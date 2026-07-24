const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "announcements.js"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const authEntry = fs.readFileSync(path.join(root, "auth-entry.js"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");

class FakeClassList {
  constructor(...values) {
    this.values = new Set(values);
  }

  contains(value) {
    return this.values.has(value);
  }

  add(...values) {
    values.forEach((value) => this.values.add(value));
  }

  remove(...values) {
    values.forEach((value) => this.values.delete(value));
  }

  toggle(value, force) {
    const enabled = force === undefined ? !this.contains(value) : Boolean(force);
    if (enabled) this.add(value);
    else this.remove(value);
    return enabled;
  }
}

function fakeElement(...classes) {
  const listeners = new Map();
  return {
    classList: new FakeClassList(...classes),
    textContent: "",
    dataset: {},
    files: [],
    value: "",
    children: [],
    focusCount: 0,
    addEventListener(type, listener) {
      const entries = listeners.get(type) || [];
      entries.push(listener);
      listeners.set(type, entries);
    },
    dispatch(type, event = {}) {
      (listeners.get(type) || []).forEach((listener) => listener({ target: this, preventDefault() {}, ...event }));
    },
    click() { this.dispatch("click"); },
    focus() { this.focusCount += 1; },
    append(...children) {
      this.children.push(...children);
      this.textContent += children.map((child) => child?.textContent || "").join("");
    },
    replaceChildren(...children) {
      this.children = children;
      this.textContent = children.map((child) => child?.textContent || "").join("");
    },
    removeAttribute(name) { delete this[name]; },
    setAttribute(name, value) { this[name] = String(value); },
  };
}

function createHarness({
  authenticated = true,
  workspaceReady = true,
  homeActive = true,
  modalOpen = false,
  settlementOpen = false,
  announcements = [{ id: "latest", large_topic: "主題", title: "最新公告", body: "公告內容", published_at: "2026-07-23T00:00:00Z" }],
  rpcError = null,
  nativeAndroid = false,
  splashFinished = true,
  micGateVisible = false,
} = {}) {
  const bodyClasses = [];
  if (authenticated) bodyClasses.push("auth-authenticated");
  else bodyClasses.push("auth-checking");
  if (modalOpen) bodyClasses.push("modal-open");
  if (settlementOpen) bodyClasses.push("practice-settlement-open");
  const body = fakeElement(...bodyClasses);
  const intro = fakeElement("view", ...(homeActive ? ["active"] : []));
  const elements = new Map([
    ["announcementPreviewModal", fakeElement("announcement-backdrop", "hidden")],
    ["announcementPreviewTopic", fakeElement()],
    ["announcementPreviewTitle", fakeElement()],
    ["announcementPreviewTime", fakeElement()],
    ["announcementPreviewImage", fakeElement("hidden")],
    ["announcementPreviewBody", fakeElement()],
    ["announcementReadMore", fakeElement()],
    ["announcementFullModal", fakeElement("announcement-backdrop", "hidden")],
    ["announcementFullTopic", fakeElement()],
    ["announcementFullTitle", fakeElement()],
    ["announcementFullTime", fakeElement()],
    ["announcementFullImages", fakeElement()],
    ["announcementFullBody", fakeElement()],
    ["announcementCommentsStatus", fakeElement()],
    ["announcementCommentsList", fakeElement()],
    ["announcementCommentForm", fakeElement()],
    ["announcementCommentBody", fakeElement()],
    ["announcementCommentHint", fakeElement()],
    ["announcementCommentSubmit", fakeElement()],
    ["announcementListModal", fakeElement("announcement-backdrop", "hidden")],
    ["announcementListTitle", fakeElement()],
    ["announcementList", fakeElement()],
    ["announcementListStatus", fakeElement()],
    ["announcementAdminModal", fakeElement("announcement-backdrop", "hidden")],
    ["announcementAdminTitle", fakeElement()],
    ["micGate", fakeElement(...(micGateVisible ? [] : ["hidden"]))],
  ]);
  const closeControls = {
    preview: [fakeElement(), fakeElement()],
    full: [fakeElement()],
    list: [fakeElement()],
    admin: [fakeElement()],
  };
  const state = {
    rows: announcements,
    rpcError,
    rpcCalls: 0,
    imageUrl: "",
  };
  const document = {
    body,
    querySelector(selector) {
      if (selector === "#intro.view.active") return intro.classList.contains("active") ? intro : null;
      const titleMatch = selector.match(/^#(announcement(?:Preview|Full|List|Admin)Modal) h2$/);
      if (titleMatch) return elements.get(titleMatch[1].replace("Modal", "Title")) || null;
      const closeMatch = selector.match(/^#(announcement(?:Preview|Full|List|Admin)Modal) \.announcement-close$/);
      if (closeMatch) {
        const key = closeMatch[1].includes("Preview") ? "preview"
          : closeMatch[1].includes("Full") ? "full"
            : closeMatch[1].includes("List") ? "list" : "admin";
        return closeControls[key][0];
      }
      if (selector.startsWith("#")) return elements.get(selector.slice(1)) || null;
      if (selector === ".announcement-backdrop:not(.hidden)") {
        return [...elements.values()].find((element) => element.classList.contains("announcement-backdrop") && !element.classList.contains("hidden")) || null;
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector === "[data-announcement-close]") return closeControls.preview;
      if (selector === "[data-announcement-full-close]") return closeControls.full;
      if (selector === "[data-announcement-list-close], [data-announcement-admin-close]") {
        return [...closeControls.list, ...closeControls.admin];
      }
      if (selector === ".announcement-backdrop:not(.hidden)") {
        return [...elements.values()].filter((element) => element.classList.contains("announcement-backdrop") && !element.classList.contains("hidden"));
      }
      return [];
    },
    createElement() { return fakeElement(); },
    createTextNode(text) { return { textContent: String(text) }; },
    addEventListener() {},
  };
  const storage = new Map();
  const eventListeners = new Map();
  const sessionStorage = {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); },
  };
  const context = {
    console,
    document,
    sessionStorage,
    Intl,
    Date,
    FormData: class FormData {},
    URL,
    chromaticaStartupState: { workspaceStatus: workspaceReady ? "ready" : "pending" },
    chromaticaStartupSplashFinished: splashFinished,
    Capacitor: {
      isNativePlatform() { return nativeAndroid; },
      getPlatform() { return nativeAndroid ? "android" : "web"; },
    },
    addEventListener(type, listener, options = {}) {
      const listeners = eventListeners.get(type) || [];
      listeners.push({ listener, once: options.once === true });
      eventListeners.set(type, listeners);
    },
    chromaticaAuth: {
      async leaderboardRpc() {
        state.rpcCalls += 1;
        return { data: state.rows, error: state.rpcError };
      },
      getAnnouncementImageUrl() { return state.imageUrl; },
    },
  };
  context.window = context;
  context.globalThis = context;
  vm.runInNewContext(source, context);
  return {
    api: context.ChromaticaAnnouncements,
    body,
    intro,
    elements,
    state,
    startup: context.chromaticaStartupState,
    dispatch(type) {
      if (type === "chromatica:startup-splash-finished") context.chromaticaStartupSplashFinished = true;
      const listeners = [...(eventListeners.get(type) || [])];
      eventListeners.set(type, listeners.filter((entry) => !entry.once));
      listeners.forEach((entry) => entry.listener());
    },
    visibleAnnouncementModals() {
      return [...elements.values()].filter((element) => element.classList.contains("announcement-backdrop") && !element.classList.contains("hidden"));
    },
  };
}

test("1 authenticated startup does not show before the home view is active", async () => {
  const harness = createHarness({ homeActive: false });
  assert.equal(await harness.api.maybeShowLatestOnHome(), false);
  assert.equal(harness.state.rpcCalls, 0);
});

test("2 workspace readiness alone does not show before the home view is active", async () => {
  const harness = createHarness({ authenticated: false, homeActive: false });
  harness.body.classList.add("auth-authenticated");
  assert.equal(await harness.api.maybeShowLatestOnHome(), false);
});

test("3 authenticated ready startup shows only on #intro.view.active", async () => {
  const harness = createHarness();
  assert.equal(await harness.api.maybeShowLatestOnHome(), true);
  assert.equal(harness.elements.get("announcementPreviewModal").classList.contains("hidden"), false);
});

test("4 active home does not show while workspace data is pending", async () => {
  const harness = createHarness({ workspaceReady: false });
  assert.equal(await harness.api.maybeShowLatestOnHome(), false);
  assert.equal(harness.state.rpcCalls, 0);
});

test("5 active home does not show before authentication", async () => {
  const harness = createHarness({ authenticated: false });
  assert.equal(await harness.api.maybeShowLatestOnHome(), false);
  assert.equal(harness.state.rpcCalls, 0);
});

test("6 no current announcement does not consume the one-per-runtime flag", async () => {
  const harness = createHarness({ announcements: [] });
  assert.equal(await harness.api.maybeShowLatestOnHome(), false);
  harness.state.rows = [{ id: "later", title: "稍後公告", body: "內容", published_at: "2026-07-23T00:00:00Z" }];
  // Force a fresh read just as a later home activation would after cache expiry.
  await harness.api.showList();
  harness.elements.get("announcementListModal").classList.add("hidden");
  harness.body.classList.remove("modal-open");
  assert.equal(await harness.api.maybeShowLatestOnHome(), true);
});

test("7 announcement read failure remains non-blocking and retryable", async () => {
  const harness = createHarness({ rpcError: new Error("offline") });
  assert.equal(await harness.api.maybeShowLatestOnHome(), false);
  harness.state.rpcError = null;
  assert.equal(await harness.api.maybeShowLatestOnHome(), true);
});

test("8 concurrent gate calls share one read and open one preview", async () => {
  const harness = createHarness();
  const results = await Promise.all([
    harness.api.maybeShowLatestOnHome(),
    harness.api.maybeShowLatestOnHome(),
    harness.api.maybeShowLatestOnHome(),
  ]);
  assert.deepEqual(results, [true, true, true]);
  assert.equal(harness.state.rpcCalls, 1);
});

test("9 returning to home after close does not auto-open again", async () => {
  const harness = createHarness();
  await harness.api.maybeShowLatestOnHome();
  harness.elements.get("announcementPreviewModal").classList.add("hidden");
  harness.body.classList.remove("modal-open");
  assert.equal(await harness.api.maybeShowLatestOnHome(), false);
});

test("10 app background resume cannot auto-open twice in one runtime", async () => {
  const harness = createHarness();
  await harness.api.maybeShowLatestOnHome();
  assert.equal(await harness.api.maybeShowLatestOnHome(), false);
  assert.equal(harness.state.rpcCalls, 1);
});

test("11 repeated gate calls never create a second preview modal", async () => {
  const harness = createHarness();
  await harness.api.maybeShowLatestOnHome();
  await harness.api.maybeShowLatestOnHome();
  assert.equal(harness.state.rpcCalls, 1);
  assert.equal(harness.elements.get("announcementPreviewModal").classList.contains("hidden"), false);
});

test("12 login transition cannot open the announcement early", async () => {
  const harness = createHarness({ authenticated: false });
  assert.equal(await harness.api.maybeShowLatestOnHome(), false);
  assert.equal(harness.elements.get("announcementPreviewModal").classList.contains("hidden"), true);
});

test("13 practice settlement overlay blocks the auto preview without consuming it", async () => {
  const harness = createHarness({ settlementOpen: true });
  assert.equal(await harness.api.maybeShowLatestOnHome(), false);
  harness.body.classList.remove("practice-settlement-open");
  assert.equal(await harness.api.maybeShowLatestOnHome(), true);
});

test("14 another modal blocks the auto preview without consuming it", async () => {
  const harness = createHarness({ modalOpen: true });
  assert.equal(await harness.api.maybeShowLatestOnHome(), false);
  harness.body.classList.remove("modal-open");
  assert.equal(await harness.api.maybeShowLatestOnHome(), true);
});

test("15 Settings About announcements remains manually repeatable", async () => {
  const harness = createHarness();
  await harness.api.showList();
  await harness.api.showList();
  assert.equal(harness.state.rpcCalls, 2);
  assert.equal(harness.elements.get("announcementListModal").classList.contains("hidden"), false);
});

test("16 old announcement list remains sorted and supplied by the existing RPC", () => {
  assert.match(source, /leaderboardRpc\?\.\("get_published_announcements_v2"\)/);
  assert.match(source, /async function showList\(\)[\s\S]*fetchPublished\(\{ force: true \}\)/);
});

test("17 startup and view hooks call one idempotent exported gate", () => {
  assert.match(authEntry, /setGateState\("authenticated"\);\s*void window\.ChromaticaAnnouncements\?\.maybeShowLatestOnHome\?\.\(\);/);
  assert.match(app, /if \(view === "intro"\) \{\s*void window\.ChromaticaAnnouncements\?\.maybeShowLatestOnHome\?\.\(\);/);
  assert.doesNotMatch(source, /setInterval|MutationObserver/);
  assert.equal((source.match(/function bind\(\)/g) || []).length, 1);
});

test("18 reduced-motion presentation remains unchanged", () => {
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(source, /prefers-reduced-motion|animation|transition/);
});

test("19 native Android does not show while the full artwork splash still covers home", async () => {
  const harness = createHarness({ nativeAndroid: true, splashFinished: false });
  assert.equal(await harness.api.maybeShowLatestOnHome(), false);
  assert.equal(harness.state.rpcCalls, 0);
});

test("20 the one-time native splash completion event opens on the now-visible home", async () => {
  const harness = createHarness({ nativeAndroid: true, splashFinished: false });
  harness.api.init();
  assert.equal(harness.state.rpcCalls, 0);
  harness.dispatch("chromatica:startup-splash-finished");
  await Promise.resolve();
  assert.equal(harness.state.rpcCalls, 1);
});

test("21 the microphone entry gate blocks the announcement even after home activation", async () => {
  const harness = createHarness({ micGateVisible: true });
  assert.equal(await harness.api.maybeShowLatestOnHome(), false);
  assert.equal(harness.state.rpcCalls, 0);
});

test("22 completing the microphone entry gate allows the announcement on home", async () => {
  const harness = createHarness({ micGateVisible: true });
  harness.elements.get("micGate").classList.add("hidden");
  assert.equal(await harness.api.maybeShowLatestOnHome(), true);
  assert.equal(harness.state.rpcCalls, 1);
});

test("23 microphone choices hide the gate before requesting the announcement", () => {
  assert.match(app, /function completeMicGate\(\) \{\s*\$\("#micGate"\)\?\.classList\.add\("hidden"\);\s*void window\.ChromaticaAnnouncements\?\.maybeShowLatestOnHome\?\.\(\);/);
  assert.match(app, /if \(started\) \{\s*await calibrateMic\(\);\s*completeMicGate\(\);/);
  assert.match(app, /\$\("#micGateSkip"\)\.addEventListener\("click", \(\) => \{\s*completeMicGate\(\);/);
});

test("24 preview to detail makes detail the only visible announcement modal and preserves one scroll lock", async () => {
  const harness = createHarness();
  await harness.api.maybeShowLatestOnHome();
  assert.equal(harness.api.showFull(), true);
  assert.equal(harness.elements.get("announcementPreviewModal").classList.contains("hidden"), true);
  assert.equal(harness.elements.get("announcementFullModal").classList.contains("hidden"), false);
  assert.equal(harness.visibleAnnouncementModals().length, 1);
  assert.equal(harness.body.classList.contains("modal-open"), true);
  assert.equal(harness.elements.get("announcementPreviewModal")["aria-hidden"], "true");
  assert.equal(harness.elements.get("announcementFullModal")["aria-hidden"], "false");
});

test("25 rapid repeated detail requests are idempotent and never create a second backdrop", async () => {
  const harness = createHarness();
  await harness.api.maybeShowLatestOnHome();
  assert.equal(harness.api.showFull(), true);
  assert.equal(harness.api.showFull(), false);
  assert.equal(harness.api.showFull(), false);
  assert.equal(harness.visibleAnnouncementModals().length, 1);
  assert.equal(harness.elements.get("announcementFullTitle").textContent, "最新公告");
});

test("26 closing auto detail does not reopen preview and the cold-start gate remains consumed", async () => {
  const harness = createHarness();
  await harness.api.maybeShowLatestOnHome();
  harness.api.showFull();
  assert.equal(harness.api.closeTopModal(), true);
  assert.equal(harness.visibleAnnouncementModals().length, 0);
  assert.equal(await harness.api.maybeShowLatestOnHome(), false);
  assert.equal(harness.visibleAnnouncementModals().length, 0);
});

test("27 manual list detail transition remains repeatable and returns to the list without overlap", async () => {
  const harness = createHarness();
  await harness.api.showList();
  const firstItem = harness.elements.get("announcementList").children[0];
  firstItem.click();
  assert.equal(harness.elements.get("announcementListModal").classList.contains("hidden"), true);
  assert.equal(harness.elements.get("announcementFullModal").classList.contains("hidden"), false);
  assert.equal(harness.visibleAnnouncementModals().length, 1);
  harness.api.closeTopModal();
  assert.equal(harness.elements.get("announcementListModal").classList.contains("hidden"), false);
  assert.equal(harness.visibleAnnouncementModals().length, 1);
  firstItem.click();
  assert.equal(harness.elements.get("announcementFullModal").classList.contains("hidden"), false);
  assert.equal(harness.visibleAnnouncementModals().length, 1);
});

test("28 unavailable detail data shows a safe nonblank state", () => {
  const harness = createHarness({ announcements: [] });
  assert.equal(harness.api.showFull(null), true);
  assert.equal(harness.elements.get("announcementFullTitle").textContent, "無法開啟公告");
  assert.match(harness.elements.get("announcementFullBody").textContent, /暫時無法載入/);
  assert.equal(harness.visibleAnnouncementModals().length, 1);
});

test("29 detail transition moves focus to its title", async () => {
  const harness = createHarness();
  await harness.api.maybeShowLatestOnHome();
  harness.api.showFull();
  assert.ok(harness.elements.get("announcementFullTitle").focusCount >= 1);
});

test("30 Android back closes the active announcement before other app navigation", () => {
  assert.match(app, /if \(window\.ChromaticaAnnouncements\?\.closeTopModal\?\.\(\)\) \{[\s\S]*?return;[\s\S]*?ChromaticaLeaderboard/);
  assert.match(source, /function closeTopModal\(\)/);
  assert.match(source, /document\.addEventListener\?\.\("keydown"/);
});

test("31 one modal coordinator hides every non-target announcement layer and does not use z-index patches", () => {
  assert.match(source, /MODAL_SELECTORS\.forEach/);
  assert.match(source, /setVisibleAnnouncementModal\("#announcementFullModal"\)/);
  assert.doesNotMatch(source, /style\.zIndex|z-index/);
});
