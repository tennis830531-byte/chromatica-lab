const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "garden-qa.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const ACTIVE_KEY = "chromatica.qaGardenMode";
const SANDBOX_KEY = "chromatica.qaGardenSandbox.v1";
const species = [
  { species: "sprout", name: "芽芽", stageNames: ["幼苗", "成長", "成熟"], images: ["stage-1.png", "stage-2.png", "stage-3.png"] },
  { species: "leaf", name: "葉葉", stageNames: ["葉苗", "葉芽", "葉靈"], images: ["leaf-1.png", "leaf-2.png", "leaf-3.png"] },
];

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

function fakeNode(id = "") {
  const listeners = new Map();
  const classes = new Set();
  return {
    id, src: "", textContent: "", innerHTML: "", value: "", disabled: false,
    style: {}, dataset: {}, offsetWidth: 120,
    classList: {
      add(...names) { names.forEach((name) => classes.add(name)); },
      remove(...names) { names.forEach((name) => classes.delete(name)); },
      toggle(name, force) { if (force ?? !classes.has(name)) classes.add(name); else classes.delete(name); },
      contains(name) { return classes.has(name); },
    },
    addEventListener(type, handler) { listeners.set(type, handler); },
    dispatch(type, event = {}) { listeners.get(type)?.({ target: this, ...event }); },
    focus() {},
  };
}

function loadQa(state, promptValue = null) {
  const sessionStorage = storage({ [ACTIVE_KEY]: "true", [SANDBOX_KEY]: JSON.stringify(state) });
  const qaNodes = new Map();
  const globalNodes = new Map();
  const qaNode = (selector) => {
    if (!qaNodes.has(selector)) qaNodes.set(selector, fakeNode(selector.slice(1)));
    return qaNodes.get(selector);
  };
  const globalNode = (selector) => {
    if (!globalNodes.has(selector)) globalNodes.set(selector, fakeNode(selector.slice(1)));
    return globalNodes.get(selector);
  };
  const actions = ["water", "fill", "mature", "harvest", "reset"].map((action) => {
    const node = fakeNode(); node.dataset.qaAction = action; return node;
  });
  const leaves = [fakeNode(), fakeNode()];
  const qaRoot = {
    querySelector: qaNode,
    querySelectorAll(selector) {
      if (selector === "[data-qa-action]") return actions;
      if (selector === "[data-qa-leave]") return leaves;
      return [];
    },
  };
  const formalImage = fakeNode("gardenPlantImage"); formalImage.src = "formal-plant.png";
  const document = {
    documentElement: { dataset: {} },
    getElementById(id) { return id === "gardenqa" ? qaRoot : null; },
    querySelector(selector) { return selector === "#gardenPlantImage" ? formalImage : globalNode(selector); },
  };
  const context = {
    globalThis: {}, document, sessionStorage, crypto: require("node:crypto").webcrypto,
    TextEncoder, Uint8Array, Date, JSON, setTimeout, clearTimeout,
    confirm: () => true, prompt: () => promptValue,
  };
  vm.runInNewContext(source, context);
  const api = context.globalThis.ChromaticaGardenQA;
  api.init({ species, stageRequirements: [2, 2, 2], navigate() {}, playGardenEffect() {} });
  return { api, sessionStorage, qaNodes, actions, formalImage };
}

function state(overrides = {}) {
  return {
    schemaVersion: 1,
    currentPlant: { id: "qa-plant", species: "sprout", name: "芽芽", customName: false, stage: 1, waterProgress: 0 },
    collection: [], featuredSpiritId: "", featuredSpiritStage: 3,
    starterPlantSelected: true, unlimitedWater: true,
    ...overrides,
  };
}

test("document contains no duplicate IDs", () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
});

test("QA plant has its own unique render target", () => {
  assert.match(html, /id="gardenQaPlantImage"/);
  assert.match(html, /id="gardenPlantImage"/);
  assert.notEqual("gardenQaPlantImage", "gardenPlantImage");
});

test("QA plant uses the same visible scene wrapper hierarchy as the formal garden", () => {
  const qa = html.match(/<section id="gardenqa"[\s\S]*?<\/section>/)?.[0] || "";
  assert.match(qa, /id="gardenQaPlantIdleLayer" class="plant-idle-layer is-idle"/);
  assert.match(qa, /id="gardenQaPlantActionLayer" class="plant-action-layer garden-stage-1"/);
  assert.match(qa, /gardenQaPlantActionLayer[\s\S]*gardenQaPlantImage/);
});

