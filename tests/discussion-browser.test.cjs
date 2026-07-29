const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const fixture = path.join(__dirname, "fixtures", "discussion-phase-one-visual.html");

function inspect(width) {
  const result = spawnSync(chrome, [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    `--window-size=${width},1000`, "--allow-file-access-from-files", "--virtual-time-budget=2500",
    "--dump-dom", `file://${fixture}?viewport=${width}`,
  ], { encoding: "utf8", timeout: 30000 });
  assert.equal(result.status, 0, result.stderr || "headless Chrome failed");
  const encoded = result.stdout.match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1] || "";
  return JSON.parse(encoded.replaceAll("&quot;", '"').replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">"));
}

test("discussion uses the shared QA/form presentation without narrow-screen overflow", () => {
  for (const width of [360, 390, 430]) {
    const result = inspect(width);
    assert.equal(result.viewport, width);
    assert.ok(result.appWidth <= width, `${width}px app overflow`);
    assert.ok(result.viewWidth <= width, `${width}px discussion overflow`);
    for (const box of [result.shell, result.qaPanel, result.composer]) {
      assert.ok(box.left >= 0, `${width}px element clips left`);
      assert.ok(box.right <= width, `${width}px element clips right`);
    }
    assert.equal(result.tabCount, 6);
    assert.ok(result.tabsScrollWidth <= result.tabsClientWidth, "connected tab rows should remain inside their container");
    assert.equal(result.postDraftPreserved, true);
    assert.equal(result.previewVisible, true);
    assert.equal(result.phase2Inputs, 1);
  }
});
