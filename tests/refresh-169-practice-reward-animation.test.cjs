const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");

test("practice reward dialog owns a dedicated hidden water animation", () => {
  assert.match(html, /id="practiceRewardWaterAnimation" class="practice-reward-water-animation hidden"/);
  assert.match(html, /id="practiceRewardWaterNumber">\+0/);
  assert.match(html, /id="practiceRewardWaterAnnouncement"[^>]*aria-live="polite"/);
});

test("completion water total is based on the formal balance delta", () => {
  assert.match(app, /function getPracticeCompletionWaterDelta\(waterBeforeCompletion\) \{\s*return Math\.max\(0, getWaterDrops\(\) - Math\.max\(0, Number\(waterBeforeCompletion\) \|\| 0\)\)/);
  assert.doesNotMatch(app, /parseInt\([^\n]*(goalToast|bonusMessages|waterResult)/);
});

test("interval completion captures balance before every reward and passes the final delta", () => {
  const block = app.match(/function finishIntervalPractice\(\) \{([\s\S]*?)\n\}/)?.[1] || "";
  assert.ok(block.indexOf("const waterBeforeCompletion = getWaterDrops()") < block.indexOf("markIntervalDailyGoalsDone"));
  assert.ok(block.indexOf("awardDailyTaskBonusIfNeeded") < block.indexOf("getPracticeCompletionWaterDelta"));
  assert.match(block, /showPracticeCompletionRewardDialog\("音程練習", waterResult, goalResult, bonusMessages, totalWaterGranted, \{/);
});

test("long-tone completion captures balance before every reward and passes the final delta", () => {
  const block = app.match(/if \(cycle >= totalCycles\) \{([\s\S]*?)\n\s*return;/)?.[1] || "";
  assert.ok(block.indexOf("const waterBeforeCompletion = getWaterDrops()") < block.indexOf("markDailyGoalDone"));
  assert.ok(block.indexOf("awardStreakMilestoneBonusesIfNeeded") < block.indexOf("getPracticeCompletionWaterDelta"));
  assert.match(block, /showLongToneCompletion\(\{[^}]*totalWaterGranted[^}]*\}\)/);
});

test("formal and quick long-tone and interval flows share the same animation dialog", () => {
  assert.match(app, /showPracticeCompletionRewardDialog\("音程練習"/);
  assert.match(app, /showPracticeCompletionRewardDialog\(exercise\.title/);
  assert.match(app, /runPracticeSettlement\(\{[\s\S]*practiceName[\s\S]*totalWaterGranted/);
  assert.match(app, /animatePracticeRewardWater\(totalWaterGranted, session\)/);
});

test("water reward uses fast fake values then slows to the exact result", () => {
  const block = app.match(/async function animatePracticeRewardWater\(totalWaterGranted, session\) \{([\s\S]*?)\n\}/)?.[1] || "";
  assert.match(block, /waterFastSteps/);
  assert.match(block, /waterSlowSteps/);
  assert.match(block, /number\.textContent = `\+\$\{total\}`/);
  assert.match(block, /if \(total === 0 \|\| reducedMotion\)/);
  assert.doesNotMatch(block, /is-expanded|is-floating|is-flying|getBoundingClientRect/);
  assert.doesNotMatch(block, /setInterval/);
});

test("reduced motion skips fake rolling and keeps the exact result", () => {
  assert.match(app, /if \(total === 0 \|\| reducedMotion\) \{\s*await finish/);
  assert.match(css, /prefers-reduced-motion[\s\S]*practice-reward-water-animation/);
  assert.doesNotMatch(css, /body\.practice-reward-active|rewardWaterFloat|rewardWaterFly/);
});

test("closing or replacing the dialog cancels all pending animation work", () => {
  assert.match(app, /function cancelPracticeRewardWaterAnimation\(\)[\s\S]*cancelAnimationFrame[\s\S]*clearTimeout/);
  assert.match(app, /function closeGoalToast\(\)[\s\S]*hidePracticeRewardWaterAnimation/);
  assert.match(app, /if \(label !== "練習獎勵"\) hidePracticeRewardWaterAnimation\(\)/);
});

test("reward roll and final reveal use shared audio context and success haptic", () => {
  assert.match(app, /function schedulePracticeRewardTone[\s\S]*getSharedAudioContext\(\)/);
  assert.match(app, /schedulePracticeRewardTone\(100, \[420, 470, 530, 590, 650\]/);
  assert.match(app, /schedulePracticeRewardTone\(0, \[660, 830, 1040\]/);
  assert.match(app, /ChromaticaHaptics\?\.success/);
  assert.match(app, /settings\.appSound !== false && settings\.completionSound !== false/);
});

test("rank feedback can wait for the reward completion event", () => {
  assert.match(app, /chromatica:practice-reward-complete/);
});

test("reward diagnostics prove effects are removed after close", () => {
  for (const token of ["activeRaf", "pendingTimeouts", "rewardAudioNodes", "particles"]) assert.match(app, new RegExp(token));
  assert.match(app, /practiceRewardAudioNodes\.clear\(\)/);
  assert.match(app, /querySelectorAll\("\[data-reward-particle\]"\)[\s\S]*particle\.remove\(\)/);
});

test("animation never mutates rewards storage or replays completion audio", () => {
  const block = app.match(/function animatePracticeRewardWater\(totalWaterGranted\) \{([\s\S]*?)\n\}/)?.[1] || "";
  assert.doesNotMatch(block, /setWaterDrops|localStorage|award|playSound|markDailyGoal|scheduleAccountSnapshotSave/);
});

test("settlement modal remains bounded on narrow and enlarged text layouts", () => {
  assert.match(css, /\.practice-settlement-card[^}]*width:\s*min\(100%, 430px\)[^}]*max-height:\s*calc\(100dvh/s);
  assert.match(css, /\.practice-settlement-content[^}]*overflow-y:\s*auto/s);
  assert.match(css, /\.practice-reward-water-animation[^}]*min-height:\s*88px/);
});
