const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const app = read("app.js");
const html = read("index.html");
const css = read("styles.css");
const leaderboard = read("leaderboard.js");

function between(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  return from >= 0 && to > from ? source.slice(from, to) : "";
}

const runFlow = between(app, "function runPracticeSettlement(", "function closeGoalToast(");
const itemBuilder = between(app, "function buildPracticeSettlementItems(", "function renderPracticeSettlementItems(");
const waterAnimation = between(app, "async function animatePracticeRewardWater(", "function getPracticeRewardEffectDiagnostics(");
const intervalCompletion = between(app, "function finishIntervalPractice()", "function setLongToneCompletionVisible(");
const longToneCompletion = between(app, "function showLongToneCompletion(", "function returnToLongTonePractice(");

test("1 completion opens a dedicated fixed safe-area settlement overlay", () => {
  assert.match(html, /id="practiceSettlementOverlay"[^>]*data-state="idle"/);
  assert.match(css, /\.practice-settlement-overlay \{[^}]*position: fixed;[^}]*inset: 0;[^}]*z-index: 1400;[^}]*safe-area-inset-top/s);
});

test("2 one explicit state sequence owns every settlement stage", () => {
  assert.match(app, /PRACTICE_SETTLEMENT_STATES = Object\.freeze\(\[\s*"idle",\s*"entering",\s*"water-slot",\s*"water-result",\s*"task-results",\s*"leaderboard",\s*"closing",\s*"original-completion-page"/s);
  assert.match(runFlow, /setPracticeSettlementState\(session, "entering"\)[\s\S]*waitForPracticeSettlementAdvance\(session, "結束", \{ autoAdvanceSeconds: 5 \}\)[\s\S]*"water-slot"[\s\S]*animatePracticeRewardWater[\s\S]*revealPracticeSettlementItems[\s\S]*waitForPracticeSettlementAdvance\(session, "繼續"\)[\s\S]*"leaderboard"[\s\S]*waitForPracticeSettlementAdvance\(session, "繼續"\)[\s\S]*"closing"/);
});

test("3 the water slot always stops on the actual granted delta", () => {
  assert.match(waterAnimation, /const total = Math\.max\(0, Math\.floor\(Number\(totalWaterGranted\) \|\| 0\)\)/);
  assert.match(waterAnimation, /number\.textContent = `\+\$\{total\}`/);
});

test("4 fake slot values are visual only and never touch storage", () => {
  assert.match(waterAnimation, /visualCeiling/);
  assert.doesNotMatch(waterAnimation, /localStorage|sessionStorage|setWaterDrops|awardGardenWater|markDailyGoal|scheduleAccountSnapshotSave/);
});

test("5 zero water bypasses fake number rolling", () => {
  assert.match(waterAnimation, /if \(total === 0 \|\| reducedMotion\) \{\s*await finish/);
  assert.ok(waterAnimation.indexOf("if (total === 0 || reducedMotion)") < waterAnimation.indexOf("waterFastSteps"));
});

test("6 water reward writes still occur once before presentation", () => {
  assert.equal((intervalCompletion.match(/awardGardenWaterForPractice\(/g) || []).length, 1);
  const longToneWrite = between(app, "if (cycle >= totalCycles)", "return;");
  assert.equal((longToneWrite.match(/awardGardenWaterForPractice\(/g) || []).length, 1);
  assert.ok(intervalCompletion.indexOf("awardGardenWaterForPractice") < intervalCompletion.indexOf("showPracticeCompletionRewardDialog"));
});

test("7 settlement item builder contains only water, daily-task, and first-daily streak results", () => {
  for (const allowed of ["練習循環完成的水滴", "每日任務的水滴", "所有任務完成的水滴", "今日練習水滴", "每日任務完成", "今日任務進度", "七項每日任務全部完成", "連續學習"]) assert.match(itemBuilder, new RegExp(allowed));
  for (const forbidden of ["練習時間", "個人紀錄", "植物成長", "植物採收", "藝術卡牌"]) assert.doesNotMatch(itemBuilder, new RegExp(forbidden));
});

test("8 result cards reveal one by one using the central 180ms cadence", () => {
  assert.match(app, /taskStep: 180/);
  assert.match(app, /for \(let index = 0; index < cards\.length; index \+= 1\)[\s\S]*cards\[index\]\.classList\.add\("is-visible"\)[\s\S]*PRACTICE_SETTLEMENT_TIMING\.taskStep/);
});

test("9 no completed-task card is invented when nothing newly completes", () => {
  assert.match(itemBuilder, /const newlyCompleted = Array\.isArray\(goalResult\?\.newlyCompleted\) \? goalResult\.newlyCompleted : \[\]/);
  assert.match(itemBuilder, /newlyCompleted\.forEach/);
  assert.doesNotMatch(itemBuilder, /newlyCompleted\.length \|\| 1|每日任務完成[^\n]*push/);
});

test("10 daily task mutation remains exactly once in each completion path", () => {
  assert.equal((intervalCompletion.match(/markIntervalDailyGoalsDone\(/g) || []).length, 1);
  const longToneWrite = between(app, "if (cycle >= totalCycles)", "return;");
  assert.equal((longToneWrite.match(/markDailyGoalDone\(/g) || []).length, 1);
  assert.doesNotMatch(runFlow, /markDailyGoalDone|markIntervalDailyGoalsDone|setDailyGoalState/);
});

test("11 leaderboard presentation follows task result presentation", () => {
  assert.ok(runFlow.indexOf("revealPracticeSettlementItems") < runFlow.indexOf('setPracticeSettlementState(session, "leaderboard")'));
});

test("12 successful leaderboard submission returns server ranks and a real weekly score", () => {
  assert.match(leaderboard, /practiceSettlementResults\.set\(event\.eventId,[\s\S]*previousRank:[\s\S]*currentRank:/);
  assert.match(leaderboard, /weeklyCycles: currentRow\?\.score \?\? 0/);
});

test("13 an improved rank shows old and new rank with an upward animation", () => {
  assert.match(app, /currentRank < previousRank[\s\S]*從第 \$\{previousRank\} 名上升至第 \$\{currentRank\} 名[\s\S]*rankDirection = "up"/);
  assert.match(css, /data-rank-direction="up"[\s\S]*practiceSettlementRankUp/);
});

test("13a settlement renders five real ranks on either side and animates overtaken rows", () => {
  assert.match(html, /id="practiceSettlementLeaderboardList"[^>]*自己前後五名的本週排行榜/);
  assert.match(leaderboard, /Math\.abs\(row\.position - currentPosition\) <= 5/);
  assert.match(leaderboard, /nearbyRows,/);
  assert.match(app, /Math\.abs\(position - currentRank\) <= 5/);
  assert.match(app, /practice-settlement-rank-row\$\{row\.isCurrentUser \? " is-me" : ""\}/);
  assert.match(app, /position > currentRank && position <= previousRank/);
  assert.match(app, /visibleDistance = Math\.min\(5, previousRank - currentRank\)/);
  assert.match(css, /\.practice-settlement-leaderboard-list \{[^}]*overflow-y: auto;/s);
  assert.match(css, /\.practice-settlement-rank-row \{[^}]*grid-template-columns:/s);
});

test("14 an unchanged rank uses the approved stable-rank message", () => {
  assert.match(app, /currentRank === previousRank[\s\S]*本週維持第 \$\{currentRank\} 名/);
});

test("15 a first rank uses the approved first-ranking message", () => {
  assert.match(app, /if \(!previousRank\) \{[\s\S]*本週目前第 \$\{currentRank\} 名/);
});

test("16 unavailable leaderboard service cannot block settlement", () => {
  assert.match(app, /排行榜服務正在更新中/);
  assert.match(app, /leaderboardTimeout: 1600/);
  assert.match(runFlow, /try \{[\s\S]*resolvePracticeSettlementLeaderboard[\s\S]*\} catch[\s\S]*finally/);
});

test("17 a non-member skips the leaderboard stage without onboarding interruption", () => {
  assert.match(runFlow, /const leaderboardResult = await resolvePracticeSettlementLeaderboard[\s\S]*if \(leaderboardResult\.status !== "not-joined"\) \{[\s\S]*setPracticeSettlementState\(session, "leaderboard"\)/);
  assert.doesNotMatch(app, /加入排行榜即可查看本週名次/);
  assert.doesNotMatch(runFlow, /openProfileEditor|leaderboardProfileModal/);
});

test("18 rapid taps can resolve only the one active continue gate", () => {
  assert.match(app, /if \(!session\?\.active \|\| !session\.canAdvance \|\| !session\.advanceWaiter\) return/);
  assert.match(app, /session\.canAdvance = false/);
  assert.match(app, /session\.advanceWaiter = null/);
  assert.match(app, /practiceSettlementSession\?\.active\) return practiceSettlementSession\.promise/);
});

test("19 background and foreground changes cannot create a second session", () => {
  assert.equal((runFlow.match(/practiceSettlementSequence/g) || []).length, 1);
  assert.doesNotMatch(app, /visibilitychange[\s\S]{0,300}runPracticeSettlement/);
  assert.match(app, /practiceSettlementSession === session/);
});

test("20 reduced motion removes bounce and fake rolling", () => {
  assert.match(waterAnimation, /reducedMotion/);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*practice-settlement-overlay[\s\S]*animation: none !important/);
});

test("21 background scrolling is locked then restored", () => {
  assert.match(css, /body\.practice-settlement-open \{ overflow: hidden; \}/);
  assert.ok(runFlow.indexOf('document.body.classList.add("practice-settlement-open")') < runFlow.indexOf('document.body.classList.remove("practice-settlement-open")'));
});

test("22 original completion is revealed only after overlay cleanup", () => {
  assert.ok(runFlow.indexOf('overlay.classList.add("hidden")') < runFlow.indexOf("revealOriginalPage()"));
  assert.match(runFlow, /if \(session\.originalShown \|\| !session\.allowOriginal\) return/);
});

test("23 original again buttons keep their existing handlers", () => {
  assert.match(app, /intervalAgainBtn"\)\?\.addEventListener\("click", beginIntervalPractice\)/);
  assert.match(app, /longToneAgainBtn"\)\?\.addEventListener\("click", returnToLongTonePractice\)/);
});

test("24 original back-to-list buttons keep their existing navigation", () => {
  assert.match(app, /intervalBackBtn"\)\?\.addEventListener[\s\S]*showIntervalSetup\(\);[\s\S]*setView\("practicehub"\)/);
  assert.match(app, /longToneBackBtn"\)\?\.addEventListener[\s\S]*setLongToneCompletionVisible\(false\);[\s\S]*setView\("practicehub"\)/);
});

test("25 both original completion page DOM blocks remain byte-for-byte unchanged", () => {
  const interval = html.match(/<section id="intervalComplete"[\s\S]*?<\/section>/)?.[0] || "";
  const longTone = html.match(/<section id="longToneComplete"[\s\S]*?<\/section>/)?.[0] || "";
  assert.equal(crypto.createHash("sha256").update(interval).digest("hex"), "fc540df16dcc26d3a712929a7fb83effae646c3f517cfd6eaa6f6a28f6d95027");
  assert.equal(crypto.createHash("sha256").update(longTone).digest("hex"), "56c696b6494160abc8a6064018312d8a954b607241cfa1fce222bff50bf1f05b");
});

test("26 settlement never replaces or skips the original completion callback", () => {
  assert.match(runFlow, /showOriginalCompletionPage/);
  assert.match(runFlow, /finally \{[\s\S]*revealOriginalPage\(\)/);
  assert.doesNotMatch(runFlow, /setView\("practicehub"\)|setView\("quickpractice"\)/);
});

test("27 quick practice still exposes continue-next-daily-task on the original page", () => {
  assert.match(html, /id="intervalQuickNextBtn"[^>]*>繼續下一項每日任務<\/button>/);
  assert.match(html, /id="longToneQuickNextBtn"[^>]*>繼續下一項每日任務<\/button>/);
  assert.match(app, /handleQuickPracticeCompletion\("音程練習", completedFromQuickPractice\)/);
  assert.match(app, /handleQuickPracticeCompletion\(exercise\.title, completedFromQuickPractice\)/);
});

test("28 completed combined results and leaderboard stages wait for continue", () => {
  assert.equal((runFlow.match(/waitForPracticeSettlementAdvance\(session, "繼續"\)/g) || []).length, 2);
  assert.equal((runFlow.match(/waitForPracticeSettlementAdvance\(session, "結束"/g) || []).length, 1);
  assert.match(html, /id="practiceSettlementNext"[^>]*disabled>請稍候…<\/button>/);
  assert.match(app, /function setPracticeSettlementAdvance\([\s\S]*if \(enabled\) requestAnimationFrame\(\(\) => button\.focus\(\)\)/);
  assert.doesNotMatch(app, /practiceSettlementSkip|skipPracticeSettlementAnimation/);
});

test("29 the original completion page requires the final continue gate", () => {
  const finalGate = runFlow.lastIndexOf('waitForPracticeSettlementAdvance(session, "繼續")');
  assert.ok(finalGate > runFlow.indexOf("renderPracticeSettlementLeaderboard"));
  assert.ok(finalGate < runFlow.indexOf('setPracticeSettlementState(session, "closing")'));
  assert.ok(runFlow.indexOf('setPracticeSettlementState(session, "closing")') < runFlow.indexOf("revealOriginalPage()"));
});

test("30 not-joined membership closes after task results without rendering the leaderboard", () => {
  assert.match(runFlow, /if \(leaderboardResult\.status !== "not-joined"\) \{[\s\S]*renderPracticeSettlementLeaderboard\(leaderboardResult\)[\s\S]*\}\s*setPracticeSettlementState\(session, "closing"\)/);
  assert.doesNotMatch(runFlow, /status === "not-joined"[\s\S]*renderPracticeSettlementLeaderboard/);
});

test("31 water result cards use measured reward-source deltas instead of parsing messages", () => {
  assert.match(itemBuilder, /waterBreakdown\.practiceWater \?\? waterResult\?\.water/);
  assert.match(itemBuilder, /waterBreakdown\.dailyTaskWater/);
  assert.match(itemBuilder, /waterBreakdown\.allTasksWater/);
  assert.match(itemBuilder, /waterBreakdown\.streakMilestoneWater/);
  assert.doesNotMatch(itemBuilder, /parseInt|match\(|bonusMessages|taskRewardMessage/);
  assert.match(intervalCompletion, /waterBeforeAllTasksReward[\s\S]*allTasksWater[\s\S]*waterBeforeStreakReward[\s\S]*streakMilestoneWater[\s\S]*waterBreakdown/);
  assert.match(longToneCompletion, /waterBreakdown/);
});

test("32 categorized water always reconciles to the actual slot total", () => {
  assert.match(itemBuilder, /const categorizedWater = practiceWater \+ dailyTaskWater \+ allTasksWater \+ streakMilestoneWater/);
  assert.match(itemBuilder, /const otherWater = Math\.max\(0, total - categorizedWater\)/);
  assert.match(itemBuilder, /if \(otherWater > 0\)/);
});

test("33 streak day appears only for the first completed practice of the day", () => {
  assert.match(itemBuilder, /if \(goalResult\?\.streakResult\?\.isFirstCompletionToday\)/);
  assert.match(itemBuilder, /value: `第 \$\{currentStreak\} 天`/);
  assert.match(itemBuilder, /今天第一次練習已達成/);
  assert.equal((itemBuilder.match(/title: "連續學習"/g) || []).length, 1);
});

test("34 long-tone pitch panel no longer shows the redundant pitch-observation heading", () => {
  const pitchPanel = html.match(/<div class="mic-panel">[\s\S]*?<button id="calibrateMicBtn"/)?.[0] || "";
  assert.doesNotMatch(pitchPanel, />音準觀察</);
  assert.match(pitchPanel, /id="pitchTuner"/);
});

test("35 the completion sound plays once when the first settlement notice opens", () => {
  assert.match(runFlow, /overlay\.classList\.add\("is-opening"\)[\s\S]*playSound\("practiceComplete"\)[\s\S]*setPracticeSettlementState\(session, "entering"\)/);
  assert.equal((intervalCompletion.match(/playSound\("practiceComplete"\)/g) || []).length, 0);
  assert.equal((longToneCompletion.match(/playSound\("practiceComplete"\)/g) || []).length, 0);
});

test("31 the first settlement page offers 結束 and counts down five seconds", () => {
  assert.match(runFlow, /waitForPracticeSettlementAdvance\(session, "結束", \{ autoAdvanceSeconds: 5 \}\)/);
  assert.match(app, /setPracticeSettlementCountdown\(remaining\)[\s\S]*window\.setInterval[\s\S]*remaining -= 1[\s\S]*window\.setTimeout\(\(\) => entry\.finish\("auto"\), remaining \* 1000\)/);
  assert.match(html, /id="practiceSettlementCountdown"[^>]*aria-live="polite"/);
});

test("32 water animation and daily results share one panel and reveal without an intermediate click", () => {
  assert.match(html, /data-settlement-panel="water-slot"[\s\S]*id="practiceRewardWaterAnimation"[\s\S]*id="practiceSettlementItems"/);
  assert.doesNotMatch(html, /data-settlement-panel="task-results"/);
  assert.match(runFlow, /animatePracticeRewardWater\(totalWaterGranted, session\);\s*await revealPracticeSettlementItems\(session, cards\);\s*await waitForPracticeSettlementAdvance\(session, "繼續"\)/);
});
