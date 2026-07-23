const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const coreSource = fs.readFileSync(path.join(root, "leaderboard-core.js"), "utf8");
const runtimeSource = fs.readFileSync(path.join(root, "leaderboard.js"), "utf8");
const authSource = fs.readFileSync(path.join(root, "auth-entry.js"), "utf8");
const capacitorConfig = JSON.parse(fs.readFileSync(path.join(root, "capacitor.config.json"), "utf8"));
const mainActivity = fs.readFileSync(
  path.join(root, "android/app/src/main/java/com/yrpeng/chromaticalab/MainActivity.java"),
  "utf8",
);

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial).map(([key, value]) => [key, String(value)]));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    key(index) { return [...values.keys()][index] ?? null; },
    get length() { return values.size; },
    entries() { return [...values.entries()]; },
  };
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function fakeNode(id = "") {
  const classes = new Set(["hidden"]);
  return {
    id,
    className: "",
    textContent: "",
    value: "",
    disabled: false,
    checked: false,
    hidden: false,
    dataset: {},
    style: {},
    files: [],
    children: [],
    classList: {
      add(...names) { names.forEach((name) => classes.add(name)); },
      remove(...names) { names.forEach((name) => classes.delete(name)); },
      toggle(name, force) {
        const enabled = force === undefined ? !classes.has(name) : force;
        if (enabled) classes.add(name);
        else classes.delete(name);
      },
      contains(name) { return classes.has(name); },
    },
    setAttribute(name, value) { this[name] = String(value); },
    removeAttribute(name) { delete this[name]; },
    addEventListener() {},
    focus() {},
    append(...items) { this.children.push(...items); },
    replaceChildren(...items) { this.children = [...items]; },
    getBoundingClientRect() { return { x: 0, y: 0, width: 320, height: 64 }; },
    animate() { return { finished: Promise.resolve() }; },
    querySelector() { return null; },
  };
}

function visibleText(node) {
  if (!node) return "";
  return [node.textContent, ...(node.children || []).map(visibleText)].filter(Boolean).join(" ");
}

