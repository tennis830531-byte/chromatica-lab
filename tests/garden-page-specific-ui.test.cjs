const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const shared = fs.readFileSync(path.join(root, "garden-shared.js"), "utf8");

test("formal garden background extends eight pixels without card or scene clipping", () => {
  assert.match(css, /\.garden-card \{[^}]*overflow: visible;/s);
  assert.match(css, /\.garden-plant-scene \{[^}]*overflow: visible;/s);
  assert.match(css, /\.garden-scene-backdrop \{[^}]*inset: -8px;[^}]*width: calc\(100% \+ 16px\);[^}]*height: calc\(100% \+ 16px\);[^}]*border-radius: 0;[^}]*clip-path: none;[^}]*mask: none;/s);
});

test("homepage uses alpha-measured per-species per-stage vertical offsets", () => {
  assert.match(css, /\.hero-plant-stage img \{[^}]*--hero-visual-y: 0px;[^}]*transform: translateY\(calc\(clamp\(36px, 10vw, 42px\) \+ var\(--hero-visual-y\)\)\);/s);
  assert.match(css, /\.hero-garden-plant-image\.hero-stage-3 \{[^}]*max-width: 102%;[^}]*max-height: 182px;/s);
  assert.match(css, /\.hero-garden-plant-image\.species-melody-sprout\.hero-stage-1,[\s\S]*?\.species-mushroom-spirit\.hero-stage-1,[\s\S]*?\.species-flower-spirit\.hero-stage-1 \{[^}]*max-width: 40%;/s);
  assert.match(css, /\.hero-garden-plant-image\.species-flower-spirit\.hero-stage-2 \{[^}]*max-width: 85%;[^}]*max-height: 144px;/s);
  const expectedOffsets = new Map([
    ["melody-sprout-1", "3.07px"], ["melody-sprout-2", "2.26px"], ["melody-sprout-3", "-45.21px"],
    ["mushroom-spirit-1", "8.30px"], ["mushroom-spirit-2", "6.54px"], ["mushroom-spirit-3", "-33.61px"],
    ["flower-spirit-1", "4.57px"], ["flower-spirit-2", "0px"], ["flower-spirit-3", "-45.52px"],
  ]);
  for (const [key, offset] of expectedOffsets) {
    const [species, spirit, stage] = key.split("-");
    assert.match(css, new RegExp(`\\.hero-garden-plant-image\\.species-${species}-${spirit}\\.hero-stage-${stage} \\{ --hero-visual-y: ${offset.replace(".", "\\.")}; \\}`));
  }
  assert.match(css, /\.hero-garden-plant-image\.species-melody-sprout\.hero-stage-3 \{[^}]*max-width: 120%;[^}]*max-height: 214px;/s);
  assert.match(css, /\.hero-plant-name-card \{[^}]*transform: translateY\(44px\);[^}]*border-radius: 0;/s);
  assert.match(app, /heroImage\.classList\.remove\("hero-stage-1", "hero-stage-2", "hero-stage-3"\);[\s\S]*setGardenSpeciesClass\(heroImage, plant\?\.species \|\| ""\);/);
  assert.doesNotMatch(app.match(/function renderHeroGarden\(\)[\s\S]*?\n\}/)?.[0] || "", /garden-stage-|garden-plant-image|applyGardenPlantPresentation|style\.(?:transform|top|bottom)/);
});

test("detail stage rules stay independent from collection and hero classes", () => {
  assert.match(css, /\.garden-spirit-stage-card \{[^}]*justify-items: center;/s);
  assert.match(css, /\.garden-spirit-stage-image-frame \{[^}]*display: flex;[^}]*align-items: flex-end;[^}]*justify-content: center;[^}]*width: 100%;[^}]*height: 168px;[^}]*overflow: visible;/s);
  assert.match(css, /\.garden-spirit-stage-card img \{[^}]*object-fit: contain;[^}]*object-position: center bottom;[^}]*margin-inline: auto;[^}]*transform: none;/s);
  assert.match(css, /\.garden-spirit-stage-card\.stage-3 img \{[^}]*width: 112%;[^}]*max-width: 112%;[^}]*max-height: 168px;/s);
  assert.match(css, /\.garden-spirit-stage-card\.spirit-mushroom-spirit\.stage-1 img \{[^}]*width: 48%;/s);
  assert.match(css, /\.garden-spirit-stage-card\.spirit-flower-spirit\.stage-2 img \{[^}]*width: 78%;[^}]*max-height: 112px;/s);
  assert.match(css, /\.garden-spirit-stage-card\.spirit-mushroom-spirit\.stage-3 img,[\s\S]*?\.spirit-flower-spirit\.stage-3 img \{[^}]*width: 123%;[^}]*max-width: 123%;[^}]*max-height: 184px;/s);
  assert.match(css, /\.garden-spirit-stage-card\.spirit-melody-sprout\.stage-3 img \{[^}]*width: 128%;[^}]*max-width: 128%;[^}]*max-height: 197px;/s);
  const detailMarkup = app.match(/list\.innerHTML = \[1, 2, 3\][\s\S]*?\.join\(""\);/)?.[0] || "";
  assert.match(detailMarkup, /class="garden-spirit-stage-image-frame"/);
  assert.doesNotMatch(detailMarkup, /collection-|garden-stage-|hero-stage-|style=/);
});

