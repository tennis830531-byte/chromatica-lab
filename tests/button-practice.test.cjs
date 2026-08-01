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
const build = fs.readFileSync(path.join(root, "scripts/build-web.mjs"), "utf8");
const serviceWorker = fs.readFileSync(path.join(root, "sw.js"), "utf8");
const accountWorkspace = fs.readFileSync(path.join(root, "account-workspace.js"), "utf8");

const context = { window: {}, document: { querySelector: () => null }, console };
vm.runInNewContext(source, context, { filename: "button-practice.js" });
const core = context.window.ChromaticaButtonPracticeCore;

const layoutStart = app.indexOf("const chromaticLayouts = ") + "const chromaticLayouts = ".length;
const layoutEnd = app.indexOf(";\n\nconst mapHarmonicaImages", layoutStart);
const layouts = vm.runInNewContext(`(${app.slice(layoutStart, layoutEnd)})`);

function createPracticeHarness() {
  class FakeClassList {
    constructor() { this.values = new Set(); }
    add(...values) { values.forEach((value) => this.values.add(value)); }
    remove(...values) { values.forEach((value) => this.values.delete(value)); }
    contains(value) { return this.values.has(value); }
    toggle(value, force) {
      const enabled = force === undefined ? !this.values.has(value) : Boolean(force);
      if (enabled) this.values.add(value); else this.values.delete(value);
      return enabled;
    }
  }
  class FakeElement {
    constructor() {
      this.value = "";
      this.checked = false;
      this.textContent = "";
      this.innerHTML = "";
      this.children = [];
      this.listeners = new Map();
      this.classList = new FakeClassList();
      this.attributes = new Map();
    }
    addEventListener(type, listener) { this.listeners.set(type, listener); }
    click() { this.listeners.get("click")?.({ target: this }); }
    replaceChildren(...children) {
      this.children = children;
      if (children[0]) this.value = children[0].value;
    }
    setAttribute(name, value) { this.attributes.set(name, value); }
  }
  const elements = new Map();
  [...source.matchAll(/\$\("#([A-Za-z0-9]+)"\)/g)].forEach((match) => elements.set(match[1], new FakeElement()));
  Object.assign(elements.get("buttonPracticeMode"), { value: "toggle" });
  Object.assign(elements.get("buttonPracticeDifficulty"), { value: "normal" });
  Object.assign(elements.get("buttonPracticeBpm"), { value: "120" });
  Object.assign(elements.get("buttonPracticeCycles"), { value: "1" });
  Object.assign(elements.get("buttonPracticeRange"), { value: "middle" });
  Object.assign(elements.get("buttonPracticeHoles"), { value: "12" });
  Object.assign(elements.get("buttonPracticeCountdown"), { value: "0" });
  Object.assign(elements.get("buttonPracticeMetronome"), { checked: false });
  elements.get("buttonPracticePlayer").classList.add("hidden");
  elements.get("buttonPracticeComplete").classList.add("hidden");
  let intervalCallback = null;
  let completionCount = 0;
  const harnessWindow = {
    setInterval(callback) { intervalCallback = callback; return 17; },
    clearInterval() { intervalCallback = null; },
  };
  const harnessContext = {
    window: harnessWindow,
    document: {
      querySelector(selector) { return elements.get(selector.slice(1)) || null; },
      createElement() { return new FakeElement(); },
    },
    console,
    Date,
    Math,
  };
  vm.runInNewContext(source, harnessContext, { filename: "button-practice.js" });
  harnessWindow.ChromaticaButtonPractice.init({
    getLayout: (holes) => layouts[holes],
    renderStaff: () => "<svg></svg>",
    renderNumberHelp: () => "<b>1</b>",
    playBeat: () => {},
    complete: async (_record, show) => { completionCount += 1; show(); },
    navigate: () => {},
    scrollTo: () => {},
  });
  return {
    api: harnessWindow.ChromaticaButtonPractice,
    elements,
    tick: () => intervalCallback?.(),
    hasTimer: () => intervalCallback !== null,
    completionCount: () => completionCount,
  };
}

function settings(overrides = {}) {
  return {
    mode: "toggle",
    difficulty: "normal",
    pattern: "hold-1",
    range: "full",
    ...overrides,
  };
}