async function settle(times = 8) {
  for (let index = 0; index < times; index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function membershipRow(userId, joined = true) {
  return joined
    ? {
      joined: true,
      display_name: `公開-${userId}`,
      custom_avatar_path: "",
      avatar_version: 0,
      featured_spirit_name: `精靈-${userId}`,
    }
    : { joined: false };
}

function weeklyRow(userId, score) {
  return {
    position: 1,
    public_key: `public-${userId}`,
    display_name: `公開-${userId}`,
    custom_avatar_path: "",
    avatar_version: 0,
    featured_spirit_species: "melody-sprout",
    featured_spirit_name: `精靈-${userId}`,
    featured_spirit_stage: 1,
    score,
    is_current_user: true,
  };
}

function createHarness({
  initialUserId = "account-a",
  memberships = {},
  weeklyTotals = {},
  weeklyMissingUsers = [],
  membershipDeferred = {},
  weeklyDeferred = {},
  recordDeferred = {},
  localStorage = createStorage(),
  sessionStorage = createStorage(),
} = {}) {
  let currentUserId = initialUserId;
  const nodes = new Map();
  const calls = [];
  const acceptedEvents = new Set();
  const totals = weeklyTotals;
  const node = (selector) => {
    if (!nodes.has(selector)) nodes.set(selector, fakeNode(selector.replace(/^#/, "")));
    return nodes.get(selector);
  };
  const document = {
    body: fakeNode("body"),
    hidden: false,
    querySelector(selector) { return selector.startsWith("#") ? node(selector) : null; },
    createElement(tag) { return fakeNode(tag); },
    createDocumentFragment() { return fakeNode("fragment"); },
    addEventListener() {},
  };
  const auth = {
    getLeaderboardAccount() { return currentUserId ? { id: currentUserId } : null; },
    getLeaderboardAvatarUrl() { return "avatar.webp"; },
    async leaderboardRpc(name, params = {}, { expectedUserId = "" } = {}) {
      calls.push({ name, params, expectedUserId, currentUserId });
      if (!expectedUserId || expectedUserId !== currentUserId) {
        const error = new Error("leaderboard-account-changed");
        error.code = "leaderboard-account-changed";
        return { data: null, error };
      }
      if (name === "get_my_leaderboard_membership") {
        if (membershipDeferred[expectedUserId]) return membershipDeferred[expectedUserId].promise;
        const value = memberships[expectedUserId];
        if (value instanceof Error) return { data: null, error: value };
        return { data: [value || membershipRow(expectedUserId, true)], error: null };
      }
      if (name === "sync_leaderboard_profile") {
        return { data: [memberships[expectedUserId] || membershipRow(expectedUserId, true)], error: null };
      }
      if (name === "get_weekly_leaderboard") {
        if (weeklyDeferred[expectedUserId]) return weeklyDeferred[expectedUserId].promise;
        if (weeklyMissingUsers.includes(expectedUserId) && !(Number(totals[expectedUserId]) > 0)) {
          return { data: [], error: null };
        }
        return { data: [weeklyRow(expectedUserId, totals[expectedUserId] || 0)], error: null };
      }
      if (name === "record_weekly_leaderboard_practice") {
        if (recordDeferred[expectedUserId]) return recordDeferred[expectedUserId].promise;
        const eventKey = `${expectedUserId}:${params.p_event_id}`;
        const accepted = !acceptedEvents.has(eventKey);
        if (accepted) {
          acceptedEvents.add(eventKey);
          totals[expectedUserId] = (totals[expectedUserId] || 0) + Number(params.p_completed_cycles || 0);
        }
        return {
          data: [{
            accepted,
            previous_rank: 1,
            current_rank: 1,
            week_start: "2026-07-19",
          }],
          error: null,
        };
      }
      return { data: null, error: null };
    },
  };
  const context = {
    console: { warn() {}, log() {}, error() {} },
    document,
    localStorage,
    sessionStorage,
    URL: { createObjectURL() { return "blob:test"; }, revokeObjectURL() {} },
    crypto: require("node:crypto").webcrypto,
    setTimeout(fn) { fn(); return 1; },
    clearTimeout() {},
    setInterval() { return 1; },
    clearInterval() {},
    requestAnimationFrame(fn) { fn(); return 1; },
    addEventListener() {},
    matchMedia() { return { matches: true }; },
    chromaticaAuth: auth,
  };
  context.window = context;
  context.globalThis = context;
  vm.runInNewContext(coreSource, context);
  vm.runInNewContext(runtimeSource, context);
  context.ChromaticaLeaderboard.init();
  return {
    api: context.ChromaticaLeaderboard,
    nodes,
    calls,
    totals,
    acceptedEvents,
    localStorage,
    sessionStorage,
    setUser(userId) {
      currentUserId = userId;
      context.ChromaticaLeaderboard.activateAccount(userId);
    },
  };
}

test("membership uses explicit idle loading joined not-joined and error states", async () => {
  const delayed = createDeferred();
  const harness = createHarness({ membershipDeferred: { "account-a": delayed } });
  assert.equal(harness.api.getMembership().status, "loading");
  delayed.resolve({ data: [membershipRow("account-a", true)], error: null });
  await settle();
  assert.equal(harness.api.getMembership().status, "joined");

  harness.setUser("account-b");
  await settle();
  assert.equal(harness.api.getMembership().status, "joined");

  harness.setUser("");
  assert.equal(harness.api.getMembership().status, "idle");
});

test("account activation clears memory state and unscoped legacy cache entries", async () => {
  const localStorage = createStorage({
    "chromatica.leaderboard.weekly.pending.v2": "[{\"eventId\":\"legacy\"}]",
    "chromatica.leaderboard.pending.v1": "[]",
  });
  const sessionStorage = createStorage({
    "chromatica.leaderboard.weekly.cache.v2": "{\"rows\":[]}",
    "chromatica.leaderboard.cache.v1": "{\"rows\":[]}",
  });
  const harness = createHarness({ localStorage, sessionStorage });
  await settle();
  harness.setUser("");
  assert.equal(harness.api.getMembership().status, "idle");
  assert.equal(harness.api.getMembership().profile, null);
  for (const key of [
    "chromatica.leaderboard.weekly.pending.v2",
    "chromatica.leaderboard.pending.v1",
  ]) assert.equal(localStorage.getItem(key), null);
  for (const key of [
    "chromatica.leaderboard.weekly.cache.v2",
    "chromatica.leaderboard.cache.v1",
  ]) assert.equal(sessionStorage.getItem(key), null);
});

test("a new account enters loading without old rows or premature onboarding", async () => {
  const delayedB = createDeferred();
  const harness = createHarness({
    memberships: { "account-a": membershipRow("account-a", true) },
    weeklyTotals: { "account-a": 84 },
    membershipDeferred: { "account-b": delayedB },
  });
  await settle();
  await harness.api.open();
  await settle();
  assert.match(visibleText(harness.nodes.get("#leaderboardList")), /84/);

  harness.setUser("account-b");
  assert.equal(harness.api.getMembership().status, "loading");
  assert.doesNotMatch(
    visibleText(harness.nodes.get("#leaderboardList")),
    /84/,
  );
  assert.equal(harness.nodes.get("#leaderboardProfileModal").classList.contains("hidden"), true);
  assert.equal(harness.nodes.get("#leaderboardProfileEdit").disabled, true);
});

test("only a confirmed not-joined response opens first-time setup", async () => {
  const harness = createHarness({
    memberships: { "account-a": membershipRow("account-a", false) },
  });
  await settle();
  assert.equal(harness.api.getMembership().status, "not-joined");
  await harness.api.open();
  assert.equal(harness.nodes.get("#leaderboardProfileModal").classList.contains("hidden"), false);
});

test("membership errors show retry-safe status and never open onboarding", async () => {
  const networkError = new Error("failed to fetch");
  networkError.code = "NETWORK";
  const harness = createHarness({ memberships: { "account-a": networkError } });
  await settle();
  assert.equal(harness.api.getMembership().status, "error");
  await harness.api.open();
  assert.equal(harness.nodes.get("#leaderboardProfileModal").classList.contains("hidden"), true);
  assert.equal(harness.nodes.get("#leaderboardModal").classList.contains("hidden"), false);
  assert.match(harness.nodes.get("#leaderboardStatus").textContent, /無法連線|稍後再試/);
});

test("A to B to A displays only the current account profile and totals", async () => {
  const harness = createHarness({
    memberships: {
      "account-a": membershipRow("account-a", true),
      "account-b": membershipRow("account-b", true),
    },
    weeklyTotals: { "account-a": 84, "account-b": 12 },
  });
  await settle();
  await harness.api.open();
  await settle();
  assert.match(visibleText(harness.nodes.get("#leaderboardList")), /84/);

  harness.setUser("account-b");
  await settle();
  await harness.api.open();
  await settle();
  const bRows = visibleText(harness.nodes.get("#leaderboardList"));
  assert.match(bRows, /12/);
  assert.doesNotMatch(bRows, /84/);

  harness.setUser("account-a");
  await settle();
  await harness.api.open();
  await settle();
  const aRows = visibleText(harness.nodes.get("#leaderboardList"));
  assert.match(aRows, /84/);
  assert.doesNotMatch(aRows, /12/);
});

test("joined membership receives a formal highlighted zero-cycle row without any write", async () => {
  const harness = createHarness({
    memberships: { "account-a": membershipRow("account-a", true) },
  });
  await settle();
  const membership = harness.api.getMembership();
  assert.equal(membership.status, "joined");
  assert.equal(membership.joined, true);
  assert.equal(membership.weeklyCycles, 0);
  assert.equal(membership.weeklyRank, 1);
  assert.equal(membership.hasWeeklyEntry, true);
  assert.match(visibleText(harness.nodes.get("#leaderboardList")), /本週 0 次/);
  assert.ok(harness.nodes.get("#leaderboardList").children.some((row) => /is-me/.test(row.className)));
  assert.equal(harness.nodes.get("#leaderboardProfileModal").classList.contains("hidden"), true);
  assert.equal(harness.calls.some((call) => call.name === "record_weekly_leaderboard_practice"), false);
  assert.equal(harness.localStorage.getItem("chromatica.leaderboard.weekly.pending.v2.account-a"), null);
});

test("a joined member omitted by an outdated RPC stays joined and shows service-updating safely", async () => {
  const harness = createHarness({
    memberships: { "account-a": membershipRow("account-a", true) },
    weeklyMissingUsers: ["account-a"],
  });
  await settle();
  assert.equal(harness.api.getMembership().status, "joined");
  assert.equal(harness.api.getMembership().joined, true);
  assert.match(harness.nodes.get("#leaderboardStatus").textContent, /排行榜服務正在更新中/);
  assert.equal(harness.nodes.get("#leaderboardProfileModal").classList.contains("hidden"), true);
  assert.equal(harness.calls.some((call) => call.name === "record_weekly_leaderboard_practice"), false);
});

test("a first valid four-cycle event changes a joined missing weekly row from zero to four exactly once", async () => {
  const totals = {};
  const harness = createHarness({
    memberships: { "account-a": membershipRow("account-a", true) },
    weeklyTotals: totals,
  });
  await settle();
  assert.equal(harness.api.getMembership().weeklyCycles, 0);
  const result = await harness.api.recordPracticeCompletion({
    completedCycles: 4,
    practiceDate: "2026-07-23",
    protectedDates: ["2026-07-23"],
  });
  await settle();
  assert.equal(result.weeklyCycles, 4);
  assert.equal(totals["account-a"], 4);
  assert.equal(harness.api.getMembership().weeklyCycles, 4);
  assert.equal(
    harness.calls.filter((call) => call.name === "record_weekly_leaderboard_practice").length,
    1,
  );
});

test("A 88 to joined B zero to A 88 never reuses totals or opens onboarding", async () => {
  const harness = createHarness({
    memberships: {
      "account-a": membershipRow("account-a", true),
      "account-b": membershipRow("account-b", true),
    },
    weeklyTotals: { "account-a": 88 },
  });
  await settle();
  assert.equal(harness.api.getMembership().weeklyCycles, 88);

  harness.setUser("account-b");
  await settle();
  const bMembership = harness.api.getMembership();
  assert.equal(bMembership.status, "joined");
  assert.equal(bMembership.weeklyCycles, 0);
  assert.equal(bMembership.weeklyRank, 1);
  assert.equal(bMembership.hasWeeklyEntry, true);
  assert.doesNotMatch(visibleText(harness.nodes.get("#leaderboardList")), /88/);
  assert.equal(harness.nodes.get("#leaderboardProfileModal").classList.contains("hidden"), true);

  harness.setUser("account-a");
  await settle();
  assert.equal(harness.api.getMembership().weeklyCycles, 88);
  assert.equal(harness.totals["account-a"], 88);
  assert.equal(harness.calls.some((call) => call.name === "record_weekly_leaderboard_practice"), false);
});

test("a delayed membership response from A cannot update account B", async () => {
  const delayedA = createDeferred();
  const harness = createHarness({
    memberships: { "account-b": membershipRow("account-b", false) },
    membershipDeferred: { "account-a": delayedA },
  });
  assert.equal(harness.api.getMembership().status, "loading");
  harness.setUser("account-b");
  await settle();
  assert.equal(harness.api.getMembership().status, "not-joined");

  delayedA.resolve({ data: [membershipRow("account-a", true)], error: null });
  await settle();
  assert.equal(harness.api.getMembership().status, "not-joined");
  assert.equal(harness.api.getMembership().profile, null);
});

test("a delayed weekly response from A cannot overwrite B UI or either account cache", async () => {
  const delayedWeeklyA = createDeferred();
  const harness = createHarness({
    memberships: {
      "account-a": membershipRow("account-a", true),
      "account-b": membershipRow("account-b", true),
    },
    weeklyTotals: { "account-b": 12 },
    weeklyDeferred: { "account-a": delayedWeeklyA },
  });
  await settle();
  const openA = harness.api.open();
  await settle(2);
  harness.setUser("account-b");
  await settle();
  await harness.api.open();
  await settle();
  delayedWeeklyA.resolve({ data: [weeklyRow("account-a", 84)], error: null });
  await openA;
  await settle();

  const rows = visibleText(harness.nodes.get("#leaderboardList"));
  assert.match(rows, /12/);
  assert.doesNotMatch(rows, /84/);
  assert.equal(
    harness.sessionStorage.getItem("chromatica.leaderboard.weekly.cache.v2.account-a.weekly"),
    null,
  );
  assert.match(
    harness.sessionStorage.getItem("chromatica.leaderboard.weekly.cache.v2.account-b.weekly"),
    /12/,
  );
});

test("cache and pending queue keys are partitioned by stable user id", () => {
  assert.match(runtimeSource, /cacheKey\(metric, userId\)[\s\S]*CACHE_PREFIX\}\.\$\{userId\}/);
  assert.match(runtimeSource, /queueKey\(userId\)[\s\S]*QUEUE_PREFIX\}\.\$\{userId\}/);
  assert.match(runtimeSource, /expectedUserId: context\.userId/);
  assert.match(authSource, /sessionData\.session\.user\.id !== expectedUserId/);
});

test("one four-cycle event changes 84 to 88 exactly once and reopening does not resubmit", async () => {
  const totals = { "account-a": 84 };
  const harness = createHarness({
    memberships: { "account-a": membershipRow("account-a", true) },
    weeklyTotals: totals,
  });
  await settle();
  const result = await harness.api.recordPracticeCompletion({
    completedCycles: 4,
    practiceDate: "2026-07-23",
    protectedDates: ["2026-07-23"],
  });
  await settle();
  assert.equal(result.weeklyCycles, 88);
  assert.equal(totals["account-a"], 88);
  assert.equal(
    harness.calls.filter((call) => call.name === "record_weekly_leaderboard_practice").length,
    1,
  );

  await harness.api.open();
  await settle();
  assert.equal(totals["account-a"], 88);
  assert.equal(
    harness.calls.filter((call) => call.name === "record_weekly_leaderboard_practice").length,
    1,
  );
});

test("a cold runtime with an empty per-user queue keeps the server total at 88", async () => {
  const totals = { "account-a": 88 };
  const localStorage = createStorage();
  const first = createHarness({ weeklyTotals: totals, localStorage });
  await settle();
  await first.api.open();
  await settle();
  assert.equal(totals["account-a"], 88);

  const cold = createHarness({ weeklyTotals: totals, localStorage });
  await settle();
  await cold.api.open();
  await settle();
  assert.equal(totals["account-a"], 88);
  assert.equal(
    cold.calls.filter((call) => call.name === "record_weekly_leaderboard_practice").length,
    0,
  );
});

test("an A pending event is never replayed through account B", async () => {
  const pendingKey = "chromatica.leaderboard.weekly.pending.v2.account-a";
  const localStorage = createStorage({
    [pendingKey]: JSON.stringify([{
      eventId: "00000000-0000-4000-8000-000000000001",
      completedCycles: 4,
      practiceDate: "2026-07-23",
      protectedDates: ["2026-07-23"],
    }]),
  });
  const delayedRecordA = createDeferred();
  const harness = createHarness({
    memberships: {
      "account-a": membershipRow("account-a", true),
      "account-b": membershipRow("account-b", true),
    },
    recordDeferred: { "account-a": delayedRecordA },
    localStorage,
  });
  await settle(3);
  harness.setUser("account-b");
  await settle();
  delayedRecordA.resolve({
    data: [{ accepted: true, previous_rank: 1, current_rank: 1, week_start: "2026-07-19" }],
    error: null,
  });
  await settle();
  assert.equal(
    harness.calls.some(
      (call) => call.name === "record_weekly_leaderboard_practice"
        && call.expectedUserId === "account-b"
        && call.params.p_event_id === "00000000-0000-4000-8000-000000000001",
    ),
    false,
  );
});

test("auth session changes activate the single leaderboard membership source", () => {
  assert.match(authSource, /currentAuthUser = user;\s*window\.ChromaticaLeaderboard\?\.activateAccount\?\.\(user\?\.id \|\| ""\)/);
  assert.match(runtimeSource, /getMembership\(\)[\s\S]*status: membershipStatus/);
  assert.match(runtimeSource, /recordPracticeCompletion[\s\S]*membershipStatus !== MEMBERSHIP\.JOINED/);
});

test("Capacitor duplicate safe-area injection is disabled while native inset geometry remains", () => {
  assert.equal(capacitorConfig.plugins?.SystemBars?.insetsHandling, "disable");
  assert.match(mainActivity, /WindowCompat\.setDecorFitsSystemWindows\(getWindow\(\), false\)/);
  assert.match(mainActivity, /ViewCompat\.setOnApplyWindowInsetsListener\(webView/);
  assert.match(mainActivity, /WindowInsetsCompat\.Type\.statusBars\(\) \| WindowInsetsCompat\.Type\.displayCutout\(\)/);
  assert.match(mainActivity, /layoutParams\.topMargin = targetTopMargin/);
});
