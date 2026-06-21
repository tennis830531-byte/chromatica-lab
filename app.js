const dynamics = {
  pp: 1,
  p: 2,
  mp: 3,
  mf: 4,
  f: 5,
};

const targetVolumes = ["p", "mp", "mf", "f"];

const exercises = [
  {
    id: "steady-4",
    title: "4 拍平穩長音",
    level: "初階",
    bpm: 60,
    prepareBeats: 4,
    playBeats: 4,
    restBeats: 4,
    pattern: [
      { beat: 1, dynamic: "mp" },
      { beat: 4, dynamic: "mp" },
    ],
    instruction: "用 mp 音量穩定吹 4 拍，讓起音乾淨、音尾不要塌。",
    scored: true,
  },
  {
    id: "steady-8",
    title: "8 拍平穩長音",
    level: "初階",
    bpm: 60,
    prepareBeats: 4,
    playBeats: 8,
    restBeats: 4,
    pattern: [
      { beat: 1, dynamic: "mp" },
      { beat: 8, dynamic: "mp" },
    ],
    instruction: "用 mp 音量穩定吹 8 拍，注意聲音不要前大後小。",
    scored: true,
  },
  {
    id: "dynamic-layers",
    title: "音量分層",
    level: "基礎",
    bpm: 60,
    prepareBeats: 4,
    playBeats: 8,
    restBeats: 4,
    pattern: [
      { beat: 1, dynamic: "p" },
      { beat: 3, dynamic: "mp" },
      { beat: 6, dynamic: "mf" },
      { beat: 8, dynamic: "mf" },
    ],
    instruction: "分辨 p、mp、mf 的差別，音量改變時不要讓音色變粗。",
    variants: [
      {
        label: "p / mp / mf",
        pattern: [
          { beat: 1, dynamic: "p" },
          { beat: 3, dynamic: "mp" },
          { beat: 6, dynamic: "mf" },
          { beat: 8, dynamic: "mf" },
        ],
      },
      {
        label: "mp / mf / f",
        pattern: [
          { beat: 1, dynamic: "mp" },
          { beat: 3, dynamic: "mf" },
          { beat: 6, dynamic: "f" },
          { beat: 8, dynamic: "f" },
        ],
      },
      {
        label: "p / mf / p",
        pattern: [
          { beat: 1, dynamic: "p" },
          { beat: 4, dynamic: "mf" },
          { beat: 8, dynamic: "p" },
        ],
      },
      {
        label: "p / mp / mf / f",
        pattern: [
          { beat: 1, dynamic: "p" },
          { beat: 3, dynamic: "mp" },
          { beat: 5, dynamic: "mf" },
          { beat: 8, dynamic: "f" },
        ],
      },
    ],
  },
  {
    id: "crescendo-8",
    title: "8 拍漸強",
    level: "進階",
    bpm: 60,
    prepareBeats: 4,
    playBeats: 8,
    restBeats: 4,
    pattern: [
      { beat: 1, dynamic: "p" },
      { beat: 4, dynamic: "mp" },
      { beat: 8, dynamic: "mf" },
    ],
    instruction: "從小聲慢慢推大，保持氣流平順，不要突然變大。",
    variants: [
      {
        label: "p → mf",
        pattern: [
          { beat: 1, dynamic: "p" },
          { beat: 4, dynamic: "mp" },
          { beat: 8, dynamic: "mf" },
        ],
      },
      {
        label: "mp → f",
        pattern: [
          { beat: 1, dynamic: "mp" },
          { beat: 4, dynamic: "mf" },
          { beat: 8, dynamic: "f" },
        ],
      },
      {
        label: "p → f",
        pattern: [
          { beat: 1, dynamic: "p" },
          { beat: 3, dynamic: "mp" },
          { beat: 6, dynamic: "mf" },
          { beat: 8, dynamic: "f" },
        ],
      },
    ],
  },
  {
    id: "decrescendo-8",
    title: "8 拍漸弱",
    level: "進階",
    bpm: 60,
    prepareBeats: 4,
    playBeats: 8,
    restBeats: 4,
    pattern: [
      { beat: 1, dynamic: "mf" },
      { beat: 4, dynamic: "mf" },
      { beat: 8, dynamic: "p" },
    ],
    instruction: "聲音慢慢退後，但音色要留住，不要在音尾突然消失。",
    variants: [
      {
        label: "mf → p",
        pattern: [
          { beat: 1, dynamic: "mf" },
          { beat: 5, dynamic: "mp" },
          { beat: 8, dynamic: "p" },
        ],
      },
      {
        label: "f → mp",
        pattern: [
          { beat: 1, dynamic: "f" },
          { beat: 4, dynamic: "mf" },
          { beat: 8, dynamic: "mp" },
        ],
      },
      {
        label: "f → p",
        pattern: [
          { beat: 1, dynamic: "f" },
          { beat: 3, dynamic: "mf" },
          { beat: 6, dynamic: "mp" },
          { beat: 8, dynamic: "p" },
        ],
      },
    ],
  },
  {
    id: "swell-12",
    title: "山形長音",
    level: "挑戰",
    bpm: 60,
    prepareBeats: 4,
    playBeats: 12,
    restBeats: 4,
    pattern: [
      { beat: 1, dynamic: "mp" },
      { beat: 6, dynamic: "f" },
      { beat: 12, dynamic: "mp" },
    ],
    instruction: "12 拍｜mp → f → mp",
    variants: [
      {
        label: "mp → f → mp",
        pattern: [
          { beat: 1, dynamic: "mp" },
          { beat: 6, dynamic: "f" },
          { beat: 12, dynamic: "mp" },
        ],
      },
      {
        label: "p → mf → p",
        pattern: [
          { beat: 1, dynamic: "p" },
          { beat: 6, dynamic: "mf" },
          { beat: 12, dynamic: "p" },
        ],
      },
    ],
  },
  {
    id: "soft-attack-release",
    title: "柔起音與收音",
    level: "挑戰",
    bpm: 56,
    prepareBeats: 4,
    playBeats: 8,
    restBeats: 4,
    pattern: [
      { beat: 1, dynamic: "p" },
      { beat: 2, dynamic: "mp" },
      { beat: 7, dynamic: "mp" },
      { beat: 8, dynamic: "p" },
    ],
    instruction: "起音不要爆，最後一拍收乾淨，聲音小但不要虛。",
    variants: [
      {
        label: "p 起音收音",
        pattern: [
          { beat: 1, dynamic: "p" },
          { beat: 2, dynamic: "mp" },
          { beat: 7, dynamic: "mp" },
          { beat: 8, dynamic: "p" },
        ],
      },
      {
        label: "mf 起音收音",
        pattern: [
          { beat: 1, dynamic: "mp" },
          { beat: 2, dynamic: "mf" },
          { beat: 7, dynamic: "mf" },
          { beat: 8, dynamic: "mp" },
        ],
      },
    ],
  },
];

