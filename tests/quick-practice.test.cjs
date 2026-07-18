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
