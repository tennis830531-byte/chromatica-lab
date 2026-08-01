(() => {
  "use strict";

  const MODE_LABELS = Object.freeze({
    toggle: "按放切換",
    random: "隨機按鍵反應",
    chromatic: "半音階穿梭",
    shift: "按鍵移位",
  });
  const DIFFICULTY_LABELS = Object.freeze({ beginner: "入門", normal: "普通", advanced: "進階" });
  const RANGE_LABELS = Object.freeze({ full: "完整音域", low: "低音域", middle: "中音域", high: "高音域" });
  const PATTERN_OPTIONS = Object.freeze({
    toggle: Object.freeze([
      Object.freeze({ value: "hold-1", label: "1 拍" }),
      Object.freeze({ value: "hold-2", label: "2 拍" }),
      Object.freeze({ value: "hold-4", label: "4 拍" }),
    ]),
    random: Object.freeze([
      Object.freeze({ value: "reaction", label: "依難度切換" }),
    ]),
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
  const PATTERN_HEADINGS = Object.freeze({
    toggle: "每個狀態維持",
    random: "切換速度",
    chromatic: "半音階類型",
    shift: "移位類型",
  });
  const HISTORY_KEY = "chromatica.buttonPracticeHistory";
  const $ = (selector) => document.querySelector(selector);
  let adapter = null;
  let initialized = false;
  let timer = 0;
  let state = null;

  function noteToMidi(noteName) {
    const match = String(noteName || "").match(/^([A-G])([#b]?)(\d)$/);
    if (!match) return Number.NaN;
    const semitones = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    const accidental = match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0;
    return (Number(match[3]) + 1) * 12 + semitones[match[1]] + accidental;
  }

  function displayNoteName(noteName) {
    return String(noteName || "").replace("#", "♯").replace("b", "♭");
  }

  function holeBounds(holeCount, range = "full") {
    const count = Math.max(1, Number(holeCount) || 1);
    if (range === "full") return [1, count];
    const third = Math.ceil(count / 3);
    if (range === "low") return [1, third];
    if (range === "high") return [Math.max(1, count - third + 1), count];
    return [third + 1, Math.max(third + 1, count - third)];
  }

  function buildPlayablePositions(layout, range = "full") {
    const holeCount = Number(layout?.blow?.length || 0);
    if (![12, 14, 16].includes(holeCount)) throw new Error("unsupported-harmonica-layout");
    const [firstHole, lastHole] = holeBounds(holeCount, range);
    const positions = [];
    for (let hole = firstHole; hole <= lastHole; hole += 1) {
      const index = hole - 1;
      [
        ["blow", "吹音", false],
        ["buttonBlow", "吹音", true],
        ["draw", "吸音", false],
        ["buttonDraw", "吸音", true],
      ].forEach(([source, breath, pressed]) => {
        const note = layout[source]?.[index];
        if (!note || !Number.isFinite(noteToMidi(note))) return;
        positions.push(Object.freeze({ note, hole, breath, pressed, source }));
      });
    }
    return positions;
  }

  function pairPositions(positions) {
    const pairs = [];
    const grouped = new Map();
    positions.forEach((position) => {
      const key = `${position.hole}:${position.breath}`;
      const pair = grouped.get(key) || {};
      pair[position.pressed ? "pressed" : "released"] = position;
      grouped.set(key, pair);
    });
    grouped.forEach((pair) => {
      if (pair.released && pair.pressed && pair.released.note !== pair.pressed.note) pairs.push(pair);
    });
    return pairs;
  }

  function chromaticPositions(positions) {
    const byPitch = new Map();
    positions.forEach((position) => {
      const midi = noteToMidi(position.note);
      const existing = byPitch.get(midi);
      if (!existing || (existing.pressed && !position.pressed)) byPitch.set(midi, position);
    });
    return [...byPitch.entries()].sort((left, right) => left[0] - right[0]).map((entry) => entry[1]);
  }

  function difficultyDuration(difficulty) {
    if (difficulty === "beginner") return 2;
    if (difficulty === "advanced") return 0.5;
    return 1;
  }

  function difficultyLength(difficulty) {
    if (difficulty === "beginner") return 8;
    if (difficulty === "advanced") return 16;
    return 12;
  }

  function withDuration(position, duration) {
    return Object.freeze({ ...position, duration });
  }

  function generateToggleSequence(pairs, pattern) {
    const pair = pairs[Math.floor(pairs.length / 2)] || pairs[0];
    if (!pair) return [];
    const duration = Number(String(pattern).replace("hold-", "")) || 1;
    return Array.from({ length: 8 }, (_, index) => withDuration(index % 2 ? pair.pressed : pair.released, duration));
  }

  function generateRandomSequence(pairs, difficulty, rng) {
    const pair = pairs[Math.floor(pairs.length / 2)] || pairs[0];
    if (!pair) return [];
    const duration = difficultyDuration(difficulty);
    const sequence = [];
    for (let index = 0; index < difficultyLength(difficulty); index += 1) {
      let pressed = rng() >= 0.5;
      if (sequence.length >= 2 && sequence.at(-1).pressed === sequence.at(-2).pressed) {
        pressed = !sequence.at(-1).pressed;
      }
      sequence.push(withDuration(pressed ? pair.pressed : pair.released, duration));
    }
    return sequence;
  }

  function generateChromaticSequence(pitches, pattern, difficulty) {
    const duration = difficultyDuration(difficulty);
    const count = Math.min(pitches.length, difficultyLength(difficulty));
    const ascending = pitches.slice(0, count);
    let sequence = ascending;
    if (pattern === "descending") sequence = [...ascending].reverse();
    if (pattern === "both") sequence = [...ascending, ...ascending.slice(0, -1).reverse()];
    if (pattern === "three-bounce") {
      const group = ascending.slice(0, 3);
      sequence = [...group, ...group.slice(0, -1).reverse()];
    }
    if (pattern === "four-bounce") {
      const group = ascending.slice(0, 4);
      sequence = [...group, ...group.slice(0, -1).reverse()];
    }
    return sequence.map((position) => withDuration(position, duration));
  }

  function generateShiftSequence(positions, pairs, pitches, pattern, difficulty) {
    const duration = difficultyDuration(difficulty);
    if (pattern === "chromatic-move") return generateChromaticSequence(pitches, "ascending", difficulty);
    if (pattern === "breath-switch-press") {
      const byHole = new Map();
      positions.forEach((position) => {
        const entry = byHole.get(position.hole) || {};
        entry[`${position.breath}:${position.pressed}`] = position;
        byHole.set(position.hole, entry);
      });
      return [...byHole.values()].flatMap((entry) => {
        const blow = entry["吹音:false"];
        const drawPressed = entry["吸音:true"];
        return blow && drawPressed ? [withDuration(blow, duration), withDuration(drawPressed, duration)] : [];
      }).slice(0, difficultyLength(difficulty));
    }
    const sequence = [];
    for (let index = 0; index < pairs.length - 1 && sequence.length < difficultyLength(difficulty); index += 1) {
      const current = pairs[index];
      const next = pairs[index + 1];
      if (pattern === "move-then-press") {
        sequence.push(withDuration(current.released, duration), withDuration(next.released, duration), withDuration(next.pressed, duration));
      } else {
        sequence.push(withDuration(current.released, duration), withDuration(current.pressed, duration), withDuration(next.released, duration));
      }
    }
    return sequence.slice(0, difficultyLength(difficulty));
  }

  function generateSequence(settings, layout, rng = Math.random) {
    const positions = buildPlayablePositions(layout, settings.range);
    const pairs = pairPositions(positions);
    const pitches = chromaticPositions(positions);
    let sequence = [];
    if (settings.mode === "toggle") sequence = generateToggleSequence(pairs, settings.pattern);
    else if (settings.mode === "random") sequence = generateRandomSequence(pairs, settings.difficulty, rng);
    else if (settings.mode === "chromatic") sequence = generateChromaticSequence(pitches, settings.pattern, settings.difficulty);
    else if (settings.mode === "shift") sequence = generateShiftSequence(positions, pairs, pitches, settings.pattern, settings.difficulty);
    if (!sequence.length) throw new Error("button-practice-sequence-empty");
    return sequence;
  }

  function claimCompletion(targetState) {
    if (!targetState || targetState.completionRecorded) return false;
    targetState.completionRecorded = true;
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
      holes: Number($("#buttonPracticeHoles").value),
      countdownBeats: Number($("#buttonPracticeCountdown").value),
      metronome: $("#buttonPracticeMetronome").checked,
    };
  }

  function clearTimer() {
    if (timer) window.clearInterval(timer);
    timer = 0;
    if (state) state.running = false;
  }

  function currentEntry() {
    return state?.sequence?.[state.itemIndex] || null;
  }

  function nextEntry() {
    if (!state?.sequence?.length) return null;
    return state.sequence[(state.itemIndex + 1) % state.sequence.length];
  }

  function render() {
    if (!state) return;
    const current = currentEntry();
    const next = nextEntry();
    $("#buttonPracticeTitle").textContent = `${MODE_LABELS[state.mode]}｜${DIFFICULTY_LABELS[state.difficulty]}`;
    $("#buttonPracticeCycleProgress").textContent = `${state.completedCycles} / ${state.totalCycles}`;
    $("#buttonPracticeBpmStatus").textContent = String(state.bpm);
    $("#buttonPracticeModelStatus").textContent = `${state.holes} 孔`;
    $("#buttonPracticeStepStatus").textContent = `第 ${state.itemIndex + 1} / ${state.sequence.length} 個提示`;
    if (current) {
      $("#buttonPracticeCurrentNote").textContent = displayNoteName(current.note);
      $("#buttonPracticeHole").textContent = `第 ${current.hole} 孔 · ${current.breath}`;
      $("#buttonPracticeButtonState").textContent = current.pressed ? "按鍵" : "放鍵";
      $("#buttonPracticeButtonHint").textContent = current.pressed ? "按鍵推入" : "按鍵縮回";
      $("#buttonPracticeSlide").classList.toggle("is-pressed", current.pressed);
    }
    if (next) {
      $("#buttonPracticeNextNote").textContent = displayNoteName(next.note);
      $("#buttonPracticeNextDetail").textContent = `第 ${next.hole} 孔 · ${next.breath} · ${next.pressed ? "按鍵" : "放鍵"}`;
    }
    const staffNotes = [current?.note, next?.note].filter(Boolean);
    $("#buttonPracticeStaff").innerHTML = adapter?.renderStaff?.(staffNotes, 0) || "";
    $("#buttonPracticeStaff").setAttribute("aria-label", `目前 ${displayNoteName(current?.note)}，下一個 ${displayNoteName(next?.note)}`);
    $("#buttonPracticeNumberHelp").innerHTML = adapter?.renderNumberHelp?.(staffNotes, 0) || "";
    const button = $("#buttonPracticeStartPause");
    button.textContent = state.running ? "暫停練習" : state.hasStarted ? "繼續練習" : "開始練習";
    $("#buttonPracticeMetronomeDot").classList.toggle("is-playing", state.running);
    const status = $("#buttonPracticeStatus");
    status.textContent = state.running && state.phase === "countdown"
      ? `預備 ${Math.ceil(state.countdownTicks / 2)}`
      : state.running ? "練習中" : state.hasStarted ? "已暫停" : "等待開始";
    status.classList.toggle("is-playing", state.running);
  }

  function finish() {
    if (!state || !claimCompletion(state)) return;
    clearTimer();
    state.completedCycles = state.totalCycles;
    $("#buttonPracticePlayer").classList.add("hidden");
    $("#buttonPracticeCompleteMode").textContent = MODE_LABELS[state.mode];
    $("#buttonPracticeCompleteDifficulty").textContent = DIFFICULTY_LABELS[state.difficulty];
    $("#buttonPracticeCompleteRange").textContent = `${state.holes} 孔 · ${RANGE_LABELS[state.range]}`;
    $("#buttonPracticeCompleteCycles").textContent = `${state.completedCycles} / ${state.totalCycles}`;
    const completion = () => {
      $("#buttonPracticeComplete").classList.remove("hidden");
      adapter?.scrollTo?.("buttonPracticeComplete");
    };
    void adapter?.complete?.({
      id: state.recordId,
      date: new Date().toISOString().slice(0, 10),
      completedAt: new Date().toISOString(),
      type: "button-practice",
      mode: state.mode,
      difficulty: state.difficulty,
      pattern: state.pattern,
      bpm: state.bpm,
      holes: state.holes,
      range: state.range,
      cyclesCompleted: state.completedCycles,
    }, completion);
  }

  function advanceEntry() {
    state.itemIndex += 1;
    if (state.itemIndex < state.sequence.length) return;
    state.itemIndex = 0;
    state.completedCycles += 1;
    if (state.completedCycles >= state.totalCycles) finish();
  }

  function step() {
    if (!state?.running) return;
    if (state.phase === "countdown") {
      if (state.metronome && state.countdownTicks % 2 === 0) adapter?.playBeat?.(state.countdownTicks <= 2);
      state.countdownTicks -= 1;
      if (state.countdownTicks <= 0) {
        state.phase = "play";
        state.entryTicksRemaining = 0;
      }
      render();
      return;
    }
    const entry = currentEntry();
    if (!entry) return finish();
    if (state.entryTicksRemaining <= 0) {
      state.entryTicksRemaining = Math.max(1, Math.round(entry.duration * 2));
      state.entryTick = 0;
    }
    if (state.metronome && state.entryTick % 2 === 0) adapter?.playBeat?.(state.itemIndex === 0 && state.entryTick === 0);
    state.entryTick += 1;
    state.entryTicksRemaining -= 1;
    if (state.entryTicksRemaining <= 0) advanceEntry();
    if (state?.running) render();
  }

  function start() {
    if (!state || state.running || state.completionRecorded) return;
    state.hasStarted = true;
    state.running = true;
    render();
    step();
    if (!state.running) return;
    timer = window.setInterval(step, 60000 / state.bpm / 2);
  }

  function toggle() {
    if (!state) return;
    if (state.running) {
      clearTimer();
      render();
    } else start();
  }

  function pause() {
    if (!state?.running) return;
    clearTimer();
    render();
  }

  function begin() {
    clearTimer();
    const settings = readSettings();
    const layout = adapter?.getLayout?.(settings.holes);
    const sequence = generateSequence(settings, layout);
    state = {
      ...settings,
      sequence,
      recordId: `button-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      itemIndex: 0,
      entryTick: 0,
      entryTicksRemaining: 0,
      completedCycles: 0,
      countdownTicks: settings.countdownBeats * 2,
      phase: settings.countdownBeats > 0 ? "countdown" : "play",
      running: false,
      hasStarted: false,
      completionRecorded: false,
    };
    $("#buttonPracticeSetup").classList.add("hidden");
    $("#buttonPracticeComplete").classList.add("hidden");
    $("#buttonPracticePlayer").classList.remove("hidden");
    render();
    adapter?.scrollTo?.("buttonPracticePlayer");
  }

  function restart() {
    if (!state) return;
    clearTimer();
    state.itemIndex = 0;
    state.entryTick = 0;
    state.entryTicksRemaining = 0;
    state.completedCycles = 0;
    state.countdownTicks = state.countdownBeats * 2;
    state.phase = state.countdownBeats > 0 ? "countdown" : "play";
    state.hasStarted = false;
    state.completionRecorded = false;
    state.recordId = `button-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
    if (view !== "buttonpractice") clearTimer();
  }

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
    $("#buttonPracticeSettings")?.addEventListener("click", showSetup);
    $("#buttonPracticeAgain")?.addEventListener("click", begin);
    $("#buttonPracticeBack")?.addEventListener("click", () => { showSetup(); adapter?.navigate?.("practicehub"); });
  }

  window.ChromaticaButtonPractice = Object.freeze({
    init,
    showSetup,
    onViewChanged,
    isRunning: () => state?.running === true,
    hasStarted: () => state?.hasStarted === true,
    isCompleteVisible: () => !$("#buttonPracticeComplete")?.classList.contains("hidden"),
    stop: pause,
  });
  window.ChromaticaButtonPracticeCore = Object.freeze({
    MODE_LABELS,
    PATTERN_OPTIONS,
    noteToMidi,
    holeBounds,
    buildPlayablePositions,
    generateSequence,
    claimCompletion,
  });
})();