const chromaticLayouts = {
  16: {
    label: "16 孔 C 調",
    blow: ["C3", "E3", "G3", "C4", "C4", "E4", "G4", "C5", "C5", "E5", "G5", "C6", "C6", "E6", "G6", "C7"],
    draw: ["D3", "F3", "A3", "B3", "D4", "F4", "A4", "B4", "D5", "F5", "A5", "B5", "D6", "F6", "A6", "B6"],
    buttonBlow: ["C#3", "F3", "G#3", "C#4", "C#4", "F4", "G#4", "C#5", "C#5", "F5", "G#5", "C#6", "C#6", "F6", "G#6", "C#7"],
    buttonDraw: ["D#3", "F#3", "A#3", "C4", "D#4", "F#4", "A#4", "C5", "D#5", "F#5", "A#5", "C6", "D#6", "F#6", "A#6", "D7"],
  },
  14: {
    label: "14 孔 C 調",
    blow: ["G3", "C4", "C4", "E4", "G4", "C5", "C5", "E5", "G5", "C6", "C6", "E6", "G6", "C7"],
    draw: ["A3", "B3", "D4", "F4", "A4", "B4", "D5", "F5", "A5", "B5", "D6", "F6", "A6", "B6"],
    buttonBlow: ["G#3", "C#4", "C#4", "F4", "G#4", "C#5", "C#5", "F5", "G#5", "C#6", "C#6", "F6", "G#6", "C#7"],
    buttonDraw: ["A#3", "C4", "D#4", "F#4", "A#4", "C5", "D#5", "F#5", "A#5", "C6", "D#6", "F#6", "A#6", "D7"],
  },
  12: {
    label: "12 孔 C 調",
    blow: ["C4", "E4", "G4", "C5", "C5", "E5", "G5", "C6", "C6", "E6", "G6", "C7"],
    draw: ["D4", "F4", "A4", "B4", "D5", "F5", "A5", "B5", "D6", "F6", "A6", "B6"],
    buttonBlow: ["C#4", "F4", "G#4", "C#5", "C#5", "F5", "G#5", "C#6", "C#6", "F6", "G#6", "C#7"],
    buttonDraw: ["D#4", "F#4", "A#4", "C5", "D#5", "F#5", "A#5", "C6", "D#6", "F#6", "A#6", "D7"],
  },
};

let currentView = "intro";
let selectedHoles = 16;
let selectedMapHole = null;
let selectedExercise = 0;
let bpm = exercises[0].bpm;
let selectedTargetVolume = "mp";
let selectedVariants = {};
let phase = "idle";
let beat = 0;
let totalCycles = 4;
let cycle = 1;
const scoringStartDelayMs = 350;
let playStartedAt = 0;
let timer = null;
let audioContext = null;
let micStream = null;
let micAnalyser = null;
let micData = null;
let micFrequencyData = null;
let micFrame = null;
let micSensitivity = 3.2;
let tuningA4 = 440;
let micSilentRms = 0;
let isCalibratingMic = false;
let liveLevels = Array.from({ length: 48 }, () => 0);
let displayEnvelopeLevel = 0;
let scoreEnvelopeSignal = 0;
let beatLevelSums = Array.from({ length: exercises[0].playBeats }, () => 0);
let beatLevelCounts = Array.from({ length: exercises[0].playBeats }, () => 0);
let playLevels = [];
let currentStabilityScore = null;
let cycleScores = Array.from({ length: totalCycles }, () => null);

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function localizeLevel(level) {
  const map = {
    "Level 1": "初階",
    "Level 2": "基礎",
    "Level 3": "進階",
    "Level 4": "挑戰",
  };
  return map[level] || level;
}

