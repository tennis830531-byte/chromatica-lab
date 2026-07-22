const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "garden-qa.js"), "utf8");
const sharedSource = fs.readFileSync(path.join(root, "garden-shared.js"), "utf8");
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
  const shared = {
    renderGardenCollection({ container, storeAdapter }) {
      container?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-open-spirit]");
        if (button) storeAdapter?.openSpirit?.(button.dataset.openSpirit);
      });
    },
    renderPlantScene({ elements, species: speciesId, stage, imageSrc, displayName, stageLabel, progressText, progressPercent = 0 }) {
      if (elements.image) {
        elements.image.src = imageSrc;
        elements.image.classList.add(`garden-stage-${stage || 1}`);
        if (speciesId) elements.image.classList.add(`species-${speciesId}`);
      }
      if (elements.actionLayer) elements.actionLayer.classList.add(`garden-stage-${stage || 1}`);
      if (elements.name) elements.name.textContent = displayName;
      if (elements.stage) elements.stage.textContent = stageLabel;
      if (elements.progressText) elements.progressText.textContent = progressText;
      if (elements.progressBar) elements.progressBar.style.width = `${progressPercent}%`;
    },
  };
  const detailCalls = [];
  const context = {
    globalThis: { ChromaticaGardenShared: shared }, document, sessionStorage, crypto: require("node:crypto").webcrypto,
    TextEncoder, Uint8Array, Date, JSON, setTimeout, clearTimeout,
    confirm: () => true, prompt: () => promptValue,
  };
  vm.runInNewContext(source, context);
  const api = context.globalThis.ChromaticaGardenQA;
  api.init({ species, stageRequirements: [2, 2, 2], navigate() {}, playGardenEffect() {}, openSpiritDetail(id, adapter) { detailCalls.push({ id, adapter }); } });
  return { api, sessionStorage, qaNodes, actions, formalImage, detailCalls };
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
  assert.match(sharedSource, /plantImage: "gardenQaPlantImage"/);
  assert.match(sharedSource, /plantImage: "gardenPlantImage"/);
  assert.notEqual("gardenQaPlantImage", "gardenPlantImage");
});

test("QA plant uses the same visible scene wrapper hierarchy as the formal garden", () => {
  assert.doesNotMatch(sharedSource, /cloneNode|ID_MAP/);
  assert.match(sharedSource, /function gardenPresentationMarkup/);
  assert.match(sharedSource, /function applyGardenPlantPresentation/);
  assert.match(sharedSource, /idleLayer: "gardenQaPlantIdleLayer"/);
  assert.match(sharedSource, /actionLayer: "gardenQaPlantActionLayer"/);
  assert.match(sharedSource, /plantImage: "gardenQaPlantImage"/);
});

test("QA controls retain unique scoped IDs", () => {
  for (const id of ["gardenQaPlantScene", "gardenQaPlantName", "gardenQaPlantImage", "gardenQaWater", "gardenQaProgress", "gardenQaProgressBar", "gardenQaCollection"]) assert.match(sharedSource, new RegExp(id));
  assert.equal((html.match(/id="gardenQaResetAll"/g) || []).length, 1);
});

test("QA renderer scopes plant and collection queries to the active QA root", () => {
  assert.match(source, /function qaRoot\(\) \{ return document\.getElementById\("gardenqa"\)/);
  assert.match(source, /function qa\$\(selector\)/);
  assert.match(source, /qa\$\("#gardenQaPlantImage"\)/);
});

test("shared garden scenes stay in flow while their backdrop can extend beyond the frame", () => {
  assert.doesNotMatch(styles, /garden-qa-layout \.garden-plant-image[^{]*\{[^}]*position:\s*absolute/);
  assert.match(styles, /\.garden-card\s*\{[\s\S]*?overflow:\s*visible/);
  assert.match(styles, /\.garden-plant-scene\s*\{[\s\S]*?height:\s*clamp\(238px, 62vw, 300px\)[\s\S]*?overflow:\s*visible/);
  assert.match(styles, /\.garden-scene-backdrop\s*\{[\s\S]*?inset:\s*-8px;[\s\S]*?width:\s*calc\(100% \+ 16px\);[\s\S]*?height:\s*calc\(100% \+ 16px\);[\s\S]*?border-radius:\s*0;[\s\S]*?clip-path:\s*none/);
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

test("QA collection opens the formal detail adapter and keeps edits session-only", () => {
  const collected = { id: "qa-spirit", species: "sprout", name: "芽芽", customName: false, stage: 3, waterProgress: 6 };
  const { qaNodes, sessionStorage, detailCalls } = loadQa(state({ collection: [collected] }));
  const target = { closest() { return { dataset: { openSpirit: "qa-spirit" } }; } };
  qaNodes.get("#gardenQaCollection").dispatch("click", { target });
  assert.equal(detailCalls[0].id, "qa-spirit");
  detailCalls[0].adapter.updateName("qa-spirit", "新名字");
  detailCalls[0].adapter.setFeatured("qa-spirit", 2);
  const updated = JSON.parse(sessionStorage.getItem(SANDBOX_KEY));
  assert.equal(updated.collection[0].name, "新名字");
  assert.equal(updated.featuredSpiritId, "qa-spirit");
  assert.equal(updated.featuredSpiritStage, 2);
});

test("formal garden image remains present and uses its formal wrapper", () => {
  assert.match(html, /id="gardenSharedRoot"/);
  assert.match(sharedSource, /idleLayer: "gardenPlantIdleLayer"/);
  assert.match(sharedSource, /plantImage: "gardenPlantImage"/);
});

test("QA runtime remains isolated from formal storage and cloud persistence", () => {
  for (const token of ["chromatica.waterDrops", "chromatica.currentPlant", "scheduleAccountSnapshotSave", "syncBestEffort", "save_game_state"]) {
    assert.doesNotMatch(source, new RegExp(token.replaceAll(".", "\\.")));
  }
});
