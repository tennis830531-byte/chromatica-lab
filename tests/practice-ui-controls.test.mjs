import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const serviceWorker = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");
const androidBuild = fs.readFileSync(new URL("../android/app/build.gradle", import.meta.url), "utf8");

test("microphone preference is device-local and defaults on", () => {
  assert.match(app, /MICROPHONE_ENABLED_KEY = "chromatica\.settings\.microphoneEnabled"/);
  assert.match(app, /localStorage\.getItem\(MICROPHONE_ENABLED_KEY\) !== "false"/);
  assert.match(app, /async function startMic\(\) \{\s+if \(isGardenQaSessionActive\(\)\) return false;\s+if \(!isMicrophoneEnabled\(\)\)/);
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

test("interval score renders all eight groups as two synchronized rows", () => {
  assert.match(html, /id="intervalStaff"/);
  assert.match(html, /id="intervalStaffSecond"/);
  assert.match(html, /id="intervalNoteHelp"/);
  assert.match(html, /id="intervalNoteHelpSecond"/);
  assert.doesNotMatch(html, /intervalNextPreview|intervalPrevPageBtn|intervalNextPageBtn/);
  assert.match(app, /const firstLineGroups = state\.groups\.slice\(0, INTERVAL_GROUPS_PER_PAGE\)/);
  assert.match(app, /const secondLineGroups = state\.groups\.slice\(INTERVAL_GROUPS_PER_PAGE, INTERVAL_GROUPS_PER_PAGE \* 2\)/);
  assert.match(app, /intervalNoteHelp"\)\.innerHTML = renderIntervalNumberHelp\(firstLineGroups, 0, state\.groupIndex, activeNoteIndex\)/);
  assert.match(app, /intervalNoteHelpSecond"\)\.innerHTML = renderIntervalNumberHelp\(secondLineGroups, INTERVAL_GROUPS_PER_PAGE, state\.groupIndex, activeNoteIndex\)/);
  assert.doesNotMatch(app, /function changeIntervalScorePage|function clampIntervalPage/);
});

test("numbered notation keeps the long dash and raises it above the baseline", () => {
  assert.match(app, /class="jianpu-hold\$\{isActiveNote \? " active" : ""\}" aria-label="延長一拍">—<\/b>/);
  assert.doesNotMatch(app, /class="jianpu-hold[^>]*>[－＿_]<\/b>/);
  assert.match(css, /\.jianpu-hold \{[^}]*transform: translateY\(-7px\);/s);
});

test("practice rewards and daily-goal progress run in the settlement overlay before the original page", () => {
  assert.doesNotMatch(html, /id="intervalCompleteWater"|id="longToneCompleteWater"/);
  assert.doesNotMatch(html, /id="intervalCompleteNote"|id="longToneCompleteNote"/);
  assert.match(html, /id="practiceSettlementOverlay"[^>]*data-state="idle"/);
  assert.match(app, /function showPracticeCompletionRewardDialog\([\s\S]*options = \{\},[\s\S]*return runPracticeSettlement\(/);
  assert.match(app, /leaderboardResultPromise: options\.leaderboardResultPromise/);
  assert.match(app, /showOriginalCompletionPage: options\.showOriginalCompletionPage/);
  assert.equal((app.match(/const completedFromQuickPractice = hasActiveQuickPracticeTask\(\);/g) || []).length, 2);
  assert.match(app, /handleQuickPracticeCompletion\("音程練習", completedFromQuickPractice\);\s*void showPracticeCompletionRewardDialog\("音程練習"[\s\S]*showOriginalCompletionPage\(\) \{\s*\$\("#intervalComplete"\)\.classList\.remove\("hidden"\)/);
  assert.match(app, /handleQuickPracticeCompletion\(exercise\.title, completedFromQuickPractice\);\s*void showPracticeCompletionRewardDialog\(exercise\.title[\s\S]*showOriginalCompletionPage\(\) \{\s*setLongToneCompletionVisible\(true\)/);
});

test("daily goal reward note is a fixed two-line message", () => {
  assert.match(css, /#dailyGoalSummary\s*\{\s*font-family: var\(--font-sans\);\s*font-weight: 900;/);
  assert.match(html, /class="daily-goal-bonus-note">\s*<span>每完成一項任務獲得 5 💧<\/span>\s*<span>全部完成再加 20 💧！<\/span>/);
  assert.doesNotMatch(html, /獲得 5 💧，全部完成/);
  assert.match(css, /\.daily-goal-copy \.daily-goal-bonus-note span\s*\{\s*display: block;\s*font-size: 12px;/);
  assert.match(css, /\.daily-goal-copy \.daily-goal-bonus-note\s*\{[\s\S]*?font-size: 12px/);
  assert.match(css, /\.daily-goal-sticky\s*\{[\s\S]*?width: clamp\(88px, 22vw, 116px\)/);
  assert.match(css, /@media \(max-width: 420px\)[\s\S]*?\.daily-goal-sticky\s*\{\s*width: 92px/);
});

test("today recommendation badge uses the quick-practice green treatment", () => {
  assert.match(html, /quick-practice-card[\s\S]*?room-badge open">今日推薦/);
  assert.match(css, /\.quick-practice-card \.room-badge\.open\s*\{\s*background: #7fa45f;/);
});

test("refresh-171 web and Android release metadata stay aligned", () => {
  assert.match(html, /version-number">refresh-171</);
  assert.doesNotMatch(html, /refresh-166/);
  assert.match(serviceWorker, /CACHE_NAME = "chromatica-lab-refresh-171"/);
  assert.doesNotMatch(serviceWorker, /refresh-166/);
  assert.match(app, /appVersion: "refresh-171 \/ Android 1\.0\.55 \(56\)"/);
  assert.match(androidBuild, /versionCode 56/);
  assert.match(androidBuild, /versionName "1\.0\.55"/);
});
