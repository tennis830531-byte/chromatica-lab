const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const qaSource = fs.readFileSync(path.join(root, "garden-qa.js"), "utf8");

const species = [
  { species: "melody-sprout", name: "一", stageNames: ["一", "一", "一"], images: ["1.png"] },
  { species: "mushroom-spirit", name: "二", stageNames: ["二", "二", "二"], images: ["2.png"] },
  { species: "flower-spirit", name: "三", stageNames: ["三", "三", "三"], images: ["3.png"] },
];

function loadQa() {
  const values = new Map();
  const sessionStorage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
  const node = () => ({
    value: "", textContent: "", disabled: false, innerHTML: "", src: "", style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, focus() {},
  });
  const qaRoot = { querySelector: node, querySelectorAll() { return []; } };
  const document = {
    documentElement: { dataset: {} },
    getElementById(id) { return id === "gardenqa" ? qaRoot : null; },
    querySelector: node,
    querySelectorAll() { return []; },
  };
  const context = {
    globalThis: {}, sessionStorage, document, Date, JSON, Set,
    TextEncoder, Uint8Array, crypto: require("node:crypto").webcrypto,
    setTimeout, clearTimeout, confirm: () => true, prompt: () => null,
  };
  vm.runInNewContext(qaSource, context);
  context.globalThis.ChromaticaGardenQA.init({ species, stageRequirements: [100, 180, 250] });
  return context.globalThis.ChromaticaGardenQA;
}

test("bottom music-note navigation opens the metronome without adding an item", () => {
  const nav = html.match(/<nav class="bottom-nav"[\s\S]*?<\/nav>/)?.[0] || "";
  assert.equal((nav.match(/class="bottom-nav-item/g) || []).length, 6);
  assert.match(nav, /data-view="metronome"[^>]*><span>♪<\/span>節拍/);
  assert.doesNotMatch(nav, /data-view="map"[^>]*><span>♪<\/span>/);
});

test("quick cards use the short tuner name and keep map route available", () => {
  assert.match(html, /data-jump="tuner"[\s\S]*?<strong>調音器<\/strong>/);
  assert.match(html, /data-jump="map"[\s\S]*?<strong>孔位地圖<\/strong>/);
  assert.match(html, /<section id="map" class="view">/);
  assert.match(html, /<section id="tuner"[\s\S]*?<h2>全音域調音器<\/h2>/);
});

test("all user-visible note-map wording is renamed without changing internal identifiers", () => {
  assert.doesNotMatch(html, /音符地圖/);
  assert.match(html, /透過孔位地圖與基礎練習/);
  assert.match(html, /<h2>孔位地圖<\/h2>/);
  assert.match(app, /function renderNoteMap/);
  assert.match(html, /id="noteMapHoles"/);
});

test("formal availability remains limited to species one through three", () => {
  const allowlist = app.match(/const availableGardenSpeciesIds = new Set\(\[([\s\S]*?)\]\);/)?.[1] || "";
  for (const id of species.map((item) => item.species)) assert.match(allowlist, new RegExp(`"${id}"`));
  assert.doesNotMatch(allowlist, /lucky-leaf-spirit|bamboo-sound-child/);
  assert.match(app, /const availableGardenSpecies = gardenSpecies\.filter/);
  assert.match(app, /species: availableGardenSpecies/);
  assert.match(app, /if \(speciesId && !availableGardenSpeciesIds\.has\(speciesId\)\) return null/);
  assert.match(app, /const canAddToCollection = availableGardenSpeciesIds\.has\(plant\.species\)/);
});

test("locked species definitions and assets remain in the repository", () => {
  for (const id of ["lucky-leaf-spirit", "bamboo-sound-child"]) {
    assert.match(app, new RegExp(`species: "${id}"`));
    assert.equal(fs.existsSync(path.join(root, "public/assets/garden/plants", `${id}-stage1.png`)), true);
  }
});

test("QA sanitize removes locked collection and safely replaces a locked current plant", () => {
  const qa = loadQa();
  const sanitized = qa.sanitizeState({
    schemaVersion: 1,
    currentPlant: { id: "old-4", species: "lucky-leaf-spirit", stage: 2, waterProgress: 20 },
    collection: [
      { id: "one", species: "melody-sprout" },
      { id: "old-5", species: "bamboo-sound-child" },
    ],
    featuredSpiritId: "old-5",
    featuredSpiritStage: 2,
    starterPlantSelected: true,
    unlimitedWater: true,
  });
  assert.deepEqual(Array.from(sanitized.collection, (item) => item.species), ["melody-sprout"]);
  assert.equal(sanitized.currentPlant.species, "mushroom-spirit");
  assert.equal(sanitized.featuredSpiritId, "");
  assert.equal(sanitized.featuredSpiritStage, 3);
});

test("QA with all three available species collected has no fourth plant", () => {
  const qa = loadQa();
  const sanitized = qa.sanitizeState({
    schemaVersion: 1,
    currentPlant: { id: "old-5", species: "bamboo-sound-child" },
    collection: species.map((item, index) => ({ id: `spirit-${index}`, species: item.species })),
    featuredSpiritId: "",
    featuredSpiritStage: 3,
    starterPlantSelected: true,
    unlimitedWater: true,
  });
  assert.equal(sanitized.currentPlant, null);
  assert.equal(sanitized.collection.length, 3);
});
