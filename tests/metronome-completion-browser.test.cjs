const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const page = path.join(__dirname, "..", "index.html");

test("headless app DOM has no metronome completion overlay or persistent completion copy", () => {
  const result = spawnSync(chrome, [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--window-size=360,844", "--allow-file-access-from-files", "--virtual-time-budget=1500",
    "--dump-dom", `file://${page}`,
  ], { encoding: "utf8", timeout: 30000 });
  assert.equal(result.status, 0, result.stderr || "headless Chrome failed");
  assert.doesNotMatch(result.stdout, /id="metronomeComplete"|節拍器練習完成/);
  assert.match(result.stdout, /id="longToneComplete"/);
  assert.match(result.stdout, /id="intervalComplete"/);
  assert.match(result.stdout, /id="buttonPracticeComplete"/);
});
