const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "button-practice.js"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const visualFixture = fs.readFileSync(path.join(root, "tests/fixtures/button-practice-visual.html"), "utf8");
const buildWeb = fs.readFileSync(path.join(root, "scripts/build-web.mjs"), "utf8");
const serviceWorker = fs.readFileSync(path.join(root, "sw.js"), "utf8");
const electricPianoPath = path.join(root, "public/assets/sounds/button-practice-electric-piano-a4.wav");
const electricPianoSample = fs.readFileSync(electricPianoPath);
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
  return { mode: "same-hole", range: "middle", bpm: 60, totalCycles: 4, ...overrides };
}

function flatten(measures) { return measures.flatMap((measure) => measure.notes); }
const NEW_MODES = ["same-hole", "breath-switch", "hole-shift", "mixed"];

function transitionTypes(sequence) {
  const types = new Set();
  for (let index = 1; index < sequence.length; index += 1) {
    const previous = sequence[index - 1];
    const current = sequence[index];
    if (previous.hole !== current.hole) types.add("hole-shift");
    else if (previous.breath !== current.breath) types.add("breath-switch");
    else if (previous.pressed !== current.pressed) types.add("same-hole");
  }
  return types;
}

function seededRng(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

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

test("setup keeps the four concise controls and adds one persisted note-demo toggle", () => {
  const setup = html.slice(html.indexOf('id="buttonPracticeSetup"'), html.indexOf('id="buttonPracticePlayer"'));
  for (const id of ["buttonPracticeMode", "buttonPracticeRange", "buttonPracticeBpm", "buttonPracticeCycles", "buttonPracticeNoteDemo"]) {
    assert.match(setup, new RegExp(`id="${id}"`));
  }
  assert.equal((setup.match(/<label class="interval-setting/g) || []).length, 5);
  assert.match(setup, /音符示範音/);
  assert.match(setup, /播放每個音符對應的音高；預備拍與休息拍使用節拍聲。/);
  assert.match(setup, /id="buttonPracticeNoteDemo"[^>]*checked/);
  assert.doesNotMatch(setup, /buttonPracticeDifficulty|buttonPracticePattern|buttonPracticeCountdown|buttonPracticeMetronome|難度|練習類型|開始前倒數|節拍音/);
  assert.doesNotMatch(source, /buttonPracticeDifficulty|buttonPracticePattern|buttonPracticeCountdown|buttonPracticeMetronome[^D]/);
});

test("mode selector exposes the four consolidated practice modes only", () => {
  const selector = html.match(/<select id="buttonPracticeMode"[\s\S]*?<\/select>/)?.[0] || "";
  assert.deepEqual([...selector.matchAll(/<option value="([^"]+)"/g)].map((match) => match[1]), NEW_MODES);
  for (const label of ["同孔按放", "吹吸切換", "移孔按放", "綜合練習"]) assert.match(selector, new RegExp(label));
  assert.doesNotMatch(selector, /隨機按鍵|半音階穿梭|按鍵移位/);
});

test("range selector keeps only low, middle, and high while legacy full values become middle", () => {
  const selector = html.match(/<select id="buttonPracticeRange"[\s\S]*?<\/select>/)?.[0] || "";
  assert.deepEqual([...selector.matchAll(/<option value="([^"]+)"/g)].map((match) => match[1]), ["low", "middle", "high"]);
  assert.doesNotMatch(selector, /全音域|value="(?:all|full|full-range)"/);
  assert.doesNotMatch(visualFixture, /全音域/);
  for (const legacyRange of ["all", "full-range", "full"]) {
    assert.equal(core.normalizeSettings(settings({ range: legacyRange })).range, "middle");
  }
  assert.equal(core.normalizeSettings(settings({ range: "low" })).range, "low");
  assert.doesNotMatch(source, /range === "full"|full-range|全音域/);
});

test("every mode pre-generates eight four-quarter-note measures from real 12-hole positions", () => {
  for (const mode of NEW_MODES) {
    const selected = settings({ mode });
    const measures = core.generateMeasures(selected, layout, seededRng(177));
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
  for (const range of ["low", "middle", "high"]) {
    for (const mode of NEW_MODES) {
      const sequence = core.generateSequence(settings({ mode, range }), layout, seededRng(301));
      assert.ok(sequence.every((entry) => core.numberedRegister(entry.note) !== "double-low"));
      assert.ok(sequence.every((entry) => core.isInRange(entry.note, range)));
    }
  }
});

test("same-hole mode fixes one hole and breath while alternating button states", () => {
  for (const range of ["low", "middle", "high"]) {
    const sequence = core.generateSequence(settings({ mode: "same-hole", range }), layout, seededRng(177));
    assert.equal(new Set(sequence.map((entry) => entry.hole)).size, 1);
    assert.equal(new Set(sequence.map((entry) => entry.breath)).size, 1);
    assert.deepEqual([...new Set(sequence.map((entry) => entry.pressed))].sort(), [false, true]);
  }
  const starts = [8, 28, 52, 78, 94].map((seed) => core.generateSequence(settings(), layout, seededRng(seed))[0].note);
  assert.ok(new Set(starts).size > 1);
});

test("breath-switch mode always combines blow, draw, pressed, and released notes", () => {
  for (const range of ["low", "middle", "high"]) {
    const measures = core.generateMeasures(settings({ mode: "breath-switch", range }), layout, seededRng(301));
    for (const measure of measures) {
      assert.equal(new Set(measure.notes.map((entry) => entry.breath)).size, 2);
      assert.ok(measure.notes.some((entry) => entry.breath === "吹音"));
      assert.ok(measure.notes.some((entry) => entry.breath === "吸音"));
      assert.deepEqual([...new Set(measure.notes.map((entry) => entry.pressed))].sort(), [false, true]);
      measure.notes.forEach(assertCanonical);
    }
  }
});

test("hole-shift mode uses multiple valid holes in every measure", () => {
  for (const range of ["low", "middle", "high"]) {
    const measures = core.generateMeasures(settings({ mode: "hole-shift", range }), layout, seededRng(109));
    for (const measure of measures) {
      assert.ok(new Set(measure.notes.map((entry) => entry.hole)).size > 1);
      measure.notes.forEach(assertCanonical);
    }
  }
});

test("mixed mode guarantees multiple action types without a separate pattern setting", () => {
  for (const range of ["low", "middle", "high"]) {
    for (const seed of [3, 19, 83]) {
      const sequence = core.generateSequence(settings({ mode: "mixed", range }), layout, seededRng(seed));
      assert.ok(transitionTypes(sequence).size >= 2);
      sequence.forEach(assertCanonical);
    }
  }
  assert.match(source, /mixedChoices\(\["same-hole", "breath-switch", "hole-shift"\], MEASURE_COUNT, rng\)/);
});

test("regenerating any mode can produce a different complete phrase", () => {
  for (const mode of NEW_MODES) {
    const phrases = [13, 29, 47, 71].map((seed) => core.generateSequence(settings({ mode }), layout, seededRng(seed))
      .map((entry) => `${entry.note}:${entry.source}`).join("|"));
    assert.ok(new Set(phrases).size > 1, `${mode} should mix more than one phrase`);
  }
});

test("legacy modes migrate safely while obsolete difficulty and pattern fields are ignored", () => {
  assert.deepEqual(Object.fromEntries(["toggle", "random", "chromatic", "shift"].map((mode) => [mode, core.normalizeSettings(settings({ mode })).mode])), {
    toggle: "same-hole",
    random: "mixed",
    chromatic: "hole-shift",
    shift: "hole-shift",
  });
  const legacy = { ...settings({ mode: "chromatic", range: "high", bpm: 96, totalCycles: 2 }), difficulty: "advanced", pattern: "descending", patternType: "three-bounce" };
  const normalized = core.normalizeSettings(legacy);
  assert.deepEqual(Object.keys(normalized).sort(), ["bpm", "holes", "mode", "noteDemoEnabled", "range", "totalCycles"]);
  assert.equal(normalized.mode, "hole-shift");
  assert.equal(normalized.range, "high");
  assert.equal(core.generateMeasures(legacy, layout, seededRng(177)).length, 8);
  const completionCall = source.match(/adapter\?\.complete\?\.\(\{[\s\S]*?\}, show\)/)?.[0] || "";
  assert.doesNotMatch(completionCall, /difficulty|patternType|pattern:/);
});

test("note demonstration defaults on, persists, and old settings remain compatible", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, value),
  };
  assert.equal(core.readNoteDemoPreference(storage), true);
  assert.equal(core.normalizeSettings(settings()).noteDemoEnabled, true);
  assert.equal(core.saveNoteDemoPreference(false, storage), false);
  assert.equal(values.get(core.NOTE_DEMO_STORAGE_KEY), "false");
  assert.equal(core.readNoteDemoPreference(storage), false);
  assert.equal(core.normalizeSettings({ ...settings(), noteDemoEnabled: false }).noteDemoEnabled, false);
  assert.match(fs.readFileSync(path.join(root, "account-workspace.js"), "utf8"), /chromatica\.settings\.buttonPracticeNoteDemo/);
});

test("note beats and click beats are mutually exclusive and follow BPM duration", () => {
  const calls = [];
  const audioAdapter = {
    playNote: (note, durationMs) => calls.push(["note", note, durationMs]),
    playBeat: (strong) => calls.push(["click", strong]),
  };
  assert.equal(core.playStepAudio({ bpm: 120, noteDemoEnabled: true }, { note: "C#5" }, audioAdapter, true), "note");
  assert.deepEqual(calls, [["note", "C#5", 430]]);
  calls.length = 0;
  assert.equal(core.playStepAudio({ bpm: 60, noteDemoEnabled: true }, null, audioAdapter, true), "click");
  assert.deepEqual(calls, [["click", true]]);
  calls.length = 0;
  assert.equal(core.playStepAudio({ bpm: 60, noteDemoEnabled: false }, { note: "A4" }, audioAdapter, false), "click");
  assert.deepEqual(calls, [["click", false]]);
  calls.length = 0;
  const prepareAdapter = { playPrepareBeat: (strong) => calls.push(["prepare", strong]), playBeat: () => calls.push(["click", false]) };
  assert.equal(core.playPreparationAudio(prepareAdapter, true), "click");
  assert.deepEqual(calls, [["prepare", true]]);
});

test("shared app pitch engine handles accidentals and the saved A4 reference", () => {
  const noteMath = app.slice(app.indexOf("function noteNameToMidi("), app.indexOf("function midiToNoteName("));
  const frequencyMath = app.slice(app.indexOf("function midiToFreq("), app.indexOf("function getNoteLetter("));
  const buttonFrequency = app.slice(app.indexOf("function getButtonPracticeDemoFrequency("), app.indexOf("function connectButtonPracticeDemoSource("));
  const values = vm.runInNewContext(`(() => { let tuningA4 = 440; const BUTTON_PRACTICE_SAMPLE_BASE_FREQUENCY = 440; ${noteMath}\n${frequencyMath}\n${buttonFrequency}\nconst at440 = [getButtonPracticeDemoFrequency("A4"), getButtonPracticeSamplePlaybackRate("A4"), getButtonPracticeSamplePlaybackRate("C#5")]; tuningA4 = 442; return [...at440, getButtonPracticeDemoFrequency("A4"), getButtonPracticeSamplePlaybackRate("A4"), getButtonPracticeSamplePlaybackRate("C#5")]; })()`);
  assert.equal(values[0], 440);
  assert.equal(values[1], 1);
  assert.ok(Math.abs(values[2] - 2 ** (4 / 12)) < 1e-9);
  assert.equal(values[3], 442);
  assert.ok(Math.abs(values[4] - (442 / 440)) < 1e-9);
  assert.ok(Math.abs(values[5] - ((442 * 2 ** (4 / 12)) / 440)) < 1e-9);
  assert.match(app, /TUNING_A4_STORAGE_KEY = "chromatica\.settings\.tuningA4"/);
  assert.match(app, /getButtonPracticeDemoFrequency\(noteName\)[\s\S]*midiToFreq\(noteNameToMidi\(noteName\), tuningA4\)/);
});

test("bundled electric-piano sample is reviewed, cached, and loaded only once", () => {
  assert.equal(electricPianoSample.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(electricPianoSample.subarray(8, 12).toString("ascii"), "WAVE");
  assert.equal(electricPianoSample.readUInt16LE(22), 1);
  assert.equal(electricPianoSample.readUInt32LE(24), 24000);
  assert.equal(electricPianoSample.readUInt16LE(34), 16);
  assert.ok(electricPianoSample.length > 10000 && electricPianoSample.length < 250000);
  const pcm = new Int16Array(electricPianoSample.buffer, electricPianoSample.byteOffset + 44, (electricPianoSample.length - 44) / 2);
  const rms = (start, end) => Math.sqrt(Array.from(pcm.subarray(start, end), (sample) => (sample / 32768) ** 2).reduce((sum, sample) => sum + sample, 0) / (end - start));
  assert.ok(rms(pcm.length - 12000, pcm.length) < rms(0, 12000) * 0.1, "sample should have a natural decay");
  const sha256 = crypto.createHash("sha256").update(electricPianoSample).digest("hex");
  assert.equal(sha256, "42139456fdae89d0bd5f90f2f68fc83ccf8f7ef348d0edc89989a48a9103c93a");
  assert.match(buildWeb, new RegExp(`button-practice-electric-piano-a4\\.wav", "${sha256}`));
  assert.match(serviceWorker, /public\/assets\/sounds\/button-practice-electric-piano-a4\.wav/);
  const loader = app.slice(app.indexOf("function preloadButtonPracticeElectricPiano("), app.indexOf("function stopButtonPracticeDemoTone("));
  assert.match(loader, /if \(buttonPracticeElectricPianoBuffer\) return Promise\.resolve/);
  assert.match(loader, /if \(buttonPracticeElectricPianoLoadPromise\) return buttonPracticeElectricPianoLoadPromise/);
  assert.equal((loader.match(/fetch\(/g) || []).length, 1);
  assert.equal((loader.match(/decodeAudioData\(/g) || []).length, 1);
  assert.match(loader, /\.catch\(\(error\) => \{[\s\S]*return null/);
});

test("electric-piano preload shares one decode promise and a failed load stays non-blocking", async () => {
  const loader = app.slice(app.indexOf("function preloadButtonPracticeElectricPiano("), app.indexOf("function stopButtonPracticeDemoTone("));
  const loadHarness = await vm.runInNewContext(`(async () => {
    let buttonPracticeElectricPianoBuffer = null;
    let buttonPracticeElectricPianoLoadPromise = null;
    const BUTTON_PRACTICE_ELECTRIC_PIANO_URL = "sample.wav";
    let fetchCalls = 0;
    let decodeCalls = 0;
    const decoded = { duration: 3.2 };
    const getSharedAudioContext = () => ({ decodeAudioData: async () => { decodeCalls += 1; return decoded; } });
    const fetch = async () => { fetchCalls += 1; return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) }; };
    ${loader}
    const first = preloadButtonPracticeElectricPiano();
    const second = preloadButtonPracticeElectricPiano();
    const results = await Promise.all([first, second]);
    const third = await preloadButtonPracticeElectricPiano();
    return { fetchCalls, decodeCalls, shared: results[0] === results[1] && results[0] === third };
  })()`, { console });
  assert.equal(loadHarness.fetchCalls, 1);
  assert.equal(loadHarness.decodeCalls, 1);
  assert.equal(loadHarness.shared, true);

  const failureHarness = await vm.runInNewContext(`(async () => {
    let buttonPracticeElectricPianoBuffer = null;
    let buttonPracticeElectricPianoLoadPromise = null;
    const BUTTON_PRACTICE_ELECTRIC_PIANO_URL = "missing.wav";
    let fetchCalls = 0;
    const getSharedAudioContext = () => ({ decodeAudioData: async () => null });
    const fetch = async () => { fetchCalls += 1; throw new Error("offline"); };
    ${loader}
    const first = await preloadButtonPracticeElectricPiano();
    const second = await preloadButtonPracticeElectricPiano();
    return { fetchCalls, first, second };
  })()`, { console: { warn() {} } });
  assert.equal(failureHarness.fetchCalls, 1);
  assert.equal(failureHarness.first, null);
  assert.equal(failureHarness.second, null);
});

test("note beats use the local electric piano while failures safely fall back to sine", () => {
  const player = app.slice(app.indexOf("function connectButtonPracticeDemoSource("), app.indexOf("function playPrepareClick("));
  assert.match(player, /getSharedAudioContext\(\)/);
  assert.match(player, /context\.createBufferSource\(\)/);
  assert.match(player, /source\.buffer = buttonPracticeElectricPianoBuffer/);
  assert.match(player, /source\.playbackRate\.setValueAtTime\(getButtonPracticeSamplePlaybackRate\(noteName\)/);
  assert.match(player, /if \(!buttonPracticeElectricPianoBuffer\)[\s\S]*preloadButtonPracticeElectricPiano\(\)[\s\S]*playButtonPracticeSineFallback/);
  assert.match(player, /function playButtonPracticeSineFallback[\s\S]*oscillator\.type = "sine"/);
  assert.match(player, /exponentialRampToValueAtTime\(peakGain[\s\S]*exponentialRampToValueAtTime\(0\.0001/);
  assert.match(source, /\(60000 \/ targetState\.bpm\) \* 0\.86/);
  assert.match(app, /let buttonPracticeDemoTone = null/);
  assert.match(app, /preloadNoteSample: preloadButtonPracticeElectricPiano/);
  assert.match(app, /playBeat: \(accent\) => playClick\(accent\)/);
  assert.match(app, /playPrepareBeat: \(accent\) => playPrepareClick\(accent\)/);
  assert.match(app, /function playClick\(strong = false\)[\s\S]*if \(!isMetronomeAllowed\(\)\) return/);
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
    change() { this.listeners.get("change")?.({ target: this }); }
    replaceChildren(...children) { this.value = children[0]?.value || ""; }
    setAttribute() {}
  }
  const elements = new Map();
  [...source.matchAll(/\$\("#([A-Za-z0-9]+)"\)/g)].forEach((match) => elements.set(match[1], new FakeElement()));
  Object.assign(elements.get("buttonPracticeMode"), { value: "same-hole" });
  Object.assign(elements.get("buttonPracticeBpm"), { value: "120" });
  Object.assign(elements.get("buttonPracticeCycles"), { value: "2" });
  Object.assign(elements.get("buttonPracticeRange"), { value: "middle" });
  elements.get("buttonPracticePlayer").classList.add("hidden");
  elements.get("buttonPracticeComplete").classList.add("hidden");
  let tick = null;
  let renderCalls = [];
  let latestPhrase = "";
  let stopCalls = 0;
  const audioCalls = [];
  const storedSettings = new Map();
  let settingsChanged = 0;
  const fakeMath = Object.create(Math);
  fakeMath.random = seededRng(177);
  const testWindow = {
    localStorage: { getItem: (key) => storedSettings.get(key) ?? null, setItem: (key, value) => storedSettings.set(key, value) },
    setInterval(callback) { tick = callback; return 1; },
    clearInterval() { tick = null; },
  };
  vm.runInNewContext(source, { window: testWindow, document: { querySelector: (selector) => elements.get(selector.slice(1)) || null, createElement: () => new FakeElement() }, console, Date, Math: fakeMath });
  testWindow.ChromaticaButtonPractice.init({
    getLayout: () => layout,
    renderStaff(measures, activeMeasure, activeNote) {
      latestPhrase = JSON.stringify(measures.flatMap((measure) => measure.notes.map((entry) => `${entry.note}:${entry.pressed}`)));
      renderCalls.push({ activeMeasure, activeNote });
      return "<svg></svg>";
    },
    renderNumberHelp: () => "",
    playBeat: (strong) => audioCalls.push(["click", strong]),
    playPrepareBeat: (strong) => audioCalls.push(["click", strong]),
    playNote: (note, durationMs) => audioCalls.push(["note", note, durationMs]),
    stopNote: () => { stopCalls += 1; },
    settingsChanged: () => { settingsChanged += 1; },
    complete: () => {},
    scrollTo: () => {},
    scrollActiveMeasure: () => {},
  });
  elements.get("buttonPracticeStart").click();
  const originalPhrase = latestPhrase;
  renderCalls = [];
  elements.get("buttonPracticeStartPause").click();
  for (let beat = 0; beat < core.PREPARE_BEATS; beat += 1) tick();
  assert.deepEqual(renderCalls.filter((entry) => entry.activeMeasure >= 0), [{ activeMeasure: 0, activeNote: 0 }]);
  assert.equal(audioCalls.filter(([type]) => type === "click").length, 4);
  assert.equal(audioCalls.filter(([type]) => type === "note").length, 1);
  renderCalls = [];
  tick();
  assert.deepEqual(renderCalls.filter((entry) => entry.activeMeasure >= 0), [{ activeMeasure: 0, activeNote: 1 }]);
  assert.equal(audioCalls.filter(([type]) => type === "click").length, 4);
  assert.equal(audioCalls.filter(([type]) => type === "note").length, 2);
  elements.get("buttonPracticeRestart").click();
  assert.equal(latestPhrase, originalPhrase);
  elements.get("buttonPracticeRegenerate").click();
  assert.notEqual(latestPhrase, originalPhrase);
  elements.get("buttonPracticeNoteDemo").checked = false;
  elements.get("buttonPracticeNoteDemo").change();
  assert.equal(storedSettings.get(core.NOTE_DEMO_STORAGE_KEY), "false");
  assert.equal(settingsChanged, 1);
  assert.ok(stopCalls >= 3);
});

test("one timer drives start, pause, resume, restart, background pause, and one completion", () => {
  assert.match(source, /if \(!state \|\| state\.running \|\| state\.completionRecorded\) return/);
  assert.match(source, /window\.setInterval\(step, 60000 \/ state\.bpm\)/);
  assert.match(source, /function onViewChanged\(view\) \{[\s\S]*if \(view === "buttonpractice"\) void adapter\?\.preloadNoteSample\?\.\(\);[\s\S]*else clearTimer\(\);/);
  assert.match(source, /function clearTimer\(\)[\s\S]*adapter\?\.stopNote\?\.\(\)/);
  assert.match(source, /noteDemoToggle\.addEventListener\("change"[\s\S]*adapter\?\.stopNote\?\.\(\)/);
  for (const action of ["finish", "restart", "regenerate", "showSetup"]) {
    const body = source.match(new RegExp(`function ${action}\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}`))?.[0] || "";
    assert.match(body, /clearTimer\(\)/, `${action} must stop its current tone and pending timer`);
  }
  assert.match(app, /pauseAudioForAppBackground[\s\S]*ChromaticaButtonPractice\?\.stop\?\.\(\)/);
  assert.match(app, /function setSoundSettings\(patch\)[\s\S]*if \(nextSettings\.appSound === false\) stopButtonPracticeDemoTone\(\)/);
  const completion = { completionRecorded: false };
  assert.equal(core.claimCompletion(completion), true);
  assert.equal(core.claimCompletion(completion), false);
});

test("the full phrase fits narrow screens and follows interval score mobile behavior", () => {
  assert.match(css, /@media \(max-width: 360px\)[\s\S]*?\.button-practice-score-card\s*\{[\s\S]*?overflow-x: clip/);
  assert.match(css, /@media \(max-width: 360px\)[\s\S]*?\.interval-settings-grid,[\s\S]*?grid-template-columns: 1fr/);
  assert.match(css, /\.button-practice-number-help\s*\{\s*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.equal((visualFixture.match(/<label class="interval-setting/g) || []).length, 5);
  assert.doesNotMatch(visualFixture, /難度|練習類型|開始前倒數|節拍音/);
  assert.match(app, /scrollIntoView\?\.\(\{ block: "nearest", inline: "center", behavior: "smooth" \}\)/);
});
