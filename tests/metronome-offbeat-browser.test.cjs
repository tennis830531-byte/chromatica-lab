const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const fixture = path.join(__dirname, "fixtures", "metronome-offbeat-visual.html");

function readFixtureResult() {
  const result = spawnSync(chrome, [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--window-size=390,1600", "--allow-file-access-from-files", "--virtual-time-budget=5000",
    "--dump-dom", `file://${fixture}`,
  ], { encoding: "utf8", timeout: 20000 });
  assert.equal(result.status, 0, result.stderr || "headless Chrome failed");
  const encoded = result.stdout.match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1] || "";
  return JSON.parse(encoded.replaceAll("&quot;", '"').replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">"));
}

test("eighth offbeat contains one in-view horizontal upper beam", () => {
  assert.equal(fs.existsSync(chrome), true, "Google Chrome is required for SVG geometry verification");
  const { offbeatAfter } = readFixtureResult();
  assert.equal(offbeatAfter.beams.length, 1);
  assert.deepEqual(offbeatAfter.beams.map(({ d }) => d), ["M 22 13 H 106"]);
  assert.deepEqual(offbeatAfter.beams.map(({ y }) => y), [11.96]);
  for (const beam of offbeatAfter.beams) {
    assert.equal(beam.width, 77.28);
    assert.equal(beam.height, 0);
    assert.equal(beam.strokeWidth, "3.5px");
    assert.equal(beam.strokeLinecap, "round");
    assert.ok(beam.x >= 0 && beam.x + beam.width <= offbeatAfter.outer.width);
    assert.ok(beam.y >= 0 && beam.y <= offbeatAfter.outer.height);
  }
});

test("repairing eighth offbeat leaves every other subdivision SVG and box unchanged", () => {
  const { unchanged } = readFixtureResult();
  assert.equal(Object.keys(unchanged).length, 9);
  for (const [id, comparison] of Object.entries(unchanged)) {
    assert.deepEqual(comparison.after, comparison.before, id);
  }
});

test("sixteenth alternating extends both beams to the final rest without moving symbols", () => {
  const { alternatingBefore, alternatingAfter } = readFixtureResult();
  assert.deepEqual(alternatingBefore.beams.map(({ d }) => d), ["M 22 13 H 78", "M 22 18 H 78"]);
  assert.deepEqual(alternatingAfter.beams.map(({ d }) => d), ["M 22 13 H 106", "M 22 18 H 106"]);
  assert.deepEqual(alternatingAfter.beams.map(({ width }) => width), [77.28, 77.28]);
  assert.deepEqual(alternatingAfter.beams.map(({ y }) => y), [11.96, 16.56]);
  assert.deepEqual(alternatingAfter.notes, alternatingBefore.notes);
  assert.deepEqual(alternatingAfter.rests, alternatingBefore.rests);
  assert.deepEqual(alternatingAfter.outer, alternatingBefore.outer);
});

test("all ten rhythm notations use the same 0.92 visual scale", () => {
  const { offbeatAfter, unchanged } = readFixtureResult();
  const metrics = [offbeatAfter, ...Object.values(unchanged).map(({ after }) => after)];
  assert.equal(metrics.length, 10);
  for (const metric of metrics) {
    assert.equal(metric.outer.width, 110.4);
    assert.equal(metric.outer.height, 40.48);
  }
});