function registerServiceWorker() {
  const canRegister =
    "serviceWorker" in navigator &&
    (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1");
  if (!canRegister) return;
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

function isCurrentExerciseScored() {
  return exercises[selectedExercise].scored === true;
}

function getExercisePattern(exercise) {
  if (exercise.variants?.length) {
    const variantIndex = selectedVariants[exercise.id] || 0;
    return exercise.variants[variantIndex].pattern;
  }
  if (!exercise.scored) return exercise.pattern;
  return [
    { beat: 1, dynamic: selectedTargetVolume },
    { beat: exercise.playBeats, dynamic: selectedTargetVolume },
  ];
}

function getExerciseInstruction(exercise) {
  if (["crescendo-8", "decrescendo-8", "swell-12"].includes(exercise.id)) {
    return `${exercise.playBeats} 拍｜${getExerciseDynamicSummary(exercise)}`;
  }
  if (exercise.variants?.length) return exercise.instruction;
  if (!exercise.scored) return exercise.instruction;
  return `用 ${selectedTargetVolume} 音量穩定吹 ${exercise.playBeats} 拍，注意聲音不要忽大忽小。`;
}

function getExerciseDynamicSummary(exercise) {
  const pattern = getExercisePattern(exercise);
  if (exercise.id === "swell-12" && pattern.length >= 3) {
    const first = pattern[0].dynamic;
    const peak = pattern[Math.floor(pattern.length / 2)].dynamic;
    const last = pattern[pattern.length - 1].dynamic;
    return `${first} → ${peak} → ${last}`;
  }
  if (["crescendo-8", "decrescendo-8"].includes(exercise.id)) {
    return `${pattern[0].dynamic} → ${pattern[pattern.length - 1].dynamic}`;
  }
  return pattern.map((item) => item.dynamic).join(" → ");
}

function getPatternSummary(pattern) {
  if (pattern.length > 3) {
    return `${pattern[0].dynamic} → ${pattern[pattern.length - 1].dynamic}`;
  }
  return pattern.map((item) => item.dynamic).join(" → ");
}

function getExerciseVariantLabel(exercise) {
  if (!exercise.variants?.length) return "";
  const variantIndex = selectedVariants[exercise.id] || 0;
  return exercise.variants[variantIndex].label;
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getDailyGoalKey() {
  return `chromatica-daily-goal-${getTodayKey()}`;
}

function getDailyGoalState() {
  try {
    return JSON.parse(localStorage.getItem(getDailyGoalKey())) || {};
  } catch {
    return {};
  }
}

function setDailyGoalState(state) {
  localStorage.setItem(getDailyGoalKey(), JSON.stringify(state));
}

function getDailyGoalTasks() {
  return exercises.flatMap((exercise, exerciseIndex) => {
    if (exercise.scored) {
      return targetVolumes.map((volume) => ({
        id: `${exercise.id}-${volume}`,
        exerciseIndex,
        volume,
        title: `${exercise.title} ${volume}`,
        level: exercise.level,
        playBeats: exercise.playBeats,
        pattern: [
          { beat: 1, dynamic: volume },
          { beat: exercise.playBeats, dynamic: volume },
        ],
      }));
    }
    if (exercise.variants?.length) {
      return exercise.variants.map((variant, variantIndex) => ({
        id: `${exercise.id}-variant-${variantIndex}`,
        exerciseIndex,
        variantIndex,
        volume: null,
        title: `${exercise.title} ${variant.label}`,
        level: exercise.level,
        playBeats: exercise.playBeats,
        pattern: variant.pattern,
        summary: variant.label,
      }));
    }
    return [
      {
        id: exercise.id,
        exerciseIndex,
        variantIndex: null,
        volume: null,
        title: exercise.title,
        level: exercise.level,
        playBeats: exercise.playBeats,
        pattern: exercise.pattern,
      },
    ];
  });
}

function getCurrentDailyGoalId() {
  const exercise = exercises[selectedExercise];
  if (exercise.scored) return `${exercise.id}-${selectedTargetVolume}`;
  if (exercise.variants?.length) return `${exercise.id}-variant-${selectedVariants[exercise.id] || 0}`;
  return exercise.id;
}

function makeLayout(holeCount) {
  const layout = chromaticLayouts[holeCount];
  return layout.blow.map((_, index) => ({
    hole: index + 1,
    blow: layout.blow[index],
    draw: layout.draw[index],
    buttonBlow: layout.buttonBlow[index],
    buttonDraw: layout.buttonDraw[index],
  }));
}

function renderNoteMap() {
  const map = $("#noteMap");
  const startIndex = selectedHoles === 16 ? 0 : selectedHoles === 14 ? 2 : 4;
  const layout = makeLayout(16).slice(startIndex);

  map.style.setProperty("--holes", selectedHoles);
  map.innerHTML = layout
    .map((note, index) => `
      <article class="hole-card">
        <strong>第 ${index + 1} 孔</strong>
        <div><span>吹</span><b>${note.blow}</b></div>
        <div><span>吸</span><b>${note.draw}</b></div>
        <div><span>按鍵吹</span><b>${note.buttonBlow}</b></div>
        <div><span>按鍵吸</span><b>${note.buttonDraw}</b></div>
      </article>
    `)
    .join("");
}

function activateViewButton(view) {
  $$("[data-view]").forEach((item) => {
    const matches = item.dataset.view === view;
    if (item.classList.contains("nav-item") || item.classList.contains("bottom-nav-item") || item.classList.contains("icon-btn")) {
      item.classList.toggle("active", matches);
    }
  });
}

function setBpm(nextBpm) {
  bpm = Math.max(40, Math.min(120, Number(nextBpm)));
  $("#bpmInput").value = bpm;
  $("#bpmValue").textContent = bpm;
  if (timer) {
    clearInterval(timer);
    timer = setInterval(stepPractice, 60000 / bpm);
  }
}

function updateAudioStatus(text) {
  const status = $("#audioMicStatus");
  if (status) status.textContent = text;
}

function modelRangeClass(hole) {
  if (hole >= 5) return "range-12";
  if (hole >= 3) return "range-14";
  return "range-16";
}

function noteHighlightClass(note, key, layout, index) {
  if (key === "draw" && (note === "C5" || note === "C6")) return "";
  if (key === "buttonDraw" && (note === "C4" || note === "C5" || note === "C6")) return "";
  const repeatClass = repeatPairClass(note, key, layout, index);
  const groups = {
    C4: "repeat-c4",
    C5: "repeat-c5",
    C6: "repeat-c6",
    "C#4": "repeat-csharp4",
    "C#5": "repeat-csharp5",
    "C#6": "repeat-csharp6",
    D7: "special-d7",
  };
  return [groups[note] || "", repeatClass].filter(Boolean).join(" ");
}

function repeatPairClass(note, key, layout, index) {
  if (!["blow", "buttonBlow"].includes(key)) return "";
  if (!["C4", "C5", "C6", "C#4", "C#5", "C#6"].includes(note)) return "";
  const previous = layout[index - 1]?.[key];
  const next = layout[index + 1]?.[key];
  if (next === note) return "pair-start";
  if (previous === note) return "pair-end";
  return "";
}

function interpolateDynamic(pattern, targetBeat) {
  if (targetBeat <= pattern[0].beat) return pattern[0].dynamic;
  for (let i = 0; i < pattern.length - 1; i += 1) {
    const current = pattern[i];
    const next = pattern[i + 1];
    if (targetBeat >= current.beat && targetBeat <= next.beat) {
      const span = next.beat - current.beat || 1;
      const progress = (targetBeat - current.beat) / span;
      const value = dynamics[current.dynamic] + (dynamics[next.dynamic] - dynamics[current.dynamic]) * progress;
      const nearest = Object.entries(dynamics).reduce((best, entry) => {
        return Math.abs(entry[1] - value) < Math.abs(best[1] - value) ? entry : best;
      });
      return nearest[0];
    }
  }
  return pattern[pattern.length - 1].dynamic;
}

function dynamicHeight(dynamic) {
  return 18 + dynamics[dynamic] * 16;
}

function renderCurve(activeBeat = 0) {
  const exercise = exercises[selectedExercise];
  const pattern = getExercisePattern(exercise);
  const curve = $("#dynamicCurve");
  curve.style.setProperty("--beats", exercise.playBeats);
  curve.innerHTML = Array.from({ length: exercise.playBeats }, (_, index) => {
    const beatNumber = index + 1;
    const dynamic = interpolateDynamic(pattern, beatNumber);
    const active = phase === "play" && beatNumber === activeBeat ? "active" : "";
    return `<div class="bar ${active}" title="${beatNumber}: ${dynamic}" style="height:${dynamicHeight(dynamic)}px"></div>`;
  }).join("");
}

function renderMicCurve() {
  $("#micCurve").style.setProperty("--samples", liveLevels.length);
  $("#micCurve").innerHTML = liveLevels
    .map((level, index) => {
      const active = phase === "play" && index === liveLevels.length - 1 ? "active" : "";
      return `<div class="mic-bar ${active}" style="height:${Math.max(4, Math.round(level * 84))}px"></div>`;
    })
    .join("");
}

function getAverageCycleScore() {
  const finishedScores = cycleScores.filter((score) => score !== null);
  return finishedScores.length
    ? Math.round(finishedScores.reduce((sum, score) => sum + score, 0) / finishedScores.length)
    : null;
}

function resetCycleScores() {
  cycleScores = Array.from({ length: totalCycles }, () => null);
}

function saveCurrentCycleScore() {
  if (currentStabilityScore === null) return;
  cycleScores[cycle - 1] = currentStabilityScore;
}

function showAverageScore() {
  const average = getAverageCycleScore();
  if (average !== null) {
    $("#stabilityStat span").textContent = "總平均";
    $("#stabilityScore").textContent = `${average}%`;
  }
}

function renderDailyGoals() {
  const state = getDailyGoalState();
  const tasks = getDailyGoalTasks();
  const doneCount = tasks.filter((task) => state[task.id]).length;
  const summary = `${doneCount} / ${tasks.length}`;
  $("#dailyGoalSummary").textContent = `今日完成 ${summary} 個練習`;
  $$('[data-view="daily"]').forEach((dailyNav) => {
    dailyNav.classList.toggle("complete", doneCount === tasks.length && tasks.length > 0);
  });
  $("#dailyGoalList").innerHTML = tasks
    .map((task, index) => {
      const done = state[task.id] === true;
      return `
        <button class="goal-chip ${done ? "done" : ""}" data-goal-exercise="${task.exerciseIndex}" data-goal-volume="${task.volume || ""}" data-goal-variant="${task.variantIndex ?? ""}" type="button">
          <span>${done ? "✓" : index + 1}</span>
          <strong>${task.title}</strong>
          <small>${localizeLevel(task.level)} · ${task.playBeats} 拍 · ${task.summary || getPatternSummary(task.pattern)}</small>
        </button>
      `;
    })
    .join("");
}

function markDailyGoalDone(goalId) {
  const state = getDailyGoalState();
  const wasDone = state[goalId] === true;
  state[goalId] = true;
  setDailyGoalState(state);
  renderDailyGoals();
  const tasks = getDailyGoalTasks();
  const isAllDone = tasks.every((task) => state[task.id] === true);
  return { isNew: !wasDone, isAllDone };
}

function showGoalCompletedDialog(title) {
  $("#goalToastTitle").textContent = "恭喜完成";
  $("#goalToastText").textContent = `你已完成今日目標：「${title}」。`;
  $("#goalToast").classList.remove("hidden");
}

function showAllGoalsCompletedDialog() {
  $("#goalToastTitle").textContent = "今日目標完成";
  $("#goalToastText").textContent = "恭喜你已完成今日所有目標。";
  $("#goalToast").classList.remove("hidden");
}

function resetMicStats() {
  const exercise = exercises[selectedExercise];
  liveLevels = Array.from({ length: 48 }, () => 0);
  displayEnvelopeLevel = 0;
  scoreEnvelopeSignal = 0;
  beatLevelSums = Array.from({ length: exercise.playBeats }, () => 0);
  beatLevelCounts = Array.from({ length: exercise.playBeats }, () => 0);
  playLevels = [];
  currentStabilityScore = null;
  $("#micLevelBar").style.width = "0%";
  $("#liveVolume").textContent = "0%";
  updatePitchTuner(null);
  $("#stabilityStat span").textContent = "穩定度";
  $("#stabilityScore").textContent = "--";
  renderMicCurve();
  resetCycleScores();
}

function resetMicCycle() {
  const exercise = exercises[selectedExercise];
  liveLevels = Array.from({ length: 48 }, () => 0);
  displayEnvelopeLevel = 0;
  scoreEnvelopeSignal = 0;
  beatLevelSums = Array.from({ length: exercise.playBeats }, () => 0);
  beatLevelCounts = Array.from({ length: exercise.playBeats }, () => 0);
  playLevels = [];
  currentStabilityScore = null;
  $("#micLevelBar").style.width = "0%";
  $("#liveVolume").textContent = "0%";
  updatePitchTuner(null);
  $("#stabilityStat span").textContent = "穩定度";
  $("#stabilityScore").textContent = "--";
  renderMicCurve();
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function standardDeviation(values) {
  if (!values.length) return 0;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function normalizeSeries(values) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max - min < 0.0001) return values.map(() => 0.5);
  return values.map((value) => (value - min) / (max - min));
}

function targetValueForBeat(beatNumber) {
  const exercise = exercises[selectedExercise];
  return dynamics[interpolateDynamic(getExercisePattern(exercise), beatNumber)];
}

function excessRatio(value, tolerance) {
  return Math.max(0, value - tolerance);
}

function calculateStability() {
  if (playLevels.length < 18) return "--";
  const minSignal = 0.00025;
  const audibleSamples = playLevels.filter((value) => value > minSignal);
  const audibleRatio = audibleSamples.length / playLevels.length;
  if (audibleSamples.length < 10 || audibleRatio < 0.4) return 0;
  const confidencePenalty = audibleRatio < 0.86 ? 0.72 + audibleRatio * 0.22 : 1;
  const normalizedSamples = audibleSamples.map((value) => Math.log1p(value / minSignal));

  const frameAverage = normalizedSamples.reduce((sum, value) => sum + value, 0) / normalizedSamples.length;
  const frameWobble = standardDeviation(normalizedSamples) / Math.max(frameAverage, 0.0001);
  const frameDeltas = normalizedSamples.slice(1).map((value, index) => Math.abs(value - normalizedSamples[index]));
  const averageDelta = frameDeltas.reduce((sum, value) => sum + value, 0) / Math.max(1, frameDeltas.length);
  const deltaRatio = averageDelta / Math.max(frameAverage, 0.0001);
  const exercise = exercises[selectedExercise];
  const chunkCount = Math.min(exercise.playBeats, Math.max(3, Math.floor(normalizedSamples.length / 10)));
  const chunkSize = Math.max(1, Math.floor(normalizedSamples.length / chunkCount));
  const chunks = [];
  for (let i = 0; i < normalizedSamples.length; i += chunkSize) {
    const chunk = normalizedSamples.slice(i, i + chunkSize);
    chunks.push(chunk.reduce((sum, value) => sum + value, 0) / chunk.length);
  }
  const chunkAverage = chunks.reduce((sum, value) => sum + value, 0) / chunks.length;
  const slowWobble = standardDeviation(chunks) / Math.max(chunkAverage, 0.0001);
  const chunkDeltas = chunks.slice(1).map((value, index) => Math.abs(value - chunks[index]));
  const slowJitter =
    chunkDeltas.reduce((sum, value) => sum + value, 0) / Math.max(1, chunkDeltas.length) / Math.max(chunkAverage, 0.0001);
  const slowWobblePenalty = excessRatio(slowWobble, 0.035) * 420;
  const slowJitterPenalty = excessRatio(slowJitter, 0.045) * 260;
  const frameNoisePenalty = excessRatio(frameWobble, 0.08) * 28 + excessRatio(deltaRatio, 0.035) * 16;
  const toneScore = 100 - slowWobblePenalty - slowJitterPenalty - frameNoisePenalty;

  const beatSignals = beatLevelSums
    .map((sum, index) => (beatLevelCounts[index] > 0 ? sum / beatLevelCounts[index] : null))
    .filter((value) => value !== null);
  if (beatSignals.length < 2) {
    return clampScore(toneScore * confidencePenalty);
  }

  const normalizedBeatSignals = beatSignals.map((value) => Math.log1p(value / minSignal));
  const targetValues = normalizedBeatSignals.map((_, index) => targetValueForBeat(index + 1));
  const targetRange = Math.max(...targetValues) - Math.min(...targetValues);
  const beatAverage = normalizedBeatSignals.reduce((sum, value) => sum + value, 0) / normalizedBeatSignals.length;
  let curveScore;

  if (targetRange < 0.2) {
    const beatWobble = standardDeviation(normalizedBeatSignals) / Math.max(beatAverage, 0.0001);
    const adjacentDeltas = normalizedBeatSignals.slice(1).map((value, index) => Math.abs(value - normalizedBeatSignals[index]));
    const beatJitter =
      adjacentDeltas.reduce((sum, value) => sum + value, 0) / Math.max(1, adjacentDeltas.length) / Math.max(beatAverage, 0.0001);
    curveScore = 100 - excessRatio(beatWobble, 0.035) * 420 - excessRatio(beatJitter, 0.045) * 220;
  } else {
    const actualShape = normalizeSeries(normalizedBeatSignals);
    const targetShape = normalizeSeries(targetValues);
    const mae = actualShape.reduce((sum, value, index) => sum + Math.abs(value - targetShape[index]), 0) / actualShape.length;
    const actualDirection = actualShape.at(-1) - actualShape[0];
    const targetDirection = targetShape.at(-1) - targetShape[0];
    const directionPenalty = Math.sign(actualDirection || 0) === Math.sign(targetDirection || 0) ? 0 : 28;
    curveScore = 100 - mae * 165 - directionPenalty;
  }

  const rawScore = (toneScore * 0.62 + curveScore * 0.38) * confidencePenalty;
  return clampScore(rawScore);
}

function readMicSignal() {
  if (!micAnalyser || !micData) return 0;
  micAnalyser.getByteTimeDomainData(micData);
  micAnalyser.getByteFrequencyData(micFrequencyData);
  let sum = 0;
  let min = 1;
  let max = -1;
  for (let i = 0; i < micData.length; i += 1) {
    const centered = (micData[i] - 128) / 128;
    sum += centered * centered;
    min = Math.min(min, centered);
    max = Math.max(max, centered);
  }
  const rms = Math.sqrt(sum / micData.length);
  const peakToPeak = Math.max(0, max - min) / 2;
  const sampleRate = audioContext?.sampleRate || 44100;
  const hzPerBin = sampleRate / micAnalyser.fftSize;
  const startBin = Math.max(1, Math.floor(80 / hzPerBin));
  const endBin = Math.min(micFrequencyData.length - 1, Math.ceil(5000 / hzPerBin));
  let spectralPeak = 0;
  let spectralSum = 0;
  let spectralCount = 0;
  for (let i = startBin; i <= endBin; i += 1) {
    const value = micFrequencyData[i] / 255;
    spectralPeak = Math.max(spectralPeak, value);
    spectralSum += value;
    spectralCount += 1;
  }
  const spectralAverage = spectralCount ? spectralSum / spectralCount : 0;
  const spectralSignal = spectralPeak * 0.075 + spectralAverage * 0.035;
  return Math.max(rms, peakToPeak * 0.72, spectralSignal);
}

function detectPitch() {
  if (!micAnalyser || !micData || !audioContext) return null;
  const sampleRate = audioContext.sampleRate;
  const buffer = new Float32Array(micData.length);
  let rmsSum = 0;
  for (let i = 0; i < micData.length; i += 1) {
    const value = (micData[i] - 128) / 128;
    buffer[i] = value;
    rmsSum += value * value;
  }
  const rms = Math.sqrt(rmsSum / buffer.length);
  if (rms < 0.006) return null;

  const minFrequency = 120;
  const maxFrequency = 1600;
  const minLag = Math.floor(sampleRate / maxFrequency);
  const maxLag = Math.min(buffer.length - 1, Math.floor(sampleRate / minFrequency));
  let bestLag = -1;
  let bestCorrelation = 0;

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let correlation = 0;
    for (let i = 0; i < buffer.length - lag; i += 1) {
      correlation += buffer[i] * buffer[i + lag];
    }
    correlation /= buffer.length - lag;
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestLag = lag;
    }
  }

  if (bestLag < 0 || bestCorrelation < 0.004) return null;
  let refinedLag = bestLag;
  if (bestLag > minLag && bestLag < maxLag) {
    const previous = lagCorrelation(buffer, bestLag - 1);
    const current = lagCorrelation(buffer, bestLag);
    const next = lagCorrelation(buffer, bestLag + 1);
    const denominator = previous - 2 * current + next;
    if (Math.abs(denominator) > 0.000001) {
      refinedLag = bestLag + (previous - next) / (2 * denominator);
    }
  }

  const frequency = sampleRate / refinedLag;
  if (!Number.isFinite(frequency) || frequency < minFrequency || frequency > maxFrequency) return null;
  return frequency;
}

function lagCorrelation(buffer, lag) {
  let correlation = 0;
  for (let i = 0; i < buffer.length - lag; i += 1) {
    correlation += buffer[i] * buffer[i + lag];
  }
  return correlation / (buffer.length - lag);
}

function formatPitch(frequency) {
  const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const midi = 69 + 12 * Math.log2(frequency / tuningA4);
  const roundedMidi = Math.round(midi);
  const cents = Math.round((midi - roundedMidi) * 100);
  const noteName = noteNames[((roundedMidi % 12) + 12) % 12];
  const octave = Math.floor(roundedMidi / 12) - 1;
  return {
    note: `${noteName}${octave}`,
    cents,
    frequency,
  };
}

function updatePitchTuner(pitch) {
  const tuner = $("#pitchTuner");
  if (!pitch) {
    $("#pitchReadout").textContent = "--";
    $("#pitchCents").textContent = "--";
    $("#pitchNeedle").style.left = "50%";
    tuner.dataset.status = "idle";
    return;
  }
  const clampedCents = Math.max(-50, Math.min(50, pitch.cents));
  const position = 50 + clampedCents;
  const sign = pitch.cents > 0 ? "+" : "";
  const absCents = Math.abs(pitch.cents);
  const status = absCents <= 8 ? "in" : absCents <= 22 ? "near" : "out";
  $("#pitchReadout").textContent = pitch.note;
  $("#pitchCents").textContent = `${sign}${pitch.cents}¢`;
  $("#pitchNeedle").style.left = `${position}%`;
  tuner.dataset.status = status;
}

function signalToMeterLevel(signal) {
  if (signal <= 0.00001) return 0;
  const db = 20 * Math.log10(signal * Math.sqrt(micSensitivity));
  const minDb = -50;
  const maxDb = -6;
  const linear = Math.max(0, Math.min(1, (db - minDb) / (maxDb - minDb)));
  return Math.pow(linear, 1.15);
}

function signalToCurveLevel(signal) {
  if (signal <= 0.00001) return 0;
  const db = 20 * Math.log10(signal * Math.sqrt(micSensitivity) * 1.15);
  const minDb = -54;
  const maxDb = -6;
  const linear = Math.max(0, Math.min(1, (db - minDb) / (maxDb - minDb)));
  return Math.pow(linear, 0.96);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function calibrateMic() {
  if (!micAnalyser || isCalibratingMic) return;
  isCalibratingMic = true;
  $("#calibrateMicBtn").textContent = "校正中...";
  $("#audioCalibrateBtn").textContent = "校正中...";
  updateAudioStatus("校正中");
  const samples = [];
  for (let i = 0; i < 24; i += 1) {
    samples.push(readMicSignal());
    await sleep(42);
  }
  samples.sort((a, b) => a - b);
  micSilentRms = samples[Math.floor(samples.length * 0.5)] || 0;
  isCalibratingMic = false;
  $("#calibrateMicBtn").textContent = "重新校正靜音";
  $("#audioCalibrateBtn").textContent = "靜音校正";
  updateAudioStatus("已開啟");
}

function updateMicMonitor() {
  const exercise = exercises[selectedExercise];
  const isPastAttackGrace = phase === "play" && performance.now() - playStartedAt >= scoringStartDelayMs;
  const isScoringWindow = phase === "play" && beat >= 1 && isPastAttackGrace;
  const isPreRoll = phase === "prepare" && beat >= exercise.prepareBeats;
  const isPostRoll = phase === "rest" && beat <= 1;
  const isListeningWindow = isScoringWindow || isPreRoll || isPostRoll;
  const rawSignal = readMicSignal();
  const gateRatio = Math.max(0.45, 1.05 - micSensitivity * 0.11);
  const scoreSignal = isListeningWindow ? Math.max(0, rawSignal - micSilentRms * gateRatio) : 0;
  const meterLevel = isListeningWindow ? signalToMeterLevel(rawSignal) : 0;
  const rawCurveLevel = isListeningWindow ? signalToCurveLevel(rawSignal) : 0;
  if (isListeningWindow) {
    displayEnvelopeLevel =
      rawCurveLevel > displayEnvelopeLevel
        ? displayEnvelopeLevel * 0.42 + rawCurveLevel * 0.58
        : displayEnvelopeLevel * 0.88 + rawCurveLevel * 0.12;
  } else {
    displayEnvelopeLevel = 0;
  }
  const percent = Math.round(meterLevel * 100);
  $("#micLevelBar").style.width = `${percent}%`;
  $("#liveVolume").textContent = `${percent}%`;
  const detectedPitch = isScoringWindow ? detectPitch() : null;
  updatePitchTuner(detectedPitch ? formatPitch(detectedPitch) : null);

  if (isListeningWindow) {
    liveLevels.push(displayEnvelopeLevel);
    liveLevels = liveLevels.slice(-48);
  }

  if (isScoringWindow && isCurrentExerciseScored()) {
    scoreEnvelopeSignal =
      scoreSignal > scoreEnvelopeSignal
        ? scoreEnvelopeSignal * 0.68 + scoreSignal * 0.32
        : scoreEnvelopeSignal * 0.86 + scoreSignal * 0.14;
    const index = beat - 1;
    beatLevelSums[index] += scoreEnvelopeSignal;
    beatLevelCounts[index] += 1;
    playLevels.push(scoreEnvelopeSignal);
    playLevels = playLevels.slice(-Math.max(240, exercise.playBeats * 90));
    const score = calculateStability();
    if (score === "--") {
      $("#stabilityScore").textContent = "--";
    } else {
      currentStabilityScore = score;
      $("#stabilityScore").textContent = `${score}%`;
    }
  }

  renderMicCurve();
  micFrame = requestAnimationFrame(updateMicMonitor);
}

async function startMic() {
  if (micAnalyser) return true;
  try {
    updateAudioStatus("開啟中");
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("getUserMedia is not available");
    }
    if (!audioContext) {
      audioContext = new AudioContext();
    }
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    const source = audioContext.createMediaStreamSource(micStream);
    micAnalyser = audioContext.createAnalyser();
    micAnalyser.fftSize = 2048;
    micAnalyser.smoothingTimeConstant = 0.18;
    micData = new Uint8Array(micAnalyser.fftSize);
    micFrequencyData = new Uint8Array(micAnalyser.frequencyBinCount);
    source.connect(micAnalyser);
    resetMicStats();
    if (micFrame) {
      cancelAnimationFrame(micFrame);
    }
    updateMicMonitor();
    updateAudioStatus("已開啟");
    return true;
  } catch (error) {
    updateAudioStatus("無法開啟");
    return false;
  }
}

function renderExercises() {
  $("#exerciseCount").textContent = `${exercises.length} 組`;
  $("#exerciseList").innerHTML = exercises
    .map((exercise, index) => {
      const pattern = getExercisePattern(exercise);
      const variantLabel = getExerciseVariantLabel(exercise);
      const summary = ["crescendo-8", "decrescendo-8", "swell-12"].includes(exercise.id)
        ? getExerciseDynamicSummary(exercise)
        : variantLabel || pattern.map((item) => item.dynamic).join(" → ");
      return `
        <button class="exercise-btn ${index === selectedExercise ? "active" : ""}" data-exercise="${index}">
          <strong>${exercise.title}</strong>
          <small>${localizeLevel(exercise.level)} · ${exercise.playBeats} 拍 · ${summary}</small>
        </button>
      `;
    })
    .join("");
}

function renderExercise() {
  const exercise = exercises[selectedExercise];
  const pattern = getExercisePattern(exercise);
  bpm = Number($("#bpmInput").value) || exercise.bpm;
  $("#exerciseLevel").textContent = localizeLevel(exercise.level);
  $("#exerciseTitle").textContent = exercise.title;
  $("#exerciseInstruction").textContent = getExerciseInstruction(exercise);
  $("#beatTotal").textContent = `/ ${exercise.playBeats} 拍`;
  $("#currentDynamic").textContent = interpolateDynamic(pattern, Math.max(1, beat));
  $("#patternText").textContent = getExerciseDynamicSummary(exercise);
  $("#prepareBeats").textContent = `${exercise.prepareBeats} 拍`;
  $("#playBeats").textContent = `${exercise.playBeats} 拍`;
  $("#restBeats").textContent = `${exercise.restBeats} 拍`;
  $("#cycleCount").textContent = totalCycles;
  $("#cycleStatus").textContent = `第 ${cycle} 次 / 共 ${totalCycles} 次`;
  $("#bpmInput").value = bpm;
  $("#bpmValue").textContent = bpm;
  $("#cycleSelect").value = String(totalCycles);
  $("#targetVolumeSelect").value = selectedTargetVolume;
  $("#targetVolumeSetting").classList.toggle("hidden", !isCurrentExerciseScored());
  $("#variantSetting").classList.toggle("hidden", !exercise.variants?.length);
  if (exercise.variants?.length) {
    $("#variantSelect").innerHTML = exercise.variants
      .map((variant, index) => `<option value="${index}">${variant.label}</option>`)
      .join("");
    $("#variantSelect").value = String(selectedVariants[exercise.id] || 0);
  }
  $("#stabilityStat").classList.toggle("hidden", !isCurrentExerciseScored());
  renderDailyGoals();
  renderExercises();
  renderCurve(phase === "play" ? beat : 0);
}

function setView(view) {
  currentView = view;
  $$(".view").forEach((element) => element.classList.toggle("active", element.id === view));
  activateViewButton(view);
  if (view !== "longtone") stopPractice(false);
}

function playClick(strong = false) {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = strong ? 1040 : 720;
  gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(strong ? 0.28 : 0.16, audioContext.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.09);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.1);
}

