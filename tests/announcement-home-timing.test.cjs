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
  return {
    classList: new FakeClassList(...classes),
    textContent: "",
    dataset: {},
    files: [],
    value: "",
    children: [],
    addEventListener() {},
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
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
    ["announcementListModal", fakeElement("announcement-backdrop", "hidden")],
    ["announcementList", fakeElement()],
    ["announcementListStatus", fakeElement()],
    ["micGate", fakeElement(...(micGateVisible ? [] : ["hidden"]))],
  ]);
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
      if (selector.startsWith("#")) return elements.get(selector.slice(1)) || null;
      if (selector === ".announcement-backdrop:not(.hidden)") {
        return [...elements.values()].find((element) => element.classList.contains("announcement-backdrop") && !element.classList.contains("hidden")) || null;
      }
      return null;
    },
    querySelectorAll() { return []; },
    createElement() { return fakeElement(); },
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
  assert.match(source, /leaderboardRpc\?\.\("get_published_announcements"\)/);
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
