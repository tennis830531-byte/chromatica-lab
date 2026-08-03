(() => {
  "use strict";

  const FIXED_HOLES = 12;
  const MEASURE_COUNT = 8;
  const BEATS_PER_MEASURE = 4;
  const PREPARE_BEATS = 4;
  const NOTE_DEMO_STORAGE_KEY = "chromatica.settings.buttonPracticeNoteDemo";
  const MODE_LABELS = Object.freeze({ toggle: "按放切換", random: "隨機按鍵", chromatic: "半音階穿梭", shift: "按鍵移位" });
  const RANGE_LABELS = Object.freeze({ low: "低音域", middle: "中音域", high: "高音域" });
  const MODES = Object.freeze(Object.keys(MODE_LABELS));
  const RANGES = Object.freeze(Object.keys(RANGE_LABELS));
  const TOGGLE_HOLDS = Object.freeze([1, 2, 4]);
  const CHROMATIC_SHAPES = Object.freeze(["ascending", "descending", "bounce"]);
  const SHIFT_SHAPES = Object.freeze(["press-then-move", "move-then-press", "chromatic-move", "breath-switch-press"]);
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
    if (range === "high") return register === "high" || register === "double-high";
    return register === range;
  }

  function buildPlayablePositions(layout, range = "middle") {
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

  function mixedChoices(options, length, rng) {
    const result = [];
    while (result.length < length) {
      const cycle = [...options];
      for (let index = cycle.length - 1; index > 0; index -= 1) {
        const swapIndex = randomIndex(index + 1, rng);
        [cycle[index], cycle[swapIndex]] = [cycle[swapIndex], cycle[index]];
      }
      result.push(...cycle);
    }
    return result.slice(0, length);
  }

  function repeatToLength(pattern, length = MEASURE_COUNT * BEATS_PER_MEASURE) {
    return Array.from({ length }, (_, index) => pattern[index % pattern.length]);
  }

  function normalizeSettings(settings = {}) {
    const mode = MODES.includes(settings.mode) ? settings.mode : "toggle";
    const range = RANGES.includes(settings.range) ? settings.range : "middle";
    const bpm = Math.min(180, Math.max(40, Number(settings.bpm) || 60));
    const totalCycles = [1, 2, 4, 6].includes(Number(settings.totalCycles)) ? Number(settings.totalCycles) : 4;
    const noteDemoEnabled = settings.noteDemoEnabled !== false;
    return Object.freeze({ mode, range, bpm, totalCycles, noteDemoEnabled, holes: FIXED_HOLES });
  }

  function generateToggle(pairs, rng) {
    if (!pairs.length) return [];
    const result = [];
    let pressed = rng() >= 0.5;
    const holds = mixedChoices(TOGGLE_HOLDS, MEASURE_COUNT, rng);
    for (let measure = 0; measure < MEASURE_COUNT; measure += 1) {
      const pair = pairs[randomIndex(pairs.length, rng)];
      const hold = holds[measure];
      for (let beat = 0; beat < BEATS_PER_MEASURE; beat += 1) {
        result.push(pressed ? pair.pressed : pair.released);
        if ((beat + 1) % hold === 0) pressed = !pressed;
      }
    }
    return result;
  }

  function generateRandom(pairs, rng) {
    if (!pairs.length) return [];
    const result = [];
    let lastPressed = null;
    let repeated = 0;
    for (let index = 0; index < MEASURE_COUNT * BEATS_PER_MEASURE; index += 1) {
      const pair = pairs[randomIndex(pairs.length, rng)];
      let pressed = rng() >= 0.5;
      if (pressed === lastPressed && repeated >= 2) pressed = !pressed;
      repeated = pressed === lastPressed ? repeated + 1 : 1;
      lastPressed = pressed;
      result.push(pressed ? pair.pressed : pair.released);
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

  function generateChromatic(pitches, rng) {
    const fourNoteWindows = contiguousWindows(pitches, 4);
    const threeNoteWindows = contiguousWindows(pitches, 3);
    if (!fourNoteWindows.length || !threeNoteWindows.length) return [];
    const result = [];
    const shapes = mixedChoices(CHROMATIC_SHAPES, MEASURE_COUNT, rng);
    for (const shape of shapes) {
      if (shape === "bounce") {
        const window = threeNoteWindows[randomIndex(threeNoteWindows.length, rng)];
        result.push(window[0], window[1], window[2], window[1]);
      } else {
        const window = fourNoteWindows[randomIndex(fourNoteWindows.length, rng)];
        result.push(...(shape === "descending" ? [...window].reverse() : window));
      }
    }
    return result;
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
    for (const current of pairs) {
      for (const next of pairs) {
        if (Math.abs(current.released.hole - next.released.hole) !== 1 || current.released.breath !== next.released.breath) continue;
        candidates.push(pattern === "move-then-press"
          ? [current.released, next.released, next.pressed, current.pressed]
          : [current.released, current.pressed, next.released, next.pressed]);
      }
    }
    return candidates;
  }

  function generateShift(positions, pairs, pitches, rng) {
    const available = SHIFT_SHAPES.map((shape) => ({ shape, candidates: buildShiftCandidates(positions, pairs, pitches, shape) }))
      .filter((entry) => entry.candidates.length);
    if (!available.length) return [];
    const result = [];
    const entries = mixedChoices(available, MEASURE_COUNT, rng);
    for (const entry of entries) {
      const candidate = entry.candidates[randomIndex(entry.candidates.length, rng)];
      result.push(...repeatToLength(candidate, BEATS_PER_MEASURE));
    }
    return result;
  }

  function toMeasures(sequence) {
    return Array.from({ length: MEASURE_COUNT }, (_, index) => Object.freeze({
      notes: Object.freeze(sequence.slice(index * BEATS_PER_MEASURE, (index + 1) * BEATS_PER_MEASURE)),
      durations: Object.freeze([1, 1, 1, 1]),
      label: `第 ${index + 1} 小節`,
    }));
  }

  function generateMeasures(rawSettings, layout, rng = Math.random) {
    const settings = normalizeSettings(rawSettings);
    const positions = buildPlayablePositions(layout, settings.range);
    const pairs = pairPositions(positions);
    const pitches = chromaticPositions(positions);
    let sequence = [];
    if (settings.mode === "toggle") sequence = generateToggle(pairs, rng);
    else if (settings.mode === "random") sequence = generateRandom(pairs, rng);
    else if (settings.mode === "chromatic") sequence = generateChromatic(pitches, rng);
    else if (settings.mode === "shift") sequence = generateShift(positions, pairs, pitches, rng);
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

  function readSettings() {
    return normalizeSettings({
      mode: $("#buttonPracticeMode").value,
      range: $("#buttonPracticeRange").value,
      bpm: Number($("#buttonPracticeBpm").value),
      totalCycles: Number($("#buttonPracticeCycles").value),
      noteDemoEnabled: $("#buttonPracticeNoteDemo")?.checked !== false,
    });
  }

  function readNoteDemoPreference(storage = window.localStorage) {
    return storage?.getItem?.(NOTE_DEMO_STORAGE_KEY) !== "false";
  }

  function saveNoteDemoPreference(enabled, storage = window.localStorage) {
    const next = enabled !== false;
    storage?.setItem?.(NOTE_DEMO_STORAGE_KEY, String(next));
    return next;
  }

  function playStepAudio(targetState, entry, targetAdapter = adapter, strong = false) {
    if (targetState?.noteDemoEnabled !== false && entry?.note) {
      targetAdapter?.playNote?.(entry.note, (60000 / targetState.bpm) * 0.86);
      return "note";
    }
    targetAdapter?.playBeat?.(strong);
    return "click";
  }

  function playPreparationAudio(targetAdapter = adapter, strong = false) {
    if (typeof targetAdapter?.playPrepareBeat === "function") targetAdapter.playPrepareBeat(strong);
    else targetAdapter?.playBeat?.(strong);
    return "click";
  }

  function clearTimer() {
    if (timer) window.clearInterval(timer);
    timer = 0;
    adapter?.stopNote?.();
    if (state) state.running = false;
  }

  function render() {
    if (!state) return;
    const activeFlatIndex = state.phase === "play" ? state.activeFlatIndex : -1;
    const activeMeasure = activeFlatIndex < 0 ? -1 : Math.floor(activeFlatIndex / BEATS_PER_MEASURE);
    const activeNote = activeFlatIndex < 0 ? -1 : activeFlatIndex % BEATS_PER_MEASURE;
    const first = state.measures.slice(0, 4);
    const second = state.measures.slice(4, 8);
    $("#buttonPracticeTitle").textContent = MODE_LABELS[state.mode];
    $("#buttonPracticeCycleProgress").textContent = `${state.completedCycles} / ${state.totalCycles}`;
    $("#buttonPracticeBpmStatus").textContent = String(state.bpm);
    $("#buttonPracticeStepStatus").textContent = state.phase === "prepare"
      ? `預備 ${Math.min(state.prepareBeat + 1, PREPARE_BEATS)} / ${PREPARE_BEATS}`
      : activeMeasure < 0 ? "完整 8 小節 · 每小節 4 拍" : `第 ${activeMeasure + 1} / 8 小節`;
    $("#buttonPracticeStaff").innerHTML = adapter?.renderStaff?.(first, activeMeasure < 4 ? activeMeasure : -1, activeNote, Math.min(state.completedInCycle, 16)) || "";
    $("#buttonPracticeNumberHelp").innerHTML = adapter?.renderNumberHelp?.(first, 0, activeMeasure, activeNote, state.completedInCycle) || "";
    $("#buttonPracticeStaffSecond").innerHTML = adapter?.renderStaff?.(second, activeMeasure >= 4 ? activeMeasure - 4 : -1, activeNote, Math.max(0, state.completedInCycle - 16)) || "";
    $("#buttonPracticeNumberHelpSecond").innerHTML = adapter?.renderNumberHelp?.(second, 4, activeMeasure, activeNote, state.completedInCycle) || "";
    if (activeMeasure >= 0) adapter?.scrollActiveMeasure?.(activeMeasure);
    $("#buttonPracticeStartPause").textContent = state.running ? "暫停練習" : state.hasStarted ? "繼續練習" : "開始練習";
    $("#buttonPracticeMetronomeDot").classList.toggle("is-playing", state.running);
    const status = $("#buttonPracticeStatus");
    status.textContent = state.running ? (state.phase === "prepare" ? "預備中" : "練習中") : state.hasStarted ? "已暫停" : "等待開始";
    status.classList.toggle("is-playing", state.running);
  }

  function finish() {
    if (!state || !claimCompletion(state)) return;
    clearTimer();
    state.completedCycles = state.totalCycles;
    $("#buttonPracticePlayer").classList.add("hidden");
    $("#buttonPracticeCompleteMode").textContent = MODE_LABELS[state.mode];
    $("#buttonPracticeCompleteRange").textContent = RANGE_LABELS[state.range];
    $("#buttonPracticeCompleteCycles").textContent = `${state.completedCycles} / ${state.totalCycles}`;
    const show = () => { $("#buttonPracticeComplete").classList.remove("hidden"); adapter?.scrollTo?.("buttonPracticeComplete"); };
    void adapter?.complete?.({ id: state.recordId, date: new Date().toISOString().slice(0, 10), completedAt: new Date().toISOString(), type: "button-practice", mode: state.mode, bpm: state.bpm, holes: FIXED_HOLES, range: state.range, cyclesCompleted: state.completedCycles }, show);
  }

  function step() {
    if (!state?.running) return;
    if (state.phase === "prepare") {
      playPreparationAudio(adapter, state.prepareBeat === 0);
      state.prepareBeat += 1;
      if (state.prepareBeat >= PREPARE_BEATS) state.phase = "play";
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
    const entry = state.measures.flatMap((measure) => measure.notes)[state.activeFlatIndex] || null;
    playStepAudio(state, entry, adapter, state.activeFlatIndex % BEATS_PER_MEASURE === 0);
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
    return { ...normalizeSettings(settings), measures, recordId: `button-${Date.now()}-${Math.random().toString(16).slice(2)}`, phase: "prepare", prepareBeat: 0, activeFlatIndex: -1, completedInCycle: 0, completedCycles: 0, running: false, hasStarted: false, completionRecorded: false };
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
    const settings = normalizeSettings(state);
    clearTimer();
    state = createState(settings, measures);
    render();
  }

  function regenerate() {
    if (!state) return;
    const settings = normalizeSettings(state);
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

  function onViewChanged(view) {
    if (view === "buttonpractice") void adapter?.preloadNoteSample?.();
    else clearTimer();
  }
  function pause() { if (state?.running) { clearTimer(); render(); } }

  function init(nextAdapter) {
    adapter = nextAdapter;
    const noteDemoToggle = $("#buttonPracticeNoteDemo");
    if (noteDemoToggle) noteDemoToggle.checked = readNoteDemoPreference();
    if (initialized) return;
    initialized = true;
    if (noteDemoToggle) {
      noteDemoToggle.addEventListener("change", (event) => {
        const enabled = saveNoteDemoPreference(event.target.checked);
        adapter?.stopNote?.();
        if (state) state.noteDemoEnabled = enabled;
        adapter?.settingsChanged?.();
      });
    }
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
  window.ChromaticaButtonPracticeCore = Object.freeze({ FIXED_HOLES, MEASURE_COUNT, BEATS_PER_MEASURE, PREPARE_BEATS, NOTE_DEMO_STORAGE_KEY, MODE_LABELS, noteToMidi, numberedRegister, registerLabel, isInRange, buildPlayablePositions, normalizeSettings, generateMeasures, generateSequence, readNoteDemoPreference, saveNoteDemoPreference, playStepAudio, playPreparationAudio, claimCompletion });
})();