function updatePhaseLabel() {
  const labels = {
    idle: "待開始",
    prepare: "準備中",
    play: "吹奏中",
    rest: "休息中",
    done: "完成",
  };
  $("#phasePill").textContent = labels[phase];
}

function updateBeatDisplay() {
  const exercise = exercises[selectedExercise];
  const pattern = getExercisePattern(exercise);
  const displayBeat = phase === "play" ? beat : phase === "idle" || phase === "done" ? 0 : beat;
  $("#currentBeat").textContent = displayBeat;
  $("#cycleCount").textContent = totalCycles;
  $("#cycleStatus").textContent = `第 ${cycle} 次 / 共 ${totalCycles} 次`;
  $("#beatTotal").textContent = phase === "prepare"
    ? `/ ${exercise.prepareBeats} 拍`
    : phase === "rest"
      ? `/ ${exercise.restBeats} 拍`
      : `/ ${exercise.playBeats} 拍`;
  $("#currentDynamic").textContent =
    phase === "play" ? interpolateDynamic(pattern, beat) : interpolateDynamic(pattern, 1);
  updatePhaseLabel();
  renderCurve(phase === "play" ? beat : 0);
}

function stepPractice() {
  const exercise = exercises[selectedExercise];
  beat += 1;
  playClick(beat === 1);

  if (phase === "prepare" && beat > exercise.prepareBeats) {
    phase = "play";
    beat = 1;
    playStartedAt = performance.now();
    resetMicCycle();
    playClick(true);
  } else if (phase === "play" && beat > exercise.playBeats) {
    if (isCurrentExerciseScored()) {
      saveCurrentCycleScore();
    }
    phase = "rest";
    beat = 1;
    playClick(true);
  } else if (phase === "rest" && beat > exercise.restBeats) {
    if (cycle >= totalCycles) {
      if (isCurrentExerciseScored()) {
        showAverageScore();
      }
      const currentGoalId = getCurrentDailyGoalId();
      const currentGoalTitle = exercise.scored
        ? `${exercise.title} ${selectedTargetVolume}`
        : exercise.variants?.length
          ? `${exercise.title} ${getExerciseVariantLabel(exercise)}`
          : exercise.title;
      const goalResult = markDailyGoalDone(currentGoalId);
      if (goalResult.isNew && goalResult.isAllDone) {
        showAllGoalsCompletedDialog();
      } else if (goalResult.isNew) {
        showGoalCompletedDialog(currentGoalTitle);
      }
      stopPractice(true);
      return;
    }
    cycle += 1;
    phase = "play";
    beat = 1;
    playStartedAt = performance.now();
    resetMicCycle();
    playClick(true);
  }

  updateBeatDisplay();
}

