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
  assert.match(app, /if \(enabled\) \{[\s\S]*?requestMicrophoneFromSettings\(\)[\s\S]*?} else \{[\s\S]*?stopPractice\(false\);[\s\S]*?stopMicrophoneResources\(\)/);
  assert.match(app, /麥克風已關閉，本次練習已停止。/);
});

test("long tone and interval have explicit practice-list return controls", () => {
  assert.equal((html.match(/aria-label="返回練習列表"/g) || []).length >= 2, true);
  assert.match(app, /function cleanupPracticeForReturn\(type\)/);
  assert.match(html, /結束本次練習/);
});

test("obsolete interval subtitle is removed while five-combo goal remains", () => {
  assert.doesNotMatch(html, /第一版由你自行判斷/);
  assert.doesNotMatch(html, /自己聽、自己判斷/);
  assert.match(app, /音程組合挑戰 5 次/);
});

test("settings requests microphone permission directly without an unauthorized label", () => {
  assert.doesNotMatch(html, /已開啟，尚未授權/);
  assert.match(app, /async function requestMicrophoneFromSettings\(\)/);
  assert.match(app, /if \(view === "audio"[\s\S]*?requestMicrophoneFromSettings\(\)/);
  assert.match(app, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(app, /麥克風授權遭拒，請至系統設定允許後再開啟。/);
});

test("long-tone goal heading is removed without removing its guide", () => {
  assert.doesNotMatch(html, /id="toneCardTitle"/);
  assert.match(html, /id="waveGuide"/);
});

test("interval score previews the next page before page turnover", () => {
  assert.match(html, /id="intervalNextPreview"/);
  assert.match(app, /const nextPageStart = pageStart \+ INTERVAL_GROUPS_PER_PAGE/);
  assert.match(app, /下一輪第 1 頁預覽/);
  assert.match(html, /id="intervalPrevPageBtn"[^>]*>上一頁</);
  assert.match(html, /id="intervalNextPageBtn"[^>]*>下一頁</);
  assert.match(app, /function clampIntervalPage\(page, totalPages\)/);
  assert.match(app, /state\.page = clampIntervalPage\(state\.page \+ delta, totalPages\)/);
  assert.match(app, /intervalPracticeState\.page = 0;[\s\S]*?intervalPracticeState\.lastActivePage = 0;/);
  assert.match(app, /intervalStaff"\)\.innerHTML = createIntervalStaffSvg\([\s\S]*?pageGroups/);
  assert.match(app, /intervalNoteHelp"\)\.innerHTML = renderIntervalNumberHelp\(pageGroups/);
  assert.match(app, /intervalPrevPageBtn"\)\.disabled = state\.page <= 0/);
  assert.match(app, /intervalNextPageBtn"\)\.disabled = state\.page >= totalPages - 1/);
});
