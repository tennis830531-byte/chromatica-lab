import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("microphone preference is device-local and defaults on", () => {
  assert.match(app, /MICROPHONE_ENABLED_KEY = "chromatica\.settings\.microphoneEnabled"/);
  assert.match(app, /localStorage\.getItem\(MICROPHONE_ENABLED_KEY\) !== "false"/);
  assert.match(app, /async function startMic\(\) \{\s+if \(!isMicrophoneEnabled\(\)\)/);
  assert.doesNotMatch(app, /scheduleAccountSnapshotSave\(\);\s*\n\s*}\s*\n\s*function saveMicrophoneEnabled/);
});

test("turning microphone off releases tracks and stops long tone", () => {
  assert.match(app, /micStream\?\.getTracks\?\.\(\)\.forEach\(\(track\) => track\.stop\(\)\)/);
  assert.match(app, /if \(!enabled\) \{[\s\S]*?stopPractice\(false\);[\s\S]*?stopMicrophoneResources\(\)/);
  assert.match(app, /麥克風已關閉，本次練習已停止。/);
});

test("long tone and interval have explicit practice-list return controls", () => {
  assert.equal((html.match(/aria-label="返回練習列表"/g) || []).length >= 2, true);
  assert.match(app, /function cleanupPracticeForReturn\(type\)/);
  assert.match(html, /結束本次練習/);
});

test("obsolete interval subtitle is removed while five-combo goal remains", () => {
  assert.doesNotMatch(html, /第一版由你自行判斷/);
  assert.match(app, /音程組合挑戰 5 次/);
});
