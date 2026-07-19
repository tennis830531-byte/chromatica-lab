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
  assert.match(handler, /if \(!quickPracticeActive \|\| !quickPracticeCurrentTaskId\)[\s\S]*?classList\.add\("hidden"\)/);
  assert.match(app, /function continueQuickPracticeFromCompletion\(\)[\s\S]*?launchQuickPracticeTask\(next\)/);
  assert.match(app, /intervalQuickNextBtn"\)\?\.addEventListener\("click", continueQuickPracticeFromCompletion\)/);
  assert.match(app, /longToneQuickNextBtn"\)\?\.addEventListener\("click", continueQuickPracticeFromCompletion\)/);
  assert.doesNotMatch(handler, /launchQuickPracticeTask/);
});