function startPractice() {
  const exercise = exercises[selectedExercise];
  if (timer) {
    clearInterval(timer);
    timer = null;
    $("#startPauseBtn").textContent = "繼續";
    return;
  }

  if (phase === "idle" || phase === "done") {
    phase = "prepare";
    beat = 0;
    cycle = 1;
    resetMicStats();
  }

  $("#startPauseBtn").textContent = "暫停";
  stepPractice();
  timer = setInterval(stepPractice, 60000 / bpm);
  updateBeatDisplay();
}

function stopPractice(done = false) {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  phase = done ? "done" : "idle";
  beat = 0;
  cycle = 1;
  $("#startPauseBtn").textContent = done ? "再練一次" : "開始";
  if (!done) {
    resetMicStats();
  }
  updateBeatDisplay();
}

function bindEvents() {
  $$("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      setView(button.dataset.view);
    });
  });

  $$("[data-jump]").forEach((button) => {
    button.addEventListener("click", () => {
      const view = button.dataset.jump;
      setView(view);
    });
  });

  $$(".map-model").forEach((button) => {
    button.addEventListener("click", () => {
      selectedHoles = Number(button.dataset.modelHoles);
      $$(".map-model").forEach((item) => item.classList.toggle("active", item === button));
      renderNoteMap();
    });
  });

  $("#exerciseList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-exercise]");
    if (!button) return;
    stopPractice(false);
    selectedExercise = Number(button.dataset.exercise);
    $("#bpmInput").value = exercises[selectedExercise].bpm;
    bpm = exercises[selectedExercise].bpm;
    renderExercise();
    resetMicStats();
    updateBeatDisplay();
  });

  $("#bpmInput").addEventListener("input", (event) => {
    setBpm(event.target.value);
  });

  $("#bpmMinus").addEventListener("click", () => setBpm(bpm - 2));
  $("#bpmPlus").addEventListener("click", () => setBpm(bpm + 2));

  $("#cycleSelect").addEventListener("change", (event) => {
    totalCycles = Number(event.target.value);
    stopPractice(false);
    renderExercise();
  });

  $("#targetVolumeSelect").addEventListener("change", (event) => {
    selectedTargetVolume = event.target.value;
    stopPractice(false);
    renderExercise();
  });

  $("#variantSelect").addEventListener("change", (event) => {
    const exercise = exercises[selectedExercise];
    selectedVariants[exercise.id] = Number(event.target.value);
    stopPractice(false);
    renderExercise();
    resetMicStats();
    updateBeatDisplay();
  });

  $("#dailyGoalList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-goal-exercise]");
    if (!button) return;
    selectedExercise = Number(button.dataset.goalExercise);
    if (button.dataset.goalVolume) {
      selectedTargetVolume = button.dataset.goalVolume;
    }
    if (button.dataset.goalVariant) {
      const exercise = exercises[selectedExercise];
      selectedVariants[exercise.id] = Number(button.dataset.goalVariant);
    }
    $("#bpmInput").value = exercises[selectedExercise].bpm;
    bpm = exercises[selectedExercise].bpm;
    stopPractice(false);
    setView("longtone");
    renderExercise();
    resetMicStats();
    updateBeatDisplay();
  });

  $("#micSensitivity").addEventListener("input", (event) => {
    micSensitivity = Number(event.target.value);
    $("#micSensitivityValue").textContent = `${micSensitivity.toFixed(1)}x`;
  });
  $("#tuningSelect").addEventListener("change", (event) => {
    tuningA4 = Number(event.target.value);
    updatePitchTuner(null);
  });
  $("#calibrateMicBtn").addEventListener("click", calibrateMic);
  $("#audioCalibrateBtn").addEventListener("click", calibrateMic);
  $("#goalToastClose").addEventListener("click", () => {
    $("#goalToast").classList.add("hidden");
  });
  $("#goalToast").addEventListener("click", (event) => {
    if (event.target.id === "goalToast") {
      $("#goalToast").classList.add("hidden");
    }
  });

  $("#startPauseBtn").addEventListener("click", startPractice);
  $("#resetBtn").addEventListener("click", () => stopPractice(false));
  $("#micGateBtn").addEventListener("click", async () => {
    $("#micGateError").textContent = "";
    const started = await startMic();
    if (started) {
      await calibrateMic();
      $("#micGate").classList.add("hidden");
    } else {
      $("#micGateError").textContent = "麥克風無法開啟，請確認瀏覽器權限後再試一次。";
    }
  });
  $("#micGateSkip").addEventListener("click", () => {
    $("#micGate").classList.add("hidden");
  });
}

async function requestMicOnEntry() {
  const started = await startMic();
  if (started) {
    await calibrateMic();
    $("#micGate").classList.add("hidden");
  }
}

bindEvents();
registerServiceWorker();
renderNoteMap();
renderExercise();
updateBeatDisplay();
renderMicCurve();
