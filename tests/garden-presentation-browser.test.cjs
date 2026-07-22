const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const fixture = path.join(__dirname, "fixtures", "garden-presentation-visual.html");
const pageFixture = path.join(__dirname, "fixtures", "garden-page-specific-visual.html");
const localFixture = path.join(__dirname, "fixtures", "garden-local-visual.html");

function readFixtureResult(target) {
  const result = spawnSync(chrome, [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--window-size=390,1200",
    "--allow-file-access-from-files", "--virtual-time-budget=20000", "--dump-dom", `file://${target}`,
  ], { encoding: "utf8", timeout: 40000 });
  assert.equal(result.status, 0, result.stderr || "headless Chrome failed");
  const encoded = result.stdout.match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1] || "";
  const json = encoded.replaceAll("&quot;", '"').replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">");
  return JSON.parse(json);
}

test("formal and QA presentation have equal computed style and boxes for all nine species-stage combinations", () => {
  assert.equal(fs.existsSync(chrome), true, "Google Chrome is required for the real layout comparison");
  const { rows } = readFixtureResult(fixture);
  assert.equal(rows.length, 9);
  for (const row of rows) {
    assert.equal(row.sceneBoxEqual, true, `${row.species} stage ${row.stage} scene`);
    assert.equal(row.backgroundBoxEqual, true, `${row.species} stage ${row.stage} background`);
    assert.equal(row.plantBoxEqual, true, `${row.species} stage ${row.stage} plant`);
    assert.equal(row.positiveBoxes, true, `${row.species} stage ${row.stage} positive boxes`);
    assert.equal(row.objectFitEqual, true, `${row.species} stage ${row.stage} object-fit`);
    assert.equal(row.transformEqual, true, `${row.species} stage ${row.stage} transform`);
    assert.ok(Math.abs(row.visibleBottomDelta) <= 1, `${row.species} stage ${row.stage} visible bottom`);
    assert.equal(row.formalGardenY, row.qaGardenY, `${row.species} stage ${row.stage} shared garden offset`);
    assert.equal(row.classEqual, true, `${row.species} stage ${row.stage} classes`);
    assert.match(row.formalClass, new RegExp(`species-${row.species}`));
    assert.match(row.formalClass, new RegExp(`garden-stage-${row.stage}`));
  }
});

