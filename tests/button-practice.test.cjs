const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "button-practice.js"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const visualFixture = fs.readFileSync(path.join(root, "tests/fixtures/button-practice-visual.html"), "utf8");
const context = { window: {}, document: { querySelector: () => null }, console };
vm.runInNewContext(source, context, { filename: "button-practice.js" });
const core = context.window.ChromaticaButtonPracticeCore;
const layoutStart = app.indexOf("const chromaticLayouts = ") + "const chromaticLayouts = ".length;
const layoutEnd = app.indexOf(";\n\nconst mapHarmonicaImages", layoutStart);
const layouts = vm.runInNewContext(`(${app.slice(layoutStart, layoutEnd)})`);
const layout = layouts[12];
const buttonNumberRenderer = app.slice(
  app.indexOf("function renderButtonPracticeNumberHelp("),
  app.indexOf("function saveButtonPracticeRecord("),
);

function settings(overrides = {}) {
  return { mode: "toggle", difficulty: "normal", pattern: "hold-1", range: "full", ...overrides };
}

function flatten(measures) { return measures.flatMap((measure) => measure.notes); }

function assertCanonical(entry) {
  assert.ok(entry.hole >= 1 && entry.hole <= 12);
  assert.ok(["blow", "draw", "buttonBlow", "buttonDraw"].includes(entry.source));
  assert.equal(entry.note, layout[entry.source][entry.hole - 1]);
  assert.equal(entry.pressed, entry.source.startsWith("button"));
  assert.equal(entry.duration, 1);
}

