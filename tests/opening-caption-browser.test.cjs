const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const fixture = path.join(__dirname, "fixtures", "opening-caption-visual.html");

function inspectCaption() {
  const result = spawnSync(chrome, [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--window-size=360,800", "--allow-file-access-from-files", "--virtual-time-budget=5000",
    "--dump-dom", `file://${fixture}`,
  ], { encoding: "utf8", timeout: 30000 });
  assert.equal(result.status, 0, result.stderr || "headless Chrome failed");
  const encoded = result.stdout.match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1] || "";
  return JSON.parse(encoded.replaceAll("&quot;", '"').replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">"));
}

test("opening captions load Cubic 11 and stay stable in the 360px lower letterbox", () => {
  assert.equal(fs.existsSync(chrome), true, "Google Chrome is required for caption layout verification");
  const result = inspectCaption();
  assert.equal(result.viewportWidth, 360);
  assert.ok(result.documentWidth <= result.viewportWidth, "caption fixture has horizontal overflow");
  assert.equal(result.fontLoaded, true);
  assert.match(result.fontFamily, /Chromatica Opening Cubic 11/);
  assert.equal(result.fontSize, "20px");
  assert.equal(result.lineCount, 2);
  assert.equal(result.partialLeft, result.fullLeft, "typewriter text shifted while characters appeared");
  assert.ok(result.frameLeft >= 18, "caption crossed the left 5% safe boundary");
  assert.ok(result.frameRight <= 342, "caption crossed the right 5% safe boundary");
  assert.ok(result.frameTop >= result.layerTop);
  assert.ok(result.frameBottom <= result.layerBottom);
  assert.equal(result.pointerEvents, "none");
});