test("QA melody preserves the locked V5 visible alpha bottoms across repeated switches", () => {
  const { rows, repeatMelody } = readFixtureResult(fixture);
  const melody = rows.filter((row) => row.species === "melody-sprout");
  const lockedBottoms = new Map([[1, 270.42], [2, 296.42], [3, 288.42]]);
  for (const row of melody) assert.equal(row.qaVisibleBottom, lockedBottoms.get(row.stage));
  assert.equal(melody.find((row) => row.stage === 1).qaGardenY, "0px");
  assert.match(melody.find((row) => row.stage === 2).qaGardenY, /^calc\(clamp\(-33\.47px,[\s\S]*\+ 26px\)$/);
  assert.match(melody.find((row) => row.stage === 3).qaGardenY, /^calc\(clamp\(-53\.83px,[\s\S]*\+ 18px\)$/);
  assert.deepEqual(repeatMelody.map((item) => item.stage), [1, 2, 3, 1, 2, 3]);
  for (const item of repeatMelody) assert.equal(item.visibleBottom, lockedBottoms.get(item.stage));
  assert.deepEqual(repeatMelody.slice(0, 3), repeatMelody.slice(3));
});

test("mushroom and flower presentation geometry remains at the approved V5 baseline", () => {
  const { rows } = readFixtureResult(fixture);
  const locked = {
    "mushroom-spirit:1": { y: "0px", bottom: 283.81, box: [102.41, 128.89, 147.19, 159.11] },
    "mushroom-spirit:2": { y: "9px", bottom: 287.02, box: [60.8, 68.7, 230.39, 228.3] },
    "mushroom-spirit:3": { y: "0px", bottom: 278.37, box: [16, 18, 320, 270] },
    "flower-spirit:1": { y: "0px", bottom: 270.86, box: [118.41, 122.42, 115.19, 165.58] },
    "flower-spirit:2": { y: "0px", bottom: 272.25, box: [73.59, 72.81, 204.8, 215.19] },
    "flower-spirit:3": { y: "-14px", bottom: 260.2, box: [16, 4, 320, 270] },
  };
  for (const row of rows.filter((item) => item.species !== "melody-sprout")) {
    const expected = locked[`${row.species}:${row.stage}`];
    assert.equal(row.qaGardenY, expected.y);
    assert.equal(row.qaVisibleBottom, expected.bottom);
    assert.deepEqual(row.renderedImageBox, expected.box);
  }
});

test("alpha-measured homepage thumbnails water balance and stable layout match the local visual contract", () => {
  const result = readFixtureResult(localFixture);
  assert.equal(result.hero.length, 9);
  const lockedHero = {
    "melody-sprout:1": { maxWidth: "40%", maxHeight: "146px", transform: "matrix(1, 0, 0, 1, 0, 45.07)", delta: 0 },
    "melody-sprout:2": { maxWidth: "84%", maxHeight: "162px", transform: "matrix(1, 0, 0, 1, 0, 44.26)", delta: 0 },
    "melody-sprout:3": { maxWidth: "120%", maxHeight: "214px", transform: "matrix(1, 0, 0, 1, 0, -3.21)", delta: -23.2 },
    "mushroom-spirit:1": { maxWidth: "40%", maxHeight: "146px", transform: "matrix(1, 0, 0, 1, 0, 50.3)", delta: 16.29 },
    "mushroom-spirit:2": { maxWidth: "84%", maxHeight: "162px", transform: "matrix(1, 0, 0, 1, 0, 48.54)", delta: 10 },
    "mushroom-spirit:3": { maxWidth: "112%", maxHeight: "200px", transform: "matrix(1, 0, 0, 1, 0, 8.39)", delta: -18.2 },
    "flower-spirit:1": { maxWidth: "40%", maxHeight: "146px", transform: "matrix(1, 0, 0, 1, 0, 46.57)", delta: 1.78 },
    "flower-spirit:2": { maxWidth: "85%", maxHeight: "144px", transform: "matrix(1, 0, 0, 1, 0, 42)", delta: 0 },
    "flower-spirit:3": { maxWidth: "112%", maxHeight: "200px", transform: "matrix(1, 0, 0, 1, 0, -3.52)", delta: -33.2 },
  };
  for (const item of result.hero) {
    assert.ok(item.alpha.width > 0 && item.alpha.height > 0, `${item.species} stage ${item.stage} alpha bounds`);
    const expected = lockedHero[`${item.species}:${item.stage}`];
    assert.equal(item.maxWidth, expected.maxWidth, `${item.species} stage ${item.stage} max-width`);
    assert.equal(item.maxHeight, expected.maxHeight, `${item.species} stage ${item.stage} max-height`);
    assert.equal(item.transform, expected.transform, `${item.species} stage ${item.stage} transform`);
    assert.ok(Math.abs(item.deltaFromFlowerStage2 - expected.delta) <= 0.01, `${item.species} stage ${item.stage} visible bottom`);
  }
  const flowerStage2 = result.hero.find((item) => item.species === "flower-spirit" && item.stage === 2);
  assert.equal(flowerStage2.deltaFromFlowerStage2, 0);
  assert.equal(flowerStage2.transform, "matrix(1, 0, 0, 1, 0, 42)");
  assert.deepEqual(result.layout.heroCard, { x: 16, y: 16, width: 358, height: 323, bottom: 339 });
  assert.deepEqual(result.layout.heroSlot, { x: 40, y: 41, width: 310, height: 232, bottom: 273 });
  assert.deepEqual(result.layout.heroStage, { x: 83, y: 46.45, width: 224, height: 188, bottom: 234.45 });
  assert.deepEqual(result.layout.startWrap, { x: 23, y: 325, width: 312, height: 0, bottom: 325 });
  assert.equal(result.layout.heroNameTransform, "matrix(1, 0, 0, 1, 0, 44)");
  assert.equal(result.layout.heroName.y, 287.91);
  assert.equal(result.layout.heroName.bottom, 315);
  assert.deepEqual(result.layout.heroImage, { x: 76.91, y: 42.93, width: 236.19, height: 200, bottom: 242.93 });
  assert.ok(result.layout.startWrap.y - result.layout.heroName.bottom >= 8);
  assert.deepEqual({ width: result.thumbs.melody.width, height: result.thumbs.melody.height }, { width: "56px", height: "56px" });
  assert.equal(result.thumbs.melody.transform, "matrix(1.05, 0, 0, 1.05, -2, 1)");
  assert.ok(Math.abs(result.thumbs.melody.visibleWidth - result.thumbs.flower.visibleWidth) <= 1);
  assert.ok(Math.abs(result.thumbs.melody.visibleHeight - result.thumbs.mushroom.visibleHeight) <= 1);
  assert.equal(result.thumbs.melody.fitsCell, true);
  assert.equal(result.thumbs.flower.transform, "matrix(0.92, 0, 0, 0.92, 0, 0)");
  assert.equal(result.thumbs.mushroom.transform, "matrix(0.9, 0, 0, 0.9, -3, 0)");
  assert.equal(result.water.flexDirection, "row");
  assert.equal(result.water.flexWrap, "nowrap");
  assert.equal(result.water.alignItems, "center");
  assert.equal(result.water.justifyContent, "center");
  assert.equal(result.water.gap, "6px");
  assert.equal(result.water.whiteSpace, "nowrap");
  assert.equal(result.water.writingMode, "horizontal-tb");
  assert.equal(result.water.minWidth, "max-content");
  assert.ok(result.water.verticalOverlap > 0);
});

test("page-specific garden selectors preserve formal background hero detail and thumbnails", () => {
  const result = readFixtureResult(pageFixture);
  assert.deepEqual(result.scene, { overflow: "visible", borderRadius: "24px" });
  assert.deepEqual(result.backdrop, { x: -8, y: -8, widthDelta: 16, heightDelta: 16, borderRadius: "0px", clipPath: "none" });
  assert.deepEqual(result.hero.melody, { maxWidth: "120%", maxHeight: "214px", transform: "matrix(1, 0, 0, 1, 0, -3.21)", className: "hero-garden-plant-image species-melody-sprout hero-stage-3" });
  assert.deepEqual(result.hero.mushroom, { maxWidth: "112%", maxHeight: "200px", transform: "matrix(1, 0, 0, 1, 0, 8.39)", className: "hero-garden-plant-image species-mushroom-spirit hero-stage-3" });
  assert.deepEqual(result.hero.flower, { maxWidth: "112%", maxHeight: "200px", transform: "matrix(1, 0, 0, 1, 0, -3.52)", className: "hero-garden-plant-image species-flower-spirit hero-stage-3" });
  assert.equal(result.detail.melody.maxWidth, "128%");
  assert.equal(result.detail.melody.maxHeight, "197px");
  assert.equal(result.detail.melody.transform, "none");
  assert.ok(Math.abs(result.detail.melody.centerDelta) <= 0.02);
  assert.equal(result.detail.flower2.maxHeight, "112px");
  assert.equal(result.detail.flower2.transform, "none");
  assert.ok(Math.abs(result.detail.flower2.centerDelta) <= 0.02);
  assert.equal(result.detail.flower3.maxWidth, "123%");
  assert.equal(result.detail.flower3.maxHeight, "184px");
  assert.equal(result.detail.flower3.transform, "none");
  assert.equal(result.detail.flower3.centerDelta, 0);
  for (const detail of Object.values(result.detail)) {
    assert.equal(detail.objectFit, "contain");
    assert.equal(detail.objectPosition, "50% 100%");
    assert.equal(detail.className, "");
  }
  assert.deepEqual(result.thumb.melody, { width: "56px", height: "56px", transform: "matrix(1.05, 0, 0, 1.05, -2, 1)", className: "garden-collection-spirit-thumb collection-melody-sprout collection-stage-1" });
  assert.deepEqual(result.thumb.flower, { width: "56px", height: "56px", transform: "matrix(0.92, 0, 0, 0.92, 0, 0)", className: "garden-collection-spirit-thumb collection-flower-spirit collection-stage-1" });
  assert.deepEqual(result.thumb.mushroom, { width: "56px", height: "56px", transform: "matrix(0.9, 0, 0, 0.9, -3, 0)", className: "garden-collection-spirit-thumb collection-mushroom-spirit collection-stage-1" });
});
