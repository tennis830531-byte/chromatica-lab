const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const fixture = path.join(__dirname, "fixtures", "metronome-triplet-visual.html");

function readFixtureResult() {
  const result = spawnSync(chrome, [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--window-size=390,900", "--allow-file-access-from-files", "--virtual-time-budget=5000",
    "--dump-dom", `file://${fixture}`,
  ], { encoding: "utf8", timeout: 20000 });
  assert.equal(result.status, 0, result.stderr || "headless Chrome failed");
  const encoded = result.stdout.match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1] || "";
  return JSON.parse(encoded.replaceAll("&quot;", '"').replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">"));
}

test("triplet digit clears the unchanged tuplet line by at least two pixels", () => {
  assert.equal(fs.existsSync(chrome), true, "Google Chrome is required for SVG geometry verification");
  const result = readFixtureResult();
  for (const sample of [result.after, result.compact]) {
    assert.equal(sample.glyphY, "-14.25");
    assert.equal(sample.glyphWidth, "18");
    assert.equal(sample.glyphHeight, "18");
    assert.ok(sample.paintedDigitBottom < sample.paintedLineTop);
    assert.ok(sample.gap >= 2, `painted gap was ${sample.gap}px`);
    assert.equal(sample.glyphOverflow, "visible");
    assert.equal(sample.outerOverflow, "visible");
    assert.deepEqual(sample.clippingAncestors, []);
  }
});

test("moving the triplet digit leaves the tuplet line notes and other subdivision boxes unchanged", () => {
  const result = readFixtureResult();
  assert.deepEqual(result.afterTriplet, result.beforeTriplet);
  assert.equal(round(result.beforeTripletGlyph.paintedDigitBottom - result.after.paintedDigitBottom), 12.19);
  for (const comparison of Object.values(result.unchanged)) assert.deepEqual(comparison.after, comparison.before);
});

function round(value) {
  return Math.round(value * 1000) / 1000;
}
