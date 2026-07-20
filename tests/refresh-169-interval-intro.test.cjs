const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");

test("interval precautions use long-tone modal style and required content", () => {
  const start = html.indexOf('id="intervalIntroModal"');
  const modal = html.slice(start, html.indexOf('id="gardenSpiritModal"', start));
  for (const text of ["音程練習注意事項", "先確認調性、音程與方向", "不使用麥克風判斷", "逐步提高 BPM", "尚未完成的進度不會記錄", "返回", "我知道了，開始練習"]) assert.match(modal, new RegExp(text));
  assert.match(modal, /class="longtone-intro-backdrop hidden"/);
});

test("long-tone precautions provide a visible back action", () => {
  const start = html.indexOf('id="longToneIntroModal"');
  const modal = html.slice(start, html.indexOf('id="intervalIntroModal"', start));
  assert.match(modal, /id="longToneIntroBack"[^>]*>返回<\/button>/);
  assert.match(app, /longToneIntroBack[^\n]*setLongToneIntroOpen\(false\)/);
});

test("only practice-list interval button requests precautions", () => {
  assert.equal((html.match(/data-interval-intro="true"/g) || []).length, 1);
  assert.match(html, /data-view="interval" data-interval-intro="true"[^>]*>開始音程練習/);
  assert.doesNotMatch(app.match(/function launchQuickPracticeTask[\s\S]*?\n\}/)?.[0] || "", /setIntervalIntroOpen/);
  const dailyBindingStart = app.indexOf('$("#dailyGoalList").addEventListener');
  const dailyBinding = app.slice(dailyBindingStart, app.indexOf('$("#calendarToggle")', dailyBindingStart));
  assert.doesNotMatch(dailyBinding, /setIntervalIntroOpen/);
});

test("confirm enters setup while cancel and backdrop stay on practice list", () => {
  assert.match(app, /function confirmIntervalIntro\(\)[\s\S]*setView\("interval"\)[\s\S]*showIntervalSetup\(\)/);
  assert.match(app, /intervalIntroBack[^\n]*setIntervalIntroOpen\(false\)/);
  assert.match(app, /event\.target\.id === "intervalIntroModal"[\s\S]*ChromaticaHaptics\?\.close[\s\S]*setIntervalIntroOpen\(false\)/);
});

test("Android back closes precautions before navigating or exiting", () => {
  const back = app.match(/App\.addListener\("backButton"[\s\S]*?\n  \}\)/)?.[0] || "";
  assert.ok(back.indexOf("longToneIntroModal") < back.indexOf("intervalIntroModal"));
  assert.ok(back.indexOf("intervalIntroModal") < back.indexOf('currentView === "metronome"'));
  assert.match(back, /ChromaticaHaptics\?\.close/);
});

test("precautions do not start microphone metronome rewards or records", () => {
  const open = app.match(/function setIntervalIntroOpen[\s\S]*?\n\}/)?.[0] || "";
  assert.doesNotMatch(open, /startMic|startIntervalMetronome|setWaterDrops|markDailyGoal|saveIntervalPracticeRecord/);
});
