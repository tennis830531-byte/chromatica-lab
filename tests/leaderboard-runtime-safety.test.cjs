const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const coreSource = fs.readFileSync(path.join(root, "leaderboard-core.js"), "utf8");
const runtimeSource = fs.readFileSync(path.join(root, "leaderboard.js"), "utf8");

function storage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

function fakeNode(id = "") {
  const classes = new Set(["hidden"]);
  return {
    id, className: "", textContent: "", value: "", disabled: false, checked: false, hidden: false,
    dataset: {}, style: {}, files: [], children: [],
    classList: {
      add(...names) { names.forEach((name) => classes.add(name)); },
      remove(...names) { names.forEach((name) => classes.delete(name)); },
      toggle(name, force) { if (force ?? !classes.has(name)) classes.add(name); else classes.delete(name); },
      contains(name) { return classes.has(name); },
    },
    setAttribute(name, value) { this[name] = String(value); },
    addEventListener() {}, focus() {}, append(...items) { this.children.push(...items); },
    replaceChildren(...items) { this.children = [...items]; },
    getBoundingClientRect() { return { x: 0, y: 0, width: 320, height: 64 }; },
    animate() { return { finished: Promise.resolve() }; },
    querySelector() { return null; },
  };
}

function rpcError(code, message = "request failed") {
  const error = new Error(message);
  error.code = code;
  return error;
}

function createHarness({ user = true, membership = "joined", weekly = "success", missingModal = false } = {}) {
  const nodes = new Map();
  const node = (selector) => {
    if (missingModal && selector === "#leaderboardModal") return null;
    if (!nodes.has(selector)) nodes.set(selector, fakeNode(selector.replace(/^#/, "")));
    return nodes.get(selector);
  };
  const document = {
    body: fakeNode("body"), hidden: false,
    querySelector(selector) { return selector.startsWith("#") ? node(selector) : null; },
    createElement(tag) { return fakeNode(tag); },
    createDocumentFragment() { return fakeNode("fragment"); },
    addEventListener() {},
  };
  const membershipRow = membership === "incomplete"
    ? { joined: false }
    : { joined: true, display_name: "測試名字", custom_avatar_path: "", avatar_version: 0 };
  const auth = {
    getLeaderboardAccount() { return user ? { id: "account-a" } : null; },
    getLeaderboardAvatarUrl() { return "avatar.webp"; },
    async leaderboardRpc(name) {
      if (name === "get_my_leaderboard_membership") {
        if (membership instanceof Error) return { data: null, error: membership };
        if (membership === "malformed") return { data: "not-an-object", error: null };
        return { data: [membershipRow], error: null };
      }
      if (name === "sync_leaderboard_profile") return { data: [membershipRow], error: null };
      if (name === "get_weekly_leaderboard") {
        if (weekly instanceof Error) return { data: null, error: weekly };
        if (weekly === "malformed") return { data: { unexpected: true }, error: null };
        return { data: [], error: null };
      }
      return { data: null, error: null };
    },
  };
  const context = {
    console: { warn() {}, log() {}, error() {} }, document,
    localStorage: storage(), sessionStorage: storage(),
    URL: { createObjectURL() { return "blob:test"; }, revokeObjectURL() {} },
    crypto: require("node:crypto").webcrypto,
    setTimeout(fn) { fn(); return 1; }, clearTimeout() {}, setInterval() { return 1; }, clearInterval() {},
    requestAnimationFrame(fn) { fn(); return 1; },
    addEventListener() {}, matchMedia() { return { matches: true }; },
    chromaticaAuth: auth,
  };
  context.window = context;
  context.globalThis = context;
  vm.runInNewContext(coreSource, context);
  vm.runInNewContext(runtimeSource, context);
  context.ChromaticaLeaderboard.init();
  return { api: context.ChromaticaLeaderboard, nodes };
}

const scenarios = [
  ["weekly RPC success", { membership: "joined", weekly: "success" }],
  ["PGRST202 function not found", { membership: rpcError("PGRST202", "could not find the function") }],
  ["401", { membership: rpcError("401", "unauthorized") }],
  ["403", { membership: rpcError("403", "forbidden") }],
  ["500", { membership: "joined", weekly: rpcError("500", "server failure") }],
  ["offline", { membership: "joined", weekly: rpcError("NETWORK", "failed to fetch") }],
  ["malformed response", { membership: "joined", weekly: "malformed" }],
  ["missing optional modal DOM", { membership: "joined", missingModal: true }],
  ["joined account", { membership: "joined" }],
  ["incomplete account", { membership: "incomplete" }],
];

for (const [name, options] of scenarios) {
  test(`leaderboard open contains ${name} without a global rejection`, async () => {
    const { api, nodes } = createHarness(options);
    await assert.doesNotReject(() => api.open());
    await new Promise((resolve) => setImmediate(resolve));
    if (name === "PGRST202 function not found") {
      assert.equal(nodes.get("#leaderboardStatus")?.textContent, "排行榜服務正在更新中");
    }
  });
}

test("leaderboard click handler terminates any future rejected open promise", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.match(app, /Promise\.resolve\(window\.ChromaticaLeaderboard\?\.open\?\.\(\)\)\.catch/);
});
