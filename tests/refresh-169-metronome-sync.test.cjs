const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const coreSource = fs.readFileSync(path.join(root, "metronome-core.js"), "utf8");
const ui = fs.readFileSync(path.join(root, "metronome.js"), "utf8");
const context = vm.createContext({});
context.window = context;
vm.runInContext(coreSource, context);
const core = context.ChromaticaMetronomeCore;

test("visual output time prefers getOutputTimestamp and has a latency-safe fallback", () => {
  assert.equal(core.getPresentedAudioTime({ currentTime: 9, getOutputTimestamp: () => ({ contextTime: 8.94 }) }), 8.94);
  assert.equal(core.getPresentedAudioTime({ currentTime: 9, outputLatency: 0.08, baseLatency: 0.02 }), 8.92);
  assert.equal(core.getPresentedAudioTime({ currentTime: 0.03, baseLatency: 0.05 }), 0);
});

test("100ms lookahead cannot present first or second beat before audio time", () => {
  const queue = [
    { audioTime: 1, beatIndex: 0, subdivisionIndex: 0, sequence: 0 },
    { audioTime: 1.5, beatIndex: 1, subdivisionIndex: 0, sequence: 1 },
  ];
  assert.equal(core.consumeDueVisualEvents(queue, 0.999).latestDue, null);
  assert.equal(core.consumeDueVisualEvents(queue, 1).latestDue.beatIndex, 0);
  assert.equal(core.consumeDueVisualEvents(queue, 1.499).latestDue.beatIndex, 0);
  assert.equal(core.consumeDueVisualEvents(queue, 1.5).latestDue.beatIndex, 1);
});

test("overdue events collapse to latest and subdivisions do not move the main dot", () => {
  const queue = [
    { audioTime: 1, beatIndex: 0, subdivisionIndex: 0 },
    { audioTime: 1.125, beatIndex: 0, subdivisionIndex: 1 },
    { audioTime: 1.25, beatIndex: 0, subdivisionIndex: 2 },
  ];
  const result = core.consumeDueVisualEvents(queue, 1.3);
  assert.equal(result.latestDue.subdivisionIndex, 2);
  assert.equal(result.remaining.length, 0);
  assert.match(ui, /if \(event\.subdivisionIndex !== 0\) return/);
});

test("scheduler captures advance-before state and clears both queues on reschedule", () => {
  assert.match(ui, /queueVisualEvent\(state, accent\)[\s\S]*scheduleTone[\s\S]*advanceSchedulerState/);
  assert.match(ui, /beatIndex: state\.beatIndex/);
  assert.match(ui, /const resumeState = scheduledVisualEvents\[0\]\?\.schedulerState \|\| schedulerState/);
  assert.match(ui, /cancelScheduledNodes\(\);\s*clearScheduledVisualEvents\(\)/);
  assert.match(ui, /schedulerTimers: schedulerTimer \? 1 : 0/);
});

test("requested BPM signature and subdivision matrix stays stable for five minutes", () => {
  const bpms = [30, 40, 60, 80, 120, 180];
  const signatures = [[2,4], [4,4], [5,4], [7,8], [12,8]];
  const subdivisions = ["quarter", "eighth", "triplet", "sixteenth"];
  for (const bpm of bpms) for (const [numerator, denominator] of signatures) for (const subdivision of subdivisions) {
    const settings = { bpm, signature: { numerator, denominator }, subdivision, swingPercent: 60, countInMeasures: 0 };
    let state = core.createSchedulerState(settings, 0);
    let previous = -1;
    while (state.nextNoteTime < 300) {
      assert.equal(state.sequence, previous + 1);
      previous = state.sequence;
      state = core.advanceSchedulerState(state, settings);
    }
    assert.ok(state.nextNoteTime >= 300);
    assert.ok(state.nextNoteTime - 300 <= 60 / bpm * (4 / denominator));
  }
});

test("diagnostics expose timing delta and visual queue cleanup", () => {
  for (const token of ["scheduledAudioTime", "presentedVisualTime", "deltaMs", "beatIndex", "subdivisionIndex", "visualQueue"]) assert.match(ui, new RegExp(token));
  assert.match(ui, /clearScheduledVisualEvents\(\);[\s\S]*presentedVisualEvent = null/);
});
