const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const html = read("index.html");
const app = read("app.js");
const metronome = read("metronome.js");
const gardenQa = read("garden-qa.js");
const gardenShared = read("garden-shared.js");
const leaderboard = read("leaderboard.js");
const announcements = read("announcements.js");
const push = read("push-notifications.js");
const css = read("styles.css");

test("tuner shortcut offers every supported A4 pitch and shares the settings state", () => {
  assert.match(html, /id="tunerReferencePitchOpen"[^>]*aria-haspopup="dialog"/);
  for (let hz = 440; hz <= 445; hz += 1) assert.match(html, new RegExp(`data-tuning-hz="${hz}"`));
  assert.match(app, /TUNING_A4_STORAGE_KEY = "chromatica\.settings\.tuningA4"/);
  assert.match(app, /function setTuningA4\(value/);
  assert.match(app, /tuningSelect[\s\S]*setTuningA4/);
  assert.match(app, /tunerReferencePitchOptions[\s\S]*setTuningA4/);
  assert.match(app, /renderTuningA4Controls/);
});

test("metronome subdivision glyphs are near-white without changing generic notes", () => {
  assert.match(css, /#metronomeRhythmOpen strong,[\s\S]*#metronomeRhythmOpen \.rhythm-notation \{ color: #fffdf8; \}/);
  assert.match(css, /#metronomeRhythmOpen:focus-visible/);
  assert.match(css, /#metronomeRhythmOpen:disabled/);
});

test("all rhythm notations shrink uniformly without resizing their controls", () => {
  assert.match(css, /\.rhythm-notation \{[^}]*width: min\(100%, 120px\); height: 44px;[^}]*transform: scale\(\.92\); transform-origin: center;/);
  assert.match(css, /\.rhythm-notation\.compact \{ width: min\(100%, 88px\); height: 30px; \}/);
  assert.match(css, /\.metronome-rhythm-option \{[^}]*min-height: 92px;/);
  assert.match(css, /\.metronome-stage-selectors button \{[^}]*min-height: 58px;/);
});

test("triplet number has coffee fill with a crisp white outline only", () => {
  assert.match(metronome, /class="rhythm-triplet-glyph"[^>]*y="-14\.25" width="18" height="18" viewBox="-3 -2 30 30"/);
  assert.match(css, /\.rhythm-notation \.rhythm-triplet-glyph \{[^}]*width: 18px; height: 18px;/);
  assert.match(css, /#metronomeRhythmPreview \{ overflow: visible; \}/);
  assert.match(metronome, /<path d="[^"]+" fill="#724523" stroke="#fffaf2"[^>]*stroke-linejoin="round"[^>]*stroke-linecap="round"[^>]*paint-order="stroke fill"[^>]*vector-effect="non-scaling-stroke"[^>]*shape-rendering="geometricPrecision"/);
  assert.doesNotMatch(metronome, /rhythm-triplet-glyph[^>]*(?:style="[^"]*(?:top|transform)|transform=)/);
  assert.doesNotMatch(metronome, /rhythm-triplet[^\n]*<text|class="rhythm-triplet-number"/);
  assert.doesNotMatch(css, /rhythm-triplet[^}]*text-shadow|rhythm-triplet[^}]*filter|rhythm-triplet-number|-webkit-text-stroke/s);
});

test("eighth offbeat alone restores one rounded upper beam", () => {
  assert.match(metronome, /const offbeatBeam = pattern\.id === "eighth-offbeat"/);
  assert.match(metronome, /<path class="rhythm-beam rhythm-offbeat-line" data-offbeat-line="upper" d="M \$\{left \+ 4\} \$\{stemTop\} H \$\{right \+ 4\}"><\/path>/);
  assert.doesNotMatch(metronome, /data-offbeat-line="lower"/);
  assert.match(css, /\.rhythm-notation \.rhythm-note path, \.rhythm-notation \.rhythm-beam \{[^}]*stroke-linecap: round;/);
  assert.match(css, /\.rhythm-notation \.rhythm-beam \{ stroke-width: 3\.5; \}/);
  assert.doesNotMatch(css, /rhythm-offbeat-line/);
});

test("sixteenth alternating alone extends both beams through the final rest column", () => {
  assert.match(metronome, /const beamEndX = pattern\.id === "sixteenth-alternating" \? right \+ 4 : hitPositions\[hitPositions\.length - 1\] \+ 4;/);
  assert.match(metronome, /Array\.from\(\{ length: beamCount \}, \(_, index\) => `<path class="rhythm-beam" d="M \$\{hitPositions\[0\] \+ 4\} \$\{stemTop \+ index \* 5\} H \$\{beamEndX\}"><\/path>`\)/);
});

test("initial metronome start positions both cards from their live bounding boxes", () => {
  assert.match(metronome, /stage\.getBoundingClientRect\(\)/);
  assert.match(metronome, /controls\.getBoundingClientRect\(\)/);
  assert.match(metronome, /visualViewport/);
  assert.match(metronome, /prefers-reduced-motion: reduce/);
  assert.match(metronome, /behavior: reduced \? "auto" : "smooth"/);
  assert.match(metronome, /if \(!playbackAutoPositioned\)[\s\S]*positionPlaybackCards/);
  assert.match(metronome, /playing = false;[\s\S]*playbackAutoPositioned = false/);
});

test("formal and QA gardens share the same card, scene, progress, and collection class contract", () => {
  const required = ["garden-card", "garden-plant-scene", "garden-progress", "garden-collection"];
  for (const className of required) assert.match(gardenShared, new RegExp(className));
  assert.match(html, /id="gardenSharedRoot"/);
  assert.match(html, /id="gardenQaSharedRoot"/);
  assert.doesNotMatch(gardenShared, /cloneNode|ID_MAP/);
  assert.match(gardenShared, /function gardenPresentationMarkup/);
  assert.match(gardenShared, /function applyGardenPlantPresentation\(\{[\s\S]*plant[\s\S]*plantImage[\s\S]*idleLayer[\s\S]*actionLayer[\s\S]*scene/);
  assert.match(gardenShared, /function renderPlantScene/);
  assert.match(gardenShared, /function renderGardenCollection/);
  assert.match(app, /ChromaticaGardenShared\?\.renderPlantScene/);
  assert.match(app, /ChromaticaGardenShared\?\.renderGardenCollection/);
  assert.match(gardenQa, /ChromaticaGardenShared\?\.renderPlantScene/);
  assert.match(gardenQa, /ChromaticaGardenShared\?\.renderGardenCollection/);
  assert.match(gardenQa, /openSpiritDetail/);
  assert.match(gardenQa, /function qaRoot/);
  assert.doesNotMatch(gardenQa, /localStorage|save_game_state|syncBestEffort/);
  assert.match(html, /class="garden-qa-toolbar"[\s\S]*id="gardenQaSharedRoot"/);
});

test("leaderboard is read-only and public profile actions live in member settings", () => {
  const rankingDialog = html.match(/id="leaderboardModal"[\s\S]*?<\/section>\s*<\/div>/)?.[0] || "";
  assert.doesNotMatch(rankingDialog, /編輯公開資料|退出排行榜|leaderboardProfileName/);
  assert.match(html, /會員帳號[\s\S]*排行榜公開資料/);
  assert.match(html, /目前公開頭像[\s\S]*目前公開名字[\s\S]*目前展示精靈/);
  assert.doesNotMatch(html, /退出排行榜|離開排行榜|停止參加|leaderboardAccountLeave|leaderboardLeaveModal/);
  assert.doesNotMatch(leaderboard, /leave_global_leaderboard|leaveLeaderboard|openLeaveConfirmation/);
});

test("home and modal use neutral leaderboard labels while onboarding starts from the leaderboard", () => {
  assert.match(html, /data-leaderboard-open[^>]*aria-label="開啟排行榜"[\s\S]*?<strong>排行榜<\/strong><em>查看本週名次<\/em>/);
  assert.match(html, /id="leaderboardModalTitle">排行榜<\/h2>[\s\S]*class="leaderboard-board-title">乖乖練習王<\/h3>/);
  assert.match(leaderboard, /if \(!joined\)[\s\S]*openProfileEditor\(\{ onboarding: true \}\)/);
  assert.match(leaderboard, /前往排行榜完成首次設定/);
});

test("weekly backend absence offline and auth failures have distinct safe messages", () => {
  assert.match(leaderboard, /PGRST202[\s\S]*排行榜服務正在更新中/);
  assert.match(leaderboard, /failed to fetch[\s\S]*目前無法連線，請稍後再試/);
  assert.match(leaderboard, /PGRST301[\s\S]*登入狀態已失效，請重新登入/);
  assert.match(leaderboard, /console\.warn\("Leaderboard refresh failed\."[,] classified\.kind\)/);
});

test("weekly leaderboard copy removes streak ranking and historic total explanations", () => {
  assert.match(html, /乖乖練習王/);
  assert.doesNotMatch(html, /連續學習王|streak排行|歷史總循環|成績自refresh-170|自refresh-170累積/);
  assert.doesNotMatch(leaderboard, /連續學習王|歷史總循環|成績自refresh-170|自refresh-170累積/);
});

test("leaderboard rows use explicit grid columns for rank avatar name spirit and score", () => {
  assert.match(css, /\.leaderboard-row\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:/s);
  assert.match(leaderboard, /leaderboard-rank[\s\S]*leaderboard-avatar[\s\S]*leaderboard-name[\s\S]*leaderboard-spirit[\s\S]*leaderboard-score/);
  assert.match(css, /minmax\(0,\s*1fr\)/);
});

test("rank movement waits for successful server sync and never claims an offline rank", () => {
  assert.match(leaderboard, /record_weekly_leaderboard_practice/);
  assert.ok(leaderboard.indexOf("invalidateCache();") < leaderboard.indexOf("core.createRankMovement"));
  assert.match(leaderboard, /rankMovementAlreadyShown/);
  assert.match(leaderboard, /chromatica:practice-reward-complete/);
  assert.doesNotMatch(leaderboard.match(/function enqueuePracticeCompletion[\s\S]*?\n\}/)?.[0] || "", /presentRankMovement/);
});

test("announcement preview truncates ten Unicode graphemes and appears once per runtime", () => {
  assert.match(announcements, /Intl\?\.Segmenter|Intl\.Segmenter/);
  assert.match(announcements, /slice\(0,\s*limit\)/);
  assert.match(announcements, /truncateGraphemes\(announcement\.body, 10\)/);
  assert.match(announcements, /runtimePreviewShown/);
  assert.match(announcements, /chromaticaStartupState\?\.workspaceStatus === "ready"/);
  assert.match(announcements, /document\.body\.classList\.contains\("auth-authenticated"\)/);
  assert.match(announcements, /showFull/);
  assert.match(announcements, /textContent/);
});

test("two independent push preferences default on and permission remains user initiated", () => {
  assert.match(html, /id="leaderboardWeeklyResultToggle"[^>]*checked/);
  assert.match(html, /id="leaderboardMovementToggle"[^>]*checked/);
  assert.match(push, /chromatica\.settings\.leaderboardWeeklyResults/);
  assert.match(push, /chromatica\.settings\.leaderboardTopTenChanges/);
  assert.match(push, /requestPermissionFromUserGesture/);
  assert.match(push, /requestPermissions\(\)/);
  assert.match(push, /createChannel/);
  assert.match(push, /id: "leaderboard-rankings"/);
  assert.match(push, /推播服務尚未完成設定；排行榜仍可正常使用。/);
  assert.match(push, /nativePushConfigured/);
  assert.match(push, /if \(!nativePushConfigured\(\)\) return reportUnavailablePushSetup\(\)/);
  assert.match(push, /register_leaderboard_push_token/);
  assert.match(push, /unregisterForSignOut/);
  assert.match(push, /preservePreferences:\s*true/);
  assert.match(push, /get_leaderboard_push_preferences/);
  assert.match(push, /set_leaderboard_push_preferences/);
  assert.doesNotMatch(push, /console\.(?:log|info|warn|error)\([^\n]*token/i);
});

test("practice reward is staged and still emits one completion event", () => {
  assert.doesNotMatch(css, /body\.practice-reward-active|\.is-expanded|\.is-floating|\.is-flying/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(app, /PRACTICE_SETTLEMENT_STATES/);
  assert.match(app, /waterFastSteps/);
  assert.match(app, /waterSlowSteps/);
  assert.match(app, /chromatica:practice-reward-complete/);
  assert.match(app, /isPracticeRewardAnimationRunning/);
});
