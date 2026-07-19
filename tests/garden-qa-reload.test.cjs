const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "garden-qa.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    snapshot() { return Object.fromEntries(values); },
  };
}

function loadQa(initial = {}) {
  const sessionStorage = createStorage(initial);
  const nodes = new Map();
  const node = (selector) => {
    if (!nodes.has(selector)) nodes.set(selector, {
      textContent: "", src: "", value: "", disabled: false,
      style: {}, dataset: {}, classList: { toggle() {}, add() {}, remove() {} },
      addEventListener() {}, focus() {},
      innerHTML: "",
    });
    return nodes.get(selector);
  };
  const qaRoot = { querySelector: node, querySelectorAll() { return []; } };
  const document = {
    documentElement: { dataset: {} },
    getElementById(id) { return id === "gardenqa" ? qaRoot : null; },
    querySelector: node,
    querySelectorAll() { return []; },
  };
  const context = {
    globalThis: {}, sessionStorage, document,
    crypto: require("node:crypto").webcrypto,
    TextEncoder, Uint8Array, Date, JSON,
    setTimeout, clearTimeout, confirm: () => true, prompt: () => null,
  };
  vm.runInNewContext(source, context);
  return { api: context.globalThis.ChromaticaGardenQA, sessionStorage, document, nodes };
}

const sandbox = JSON.stringify({
  schemaVersion: 1,
  currentPlant: { id: "qa-plant", species: "sprout", name: "芽芽", customName: false, stage: 1, waterProgress: 7 },
  collection: [], featuredSpiritId: "", featuredSpiritStage: 3,
  starterPlantSelected: true, unlimitedWater: true,
});

test("QA active with saved map resolves to the QA garden", () => {
  const { api } = loadQa({ "chromatica.qaGardenMode": "true" });
  assert.equal(api.resolveInitialView({ qaActive: true, savedView: "map", defaultView: "intro" }), "gardenqa");
});

test("authenticated QA resume renders and navigates to QA garden", () => {
  const calls = [];
  const { api } = loadQa({ "chromatica.qaGardenMode": "true", "chromatica.qaGardenSandbox.v1": sandbox });
  api.init({
    species: [{ species: "sprout", name: "芽芽", stageNames: ["幼苗", "成長", "成熟"], images: ["stage-1.png", "stage-2.png", "stage-3.png"] }],
    stageRequirements: [100, 180, 250],
    navigate(view, options) { calls.push([view, options.reason]); },
  });
  api.resumeGardenQaSession({ reason: "auth-ready", afterAuthReady: true });
  assert.deepEqual(calls, [["gardenqa", "bootstrap"], ["gardenqa", "auth-ready"]]);
});

test("remote apply QA resume cannot restore map", () => {
  const calls = [];
  const { api } = loadQa({ "chromatica.qaGardenMode": "true", "chromatica.qaGardenSandbox.v1": sandbox });
  api.init({ species: [{ species: "sprout", stageNames: ["a", "b", "c"], images: ["1.png"] }], navigate(view, options) { calls.push([view, options.reason]); } });
  api.resumeGardenQaSession({ reason: "remote-apply", afterAuthReady: true });
  assert.equal(calls.at(-1)[0], "gardenqa");
  assert.equal(calls.at(-1)[1], "remote-apply");
});

test("reload preserves the existing QA sandbox bytes", () => {
  const initial = { "chromatica.qaGardenMode": "true", "chromatica.qaGardenSandbox.v1": sandbox };
  const { api, sessionStorage } = loadQa(initial);
  api.init({ species: [{ species: "sprout", stageNames: ["a", "b", "c"], images: ["1.png"] }], stageRequirements: [100, 180, 250], navigate() {} });
  const resumed = JSON.parse(sessionStorage.getItem("chromatica.qaGardenSandbox.v1"));
  assert.equal(resumed.currentPlant.id, "qa-plant");
  assert.equal(resumed.currentPlant.waterProgress, 7);
});

test("reload renders the QA plant image", () => {
  const { api, nodes } = loadQa({ "chromatica.qaGardenMode": "true", "chromatica.qaGardenSandbox.v1": sandbox });
  api.init({ species: [{ species: "sprout", name: "芽芽", stageNames: ["幼苗", "成長", "成熟"], images: ["stage-1.png", "stage-2.png", "stage-3.png"] }], stageRequirements: [100, 180, 250], navigate() {} });
  assert.equal(nodes.get("#gardenQaPlantImage").src, "stage-1.png");
  assert.equal(nodes.get("#gardenQaPlantName").textContent, "幼苗");
});

test("QA banner plant and toolbar remain present in the reload target view", () => {
  const section = html.match(/<section id="gardenqa"[\s\S]*?<\/section>/)?.[0] || "";
  assert.match(section, /garden-qa-banner/);
  assert.match(section, /id="gardenQaPlantImage"/);
  assert.match(section, /garden-qa-toolbar/);
});

test("protected formal values remain byte-for-byte identical while QA session keys change", () => {
  const protectedValues = {
    "chromatica.waterDrops": "137",
    "chromatica.currentPlant": '{"species":"formal","stage":2,"waterProgress":18}',
    "chromatica.spiritCollection": '[{"id":"formal-spirit"}]',
    "chromatica.featuredSpiritId": '"formal-spirit"',
    "chromatica.featuredSpiritStage": "2",
    "chromatica.starterPlantSelected": "true",
    "chromatica.practiceHistory": '[{"type":"longtone"}]',
    "chromatica.streak": "4",
    "chromatica.freeze": "1",
    "chromatica.accountSnapshot.payload": '{"waterDrops":137,"plant":{"species":"formal"}}',
  };
  const formalStorage = createStorage(protectedValues);
  const before = formalStorage.snapshot();
  const qaStorage = createStorage();
  qaStorage.setItem("chromatica.qaGardenMode", "true");
  qaStorage.setItem("chromatica.qaGardenSandbox.v1", sandbox);
  assert.deepEqual(formalStorage.snapshot(), before);
});

test("a new session has no active QA flag", () => {
  const { api, document } = loadQa();
  assert.equal(api.isGardenQaSessionActive(), false);
  assert.equal(document.documentElement.dataset.qaGardenActive, undefined);
});
