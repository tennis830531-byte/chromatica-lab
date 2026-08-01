(() => {
  "use strict";

  const FIXED_HOLES = 12;
  const MEASURE_COUNT = 8;
  const BEATS_PER_MEASURE = 4;
  const MODE_LABELS = Object.freeze({ toggle: "按放切換", random: "隨機按鍵反應", chromatic: "半音階穿梭", shift: "按鍵移位" });
  const DIFFICULTY_LABELS = Object.freeze({ beginner: "入門", normal: "普通", advanced: "進階" });
  const RANGE_LABELS = Object.freeze({ full: "全音域", low: "低音域", middle: "中音域", high: "高音域" });
  const PATTERN_OPTIONS = Object.freeze({
    toggle: Object.freeze([
      Object.freeze({ value: "hold-1", label: "1 拍" }),
      Object.freeze({ value: "hold-2", label: "2 拍" }),
      Object.freeze({ value: "hold-4", label: "4 拍" }),
    ]),
    random: Object.freeze([Object.freeze({ value: "reaction", label: "依難度切換" })]),
    chromatic: Object.freeze([
      Object.freeze({ value: "ascending", label: "上行" }),
      Object.freeze({ value: "descending", label: "下行" }),
      Object.freeze({ value: "both", label: "上行後下行" }),
      Object.freeze({ value: "three-bounce", label: "三音來回" }),
      Object.freeze({ value: "four-bounce", label: "四音來回" }),
    ]),
    shift: Object.freeze([
      Object.freeze({ value: "press-then-move", label: "按鍵後移孔" }),
      Object.freeze({ value: "move-then-press", label: "移孔後按鍵" }),
      Object.freeze({ value: "chromatic-move", label: "連續半音移動" }),
      Object.freeze({ value: "breath-switch-press", label: "吹吸轉換＋按鍵" }),
    ]),
  });
  const PATTERN_HEADINGS = Object.freeze({ toggle: "每個狀態維持", random: "反應難度", chromatic: "半音階類型", shift: "移位類型" });
  const $ = (selector) => document.querySelector(selector);
  let adapter = null;
  let initialized = false;
  let timer = 0;
  let state = null;

  function noteToMidi(noteName) {
    const match = String(noteName || "").match(/^([A-G])([#b]?)(\d)$/);
    if (!match) return Number.NaN;
    const semitones = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    return (Number(match[3]) + 1) * 12 + semitones[match[1]] + (match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0);
  }

  function numberedRegister(noteName) {
    const octave = Number(String(noteName || "").match(/(\d)$/)?.[1]);
    if (octave <= 3) return "double-low";
    if (octave === 4) return "low";
    if (octave === 5) return "middle";
    if (octave === 6) return "high";
    return "double-high";
  }

  function registerLabel(register) {
    return ({ "double-low": "倍低音", low: "低音", middle: "中音", high: "高音", "double-high": "倍高音" })[register] || "中音";
  }

  function isInRange(noteName, range) {
    const register = numberedRegister(noteName);
    if (register === "double-low") return false;
    if (range === "full") return true;
    if (range === "high") return register === "high" || register === "double-high";
    return register === range;
  }

  function buildPlayablePositions(layout, range = "full") {
    if (Number(layout?.blow?.length || 0) !== FIXED_HOLES) throw new Error("button-practice-requires-12-hole-layout");
    const positions = [];
    for (let hole = 1; hole <= FIXED_HOLES; hole += 1) {
      const index = hole - 1;
      [["blow", "吹音", false], ["buttonBlow", "吹音", true], ["draw", "吸音", false], ["buttonDraw", "吸音", true]].forEach(([source, breath, pressed]) => {
        const note = layout[source]?.[index];
        if (!note || !Number.isFinite(noteToMidi(note)) || !isInRange(note, range)) return;
        positions.push(Object.freeze({ note, hole, breath, pressed, source, duration: 1 }));
      });
    }
    return positions;
  }

  function pairPositions(positions) {
    const grouped = new Map();
    positions.forEach((position) => {
      const key = `${position.hole}:${position.breath}`;
      const pair = grouped.get(key) || {};
      pair[position.pressed ? "pressed" : "released"] = position;
      grouped.set(key, pair);
    });
    return [...grouped.values()].filter((pair) => pair.released && pair.pressed && pair.released.note !== pair.pressed.note);
  }

  function chromaticPositions(positions) {
    const byPitch = new Map();
    positions.forEach((position) => {
      const midi = noteToMidi(position.note);
      const existing = byPitch.get(midi);
      if (!existing || (existing.pressed && !position.pressed)) byPitch.set(midi, position);
    });
    return [...byPitch.entries()].sort((a, b) => a[0] - b[0]).map((entry) => entry[1]);
  }

  function randomIndex(length, rng) {
    return Math.min(length - 1, Math.max(0, Math.floor(rng() * length)));
  }

  function repeatToLength(pattern, length = MEASURE_COUNT * BEATS_PER_MEASURE) {
    return Array.from({ length }, (_, index) => pattern[index % pattern.length]);
  }

  function generateToggle(pairs, pattern, rng) {
    const pair = pairs[randomIndex(pairs.length, rng)];
    if (!pair) return [];
    const hold = Math.max(1, Number(String(pattern).replace("hold-", "")) || 1);
    return Array.from({ length: MEASURE_COUNT * BEATS_PER_MEASURE }, (_, index) => Math.floor(index / hold) % 2 ? pair.pressed : pair.released);
  }

  function generateRandom(pairs, difficulty, rng) {
    if (!pairs.length) return [];
    const result = [];
    const hold = difficulty === "beginner" ? 2 : 1;
    let lastPressed = null;
    let repeated = 0;
    for (let index = 0; index < MEASURE_COUNT * BEATS_PER_MEASURE; index += 1) {
      if (index % hold === 0) {
        const pair = pairs[randomIndex(pairs.length, rng)];
        let pressed = rng() >= 0.5;
        if (pressed === lastPressed && repeated >= 2) pressed = !pressed;
        repeated = pressed === lastPressed ? repeated + 1 : 1;
        lastPressed = pressed;
        result.push(pressed ? pair.pressed : pair.released);
      } else {
        result.push(result.at(-1));
      }
    }
    return result;
  }

  function contiguousWindows(pitches, minimumLength) {
    const windows = [];
    for (let start = 0; start <= pitches.length - minimumLength; start += 1) {
      const window = pitches.slice(start, start + minimumLength);
      if (window.slice(1).every((entry, index) => noteToMidi(entry.note) === noteToMidi(window[index].note) + 1)) windows.push(window);
    }
    return windows;
  }

  function generateChromatic(pitches, pattern, rng) {
    const width = pattern === "four-bounce" ? 4 : pattern === "three-bounce" ? 3 : 8;
    const windows = contiguousWindows(pitches, width);
    const window = windows[randomIndex(windows.length, rng)];
    if (!window) return [];
    let phrase = window;
    if (pattern === "descending") phrase = [...window].reverse();
    if (pattern === "both") phrase = [...window, ...window.slice(0, -1).reverse()];
    if (pattern === "three-bounce" || pattern === "four-bounce") phrase = [...window, ...window.slice(0, -1).reverse()];
    return repeatToLength(phrase);
  }

  function buildShiftCandidates(positions, pairs, pitches, pattern) {
    if (pattern === "chromatic-move") return contiguousWindows(pitches, 4);
    if (pattern === "breath-switch-press") {
      const byHole = new Map();
      positions.forEach((position) => {
        const entry = byHole.get(position.hole) || {};
        entry[`${position.breath}:${position.pressed}`] = position;
        byHole.set(position.hole, entry);
      });
      return [...byHole.values()].map((entry) => [entry["吹音:false"], entry["吸音:true"]]).filter((entry) => entry.every(Boolean));
    }
    const candidates = [];
    for (let index = 0; index < pairs.length - 1; index += 1) {
      const current = pairs[index];
      const next = pairs[index + 1];
      candidates.push(pattern === "move-then-press"
        ? [current.released, next.released, next.pressed, current.released]
        : [current.released, current.pressed, next.released, next.pressed]);
    }
    return candidates;
  }

  function generateShift(positions, pairs, pitches, pattern, rng) {
    const candidates = buildShiftCandidates(positions, pairs, pitches, pattern);
    const phrase = candidates[randomIndex(candidates.length, rng)];
    return phrase ? repeatToLength(phrase) : [];
  }

  function toMeasures(sequence) {
    return Array.from({ length: MEASURE_COUNT }, (_, index) => Object.freeze({
      notes: Object.freeze(sequence.slice(index * BEATS_PER_MEASURE, (index + 1) * BEATS_PER_MEASURE)),
      durations: Object.freeze([1, 1, 1, 1]),
      label: `第 ${index + 1} 小節`,
    }));
  }

  function generateMeasures(settings, layout, rng = Math.random) {
    const positions = buildPlayablePositions(layout, settings.range);
    const pairs = pairPositions(positions);
    const pitches = chromaticPositions(positions);
    let sequence = [];
    if (settings.mode === "toggle") sequence = generateToggle(pairs, settings.pattern, rng);
    else if (settings.mode === "random") sequence = generateRandom(pairs, settings.difficulty, rng);
    else if (settings.mode === "chromatic") sequence = generateChromatic(pitches, settings.pattern, rng);
    else if (settings.mode === "shift") sequence = generateShift(positions, pairs, pitches, settings.pattern, rng);
    if (sequence.length !== MEASURE_COUNT * BEATS_PER_MEASURE) throw new Error("button-practice-phrase-empty");
    return toMeasures(sequence);
  }

  function generateSequence(settings, layout, rng = Math.random) {
    return generateMeasures(settings, layout, rng).flatMap((measure) => measure.notes);
  }

  function claimCompletion(target) {
    if (!target || target.completionRecorded) return false;
    target.completionRecorded = true;
    return true;
  }

  function updatePatternOptions() {
    const mode = $("#buttonPracticeMode")?.value || "toggle";
    const select = $("#buttonPracticePattern");
    if (!select) return;
    select.replaceChildren(...PATTERN_OPTIONS[mode].map(({ value, label }) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      return option;
    }));
    $("#buttonPracticePatternLabel").textContent = PATTERN_HEADINGS[mode];
  }

  function readSettings() {
    return {
      mode: $("#buttonPracticeMode").value,
      difficulty: $("#buttonPracticeDifficulty").value,
      pattern: $("#buttonPracticePattern").value,
      bpm: Number($("#buttonPracticeBpm").value),
      totalCycles: Number($("#buttonPracticeCycles").value),
      range: $("#buttonPracticeRange").value,
      countdownBeats: Number($("#buttonPracticeCountdown").value),
      metronome: $("#buttonPracticeMetronome").checked,
      holes: FIXED_HOLES,
    };
  }

  function clearTimer() {
    if (timer) window.clearInterval(timer);
    timer = 0;
    if (state) state.running = false;
  }

  function render() {
    if (!state) return;
    const activeFlatIndex = state.phase === "play" ? state.activeFlatIndex : -1;
    const activeMeasure = activeFlatIndex < 0 ? -1 : Math.floor(activeFlatIndex / BEATS_PER_MEASURE);
    const activeNote = activeFlatIndex < 0 ? -1 : activeFlatIndex % BEATS_PER_MEASURE;
    const first = state.measures.slice(0, 4);
    const second = state.measures.slice(4, 8);
    $("#buttonPracticeTitle").textContent = `${MODE_LABELS[state.mode]}｜${DIFFICULTY_LABELS[state.difficulty]}`;
    $("#buttonPracticeCycleProgress").textContent = `${state.completedCycles} / ${state.totalCycles}`;
    $("#buttonPracticeBpmStatus").textContent = String(state.bpm);
    $("#buttonPracticeStepStatus").textContent = activeMeasure < 0 ? "完整 8 小節 · 每小節 4 拍" : `第 ${activeMeasure + 1} / 8 小節`;
    $("#buttonPracticeStaff").innerHTML = adapter?.renderStaff?.(first, activeMeasure < 4 ? activeMeasure : -1, activeNote, Math.min(state.completedInCycle, 16)) || "";
    $("#buttonPracticeNumberHelp").innerHTML = adapter?.renderNumberHelp?.(first, 0, activeMeasure, activeNote, state.completedInCycle) || "";
    $("#buttonPracticeStaffSecond").innerHTML = adapter?.renderStaff?.(second, activeMeasure >= 4 ? activeMeasure - 4 : -1, activeNote, Math.max(0, state.completedInCycle - 16)) || "";
    $("#buttonPracticeNumberHelpSecond").innerHTML = adapter?.renderNumberHelp?.(second, 4, activeMeasure, activeNote, state.completedInCycle) || "";
    if (activeMeasure >= 0) adapter?.scrollActiveMeasure?.(activeMeasure);
    $("#buttonPracticeStartPause").textContent = state.running ? "暫停練習" : state.hasStarted ? "繼續練習" : "開始練習";
    $("#buttonPracticeMetronomeDot").classList.toggle("is-playing", state.running);
    const status = $("#buttonPracticeStatus");
    status.textContent = state.running && state.phase === "countdown" ? `預備 ${state.countdownRemaining}` : state.running ? "練習中" : state.hasStarted ? "已暫停" : "等待開始";
    status.classList.toggle("is-playing", state.running);
  }

  function finish() {
    if (!state || !claimCompletion(state)) return;
    clearTimer();
    state.completedCycles = state.totalCycles;
    $("#buttonPracticePlayer").classList.add("hidden");
    $("#buttonPracticeCompleteMode").textContent = MODE_LABELS[state.mode];
    $("#buttonPracticeCompleteDifficulty").textContent = DIFFICULTY_LABELS[state.difficulty];
    $("#buttonPracticeCompleteRange").textContent = RANGE_LABELS[state.range];
    $("#buttonPracticeCompleteCycles").textContent = `${state.completedCycles} / ${state.totalCycles}`;
    const show = () => { $("#buttonPracticeComplete").classList.remove("hidden"); adapter?.scrollTo?.("buttonPracticeComplete"); };
    void adapter?.complete?.({ id: state.recordId, date: new Date().toISOString().slice(0, 10), completedAt: new Date().toISOString(), type: "button-practice", mode: state.mode, difficulty: state.difficulty, pattern: state.pattern, bpm: state.bpm, holes: FIXED_HOLES, range: state.range, cyclesCompleted: state.completedCycles }, show);
  }

  function step() {
    if (!state?.running) return;
    if (state.phase === "countdown") {
      if (state.metronome) adapter?.playBeat?.(state.countdownRemaining === state.countdownBeats);
      state.countdownRemaining -= 1;
      if (state.countdownRemaining <= 0) state.phase = "play";
      render();
      return;
    }
    if (state.activeFlatIndex >= 0) state.completedInCycle = state.activeFlatIndex + 1;
    if (state.completedInCycle >= MEASURE_COUNT * BEATS_PER_MEASURE) {
      state.completedCycles += 1;
      if (state.completedCycles >= state.totalCycles) return finish();
      state.completedInCycle = 0;
    }
    state.activeFlatIndex = state.completedInCycle;
    if (state.metronome) adapter?.playBeat?.(state.activeFlatIndex % BEATS_PER_MEASURE === 0);
    render();
  }

  function start() {
    if (!state || state.running || state.completionRecorded) return;
    state.hasStarted = true;
    state.running = true;
    render();
    step();
    if (state.running) timer = window.setInterval(step, 60000 / state.bpm);
  }

  function toggle() {
    if (!state) return;
    if (state.running) { clearTimer(); render(); } else start();
  }

  function createState(settings, measures) {
    return { ...settings, measures, recordId: `button-${Date.now()}-${Math.random().toString(16).slice(2)}`, activeFlatIndex: -1, completedInCycle: 0, completedCycles: 0, countdownRemaining: settings.countdownBeats, phase: settings.countdownBeats > 0 ? "countdown" : "play", running: false, hasStarted: false, completionRecorded: false };
  }

  function begin() {
    clearTimer();
    const settings = readSettings();
    state = createState(settings, generateMeasures(settings, adapter?.getLayout?.(FIXED_HOLES)));
    $("#buttonPracticeSetup").classList.add("hidden");
    $("#buttonPracticeComplete").classList.add("hidden");
    $("#buttonPracticePlayer").classList.remove("hidden");
    render();
    adapter?.scrollTo?.("buttonPracticePlayer");
  }

  function restart() {
    if (!state) return;
    const measures = state.measures;
    const settings = state;
    clearTimer();
    state = createState(settings, measures);
    render();
  }

  function regenerate() {
    if (!state) return;
    const settings = state;
    clearTimer();
    state = createState(settings, generateMeasures(settings, adapter?.getLayout?.(FIXED_HOLES)));
    render();
  }

  function showSetup() {
    clearTimer();
    state = null;
    $("#buttonPracticePlayer")?.classList.add("hidden");
    $("#buttonPracticeComplete")?.classList.add("hidden");
    $("#buttonPracticeSetup")?.classList.remove("hidden");
    adapter?.scrollTo?.("buttonPracticeSetup");
  }

  function onViewChanged(view) { if (view !== "buttonpractice") clearTimer(); }
  function pause() { if (state?.running) { clearTimer(); render(); } }

  function init(nextAdapter) {
    adapter = nextAdapter;
    if (initialized) return;
    initialized = true;
    updatePatternOptions();
    $("#buttonPracticeMode")?.addEventListener("change", updatePatternOptions);
    $("#buttonPracticeBpm")?.addEventListener("input", (event) => { $("#buttonPracticeBpmValue").textContent = event.target.value; });
    $("#buttonPracticeStart")?.addEventListener("click", begin);
    $("#buttonPracticeStartPause")?.addEventListener("click", toggle);
    $("#buttonPracticeRestart")?.addEventListener("click", restart);
    $("#buttonPracticeRegenerate")?.addEventListener("click", regenerate);
    $("#buttonPracticeSettings")?.addEventListener("click", showSetup);
    $("#buttonPracticeAgain")?.addEventListener("click", begin);
    $("#buttonPracticeBack")?.addEventListener("click", () => { showSetup(); adapter?.navigate?.("practicehub"); });
  }

  window.ChromaticaButtonPractice = Object.freeze({ init, showSetup, onViewChanged, isRunning: () => state?.running === true, hasStarted: () => state?.hasStarted === true, isCompleteVisible: () => !$("#buttonPracticeComplete")?.classList.contains("hidden"), stop: pause });
  window.ChromaticaButtonPracticeCore = Object.freeze({ FIXED_HOLES, MEASURE_COUNT, BEATS_PER_MEASURE, MODE_LABELS, PATTERN_OPTIONS, noteToMidi, numberedRegister, registerLabel, isInRange, buildPlayablePositions, generateMeasures, generateSequence, claimCompletion });
})();
