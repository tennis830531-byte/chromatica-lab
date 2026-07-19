const assert = require("node:assert/strict");
const test = require("node:test");
const core = require("../quick-practice.js");

test("queue preserves formal daily-goal order and excludes completed tasks", () => {
  const tasks = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const completed = new Set(["b"]);
  const snapshot = core.buildSnapshot(tasks, (task) => ({ done: completed.has(task.id) }));
  assert.equal(snapshot.total, 3);
  assert.equal(snapshot.done, 1);
  assert.deepEqual(snapshot.remaining.map(({ task }) => task.id), ["a", "c"]);
});

test("completion, abort, and reload always derive the next item from formal state", () => {
  const tasks = [{ id: "long", type: "longtone" }, { id: "interval", type: "interval" }];
  const state = new Set();
  const read = () => core.buildSnapshot(tasks, (task) => ({ done: state.has(task.id) }));
  assert.equal(core.getNext(read()).task.id, "long");
  state.add("long");
  assert.equal(core.getNext(read()).task.id, "interval");
  assert.equal(core.getNext(read()).task.id, "interval", "abort does not mutate formal completion");
  const restored = core.buildSnapshot(tasks, (task) => ({ done: state.has(task.id) }));
  assert.equal(core.getNext(restored).task.id, "interval", "reload reconstructs remaining queue");
  state.add("interval");
  assert.equal(core.getNext(read()), null);
});

test("formal completion mode survives every quick-practice exit path", () => {
  const activeTask = { active: true, currentTaskId: "long", justCompletedTitle: "" };
  assert.equal(core.getCompletionMode(false, ""), "formal-practice", "fresh formal long tone");
  assert.equal(core.getCompletionMode(false, ""), "formal-practice", "fresh formal interval");
  for (const exit of ["home", "results", "bottom-nav", "practice-list"]) {
    const reset = core.resetSession(activeTask);
    assert.deepEqual(reset, { active: false, currentTaskId: "", justCompletedTitle: "" }, exit);
    assert.equal(core.getCompletionMode(reset.active, reset.currentTaskId), "formal-practice", exit);
  }
  assert.equal(core.getCompletionMode(true, ""), "formal-practice", "stale active flag is not a quick task");
});

test("only a concrete active quick task enables the dedicated quick completion action", () => {
  assert.equal(core.getCompletionMode(true, "long"), "quick-practice");
  assert.equal(core.getCompletionMode(true, "interval"), "quick-practice");
  assert.equal(core.hasActiveTask(true, "long"), true);
  assert.equal(core.hasActiveTask(true, ""), false);
});

test("quick-practice completion stays on the completion view and offers the next daily task", () => {
  const fs = require("node:fs");
  const app = fs.readFileSync(require.resolve("../app.js"), "utf8");
  const html = fs.readFileSync(require.resolve("../index.html"), "utf8");
  const handler = app.match(/function handleQuickPracticeCompletion[\s\S]*?\n}/)?.[0] || "";
  assert.doesNotMatch(handler, /setView\("quickpractice"\)/);
  assert.match(handler, /繼續下一項每日任務/);
  assert.match(html, /id="longToneQuickNextBtn"/);
  assert.match(html, /id="intervalQuickNextBtn"/);
  assert.match(html, /id="quickPracticePrimaryBtn"[^>]*>準備開始！</);
  assert.match(handler, /if \(!completedFromQuickPractice\)[\s\S]*?classList\.add\("hidden"\)/);
  assert.match(app, /function continueQuickPracticeFromCompletion\(\)[\s\S]*?launchQuickPracticeTask\(next\)/);
  assert.match(app, /intervalQuickNextBtn"\)\?\.addEventListener\("click", continueQuickPracticeFromCompletion\)/);
  assert.match(app, /longToneQuickNextBtn"\)\?\.addEventListener\("click", continueQuickPracticeFromCompletion\)/);
  assert.doesNotMatch(handler, /launchQuickPracticeTask/);
});

test("real navigation handlers clear quick session before formal navigation", () => {
  const fs = require("node:fs");
  const app = fs.readFileSync(require.resolve("../app.js"), "utf8");
  assert.match(app, /function resetQuickPracticeSession\(\)[\s\S]*?quickPracticeActive = reset\.active;[\s\S]*?quickPracticeCurrentTaskId = reset\.currentTaskId;/);
  assert.match(app, /quickPracticeResultsBtn"\)\?\.addEventListener\("click", \(\) => \{\s*resetQuickPracticeSession\(\);\s*setView\("daily"\)/);
  assert.match(app, /quickPracticeHomeBtn"\)\?\.addEventListener\("click", \(\) => \{\s*resetQuickPracticeSession\(\);\s*setView\("intro"\)/);
  assert.match(app, /\$\$\("\[data-view\]"\)[\s\S]*?resetQuickPracticeSession\(\);\s*setView\(button\.dataset\.view/);
  assert.match(app, /dailyGoalList"\)\.addEventListener[\s\S]*?resetQuickPracticeSession\(\);/);
});

test("formal and quick completion paths use the same concrete-task classification", () => {
  const fs = require("node:fs");
  const app = fs.readFileSync(require.resolve("../app.js"), "utf8");
  assert.match(app, /function finishIntervalPractice\(\)[\s\S]*?const completedFromQuickPractice = hasActiveQuickPracticeTask\(\);[\s\S]*?showPracticeCompletionRewardDialog\("音程練習"[\s\S]*?handleQuickPracticeCompletion\("音程練習", completedFromQuickPractice\)/);
  assert.match(app, /function showLongToneCompletion\([^)]*\) \{\s*const completedFromQuickPractice = hasActiveQuickPracticeTask\(\);[\s\S]*?showPracticeCompletionRewardDialog\(exercise\.title[\s\S]*?handleQuickPracticeCompletion\(exercise\.title, completedFromQuickPractice\)/);
  assert.match(app, /source: hasActiveQuickPracticeTask\(\) \? "quick-practice" : "formal-practice"/);
});

test("reward dialog appears once per formal or quick completion and closing has no side effects", () => {
  const fs = require("node:fs");
  const app = fs.readFileSync(require.resolve("../app.js"), "utf8");
  assert.equal((app.match(/showPracticeCompletionRewardDialog\(/g) || []).length, 3, "definition plus two completion calls");
  const closeHandler = app.match(/goalToastClose"\)\.addEventListener\("click",[\s\S]*?\n  \}\);/)?.[0] || "";
  assert.match(closeHandler, /classList\.add\("hidden"\)/);
  assert.doesNotMatch(closeHandler, /setWaterDrops|saveIntervalPracticeRecord|markDailyGoalDone|showPracticeCompletionRewardDialog/);
  for (const renderer of ["renderDailyGoals", "renderQuickPractice", "applyRemoteSnapshot"]) {
    const block = app.match(new RegExp(`function ${renderer}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`))?.[0] || "";
    assert.doesNotMatch(block, /showPracticeCompletionRewardDialog/, renderer);
  }
});
