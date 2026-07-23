const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const fixture = path.join(__dirname, "fixtures", "garden-card-collection-visual.html");

test("430px garden collection renders four uncropped 2:3 art cards and equal card backs", () => {
  const result = spawnSync(chrome, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--window-size=430,1100", "--allow-file-access-from-files", "--virtual-time-budget=12000", "--dump-dom", `file://${fixture}`], { encoding: "utf8", timeout: 30000 });
  assert.equal(result.status, 0, result.stderr || "headless Chrome failed");
  const encoded = result.stdout.match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1] || "";
  const data = JSON.parse(encoded.replaceAll("&quot;", '"').replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">"));
  assert.equal(data.error, undefined);
  assert.equal(data.cells.length, 8);
  assert.equal(data.images.length, 3);
  assert.equal(data.legacyThumbs, 0);
  assert.equal(data.columns.trim().split(/\s+/).length, 4);
  for (const cell of data.cells) {
    assert.equal(cell.ratio, "2 / 3");
    assert.ok(Math.abs(cell.rect.width / cell.rect.height - 2 / 3) < 0.01);
  }
  for (const image of data.images) {
    assert.equal(image.naturalWidth, 1024);
    assert.equal(image.naturalHeight, 1536);
    assert.equal(image.objectFit, "contain");
    assert.ok(Math.abs(image.rect.width / image.rect.height - 2 / 3) < 0.01);
  }
  assert.equal(data.cells.filter((cell) => cell.featured).length, 1);
});