test("QA controls retain unique scoped IDs", () => {
  for (const id of ["gardenQaPlantScene", "gardenQaPlantName", "gardenQaPlantImage", "gardenQaWater", "gardenQaProgress", "gardenQaProgressBar", "gardenQaCollection", "gardenQaResetAll"]) {
    assert.equal((html.match(new RegExp(`id="${id}"`, "g")) || []).length, 1);
  }
});

test("QA renderer scopes plant and collection queries to the active QA root", () => {
  assert.match(source, /function qaRoot\(\) \{ return document\.getElementById\("gardenqa"\)/);
  assert.match(source, /function qa\$\(selector\)/);
  assert.match(source, /qa\$\("#gardenQaPlantImage"\)/);
});

test("obsolete off-screen absolute positioning is removed", () => {
  assert.doesNotMatch(styles, /garden-qa-layout \.garden-plant-image[^{]*\{[^}]*position:\s*absolute/);
  assert.match(styles, /\.garden-plant-scene\s*\{[\s\S]*?min-height:\s*238px/);
});

test("active QA render assigns a non-empty plant image source", () => {
  const { qaNodes } = loadQa(state());
  assert.equal(qaNodes.get("#gardenQaPlantImage").src, "stage-1.png");
});

test("reload render preserves the selected stage image and classes", () => {
  const { qaNodes } = loadQa(state({ currentPlant: { id: "p", species: "sprout", name: "芽芽", stage: 2, waterProgress: 3 } }));
  assert.equal(qaNodes.get("#gardenQaPlantImage").src, "stage-2.png");
  assert.equal(qaNodes.get("#gardenQaPlantActionLayer").classList.contains("garden-stage-2"), true);
});

test("watering updates only the QA plant", () => {
  const { actions, sessionStorage, formalImage } = loadQa(state());
  actions.find((button) => button.dataset.qaAction === "water").dispatch("click");
  assert.equal(JSON.parse(sessionStorage.getItem(SANDBOX_KEY)).currentPlant.waterProgress, 1);
  assert.equal(formalImage.src, "formal-plant.png");
});

test("stage evolution renders the next QA stage visibly", () => {
  const { actions, qaNodes } = loadQa(state({ currentPlant: { id: "p", species: "sprout", name: "芽芽", stage: 1, waterProgress: 1 } }));
  actions.find((button) => button.dataset.qaAction === "fill").dispatch("click");
  assert.equal(qaNodes.get("#gardenQaPlantImage").src, "stage-2.png");
});

test("harvest renders the next QA plant rather than the formal target", () => {
  const { actions, qaNodes, formalImage } = loadQa(state({ currentPlant: { id: "p", species: "sprout", name: "芽芽", stage: 3, waterProgress: 6 } }));
  actions.find((button) => button.dataset.qaAction === "harvest").dispatch("click");
  assert.equal(qaNodes.get("#gardenQaPlantImage").src, "leaf-1.png");
  assert.equal(formalImage.src, "formal-plant.png");
});

test("reset current plant restores the first-stage QA image", () => {
  const { actions, qaNodes } = loadQa(state({ currentPlant: { id: "p", species: "sprout", name: "芽芽", stage: 3, waterProgress: 6 } }));
  actions.find((button) => button.dataset.qaAction === "reset").dispatch("click");
  assert.equal(qaNodes.get("#gardenQaPlantImage").src, "stage-1.png");
});

test("renaming a collected spirit also marks it as QA featured", () => {
  const collected = { id: "qa-spirit", species: "sprout", name: "芽芽", customName: false, stage: 3, waterProgress: 6 };
  const { qaNodes, sessionStorage } = loadQa(state({ collection: [collected] }), "新名字");
  const target = { closest() { return { dataset: { qaSpirit: "qa-spirit" } }; } };
  qaNodes.get("#gardenQaCollection").dispatch("click", { target });
  const updated = JSON.parse(sessionStorage.getItem(SANDBOX_KEY));
  assert.equal(updated.collection[0].name, "新名字");
  assert.equal(updated.featuredSpiritId, "qa-spirit");
});

test("formal garden image remains present and uses its formal wrapper", () => {
  const formal = html.match(/<section id="garden"[\s\S]*?<section id="gardenqa"/)?.[0] || "";
  assert.match(formal, /id="gardenPlantIdleLayer" class="plant-idle-layer is-idle"/);
  assert.match(formal, /id="gardenPlantImage"/);
});

test("QA runtime remains isolated from formal storage and cloud persistence", () => {
  for (const token of ["chromatica.waterDrops", "chromatica.currentPlant", "scheduleAccountSnapshotSave", "syncBestEffort", "save_game_state"]) {
    assert.doesNotMatch(source, new RegExp(token.replaceAll(".", "\\.")));
  }
});