function assertCanonicalEntry(entry, layout) {
  assert.ok(entry.hole >= 1 && entry.hole <= layout.blow.length);
  assert.ok(["blow", "draw", "buttonBlow", "buttonDraw"].includes(entry.source));
  assert.equal(entry.note, layout[entry.source][entry.hole - 1]);
  assert.equal(entry.pressed, entry.source.startsWith("button"));
  assert.equal(entry.breath, entry.source.endsWith("Blow") || entry.source === "blow" ? "吹音" : "吸音");
}

test("practice hub marks the button room open and exposes the reused setup and player flow", () => {
  const card = html.slice(html.lastIndexOf("<article", html.indexOf("<h4>按鍵練習室</h4>")), html.indexOf("<h4>節奏練習室</h4>"));
  assert.match(card, /practice-room-card available/);
  assert.match(card, /room-badge open">已開啟/);
  assert.match(card, /data-view="buttonpractice"/);
  for (const id of ["buttonPracticeSetup", "buttonPracticePlayer", "buttonPracticeComplete", "buttonPracticeStartPause", "buttonPracticeRestart", "buttonPracticeSettings"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /class="view interval-practice-view button-practice-view"/);
  assert.match(html, /不使用麥克風判定/);
});

test("all four modes generate canonical playable positions for 12, 14, and 16 holes", () => {
  const cases = [
    settings(),
    settings({ mode: "random", pattern: "reaction" }),
    settings({ mode: "chromatic", pattern: "both" }),
    settings({ mode: "shift", pattern: "press-then-move" }),
  ];
  for (const holes of [12, 14, 16]) {
    for (const selected of cases) {
      const sequence = core.generateSequence(selected, layouts[holes], () => 0.75);
      assert.ok(sequence.length > 0, `${holes} holes ${selected.mode}`);
      sequence.forEach((entry) => assertCanonicalEntry(entry, layouts[holes]));
    }
  }
});

test("range filtering never produces a hole outside the selected third", () => {
  for (const holes of [12, 14, 16]) {
    for (const range of ["low", "middle", "high"]) {
      const [first, last] = core.holeBounds(holes, range);
      const sequence = core.generateSequence(settings({ mode: "chromatic", pattern: "ascending", range }), layouts[holes]);
      assert.ok(sequence.every((entry) => entry.hole >= first && entry.hole <= last));
    }
  }
});

test("toggle mode alternates released and pressed positions for 1, 2, and 4 beats", () => {
  for (const duration of [1, 2, 4]) {
    const sequence = core.generateSequence(settings({ pattern: `hold-${duration}` }), layouts[16]);
    assert.ok(sequence.every((entry) => entry.duration === duration));
    for (let index = 1; index < sequence.length; index += 1) {
      assert.equal(sequence[index].hole, sequence[0].hole);
      assert.equal(sequence[index].breath, sequence[0].breath);
      assert.notEqual(sequence[index].pressed, sequence[index - 1].pressed);
    }
  }
});

test("random reaction difficulty controls timing and prevents more than two identical commands", () => {
  const durations = { beginner: 2, normal: 1, advanced: 0.5 };
  for (const [difficulty, duration] of Object.entries(durations)) {
    let calls = 0;
    const sequence = core.generateSequence(settings({ mode: "random", difficulty, pattern: "reaction" }), layouts[14], () => (++calls % 5 ? 0.9 : 0.1));
    assert.ok(sequence.every((entry) => entry.duration === duration));
    let run = 1;
    for (let index = 1; index < sequence.length; index += 1) {
      run = sequence[index].pressed === sequence[index - 1].pressed ? run + 1 : 1;
      assert.ok(run <= 2);
    }
  }
});

test("chromatic patterns move by real semitones and support every requested shape", () => {
  for (const pattern of ["ascending", "descending", "both", "three-bounce", "four-bounce"]) {
    const sequence = core.generateSequence(settings({ mode: "chromatic", pattern }), layouts[16]);
    const midi = sequence.map((entry) => core.noteToMidi(entry.note));
    assert.ok(midi.every(Number.isFinite));
    assert.ok(midi.slice(1).every((value, index) => Math.abs(value - midi[index]) <= 1));
    if (pattern === "ascending") assert.ok(midi.slice(1).every((value, index) => value > midi[index]));
    if (pattern === "descending") assert.ok(midi.slice(1).every((value, index) => value < midi[index]));
  }
});

test("all button-shift patterns use only real layout combinations", () => {
  for (const pattern of ["press-then-move", "move-then-press", "chromatic-move", "breath-switch-press"]) {
    const sequence = core.generateSequence(settings({ mode: "shift", pattern, difficulty: "advanced" }), layouts[12]);
    assert.ok(sequence.length > 1, pattern);
    sequence.forEach((entry) => assertCanonicalEntry(entry, layouts[12]));
  }
});

test("completion can be claimed only once and saved records are idempotent", () => {
  const state = { completionRecorded: false };
  assert.equal(core.claimCompletion(state), true);
  assert.equal(core.claimCompletion(state), false);
  assert.match(app, /nextHistory\.some\(\(entry\) => entry\?\.id === record\.id\)/);
  assert.match(app, /completeButtonPractice[\s\S]*showPracticeCompletionRewardDialog/);
});

test("start, pause, resume, restart, leave, and completion follow one timer and one record", async () => {
  const harness = createPracticeHarness();
  const element = (id) => harness.elements.get(id);
  element("buttonPracticeStart").click();
  assert.equal(element("buttonPracticeSetup").classList.contains("hidden"), true);
  assert.equal(element("buttonPracticePlayer").classList.contains("hidden"), false);

  element("buttonPracticeStartPause").click();
  assert.equal(harness.hasTimer(), true);
  assert.equal(element("buttonPracticeStartPause").textContent, "暫停練習");
  element("buttonPracticeStartPause").click();
  assert.equal(harness.hasTimer(), false);
  assert.equal(element("buttonPracticeStartPause").textContent, "繼續練習");
  element("buttonPracticeStartPause").click();
  assert.equal(harness.hasTimer(), true);

  element("buttonPracticeRestart").click();
  assert.equal(harness.hasTimer(), false);
  assert.equal(element("buttonPracticeStartPause").textContent, "開始練習");
  element("buttonPracticeStartPause").click();
  for (let index = 0; index < 40 && harness.completionCount() === 0; index += 1) harness.tick();
  await Promise.resolve();
  assert.equal(harness.completionCount(), 1);
  assert.equal(element("buttonPracticeComplete").classList.contains("hidden"), false);
  assert.equal(harness.hasTimer(), false);

  harness.api.onViewChanged("intro");
  assert.equal(harness.hasTimer(), false);
  element("buttonPracticeSettings").click();
  assert.equal(element("buttonPracticeSetup").classList.contains("hidden"), false);
});

test("staff, numbered notation, explicit button text, and mechanical state share existing components", () => {
  assert.match(html, /id="buttonPracticeStaff"[^>]*按鍵練習五線譜/);
  assert.match(html, /id="buttonPracticeNumberHelp"[^>]*按鍵練習簡譜/);
  assert.match(source, /renderNumberHelp\?\.\(staffNotes, 0\)/);
  assert.match(app, /renderButtonPracticeNumberHelp[\s\S]*renderIntervalNumberNote/);
  assert.match(source, /current\.pressed \? "按鍵" : "放鍵"/);
  assert.match(source, /current\.pressed \? "按鍵推入" : "按鍵縮回"/);
  assert.match(css, /\.button-practice-slide\.is-pressed i/);
  assert.match(css, /\.button-practice-next\s*\{\s*opacity: 0\.58;/);
});

test("lifecycle integration prevents duplicate timers and stops playback off-page or in background", () => {
  assert.match(source, /if \(!state \|\| state\.running \|\| state\.completionRecorded\) return;/);
  assert.match(source, /if \(!state\.running\) return;\s*timer = window\.setInterval/);
  assert.match(source, /function onViewChanged\(view\) \{\s*if \(view !== "buttonpractice"\) clearTimer\(\);/);
  assert.match(app, /ChromaticaButtonPractice\?\.onViewChanged\?\.\(view\)/);
  assert.match(app, /pauseAudioForAppBackground[\s\S]*ChromaticaButtonPractice\?\.stop\?\.\(\)/);
});

test("source, offline shell, account history, and narrow-screen styles include the button room", () => {
  assert.match(html, /src="\.\/button-practice\.js\?v=refresh-176"/);
  assert.match(build, /"button-practice\.js"/);
  assert.match(serviceWorker, /"\.\/button-practice\.js\?v=refresh-176"/);
  assert.match(accountWorkspace, /"chromatica\.buttonPracticeHistory"/);
  assert.match(css, /@media \(max-width: 360px\)[\s\S]*\.button-practice-display\s*\{\s*grid-template-columns: minmax\(0, 1fr\) 78px minmax\(0, 1fr\)/);
});