test("button room uses the interval room structure and removes the single-note dashboard", () => {
  assert.match(html, /class="view interval-practice-view button-practice-view"/);
  for (const id of ["buttonPracticeStaff", "buttonPracticeStaffSecond", "buttonPracticeNumberHelp", "buttonPracticeNumberHelpSecond", "buttonPracticeStartPause", "buttonPracticeRestart", "buttonPracticeRegenerate"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /class="interval-score-line"/);
  assert.doesNotMatch(html, /buttonPracticeCurrentNote|buttonPracticeNextNote|buttonPracticeSlide|button-practice-display/);
  assert.doesNotMatch(html, />目前音</);
  assert.doesNotMatch(html, />下一音</);
});

test("button practice is fixed to the canonical 12-hole layout with no model selector", () => {
  assert.equal(core.FIXED_HOLES, 12);
  assert.doesNotMatch(html, /id="buttonPracticeHoles"|按鍵練習琴型/);
  assert.throws(() => core.generateMeasures(settings(), layouts[14]), /requires-12-hole/);
  assert.throws(() => core.generateMeasures(settings(), layouts[16]), /requires-12-hole/);
});

test("every mode pre-generates eight four-quarter-note measures from real 12-hole positions", () => {
  const cases = [
    settings(),
    settings({ mode: "random", pattern: "reaction" }),
    settings({ mode: "chromatic", pattern: "both" }),
    settings({ mode: "shift", pattern: "press-then-move" }),
  ];
  for (const selected of cases) {
    const measures = core.generateMeasures(selected, layout, () => 0.61);
    assert.equal(measures.length, 8);
    measures.forEach((measure) => {
      assert.equal(measure.notes.length, 4);
      assert.deepEqual([...measure.durations], [1, 1, 1, 1]);
      measure.notes.forEach(assertCanonical);
    });
  }
});

test("range labels and filters follow numbered notation and exclude double-low notes", () => {
  assert.equal(core.registerLabel("low"), "低音");
  assert.equal(core.registerLabel("double-low"), "倍低音");
  assert.equal(core.registerLabel("high"), "高音");
  assert.equal(core.registerLabel("double-high"), "倍高音");
  assert.equal(core.numberedRegister("C3"), "double-low");
  assert.equal(core.numberedRegister("C4"), "low");
  for (const range of ["low", "middle", "high", "full"]) {
    const sequence = core.generateSequence(settings({ mode: "random", pattern: "reaction", range }), layout, () => 0.55);
    assert.ok(sequence.every((entry) => core.numberedRegister(entry.note) !== "double-low"));
    assert.ok(sequence.every((entry) => core.isInRange(entry.note, range)));
  }
});

test("toggle and random modes choose valid non-fixed starting positions", () => {
  const starts = [0.08, 0.28, 0.52, 0.78, 0.94].map((value) => core.generateSequence(settings(), layout, () => value)[0].note);
  assert.ok(new Set(starts).size > 1);
  assert.ok(starts.some((note) => !note.startsWith("C")));
  const randomStarts = [0.11, 0.37, 0.69, 0.91].map((value) => core.generateSequence(settings({ mode: "random", pattern: "reaction" }), layout, () => value)[0].note);
  assert.ok(new Set(randomStarts).size > 1);
  assert.ok(randomStarts.some((note) => !note.startsWith("C")));
});

test("chromatic and shift modes randomize only among starts that can complete their shape", () => {
  for (const pattern of ["ascending", "descending", "both", "three-bounce", "four-bounce"]) {
    const sequence = core.generateSequence(settings({ mode: "chromatic", pattern }), layout, () => 0.73);
    sequence.forEach(assertCanonical);
    assert.ok(sequence.every((entry) => core.isInRange(entry.note, "full")));
    const head = pattern === "four-bounce" ? sequence.slice(0, 4) : pattern === "three-bounce" ? sequence.slice(0, 3) : sequence.slice(0, 8);
    assert.ok(head.slice(1).every((entry, index) => Math.abs(core.noteToMidi(entry.note) - core.noteToMidi(head[index].note)) === 1));
  }
  for (const pattern of ["press-then-move", "move-then-press", "chromatic-move", "breath-switch-press"]) {
    core.generateSequence(settings({ mode: "shift", pattern }), layout, () => 0.77).forEach(assertCanonical);
  }
});

test("random reactions never produce more than two consecutive identical commands", () => {
  let calls = 0;
  const sequence = core.generateSequence(settings({ mode: "random", pattern: "reaction", difficulty: "advanced" }), layout, () => (++calls % 4 ? 0.9 : 0.1));
  let repeated = 1;
  for (let index = 1; index < sequence.length; index += 1) {
    repeated = sequence[index].pressed === sequence[index - 1].pressed ? repeated + 1 : 1;
    assert.ok(repeated <= 2);
  }
});

test("score keeps only staff and numbered notation while their active states stay synchronized", () => {
  assert.match(app, /createIntervalStaffSvg\(groups, "C", activeMeasureIndex, activeNoteIndex, completedNoteCount\)/);
  assert.match(app, /staff-note\.completed-note/);
  assert.match(app, /staff-note\.active-note/);
  assert.match(app, /button-score-note\$\{active \? " active"/);
  assert.match(app, /renderIntervalNumberNote\(entry\.note, active\)/);
  assert.doesNotMatch(buttonNumberRenderer, /button-note-action|entry\.pressed|entry\.hole|entry\.breath|孔|吹音|吸音/);
  assert.doesNotMatch(css, /button-note-action|button-score-note > small/);
  assert.doesNotMatch(visualFixture, /button-note-action|[0-9]+孔| · 吹| · 吸/);
  assert.match(app, /class="bar-line"/);
  assert.match(css, /\.button-score-note\.active\s*\{[\s\S]*?rgba\(211, 79, 69/);
  assert.match(source, /const activeFlatIndex = state\.phase === "play" \? state\.activeFlatIndex : -1/);
});

test("restart preserves the phrase and regenerate is the only player action that creates a new phrase", () => {
  const restart = source.match(/function restart\(\) \{[\s\S]*?\n  \}/)?.[0] || "";
  const regenerate = source.match(/function regenerate\(\) \{[\s\S]*?\n  \}/)?.[0] || "";
  assert.match(restart, /const measures = state\.measures/);
  assert.doesNotMatch(restart, /generateMeasures/);
  assert.match(regenerate, /generateMeasures/);
  assert.match(source, /state\.completedCycles \+= 1;[\s\S]*?state\.completedInCycle = 0/);
  assert.doesNotMatch(source.match(/function step\(\) \{[\s\S]*?\n  \}/)?.[0] || "", /generateMeasures/);
});

test("playback advances exactly one synchronized active note while restart reuses the phrase", () => {
  class FakeClassList {
    constructor() { this.values = new Set(); }
    add(...values) { values.forEach((value) => this.values.add(value)); }
    remove(...values) { values.forEach((value) => this.values.delete(value)); }
    contains(value) { return this.values.has(value); }
    toggle(value, force) { const on = force === undefined ? !this.values.has(value) : Boolean(force); on ? this.values.add(value) : this.values.delete(value); return on; }
  }
  class FakeElement {
    constructor() { this.value = ""; this.checked = false; this.textContent = ""; this.innerHTML = ""; this.classList = new FakeClassList(); this.listeners = new Map(); }
    addEventListener(type, listener) { this.listeners.set(type, listener); }
    click() { this.listeners.get("click")?.({ target: this }); }
    replaceChildren(...children) { this.value = children[0]?.value || ""; }
    setAttribute() {}
  }
  const elements = new Map();
  [...source.matchAll(/\$\("#([A-Za-z0-9]+)"\)/g)].forEach((match) => elements.set(match[1], new FakeElement()));
  Object.assign(elements.get("buttonPracticeMode"), { value: "toggle" });
  Object.assign(elements.get("buttonPracticeDifficulty"), { value: "normal" });
  Object.assign(elements.get("buttonPracticeBpm"), { value: "120" });
  Object.assign(elements.get("buttonPracticeCycles"), { value: "2" });
  Object.assign(elements.get("buttonPracticeRange"), { value: "full" });
  Object.assign(elements.get("buttonPracticeCountdown"), { value: "0" });
  Object.assign(elements.get("buttonPracticeMetronome"), { checked: false });
  elements.get("buttonPracticePlayer").classList.add("hidden");
  elements.get("buttonPracticeComplete").classList.add("hidden");
  let tick = null;
  let renderCalls = [];
  let latestPhrase = "";
  const randomValues = [0.08, 0.21, 0.92, 0.37, 0.61];
  const fakeMath = Object.create(Math);
  fakeMath.random = () => randomValues.shift() ?? 0.5;
  const testWindow = { setInterval(callback) { tick = callback; return 1; }, clearInterval() { tick = null; } };
  vm.runInNewContext(source, { window: testWindow, document: { querySelector: (selector) => elements.get(selector.slice(1)) || null, createElement: () => new FakeElement() }, console, Date, Math: fakeMath });
  testWindow.ChromaticaButtonPractice.init({
    getLayout: () => layout,
    renderStaff(measures, activeMeasure, activeNote) {
      latestPhrase = JSON.stringify(measures.flatMap((measure) => measure.notes.map((entry) => `${entry.note}:${entry.pressed}`)));
      renderCalls.push({ activeMeasure, activeNote });
      return "<svg></svg>";
    },
    renderNumberHelp: () => "",
    playBeat: () => {},
    complete: () => {},
    scrollTo: () => {},
    scrollActiveMeasure: () => {},
  });
  elements.get("buttonPracticeStart").click();
  const originalPhrase = latestPhrase;
  renderCalls = [];
  elements.get("buttonPracticeStartPause").click();
  assert.deepEqual(renderCalls.filter((entry) => entry.activeMeasure >= 0), [{ activeMeasure: 0, activeNote: 0 }]);
  renderCalls = [];
  tick();
  assert.deepEqual(renderCalls.filter((entry) => entry.activeMeasure >= 0), [{ activeMeasure: 0, activeNote: 1 }]);
  elements.get("buttonPracticeRestart").click();
  assert.equal(latestPhrase, originalPhrase);
  elements.get("buttonPracticeRegenerate").click();
  assert.notEqual(latestPhrase, originalPhrase);
});

test("one timer drives start, pause, resume, restart, background pause, and one completion", () => {
  assert.match(source, /if \(!state \|\| state\.running \|\| state\.completionRecorded\) return/);
  assert.match(source, /window\.setInterval\(step, 60000 \/ state\.bpm\)/);
  assert.match(source, /function onViewChanged\(view\) \{ if \(view !== "buttonpractice"\) clearTimer\(\); \}/);
  assert.match(app, /pauseAudioForAppBackground[\s\S]*ChromaticaButtonPractice\?\.stop\?\.\(\)/);
  const completion = { completionRecorded: false };
  assert.equal(core.claimCompletion(completion), true);
  assert.equal(core.claimCompletion(completion), false);
});

test("the full phrase fits narrow screens and follows interval score mobile behavior", () => {
  assert.match(css, /@media \(max-width: 360px\)[\s\S]*?\.button-practice-score-card\s*\{[\s\S]*?overflow-x: clip/);
  assert.match(css, /\.button-practice-number-help\s*\{\s*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(app, /scrollIntoView\?\.\(\{ block: "nearest", inline: "center", behavior: "smooth" \}\)/);
});