test("collection uses full 2:3 art cards without legacy plant thumbnail transforms", () => {
  assert.match(css, /\.garden-collection \{[^}]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/s);
  assert.match(css, /\.garden-collection-cell \{[^}]*aspect-ratio: 2 \/ 3;/s);
  assert.match(css, /\.garden-collection-art-card \{[^}]*width: 100%;[^}]*height: 100%;[^}]*object-fit: contain;/s);
  assert.match(shared, /image\.className = "garden-collection-art-card"/);
  assert.match(shared, /getGardenCardAsset\(collected\.species\)/);
  assert.doesNotMatch(css, /\.garden-collection-cell \.collection-(?:melody-sprout|flower-spirit|mushroom-spirit)/);
  assert.doesNotMatch(shared, /garden-collection-spirit-thumb|collection-stage-/);
  const collectionRenderer = shared.match(/function renderGardenCollection\([\s\S]*?\n  \}/)?.[0] || "";
  assert.doesNotMatch(collectionRenderer, /style\.(?:width|height|transform|left|right)|hero-stage-|garden-stage-/);
});

test("garden water balance is horizontal and garden position offsets are shared by formal and QA", () => {
  assert.match(css, /\.water-balance \{[^}]*flex-direction: row;[^}]*flex-wrap: nowrap;[^}]*justify-content: center;[^}]*width: auto;[^}]*min-width: max-content;[^}]*white-space: nowrap;[^}]*writing-mode: horizontal-tb;/s);
  assert.match(css, /\.water-balance span \{[^}]*display: inline;[^}]*line-height: 1;[^}]*white-space: nowrap;/s);
  assert.match(css, /\.water-balance img \{[^}]*width: 24px;[^}]*height: 24px;[^}]*flex: 0 0 auto;[^}]*object-fit: contain;/s);
  assert.match(css, /\.garden-plant-image \{[^}]*--garden-plant-y: 0px;[^}]*transform: translateY\(var\(--garden-plant-y\)\);/s);
  assert.match(css, /\.garden-plant-image\.species-melody-sprout\.garden-stage-2 \{[^}]*--melody-stage-2-visible-bottom-offset: clamp\(-33\.47px, calc\(35\.33vw - 169\.08px\), 1\.86px\);[^}]*--garden-plant-y: calc\(var\(--melody-stage-2-visible-bottom-offset\) \+ 26px\);/s);
  assert.match(css, /\.garden-plant-image\.species-melody-sprout\.garden-stage-3 \{[^}]*--melody-stage-3-visible-bottom-offset: clamp\(-53\.83px, calc\(39\.67vw - 204\.16px\), -14\.16px\);[^}]*--garden-plant-y: calc\(var\(--melody-stage-3-visible-bottom-offset\) \+ 18px\);/s);
  assert.match(css, /\.garden-plant-image\.species-mushroom-spirit\.garden-stage-2 \{[^}]*--garden-plant-y: 9px;/s);
  assert.match(css, /\.garden-plant-image\.species-flower-spirit\.garden-stage-3 \{[^}]*--garden-plant-y: -14px;/s);
  assert.match(css, /\.plant-action-layer\.species-melody-sprout\.garden-stage-2 \{[^}]*width: min\(64%, 236px\);/s);
  assert.match(css, /\.plant-action-layer\.species-melody-sprout\.garden-stage-3 \{[^}]*width: min\(122%, 406px\);[^}]*max-width: 96\.83%;/s);
  assert.doesNotMatch(css, /#gardenQaPlantImage|#gardenPlantImage/);
});
