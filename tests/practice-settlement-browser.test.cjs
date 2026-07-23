const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const fixture = path.join(__dirname, "fixtures", "practice-settlement-visual.html");

function inspect(extra = []) {
  const result = spawnSync(chrome, [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--window-size=390,844", "--allow-file-access-from-files", "--virtual-time-budget=3000",
    ...extra, "--dump-dom", `file://${fixture}`,
  ], { encoding: "utf8", timeout: 30000 });
  assert.equal(result.status, 0, result.stderr || "headless Chrome failed");
  const encoded = result.stdout.match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1] || "";
  return JSON.parse(encoded.replaceAll("&quot;", '"').replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">"));
}

test("real mobile layout keeps the settlement fixed bounded and internally scrollable", () => {
  const result = inspect();
  assert.equal(result.overlay, "fixed");
  assert.equal(result.overlayRect.x, 0);
  assert.equal(result.overlayRect.y, 0);
  assert.equal(result.overlayRect.width, result.viewport.width);
  assert.equal(result.overlayRect.height, result.viewport.height);
  assert.ok(result.cardRect.x >= 14 && result.cardRect.x + result.cardRect.width <= result.viewport.width - 14);
  assert.ok(result.cardRect.y >= 18 && result.cardRect.y + result.cardRect.height <= result.viewport.height - 18);
  assert.equal(result.contentOverflow, "auto");
  assert.equal(result.bodyOverflow, "hidden");
  assert.equal(result.waterRewardMaxWidth, "160px");
  assert.ok(result.waterRewardRect.width <= 160);
  assert.ok(Math.abs((result.waterRewardRect.x + result.waterRewardRect.width / 2) - (result.viewport.width / 2)) <= 1);
});

test("real reduced-motion layout removes item movement without hiding results", () => {
  const result = inspect(["--force-prefers-reduced-motion=reduce"]);
  assert.equal(result.reducedMotion, true);
  assert.equal(result.itemOpacity, "1");
  assert.equal(result.itemTransform, "none");
});
