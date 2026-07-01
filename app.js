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
    showStability: false,
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
let micFloatTimeData = null;
let micFrequencyData = null;
let micFloatFrequencyData = null;
let micFrame = null;
let micSensitivity = 3.2;
let tuningA4 = 440;
let micSilentRms = 0;
let isCalibratingMic = false;
const tunerMode = "full-range";
const harpType = "chromatic";
const allowedRange = { lowNote: "C1", highNote: "D7" };
const correctionRange = { lowNote: "C3", highNote: "D7" };
const HIGH_REGISTER_START_HZ = 950;
const VIBRATO_TRACKING_RANGE_CENTS = 80;
const FINE_TRACKER_RANGE_CENTS = 120;
const DETECTOR_RANGE = {
  minFundamentalHz: 80,
  maxFundamentalHz: 2600,
  maxRawAnalysisHz: 5000,
  displayMinHz: 120,
  displayMaxHz: 2400,
};
const YIN_CONFIG = {
  threshold: 0.14,
  highThreshold: 0.18,
  fallbackThreshold: 0.26,
  highFallbackThreshold: 0.32,
  probabilityThreshold: 0.52,
  minFrequency: DETECTOR_RANGE.minFundamentalHz,
  maxFrequency: DETECTOR_RANGE.maxFundamentalHz,
  bufferSize: 4096,
  highBufferSize: 2048,
  analyserSize: 8192,
};
const MPM_CONFIG = {
  clarityThreshold: 0.52,
  highClarityThreshold: 0.44,
  minFrequency: DETECTOR_RANGE.minFundamentalHz,
  maxFrequency: DETECTOR_RANGE.maxFundamentalHz,
};
const FINE_TRACKER_CONFIG = {
  normalBufferSize: 2048,
  highBufferSize: 1024,
  searchCents: 140,
  minCorrelation: 0.12,
  highMinCorrelation: 0.08,
  validRangeCents: 90,
  releaseRangeCents: 120,
  detectorFallbackRangeCents: 85,
  normalQualityThreshold: 0.16,
  highQualityThreshold: 0.11,
  maxJumpCents: 160,
};
const SEMITONE_SWITCH_CENTS = 45;
const SEMITONE_CONFIRM_CENTS = 55;
const SEMITONE_RELEASE_CENTS = 65;
const SEMITONE_PENDING_FRAMES = 2;
const PITCH_DETECTION_MODES = {
  stable: {
    minRms: () => Math.max(micSilentRms * 2.2, 0.0052),
    qualityThreshold: 0.7,
    harmonicThreshold: 0.28,
    noteSwitchFrames: 2,
  },
  normal: {
    minRms: () => Math.max(micSilentRms * 1.55, 0.0032),
    qualityThreshold: 0.5,
    harmonicThreshold: 0.14,
    noteSwitchFrames: 2,
  },
  sensitive: {
    minRms: () => Math.max(micSilentRms * 1.25, 0.0022),
    qualityThreshold: 0.42,
    harmonicThreshold: 0.08,
    noteSwitchFrames: 1,
  },
};
const DETECTOR_V1_CONFIDENCE = 0.68;
let pitchDetectionMode = "normal";
let allowedNotes = [];
let pitchCentsWindow = [];
let activeNearestNote = null;
let pendingNearestNote = null;
let pendingNearestNoteCount = 0;
let activeNoteConfidence = 0;
let activeNoteRms = 0;
let smoothedCents = null;
let stablePitchDisplay = null;
let fineRejectCount = 0;
let lastFineAcceptedAt = 0;
let naturalBoundaryPendingNote = null;
let naturalBoundaryPendingCount = 0;
let lastPitchAt = 0;
let lastPitchUiUpdateAt = 0;
let lastPitchAnalysisAt = 0;
let pitchCentsHistory = [];
let pitchDebugLog = [];
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

function shouldShowStability() {
  const exercise = exercises[selectedExercise];
  return isCurrentExerciseScored() && exercise.showStability !== false;
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
  const firstDynamic = pattern[0].dynamic;
  const lastDynamic = pattern[pattern.length - 1].dynamic;
  if (firstDynamic === lastDynamic && pattern.every((item) => item.dynamic === firstDynamic)) {
    return firstDynamic;
  }
  if (exercise.id === "swell-12" && pattern.length >= 3) {
    const peak = pattern[Math.floor(pattern.length / 2)].dynamic;
    if (firstDynamic === peak && peak === lastDynamic) return firstDynamic;
    return `${firstDynamic} → ${peak} → ${lastDynamic}`;
  }
  if (["crescendo-8", "decrescendo-8"].includes(exercise.id)) {
    return firstDynamic === lastDynamic ? firstDynamic : `${firstDynamic} → ${lastDynamic}`;
  }
  return pattern.map((item) => item.dynamic).join(" → ");
}

function getPatternDynamicMarkers(exercise) {
  const markers = getExercisePattern(exercise).map((item) => item.dynamic);
  return markers.filter((marker, index) => index === 0 || marker !== markers[index - 1]);
}

function getExerciseWaveGuide(exercise) {
  const guides = {
    "steady-8": {
      type: "stable",
      title: "平穩長音",
      text: "自然起音，平穩延伸，輕柔收尾。",
      path: "M24 68 C42 68 44 38 66 38 H250 C276 38 278 68 296 68",
    },
    "dynamic-layers": {
      type: "layers",
      title: "音量分層",
      text: "感受不同力度的層次變化。",
      path: "M24 72 H88 V60 H152 V48 H216 V34 H296",
      markers: ["p", "mp", "mf", "f"],
    },
    "crescendo-8": {
      type: "crescendo",
      title: "漸強",
      text: "由弱漸強，讓聲音慢慢站起來。",
      path: "M24 72 C78 70 118 58 160 48 S238 28 296 26",
    },
    "decrescendo-8": {
      type: "decrescendo",
      title: "漸弱",
      text: "由強漸弱，讓聲音自然放下來。",
      path: "M24 26 C82 28 120 40 160 48 S238 70 296 72",
    },
    "swell-12": {
      type: "mountain",
      title: "山形長音",
      text: "由弱漸強，再自然回落。",
      path: "M24 72 C78 68 108 28 160 28 S242 68 296 72",
    },
  };
  return guides[exercise.id] || guides["steady-8"];
}

function renderWaveGuide() {
  const guide = getExerciseWaveGuide(exercises[selectedExercise]);
  const exercise = exercises[selectedExercise];
  const markers = guide.markers || getPatternDynamicMarkers(exercise);
  $("#waveGuideTitle").textContent = guide.title;
  $("#waveGuideText").textContent = guide.text;
  $("#waveLine").setAttribute("d", guide.path);
  $("#waveGuide").dataset.type = guide.type;
  const labels = $("#waveLabels");
  labels.innerHTML = markers.length
    ? markers.map((marker) => `<span>${marker}</span>`).join("")
    : "";
  labels.style.setProperty("--wave-label-count", Math.max(markers.length, 1));
  labels.classList.toggle("hidden", !markers.length);
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

function getDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTodayKey() {
  return getDateKey();
}

function getDailyGoalKey() {
  return `chromatica-daily-goal-${getTodayKey()}`;
}

function addDays(date, offset) {
  const next = new Date(date);
  next.setDate(next.getDate() + offset);
  return next;
}

function readJsonStorage(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}

function getPracticeHistory() {
  return readJsonStorage("practiceHistory", {});
}

function setPracticeHistory(history) {
  localStorage.setItem("practiceHistory", JSON.stringify(history));
}

function getFreezeCount() {
  const value = Number(localStorage.getItem("freezeCount"));
  return Number.isFinite(value) ? value : 0;
}

function setFreezeCount(value) {
  localStorage.setItem("freezeCount", String(Math.max(0, value)));
}

function getLongestStreak() {
  const value = Number(localStorage.getItem("longestStreak"));
  return Number.isFinite(value) ? value : 0;
}

function setLongestStreak(value) {
  localStorage.setItem("longestStreak", String(Math.max(0, value)));
}

function isPracticeProtected(history, dateKey) {
  return history[dateKey] === "completed" || history[dateKey] === "frozen";
}

function calculateCurrentStreak(history) {
  let count = 0;
  const today = new Date();
  let cursor = isPracticeProtected(history, getDateKey(today)) ? today : addDays(today, -1);
  while (isPracticeProtected(history, getDateKey(cursor))) {
    count += 1;
    cursor = addDays(cursor, -1);
  }
  return count;
}

function calculateMonthCompletedDays(history) {
  const prefix = getDateKey().slice(0, 8);
  return Object.entries(history).filter(([dateKey, status]) => dateKey.startsWith(prefix) && status === "completed").length;
}

function updateLongestStreak(history) {
  const current = calculateCurrentStreak(history);
  const longest = Math.max(getLongestStreak(), current);
  setLongestStreak(longest);
  return longest;
}

function markPracticeCompletedToday() {
  const history = getPracticeHistory();
  const todayKey = getTodayKey();
  if (history[todayKey] !== "completed") {
    history[todayKey] = "completed";
    setPracticeHistory(history);
  }
  updateLongestStreak(history);
}

function shouldShowFreezePrompt(history) {
  const yesterdayKey = getDateKey(addDays(new Date(), -1));
  return getFreezeCount() > 0
    && !sessionStorage.getItem(`freezePromptDismissed-${getTodayKey()}`)
    && !isPracticeProtected(history, yesterdayKey);
}

function useLearningFreeze() {
  const history = getPracticeHistory();
  const freezeCount = getFreezeCount();
  if (freezeCount <= 0) return;
  const yesterdayKey = getDateKey(addDays(new Date(), -1));
  if (!isPracticeProtected(history, yesterdayKey)) {
    history[yesterdayKey] = "frozen";
    setPracticeHistory(history);
    setFreezeCount(freezeCount - 1);
    updateLongestStreak(history);
  }
  renderStreakSummary();
}

function dismissLearningFreezePrompt() {
  sessionStorage.setItem(`freezePromptDismissed-${getTodayKey()}`, "true");
  renderStreakSummary();
}

function renderStreakCalendar(history) {
  const today = new Date();
  const days = Array.from({ length: 28 }, (_, index) => addDays(today, index - 27));
  $("#streakCalendarGrid").innerHTML = days
    .map((date) => {
      const key = getDateKey(date);
      const status = history[key];
      const day = date.getDate();
      const className = status === "completed" ? "done" : status === "frozen" ? "frozen" : "";
      return `<span class="calendar-day ${className}">${day}</span>`;
    })
    .join("");
}

function renderStreakSummary() {
  const history = getPracticeHistory();
  const todayCompleted = history[getTodayKey()] === "completed";
  const currentStreak = calculateCurrentStreak(history);
  const longest = updateLongestStreak(history);
  $("#streakDays").textContent = currentStreak;
  $("#freezeCount").textContent = getFreezeCount();
  $("#todayPracticeStatus").textContent = todayCompleted ? "今日已完成" : "今日尚未完成";
  $("#todayPracticeStatus").classList.toggle("complete", todayCompleted);
  $("#longestStreak").textContent = longest;
  $("#monthCompletedDays").textContent = calculateMonthCompletedDays(history);
  $("#freezePrompt").classList.toggle("hidden", !shouldShowFreezePrompt(history));
  renderStreakCalendar(history);
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
  $("#statusBpm").textContent = bpm;
  if (timer) {
    clearInterval(timer);
    timer = setInterval(stepPractice, 60000 / bpm);
  }
}

function setPracticeSettingsOpen(isOpen) {
  const panel = $("#practiceSettingsPanel");
  panel.classList.toggle("hidden", !isOpen);
  panel.setAttribute("aria-hidden", isOpen ? "false" : "true");
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
  void activeBeat;
}

function renderMicCurve() {
}

function scrollToLongTonePracticeMain() {
  requestAnimationFrame(() => {
    const target = $(".practice-status-card") || $("#long-tone-practice-main");
    if (!target) return;
    const top = target.getBoundingClientRect().top + window.scrollY - 12;
    window.scrollTo({
      top: Math.max(0, top),
      behavior: "smooth",
    });
  });
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
  renderStreakSummary();
}

function markDailyGoalDone(goalId) {
  const state = getDailyGoalState();
  const wasDone = state[goalId] === true;
  state[goalId] = true;
  setDailyGoalState(state);
  markPracticeCompletedToday();
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
  resetPitchTracker();
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
  resetPitchTracker();
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
  if (micFloatFrequencyData) {
    micAnalyser.getFloatFrequencyData(micFloatFrequencyData);
  }
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

function isHighRegisterFrequency(frequency) {
  return Number.isFinite(frequency) && frequency >= HIGH_REGISTER_START_HZ;
}

function getActivePitchBufferSize(estimatedFrequency = null) {
  if (isHighRegisterFrequency(estimatedFrequency || activeNearestNote?.frequency || stablePitchDisplay?.detectedFrequency)) {
    return YIN_CONFIG.highBufferSize;
  }
  return YIN_CONFIG.bufferSize;
}

function buildPitchBuffer(bufferSize = getActivePitchBufferSize()) {
  if (!micAnalyser || !micData || !audioContext) return null;
  if (micFloatTimeData) {
    micAnalyser.getFloatTimeDomainData(micFloatTimeData);
  }
  const sourceLength = micFloatTimeData?.length || micData.length;
  const activeBufferSize = Math.max(512, Math.min(bufferSize, sourceLength));
  const sourceOffset = Math.max(0, sourceLength - activeBufferSize);
  const buffer = new Float32Array(activeBufferSize);
  let rmsSum = 0;
  let mean = 0;
  for (let i = 0; i < activeBufferSize; i += 1) {
    const sourceIndex = sourceOffset + i;
    const value = micFloatTimeData ? micFloatTimeData[sourceIndex] : (micData[sourceIndex] - 128) / 128;
    mean += value;
  }
  mean /= activeBufferSize;
  let previous = 0;
  const preEmphasis = activeBufferSize <= YIN_CONFIG.highBufferSize ? 0.04 : 0.08;
  for (let i = 0; i < activeBufferSize; i += 1) {
    const sourceIndex = sourceOffset + i;
    const raw = (micFloatTimeData ? micFloatTimeData[sourceIndex] : (micData[sourceIndex] - 128) / 128) - mean;
    const value = raw - previous * preEmphasis;
    previous = raw;
    buffer[i] = value;
    rmsSum += value * value;
  }
  const rms = Math.sqrt(rmsSum / buffer.length);
  return {
    buffer,
    rms,
    sampleRate: audioContext.sampleRate,
    activeBufferSize,
    isHighRegisterWindow: activeBufferSize <= YIN_CONFIG.highBufferSize,
  };
}

function detectPitchV1(frame = buildPitchBuffer()) {
  if (!frame) return null;
  const { buffer, rms, sampleRate } = frame;
  const dominantEnergy = getDominantEnergy();
  const rmsThreshold = getPitchRmsThreshold();
  if (rms < rmsThreshold) return { frequency: null, confidence: 0, rms, dominantEnergy, reason: "quiet" };

  const minFrequency = DETECTOR_RANGE.minFundamentalHz;
  const maxFrequency = DETECTOR_RANGE.maxFundamentalHz;
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

  const normalizedCorrelation = bestCorrelation / Math.max(rms * rms, 0.0000001);
  if (bestLag < 0 || normalizedCorrelation < DETECTOR_V1_CONFIDENCE) {
    return { frequency: null, confidence: normalizedCorrelation, rms, dominantEnergy, reason: "low-autocorrelation-confidence" };
  }
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
  if (!Number.isFinite(frequency) || frequency < minFrequency || frequency > maxFrequency) {
    return { frequency: null, confidence: normalizedCorrelation, rms, dominantEnergy, reason: "range" };
  }
  return { frequency, confidence: Math.min(1, normalizedCorrelation), rms, dominantEnergy, reason: "autocorrelation-v1" };
}

function detectPitchV2(frame = buildPitchBuffer()) {
  if (!frame) return null;
  const yinResult = detectYinPitch(frame);
  const config = getPitchDetectionConfig();
  const qualityThreshold = getAdjustedQualityThreshold(yinResult?.frequency);
  const shouldRunMpm =
    !yinResult?.frequency ||
    (yinResult.confidence || 0) < qualityThreshold + 0.12 ||
    yinResult.reason === "low-yin-confidence";
  const mpmResult = shouldRunMpm ? detectMpmPitch(frame) : null;
  const candidates = [yinResult, mpmResult].filter((item) => item?.frequency);
  if (!candidates.length) {
    const fallback = yinResult || mpmResult;
    return {
      ...(fallback || {}),
      frequency: null,
      detector: "hybrid-v2",
      reason: fallback?.reason || "no-hybrid-frequency",
      yin: summarizeDetectorResult(yinResult),
      mpm: summarizeDetectorResult(mpmResult),
    };
  }
  const selected = candidates.reduce((best, item) => {
    const bestScore = (best.confidence || 0) + (best.reason === "yin-v2" ? 0.03 : 0);
    const itemScore = (item.confidence || 0) + (item.reason === "yin-v2" ? 0.03 : 0);
    return itemScore > bestScore ? item : best;
  }, candidates[0]);
  return {
    ...selected,
    detector: "hybrid-v2",
    selectedDetector: selected.reason,
    yin: summarizeDetectorResult(yinResult),
    mpm: summarizeDetectorResult(mpmResult),
  };
}

function detectYinPitch(frame) {
  if (!frame) return null;
  const { buffer, rms, sampleRate, activeBufferSize, isHighRegisterWindow } = frame;
  const dominantEnergy = getDominantEnergy();
  const config = getPitchDetectionConfig();
  const minRms = getPitchRmsThreshold();
  if (rms < minRms) {
    return { frequency: null, confidence: 0, rms, dominantEnergy, reason: "quiet", detector: "yin-v2", minRms };
  }

  const minTau = Math.max(2, Math.floor(sampleRate / YIN_CONFIG.maxFrequency));
  const maxTau = Math.min(buffer.length - 2, Math.ceil(sampleRate / YIN_CONFIG.minFrequency));
  if (maxTau <= minTau) {
    return { frequency: null, confidence: 0, rms, dominantEnergy, reason: "invalid-yin-range", detector: "yin-v2", minRms };
  }

  const difference = new Float32Array(maxTau + 1);
  for (let tau = 1; tau <= maxTau; tau += 1) {
    let sum = 0;
    const limit = buffer.length - tau;
    for (let i = 0; i < limit; i += 1) {
      const delta = buffer[i] - buffer[i + tau];
      sum += delta * delta;
    }
    difference[tau] = sum;
  }

  const cmnd = new Float32Array(maxTau + 1);
  cmnd[0] = 1;
  let runningSum = 0;
  let selectedTau = -1;
  let selectedValue = Infinity;
  for (let tau = 1; tau <= maxTau; tau += 1) {
    runningSum += difference[tau];
    cmnd[tau] = runningSum > 0 ? (difference[tau] * tau) / runningSum : 1;
    const threshold = isHighRegisterWindow ? YIN_CONFIG.highThreshold : YIN_CONFIG.threshold;
    if (tau >= minTau && cmnd[tau] < threshold) {
      selectedTau = tau;
      while (selectedTau + 1 <= maxTau && cmnd[selectedTau + 1] < cmnd[selectedTau]) {
        selectedTau += 1;
      }
      selectedValue = cmnd[selectedTau];
      break;
    }
    if (tau >= minTau && cmnd[tau] < selectedValue) {
      selectedValue = cmnd[tau];
      selectedTau = tau;
    }
  }

  const fallbackThreshold = isHighRegisterWindow ? YIN_CONFIG.highFallbackThreshold : YIN_CONFIG.fallbackThreshold;
  if (selectedTau < minTau || selectedValue > fallbackThreshold) {
    return { frequency: null, confidence: 0, rms, dominantEnergy, reason: "no-yin-period", detector: "yin-v2", minRms };
  }

  const interpolatedTau = parabolicInterpolate(cmnd, selectedTau);
  const rawFrequency = sampleRate / interpolatedTau;
  const confidence = Math.max(0, Math.min(1, 1 - selectedValue));
  if (!Number.isFinite(rawFrequency) || rawFrequency < YIN_CONFIG.minFrequency || rawFrequency > YIN_CONFIG.maxFrequency) {
    return {
      frequency: null,
      confidence,
      rms,
      dominantEnergy,
      reason: "yin-range",
      detector: "yin-v2",
      minRms,
      rawFrequency,
    };
  }
  const qualityThreshold = getAdjustedQualityThreshold(rawFrequency);
  if (confidence < Math.min(YIN_CONFIG.probabilityThreshold, qualityThreshold)) {
    return {
      frequency: rawFrequency,
      confidence,
      rms,
      dominantEnergy,
      reason: "low-yin-confidence",
      detector: "yin-v2",
      minRms,
      yinTau: interpolatedTau,
      yinValue: selectedValue,
      activeBufferSize,
      isHighRegister: isHighRegisterFrequency(rawFrequency),
    };
  }
  return {
    frequency: rawFrequency,
    confidence,
    rms,
    dominantEnergy,
    reason: "yin-v2",
    detector: "yin-v2",
    minRms,
    yinTau: interpolatedTau,
    yinValue: selectedValue,
    activeBufferSize,
    isHighRegister: isHighRegisterFrequency(rawFrequency),
  };
}

function detectMpmPitch(frame) {
  if (!frame) return null;
  const { buffer, rms, sampleRate, activeBufferSize, isHighRegisterWindow } = frame;
  const dominantEnergy = getDominantEnergy();
  const minRms = getPitchRmsThreshold();
  if (rms < minRms) {
    return { frequency: null, confidence: 0, rms, dominantEnergy, reason: "quiet", detector: "mpm-v2", minRms };
  }
  const minTau = Math.max(2, Math.floor(sampleRate / MPM_CONFIG.maxFrequency));
  const maxTau = Math.min(buffer.length - 2, Math.ceil(sampleRate / MPM_CONFIG.minFrequency));
  let bestTau = -1;
  let bestClarity = 0;
  let previousNsdf = 0;
  let rising = false;
  const clarityThreshold = isHighRegisterWindow ? MPM_CONFIG.highClarityThreshold : MPM_CONFIG.clarityThreshold;

  for (let tau = minTau; tau <= maxTau; tau += 1) {
    let acf = 0;
    let divisor = 0;
    const limit = buffer.length - tau;
    for (let i = 0; i < limit; i += 1) {
      const x = buffer[i];
      const y = buffer[i + tau];
      acf += x * y;
      divisor += x * x + y * y;
    }
    const nsdf = divisor > 0 ? (2 * acf) / divisor : 0;
    if (nsdf > previousNsdf) {
      rising = true;
    } else if (rising && previousNsdf > bestClarity && previousNsdf > clarityThreshold) {
      bestClarity = previousNsdf;
      bestTau = tau - 1;
      rising = false;
    }
    previousNsdf = nsdf;
  }

  if (bestTau < minTau) {
    return { frequency: null, confidence: bestClarity, rms, dominantEnergy, reason: "no-mpm-peak", detector: "mpm-v2", minRms };
  }
  const refinedTau = refineMpmTau(buffer, bestTau);
  const frequency = sampleRate / refinedTau;
  if (!Number.isFinite(frequency) || frequency < MPM_CONFIG.minFrequency || frequency > MPM_CONFIG.maxFrequency) {
    return { frequency: null, confidence: bestClarity, rms, dominantEnergy, reason: "mpm-range", detector: "mpm-v2", minRms };
  }
  return {
    frequency,
    confidence: Math.max(0, Math.min(1, bestClarity)),
    rms,
    dominantEnergy,
    reason: "mpm-v2",
    detector: "mpm-v2",
    minRms,
    mpmTau: refinedTau,
    activeBufferSize,
    isHighRegister: isHighRegisterFrequency(frequency),
  };
}

const detectorV1 = {
  name: "autocorrelation-v1",
  detect: detectPitchV1,
};

const detectorV2 = {
  name: "yin-v2",
  detect: detectPitchV2,
};

function detectPitch() {
  const frame = buildPitchBuffer();
  if (!frame) return null;
  const v1 = detectorV1.detect(frame);
  let v2 = detectorV2.detect(frame);
  if (isHighRegisterFrequency(v2?.frequency) && frame.activeBufferSize > YIN_CONFIG.highBufferSize) {
    const highFrame = buildPitchBuffer(YIN_CONFIG.highBufferSize);
    const highV2 = detectorV2.detect(highFrame);
    if (highV2?.frequency && (highV2.confidence || 0) >= Math.max(0.28, (v2.confidence || 0) - 0.1)) {
      v2 = {
        ...highV2,
        fullWindowDetector: summarizeDetectorResult(v2),
        selectedReason: "high-register-short-window",
      };
    }
  }
  return {
    ...(v2 || {}),
    detectorV1: summarizeDetectorResult(v1),
    detectorV2: summarizeDetectorResult(v2),
  };
}

function getDominantEnergy() {
  if (!micFrequencyData || !audioContext) return 0;
  const sampleRate = audioContext.sampleRate;
  const hzPerBin = sampleRate / micAnalyser.fftSize;
  const minBin = Math.max(1, Math.floor(DETECTOR_RANGE.minFundamentalHz / hzPerBin));
  const maxBin = Math.min(micFrequencyData.length - 2, Math.ceil(DETECTOR_RANGE.maxRawAnalysisHz / hzPerBin));
  let peakValue = 0;
  let total = 0;
  let count = 0;
  for (let i = minBin; i <= maxBin; i += 1) {
    const value = micFrequencyData[i];
    total += value;
    count += 1;
    if (value > peakValue) {
      peakValue = value;
    }
  }
  const average = count ? total / count : 0;
  return Math.max(peakValue / 255, average / 255);
}

function lagCorrelation(buffer, lag) {
  let correlation = 0;
  for (let i = 0; i < buffer.length - lag; i += 1) {
    correlation += buffer[i] * buffer[i + lag];
  }
  return correlation / (buffer.length - lag);
}

function parabolicInterpolate(values, index) {
  if (index <= 0 || index >= values.length - 1) return index;
  const previous = values[index - 1];
  const current = values[index];
  const next = values[index + 1];
  const denominator = previous - 2 * current + next;
  if (Math.abs(denominator) < 0.000001) return index;
  return index + (previous - next) / (2 * denominator);
}

function refineMpmTau(buffer, tau) {
  const previous = nsdfAt(buffer, tau - 1);
  const current = nsdfAt(buffer, tau);
  const next = nsdfAt(buffer, tau + 1);
  const denominator = previous - 2 * current + next;
  if (Math.abs(denominator) < 0.000001) return tau;
  return tau + (previous - next) / (2 * denominator);
}

function nsdfAt(buffer, tau) {
  if (tau <= 0 || tau >= buffer.length) return 0;
  let acf = 0;
  let divisor = 0;
  const limit = buffer.length - tau;
  for (let i = 0; i < limit; i += 1) {
    const x = buffer[i];
    const y = buffer[i + tau];
    acf += x * y;
    divisor += x * x + y * y;
  }
  return divisor > 0 ? (2 * acf) / divisor : 0;
}

function getPitchDetectionConfig() {
  return PITCH_DETECTION_MODES[pitchDetectionMode] || PITCH_DETECTION_MODES.normal;
}

function summarizeDetectorResult(result) {
  if (!result) return null;
  const nearest = result.frequency ? findNearestAllowedNote(result.frequency) : null;
  const cents = result.frequency && nearest ? 1200 * Math.log2(result.frequency / nearest.frequency) : null;
  return {
    rawFrequency: result.frequency || result.rawFrequency || null,
    note: nearest?.name || null,
    cents,
    confidence: result.confidence ?? 0,
    rms: result.rms ?? null,
    reason: result.reason,
  };
}

function frequencyToMidi(frequency) {
  return 69 + 12 * Math.log2(frequency / tuningA4);
}

function noteNameToMidi(noteName) {
  const match = /^([A-G])(#?)(-?\d+)$/.exec(noteName);
  if (!match) return 60;
  const noteOffsets = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const [, letter, sharp, octaveText] = match;
  return (Number(octaveText) + 1) * 12 + noteOffsets[letter] + (sharp ? 1 : 0);
}

function midiToNoteName(midi) {
  const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const noteName = noteNames[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${noteName}${octave}`;
}

function midiToFreq(midi, a4 = tuningA4) {
  return a4 * 2 ** ((midi - 69) / 12);
}

function getNoteLetter(noteName) {
  return /^([A-G])/.exec(noteName || "")?.[1] || null;
}

function isNaturalBoundaryPair(fromNoteName, toNoteName) {
  const from = getNoteLetter(fromNoteName);
  const to = getNoteLetter(toNoteName);
  return (
    (from === "E" && to === "F") ||
    (from === "F" && to === "E") ||
    (from === "B" && to === "C") ||
    (from === "C" && to === "B")
  );
}

function isAdjacentSemitone(noteA, noteB) {
  const nameA = typeof noteA === "string" ? noteA : noteA?.name;
  const nameB = typeof noteB === "string" ? noteB : noteB?.name;
  if (!nameA || !nameB) return false;
  return Math.abs(noteNameToMidi(nameA) - noteNameToMidi(nameB)) === 1;
}

function getAdjacentSemitoneNote(lockedNote, direction) {
  if (!lockedNote) return null;
  const lockedMidi = Number.isFinite(lockedNote.midi) ? lockedNote.midi : noteNameToMidi(lockedNote.name);
  const midi = lockedMidi + direction;
  return {
    name: midiToNoteName(midi),
    midi,
    frequency: midiToFreq(midi, tuningA4),
  };
}

function buildNoteRange(lowNote, highNote, a4 = tuningA4) {
  const lowMidi = noteNameToMidi(lowNote);
  const highMidi = noteNameToMidi(highNote);
  return Array.from({ length: highMidi - lowMidi + 1 }, (_, index) => {
    const midi = lowMidi + index;
    return {
      name: midiToNoteName(midi),
      midi,
      frequency: midiToFreq(midi, a4),
    };
  });
}

function findNearestAllowedNote(freq, notes = allowedNotes) {
  if (!Number.isFinite(freq) || !notes.length) return null;
  return notes.reduce((nearest, note) => {
    const distance = Math.abs(Math.log2(freq / note.frequency));
    const nearestDistance = Math.abs(Math.log2(freq / nearest.frequency));
    return distance < nearestDistance ? note : nearest;
  }, notes[0]);
}

function refreshAllowedNotes() {
  allowedNotes = buildNoteRange(allowedRange.lowNote, allowedRange.highNote, tuningA4);
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function getPitchRmsThreshold() {
  return getPitchDetectionConfig().minRms();
}

function getAdjustedQualityThreshold(frequency) {
  const base = getPitchDetectionConfig().qualityThreshold;
  return isHighRegisterFrequency(frequency) ? Math.max(0.28, base - 0.08) : base;
}

function isFrequencyInCorrectionRange(freq) {
  const low = midiToFreq(noteNameToMidi(correctionRange.lowNote), tuningA4);
  const high = midiToFreq(noteNameToMidi(correctionRange.highNote), tuningA4);
  return Number.isFinite(freq) && freq >= low && freq <= high;
}

function buildPitchCandidates(rawFrequency) {
  const rawIsHigh = isHighRegisterFrequency(rawFrequency);
  const candidateSources = [
    { frequency: rawFrequency, source: "raw", octavePenalty: 0 },
    { frequency: rawFrequency / 2, source: "raw/2", octavePenalty: rawIsHigh ? 0.48 : 0.04 },
    { frequency: rawFrequency * 2, source: "raw*2", octavePenalty: 0.34 },
    { frequency: (rawFrequency / 3) * 2, source: "raw/3*2", octavePenalty: rawIsHigh ? 0.32 : 0.16 },
    { frequency: rawFrequency * 1.5, source: "raw*3/2", octavePenalty: 0.22 },
  ];
  const seen = new Set();
  return candidateSources
    .filter(({ frequency }) => Number.isFinite(frequency) && frequency >= DETECTOR_RANGE.minFundamentalHz && frequency <= DETECTOR_RANGE.maxRawAnalysisHz)
    .filter(({ frequency }) => {
      const key = Math.round(frequency * 10);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(({ frequency, source, octavePenalty }) => {
      const nearest = findNearestAllowedNote(frequency);
      const cents = nearest ? 1200 * Math.log2(frequency / nearest.frequency) : null;
      const lockedDistance = activeNearestNote
        ? Math.abs(1200 * Math.log2(frequency / activeNearestNote.frequency))
        : 0;
      const inRange = isFrequencyInCorrectionRange(frequency);
      const absCents = Number.isFinite(cents) ? Math.abs(cents) : Infinity;
      const harmonicScore = getHarmonicScore(frequency);
      const absCentsPenalty = absCents / 50;
      const confidenceBonus = 0;
      const lockPenalty = activeNearestNote ? Math.min(0.28, lockedDistance / 600) : 0;
      const highRawBonus = rawIsHigh && source === "raw" && absCents <= 45 ? 0.22 : 0;
      const lockedHighBonus =
        rawIsHigh && activeNearestNote && isHighRegisterFrequency(activeNearestNote.frequency) && lockedDistance <= VIBRATO_TRACKING_RANGE_CENTS
          ? 0.2
          : 0;
      const finalScore = nearest && inRange
        ? absCentsPenalty - harmonicScore * 0.62 - confidenceBonus + octavePenalty + lockPenalty - highRawBonus - lockedHighBonus
        : Infinity;
      return {
        frequency,
        nearestNote: nearest?.name || null,
        nearestNoteFrequency: nearest?.frequency || null,
        cents,
        absCents,
        harmonicScore,
        inRange,
        finalScore,
        score: finalScore,
        source,
      };
    });
}

function selectPitchCandidate(measurement) {
  const candidateList = buildPitchCandidates(measurement.frequency).map((candidate) => ({
    ...candidate,
    finalScore: Number.isFinite(candidate.finalScore)
      ? candidate.finalScore - (measurement.confidence || 0) * 0.24
      : Infinity,
  }));
  const validCandidates = candidateList.filter((candidate) => Number.isFinite(candidate.finalScore));
  if (!validCandidates.length) {
    return {
      candidateList,
      selected: null,
      selectedReason: null,
      rejectedReason: "no-candidate-in-correction-range",
    };
  }
  const selected = validCandidates.reduce(
    (best, candidate) => (candidate.finalScore < best.finalScore ? candidate : best),
    validCandidates[0],
  );
  return {
    candidateList,
    selected,
    selectedReason: selected.source === "raw" ? "yin-raw-fundamental" : `harmonic-correction-${selected.source}`,
    rejectedReason: null,
  };
}

function getNaturalBoundarySourceFrequency(fine, detectorMeasurement) {
  if (Number.isFinite(fine?.frequency)) return fine.frequency;
  if (Number.isFinite(fine?.rawFrequency)) return fine.rawFrequency;
  if (Number.isFinite(detectorMeasurement?.correctedFrequency)) return detectorMeasurement.correctedFrequency;
  if (Number.isFinite(detectorMeasurement?.detectedFrequency)) return detectorMeasurement.detectedFrequency;
  if (Number.isFinite(detectorMeasurement?.frequency)) return detectorMeasurement.frequency;
  return null;
}

function maybeSwitchAdjacentSemitone(rawCents, fine, detectorMeasurement) {
  if (!activeNearestNote || !Number.isFinite(rawCents)) {
    return { switched: false, pending: false, reason: "semitone-no-active-note" };
  }

  const direction = rawCents >= SEMITONE_SWITCH_CENTS
    ? 1
    : rawCents <= -SEMITONE_SWITCH_CENTS
      ? -1
      : 0;
  if (!direction) {
    naturalBoundaryPendingNote = null;
    naturalBoundaryPendingCount = 0;
    return { switched: false, pending: false, reason: "semitone-cents-inside" };
  }

  const candidate = getAdjacentSemitoneNote(activeNearestNote, direction);
  if (!candidate) {
    naturalBoundaryPendingNote = null;
    naturalBoundaryPendingCount = 0;
    return { switched: false, pending: false, reason: "semitone-no-adjacent-note" };
  }

  const sourceFrequency = getNaturalBoundarySourceFrequency(fine, detectorMeasurement);
  const nearestFromSource = findNearestAllowedNote(sourceFrequency);
  const centsToCandidate = Number.isFinite(sourceFrequency)
    ? 1200 * Math.log2(sourceFrequency / candidate.frequency)
    : null;
  const detectorNearestName =
    detectorMeasurement?.nearestNote ||
    detectorMeasurement?.selectedCandidate?.nearestNote ||
    nearestFromSource?.name ||
    null;
  const detectorNearCandidate =
    isAdjacentSemitone(detectorNearestName, activeNearestNote.name) &&
    (
      detectorNearestName === candidate.name ||
      (Number.isFinite(centsToCandidate) && Math.abs(centsToCandidate) <= SEMITONE_CONFIRM_CENTS)
    );

  if (!detectorNearCandidate) {
    naturalBoundaryPendingNote = null;
    naturalBoundaryPendingCount = 0;
    return {
      switched: false,
      pending: false,
      reason: "semitone-detector-not-adjacent",
      candidate,
      sourceFrequency,
      centsToCandidate,
      detectorNearestName,
    };
  }

  if (naturalBoundaryPendingNote?.name === candidate.name) {
    naturalBoundaryPendingCount += 1;
  } else {
    naturalBoundaryPendingNote = candidate;
    naturalBoundaryPendingCount = 1;
  }

  const directDetectorSwitch = detectorNearestName === candidate.name;
  const confirmedByCents = Math.abs(rawCents) >= SEMITONE_CONFIRM_CENTS;
  const releaseExceeded = Math.abs(rawCents) >= SEMITONE_RELEASE_CENTS;
  const readyToSwitch =
    (confirmedByCents && detectorNearCandidate) ||
    directDetectorSwitch ||
    releaseExceeded ||
    naturalBoundaryPendingCount >= SEMITONE_PENDING_FRAMES;
  if (!readyToSwitch) {
    return {
      switched: false,
      pending: true,
      reason: "semitone-pending",
      candidate,
      sourceFrequency,
      centsToCandidate,
      detectorNearestName,
      naturalBoundaryPendingCount,
    };
  }

  const previousNote = activeNearestNote;
  activeNearestNote = candidate;
  pendingNearestNote = null;
  pendingNearestNoteCount = 0;
  activeNoteConfidence = Math.max(activeNoteConfidence * 0.7, detectorMeasurement?.confidence || fine?.confidence || 0);
  activeNoteRms = detectorMeasurement?.rms || fine?.rms || activeNoteRms;
  resetFineTrackerForNoteSwitch();
  return {
    switched: true,
    pending: false,
    reason: isNaturalBoundaryPair(previousNote.name, candidate.name)
      ? "natural-boundary-switch"
      : "adjacent-semitone-switch",
    previousNote,
    candidate,
    sourceFrequency,
    centsToCandidate,
    detectorNearestName,
  };
}

function getHarmonicScore(f0) {
  if (!micFloatFrequencyData || !audioContext || !micAnalyser || !Number.isFinite(f0)) return 0;
  const weights = [0.42, 0.28, 0.18, 0.12];
  let weightedEnergy = 0;
  let totalWeight = 0;
  for (let harmonic = 1; harmonic <= 4; harmonic += 1) {
    const target = f0 * harmonic;
    if (target > audioContext.sampleRate / 2) continue;
    const energy = getFrequencyEnergy(target);
    const weight = weights[harmonic - 1];
    weightedEnergy += energy * weight;
    totalWeight += weight;
  }
  return totalWeight ? Math.max(0, Math.min(1, weightedEnergy / totalWeight)) : 0;
}

function getFrequencyEnergy(frequency) {
  const sampleRate = audioContext?.sampleRate || 44100;
  const hzPerBin = sampleRate / micAnalyser.fftSize;
  const centerBin = Math.round(frequency / hzPerBin);
  const radius = Math.max(1, Math.round(18 / hzPerBin));
  const start = Math.max(1, centerBin - radius);
  const end = Math.min(micFloatFrequencyData.length - 1, centerBin + radius);
  let maxDb = -120;
  for (let bin = start; bin <= end; bin += 1) {
    const value = micFloatFrequencyData[bin];
    if (Number.isFinite(value)) maxDb = Math.max(maxDb, value);
  }
  return Math.max(0, Math.min(1, (maxDb + 100) / 72));
}

function smoothCentsNormal(previous, current) {
  if (previous === null || !Number.isFinite(previous)) return current;
  const diff = Math.abs(current - previous);
  if (diff <= 3) return previous + (current - previous) * 0.25;
  if (diff <= 15) return previous + (current - previous) * 0.55;
  return previous + (current - previous) * 0.78;
}

function smoothCentsFast(previous, current) {
  if (previous === null || !Number.isFinite(previous)) return current;
  const diff = Math.abs(current - previous);
  if (diff <= 3) return previous + (current - previous) * 0.45;
  if (diff <= 15) return previous + (current - previous) * 0.75;
  return previous + (current - previous) * 0.9;
}

function smoothCents(previous, current, mode = "normal") {
  return mode === "fast" ? smoothCentsFast(previous, current) : smoothCentsNormal(previous, current);
}

function getFineTrackerBufferSize() {
  return isHighRegisterFrequency(activeNearestNote?.frequency) ? FINE_TRACKER_CONFIG.highBufferSize : FINE_TRACKER_CONFIG.normalBufferSize;
}

function localNormalizedCorrelation(buffer, lag) {
  let acf = 0;
  let energy = 0;
  const limit = buffer.length - lag;
  if (limit <= 8) return 0;
  for (let i = 0; i < limit; i += 1) {
    const x = buffer[i];
    const y = buffer[i + lag];
    acf += x * y;
    energy += x * x + y * y;
  }
  return energy > 0 ? (2 * acf) / energy : 0;
}

function refineCorrelationLag(buffer, lag) {
  const previous = localNormalizedCorrelation(buffer, lag - 1);
  const current = localNormalizedCorrelation(buffer, lag);
  const next = localNormalizedCorrelation(buffer, lag + 1);
  const denominator = previous - 2 * current + next;
  if (Math.abs(denominator) < 0.000001) return lag;
  return lag + (previous - next) / (2 * denominator);
}

function estimateFinePitchNearLockedNote(frame, lockedNote) {
  if (!frame || !lockedNote || !Number.isFinite(lockedNote.frequency)) return null;
  const { buffer, rms, sampleRate, activeBufferSize } = frame;
  const minRms = Math.max(0.0018, getPitchRmsThreshold() * 0.72);
  if (rms < minRms) {
    return { frequency: null, rms, confidence: 0, quality: 0, valid: false, reason: "fine-rms-low", activeBufferSize };
  }

  const referenceFrequency = lockedNote.frequency;
  const lowFrequency = referenceFrequency / 2 ** (FINE_TRACKER_CONFIG.searchCents / 1200);
  const highFrequency = referenceFrequency * 2 ** (FINE_TRACKER_CONFIG.searchCents / 1200);
  const minLag = Math.max(2, Math.floor(sampleRate / highFrequency));
  const maxLag = Math.min(buffer.length - 3, Math.ceil(sampleRate / lowFrequency));
  if (maxLag <= minLag) {
    return { frequency: null, rms, confidence: 0, quality: 0, valid: false, reason: "fine-invalid-range", activeBufferSize };
  }

  let bestLag = -1;
  let bestCorrelation = -1;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    const correlation = localNormalizedCorrelation(buffer, lag);
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestLag = lag;
    }
  }

  const minCorrelation = isHighRegisterFrequency(referenceFrequency)
    ? FINE_TRACKER_CONFIG.highMinCorrelation
    : FINE_TRACKER_CONFIG.minCorrelation;
  if (bestLag < minLag || bestCorrelation < minCorrelation) {
    return {
      frequency: null,
      rms,
      confidence: Math.max(0, bestCorrelation),
      quality: Math.max(0, bestCorrelation),
      valid: false,
      reason: "fine-low-correlation",
      activeBufferSize,
      selectedFineLag: bestLag,
      minFineLag: minLag,
      maxFineLag: maxLag,
    };
  }

  const refinedLag = refineCorrelationLag(buffer, bestLag);
  const frequency = sampleRate / refinedLag;
  const cents = 1200 * Math.log2(frequency / referenceFrequency);
  const nearestNote = findNearestAllowedNote(frequency);
  const centsFromNearest = nearestNote ? 1200 * Math.log2(frequency / nearestNote.frequency) : null;
  if (!Number.isFinite(frequency) || !Number.isFinite(cents) || Math.abs(cents) > FINE_TRACKER_CONFIG.maxJumpCents) {
    return {
      frequency: null,
      rms,
      confidence: Math.max(0, bestCorrelation),
      quality: Math.max(0, bestCorrelation),
      valid: false,
      reason: "fine-outlier",
      activeBufferSize,
      rawFrequency: frequency,
      rawCents: cents,
      selectedFineLag: refinedLag,
      minFineLag: minLag,
      maxFineLag: maxLag,
    };
  }

  return {
    frequency,
    cents,
    rms,
    confidence: Math.max(0, Math.min(1, bestCorrelation)),
    quality: Math.max(0, Math.min(1, bestCorrelation)),
    valid: true,
    reason: "fine-waveform-lock",
    activeBufferSize,
    referenceFrequency,
    nearestNote: nearestNote?.name || null,
    nearestNoteFrequency: nearestNote?.frequency || null,
    centsFromNearest,
    selectedFineLag: refinedLag,
    minFineLag: minLag,
    maxFineLag: maxLag,
  };
}

function validateFinePitchResult(fine, lockedNote) {
  if (!lockedNote) return { valid: false, reason: "fine-no-locked-note" };
  if (!fine?.valid || !Number.isFinite(fine.frequency) || !Number.isFinite(fine.cents)) {
    return { valid: false, reason: fine?.reason || "fine-invalid-frequency" };
  }
  const qualityThreshold = isHighRegisterFrequency(lockedNote.frequency)
    ? FINE_TRACKER_CONFIG.highQualityThreshold
    : FINE_TRACKER_CONFIG.normalQualityThreshold;
  if ((fine.quality || fine.confidence || 0) < qualityThreshold) {
    return { valid: false, reason: "fine-quality-low", qualityThreshold };
  }
  if (Math.abs(fine.cents) > FINE_TRACKER_CONFIG.validRangeCents) {
    return { valid: false, reason: "fine-cents-outside-valid-range", qualityThreshold };
  }
  if (
    fine.nearestNote &&
    fine.nearestNote !== lockedNote.name &&
    Math.abs(fine.cents) > VIBRATO_TRACKING_RANGE_CENTS
  ) {
    return { valid: false, reason: "fine-nearest-note-mismatch", qualityThreshold };
  }
  if (
    !Number.isFinite(fine.selectedFineLag) ||
    fine.selectedFineLag < fine.minFineLag ||
    fine.selectedFineLag > fine.maxFineLag
  ) {
    return { valid: false, reason: "fine-lag-out-of-range", qualityThreshold };
  }
  return { valid: true, reason: "fine-valid", qualityThreshold };
}

function resetFineTrackerForNoteSwitch() {
  pitchCentsWindow = [];
  smoothedCents = null;
  fineRejectCount = 0;
  lastFineAcceptedAt = 0;
  naturalBoundaryPendingNote = null;
  naturalBoundaryPendingCount = 0;
}

function updatePitchTuner(pitch, waiting = false) {
  const tuner = $("#pitchTuner");
  const homeNote = $("#homePitchNote");
  const homeCents = $("#homePitchCents");
  const homeStatus = $("#homeTunerStatus");
  const homeNeedle = $("#homePitchNeedle");
  if (!pitch || waiting) {
    if (stablePitchDisplay) {
      updatePitchTuner(stablePitchDisplay);
    } else {
      $("#pitchReadout").textContent = "等待";
      $("#pitchCents").textContent = "等待穩定收音";
      $("#pitchNeedle").style.left = "50%";
      tuner.dataset.status = "waiting";
      if (homeNote) homeNote.textContent = "--";
      if (homeCents) homeCents.textContent = "等待收音";
      if (homeStatus) homeStatus.textContent = "等待收音";
      if (homeNeedle) homeNeedle.style.left = "50%";
    }
    return;
  }
  const clampedCents = Math.max(-50, Math.min(50, pitch.cents));
  const position = 50 + clampedCents;
  const absCents = Math.abs(pitch.cents);
  const status = absCents <= 8 ? "in" : absCents <= 22 ? "near" : "out";
  $("#pitchReadout").textContent = pitch.nearestNote.name;
  $("#pitchCents").textContent = `${formatSignedCents(pitch.cents)} cents`;
  $("#pitchNeedle").style.left = `${position}%`;
  tuner.dataset.status = status;
  if (homeNote) homeNote.textContent = pitch.nearestNote.name;
  if (homeCents) homeCents.textContent = `${formatSignedCents(pitch.cents)} cents`;
  if (homeStatus) homeStatus.textContent = "收音中";
  if (homeNeedle) homeNeedle.style.left = `${position}%`;
}

function getPitchStatusText(measurement) {
  const reason = measurement?.blockedReason || measurement?.reason;
  if (!measurement || reason === "no-frequency" || reason === "quiet") return "等待收音";
  if (reason === "low-rms") return "音量太小";
  if (reason === "low-confidence" || reason === "low-yin-confidence" || reason === "low-harmonic-score") {
    return "等待穩定收音";
  }
  return measurement.detectionStatus === "detected" ? "收音中" : "等待穩定收音";
}

function updatePitchStatusText(measurement) {
  const statusText = getPitchStatusText(measurement);
  const homeStatus = $("#homeTunerStatus");
  const homeCents = $("#homePitchCents");
  if (homeStatus) homeStatus.textContent = statusText;
  if (!stablePitchDisplay && homeCents) homeCents.textContent = statusText;
}

function formatSignedCents(cents) {
  return cents > 0 ? `+${cents}` : `${cents}`;
}

function resetPitchTracker() {
  pitchCentsWindow = [];
  activeNearestNote = null;
  pendingNearestNote = null;
  pendingNearestNoteCount = 0;
  activeNoteConfidence = 0;
  activeNoteRms = 0;
  smoothedCents = null;
  stablePitchDisplay = null;
  fineRejectCount = 0;
  lastFineAcceptedAt = 0;
  naturalBoundaryPendingNote = null;
  naturalBoundaryPendingCount = 0;
  lastPitchAt = 0;
  lastPitchUiUpdateAt = 0;
  lastPitchAnalysisAt = 0;
  pitchCentsHistory = [];
  updatePitchTuner(null, true);
}

function logPitchDebug(measurement) {
  if (!measurement) return;
  const config = getPitchDetectionConfig();
  pitchDebugLog.push({
    at: Date.now(),
    mode: tunerMode,
    detectionMode: pitchDetectionMode,
    harpType,
    allowedRange: `${allowedRange.lowNote}-${allowedRange.highNote}`,
    deviceType: /iPhone|Android|Mobile/i.test(navigator.userAgent) ? "mobile" : "desktop",
    userAgent: navigator.userAgent,
    sampleRate: audioContext?.sampleRate || null,
    fftSize: micAnalyser?.fftSize || null,
    noiseFloor: micSilentRms,
    minRms: measurement.minRms ?? getPitchRmsThreshold(),
    qualityThreshold: config.qualityThreshold,
    qualityThresholdAdjusted: measurement.qualityThresholdAdjusted ?? getAdjustedQualityThreshold(measurement.correctedFrequency || measurement.frequency),
    harmonicThreshold: config.harmonicThreshold,
    detectorV1: measurement.detectorV1,
    detectorV2: {
      ...measurement.detectorV2,
      rawFrequency: measurement.frequency || measurement.detectorV2?.rawFrequency || null,
      correctedFrequency: measurement.correctedFrequency || null,
      selectedCandidate: measurement.selectedCandidate || null,
      rejectedReason: measurement.rejectedReason || measurement.blockedReason || null,
    },
    yin: measurement.yin,
    mpm: measurement.mpm,
    selectedDetector: measurement.selectedDetector,
    rawFreq: measurement.frequency,
    rawFrequency: measurement.frequency,
    isHighRegister: measurement.isHighRegister,
    activeBufferSize: measurement.activeBufferSize,
    detectedFrequency: measurement.detectedFrequency,
    correctedFrequency: measurement.correctedFrequency,
    selectedCandidateFrequency: measurement.selectedCandidateFrequency,
    selectedCandidate: measurement.selectedCandidate,
    referenceFrequency: measurement.referenceFrequency,
    lockedNote: measurement.lockedNote,
    pendingNote: measurement.pendingNote,
    noteSwitchFrames: measurement.noteSwitchFrames ?? config.noteSwitchFrames,
    nearestNote: measurement.nearestNote,
    nearestNoteFrequency: measurement.nearestNoteFrequency,
    centsFromNearest: measurement.centsFromNearest,
    centsRelativeToLockedNote: measurement.centsRelativeToLockedNote,
    absCents: measurement.absCents,
    harmonicScore: measurement.harmonicScore,
    finalScore: measurement.finalScore,
    targetNote: measurement.targetNote,
    targetFrequency: measurement.targetFrequency,
    confidence: measurement.confidence,
    rms: measurement.rms,
    dominantEnergy: measurement.dominantEnergy,
    rawCents: measurement.rawCents,
    centsFromTarget: measurement.centsFromTarget,
    smoothedCents: measurement.smoothedCents ?? stablePitchDisplay?.cents ?? null,
    vibratoTrackingActive: measurement.vibratoTrackingActive,
    smoothingMode: measurement.smoothingMode,
    detectionStatus: measurement.detectionStatus || (measurement.frequency ? "detected" : "blocked"),
    blockedReason: measurement.blockedReason || measurement.reason,
    noteSwitchReason: measurement.noteSwitchReason,
    centsUpdateReason: measurement.centsUpdateReason,
    naturalBoundarySwitch: measurement.naturalBoundarySwitch,
    naturalBoundaryPending: measurement.naturalBoundaryPending,
    naturalBoundaryReason: measurement.naturalBoundaryReason,
    naturalBoundaryCandidate: measurement.naturalBoundaryCandidate,
    naturalBoundaryPreviousNote: measurement.naturalBoundaryPreviousNote,
    naturalBoundaryPendingCount: measurement.naturalBoundaryPendingCount,
    boundarySourceFrequency: measurement.boundarySourceFrequency,
    boundaryCentsToCandidate: measurement.boundaryCentsToCandidate,
    coarseDetectedNote: measurement.nearestNote,
    fineCentsRaw: measurement.rawCents,
    fineCentsSmoothed: measurement.smoothedCents ?? stablePitchDisplay?.cents ?? null,
    isAdjacentSemitoneCandidate: measurement.isAdjacentSemitoneCandidate,
    semitoneSwitchTriggered: measurement.semitoneSwitchTriggered,
    semitoneSwitchReason: measurement.semitoneSwitchReason,
    lastLockedNoteBeforeSwitch: measurement.lastLockedNoteBeforeSwitch,
    lastLockedNoteAfterSwitch: measurement.lastLockedNoteAfterSwitch,
    candidateList: measurement.candidateList,
    selectedReason: measurement.selectedReason,
    rejectedReason: measurement.rejectedReason,
  });
  pitchDebugLog = pitchDebugLog.slice(-80);
}

function updateLockedNoteWithDetectorV2(measurement) {
  const config = getPitchDetectionConfig();
  const rmsThreshold = getPitchRmsThreshold();
  if (
    !measurement?.frequency ||
    measurement.rms < rmsThreshold ||
    measurement.frequency < DETECTOR_RANGE.minFundamentalHz ||
    measurement.frequency > DETECTOR_RANGE.maxRawAnalysisHz
  ) {
    const reason = !measurement?.frequency
      ? "no-frequency"
      : measurement.rms < rmsThreshold
        ? "low-rms"
        : "out-of-range";
    return {
      ...(measurement || {}),
      detectionStatus: reason === "low-rms" ? "too-quiet" : "blocked",
      blockedReason: reason,
      reason,
      minRms: rmsThreshold,
      qualityThresholdAdjusted: getAdjustedQualityThreshold(measurement?.frequency),
    };
  }

  const correction = selectPitchCandidate(measurement);
  measurement.candidateList = correction.candidateList;
  measurement.selectedReason = correction.selectedReason;
  measurement.rejectedReason = correction.rejectedReason;
  measurement.selectedCandidate = correction.selected;
  if (!correction.selected) {
    measurement.detectionStatus = "blocked";
    measurement.blockedReason = correction.rejectedReason;
    return measurement;
  }
  if (!isCandidateReliable(correction.selected, measurement, config)) {
    measurement.detectionStatus = "blocked";
    measurement.blockedReason = "low-harmonic-score";
    measurement.rejectedReason = "low-harmonic-score";
    return measurement;
  }

  const correctedFrequency = correction.selected.frequency;
  const nearestNote = findNearestAllowedNote(correctedFrequency);
  if (!nearestNote) {
    measurement.detectionStatus = "blocked";
    measurement.blockedReason = "no-nearest-note";
    return measurement;
  }

  const existingLockedNote = activeNearestNote;
  const centsRelativeToExistingLock = existingLockedNote
    ? 1200 * Math.log2(correctedFrequency / existingLockedNote.frequency)
    : null;
  const isHighRegister = isHighRegisterFrequency(correctedFrequency) || isHighRegisterFrequency(measurement.frequency) || isHighRegisterFrequency(existingLockedNote?.frequency);
  const qualityThreshold = getAdjustedQualityThreshold(correctedFrequency);
  const vibratoTrackingActive =
    Boolean(existingLockedNote) &&
    Number.isFinite(centsRelativeToExistingLock) &&
    Math.abs(centsRelativeToExistingLock) <= VIBRATO_TRACKING_RANGE_CENTS &&
    measurement.rms >= rmsThreshold;
  const likelyNewNote =
    Boolean(existingLockedNote) &&
    Number.isFinite(centsRelativeToExistingLock) &&
    Math.abs(centsRelativeToExistingLock) > FINE_TRACKER_CONFIG.releaseRangeCents;
  const lowConfidenceButTrackable =
    vibratoTrackingActive &&
    (measurement.confidence || 0) >= Math.max(0.22, qualityThreshold - 0.22);
  if ((measurement.confidence || 0) < qualityThreshold && !lowConfidenceButTrackable) {
    measurement.detectionStatus = "blocked";
    measurement.blockedReason = "low-confidence";
    measurement.qualityThresholdAdjusted = qualityThreshold;
    measurement.isHighRegister = isHighRegister;
    measurement.vibratoTrackingActive = false;
    return measurement;
  }

  const previousLockedNote = activeNearestNote;
  let noteSwitchReason = "same-note";
  if (!activeNearestNote) {
    activeNearestNote = nearestNote;
    pendingNearestNote = null;
    pendingNearestNoteCount = 0;
    activeNoteConfidence = measurement.confidence || 0;
    activeNoteRms = measurement.rms || 0;
    resetFineTrackerForNoteSwitch();
    noteSwitchReason = "initial-lock";
  } else if (nearestNote.name !== activeNearestNote.name && (!vibratoTrackingActive || likelyNewNote)) {
    if (pendingNearestNote?.name === nearestNote.name) {
      pendingNearestNoteCount += 1;
    } else {
      pendingNearestNote = nearestNote;
      pendingNearestNoteCount = 1;
    }
    const confidenceGain = (measurement.confidence || 0) >= activeNoteConfidence + 0.15;
    const absoluteConfidenceSwitch = (measurement.confidence || 0) >= 0.75;
    const strongerRms = activeNoteRms > 0 && (measurement.rms || 0) >= activeNoteRms * 1.2;
    const stableNewNote = pendingNearestNoteCount >= (likelyNewNote ? 1 : config.noteSwitchFrames);
    if (stableNewNote || confidenceGain || strongerRms || absoluteConfidenceSwitch) {
      activeNearestNote = nearestNote;
      pendingNearestNote = null;
      pendingNearestNoteCount = 0;
      activeNoteConfidence = measurement.confidence || 0;
      activeNoteRms = measurement.rms || 0;
      resetFineTrackerForNoteSwitch();
      noteSwitchReason = stableNewNote
        ? "stable-new-note-switch"
        : confidenceGain
          ? "confidence-gain-switch"
          : strongerRms
            ? "stronger-rms-switch"
            : "absolute-confidence-switch";
    } else {
      noteSwitchReason = "pending-note-hold";
    }
  } else {
    pendingNearestNote = null;
    pendingNearestNoteCount = 0;
    activeNoteConfidence = activeNoteConfidence * 0.7 + (measurement.confidence || 0) * 0.3;
    activeNoteRms = activeNoteRms * 0.7 + (measurement.rms || 0) * 0.3;
  }

  const lockedChanged = previousLockedNote?.name !== activeNearestNote.name;
  measurement.detectedFrequency = correctedFrequency;
  measurement.correctedFrequency = correctedFrequency;
  measurement.selectedCandidateFrequency = correctedFrequency;
  measurement.selectedCandidate = correction.selected;
  measurement.referenceFrequency = activeNearestNote.frequency;
  measurement.lockedNote = activeNearestNote.name;
  measurement.pendingNote = pendingNearestNote?.name || null;
  measurement.noteSwitchFrames = config.noteSwitchFrames;
  measurement.nearestNote = nearestNote.name;
  measurement.nearestNoteFrequency = nearestNote.frequency;
  measurement.centsFromNearest = 1200 * Math.log2(correctedFrequency / activeNearestNote.frequency);
  measurement.harmonicScore = correction.selected.harmonicScore;
  measurement.finalScore = correction.selected.finalScore;
  measurement.targetNote = null;
  measurement.targetFrequency = null;
  measurement.centsFromTarget = null;
  measurement.detectionStatus = "detected";
  measurement.blockedReason = null;
  measurement.isHighRegister = isHighRegister;
  measurement.activeBufferSize = measurement.activeBufferSize || measurement.detectorV2?.activeBufferSize || null;
  measurement.vibratoTrackingActive = vibratoTrackingActive;
  measurement.likelyNewNote = likelyNewNote;
  measurement.qualityThresholdAdjusted = qualityThreshold;
  measurement.noteSwitchReason = noteSwitchReason;
  measurement.lockedChanged = lockedChanged;
  measurement.noteDetectorUpdated = true;
  return measurement;
}

function updateFineCentsTrackerEveryFrame(detectorMeasurement) {
  if (!activeNearestNote) return null;
  const fineFrame = buildPitchBuffer(getFineTrackerBufferSize());
  const fine = estimateFinePitchNearLockedNote(fineFrame, activeNearestNote);
  const fineGate = validateFinePitchResult(fine, activeNearestNote);
  const isHighRegister = isHighRegisterFrequency(activeNearestNote.frequency) || isHighRegisterFrequency(fine?.frequency) || detectorMeasurement?.isHighRegister;
  const detectorCents = detectorMeasurement?.correctedFrequency
    ? 1200 * Math.log2(detectorMeasurement.correctedFrequency / activeNearestNote.frequency)
    : null;
  const canUseFineCents = fineGate.valid;
  const canUseDetectorCents =
    !canUseFineCents &&
    detectorMeasurement?.detectionStatus === "detected" &&
    Number.isFinite(detectorCents) &&
    Math.abs(detectorCents) <= FINE_TRACKER_CONFIG.detectorFallbackRangeCents &&
    (detectorMeasurement.confidence || 0) >= Math.max(0.26, getAdjustedQualityThreshold(activeNearestNote.frequency) - 0.18);
  let rawCents = canUseFineCents ? fine.cents : canUseDetectorCents ? detectorCents : null;
  let centsUpdateReason = canUseFineCents ? "fine-waveform-contour" : canUseDetectorCents ? "detector-cents-fallback" : "fine-rejected";
  const boundaryRawCents = Number.isFinite(fine?.cents) ? fine.cents : detectorCents;
  const boundarySwitch = maybeSwitchAdjacentSemitone(boundaryRawCents, fine, detectorMeasurement);

  if (boundarySwitch.switched) {
    const sourceFrequency = boundarySwitch.sourceFrequency;
    rawCents = Number.isFinite(sourceFrequency)
      ? 1200 * Math.log2(sourceFrequency / activeNearestNote.frequency)
      : boundarySwitch.centsToCandidate;
    centsUpdateReason = boundarySwitch.reason;
    if (Number.isFinite(rawCents)) {
      smoothedCents = rawCents;
    }
  } else if (boundarySwitch.pending) {
    const blockedMeasurement = {
      ...(detectorMeasurement || {}),
      lockedNote: activeNearestNote.name,
      referenceFrequency: activeNearestNote.frequency,
      rawCents: boundaryRawCents,
      fineTracker: fine,
      fineTrackerFrequency: fine?.frequency || fine?.rawFrequency || null,
      fineTrackerConfidence: fine?.confidence || 0,
      fineTrackerQuality: fine?.quality || 0,
      fineTrackerReason: fine?.reason || null,
      fineTrackerGateReason: "natural-boundary-pending",
      fineTrackerValid: false,
      naturalBoundarySwitch: false,
      naturalBoundaryPending: true,
      naturalBoundaryCandidate: boundarySwitch.candidate?.name || null,
      naturalBoundaryPendingCount: boundarySwitch.naturalBoundaryPendingCount,
      isAdjacentSemitoneCandidate: true,
      semitoneSwitchTriggered: false,
      semitoneSwitchReason: boundarySwitch.reason,
      lastLockedNoteBeforeSwitch: activeNearestNote.name,
      lastLockedNoteAfterSwitch: activeNearestNote.name,
      boundarySourceFrequency: boundarySwitch.sourceFrequency,
      boundaryCentsToCandidate: boundarySwitch.centsToCandidate,
      detectionStatus: "blocked",
      blockedReason: "natural-boundary-pending",
      centsUpdateReason: "natural-boundary-hold-old-note",
      detectorCents,
      isHighRegister,
    };
    logPitchDebug(blockedMeasurement);
    return null;
  }

  if (!Number.isFinite(rawCents)) {
    fineRejectCount += 1;
    if (fineRejectCount >= 3) {
      smoothedCents = null;
    }
    const blockedMeasurement = {
      ...(detectorMeasurement || {}),
      lockedNote: activeNearestNote.name,
      referenceFrequency: activeNearestNote.frequency,
      fineTracker: fine,
    fineTrackerFrequency: fine?.frequency || fine?.rawFrequency || null,
      fineTrackerConfidence: fine?.confidence || 0,
      fineTrackerQuality: fine?.quality || 0,
      fineTrackerReason: fine?.reason || null,
      fineTrackerGateReason: fineGate.reason,
      fineTrackerValid: false,
      fineRejectCount,
      selectedFineLag: fine?.selectedFineLag || null,
      minFineLag: fine?.minFineLag || null,
      maxFineLag: fine?.maxFineLag || null,
      detectionStatus: detectorMeasurement?.detectionStatus || "blocked",
      blockedReason: fineGate.reason || fine?.reason || detectorMeasurement?.blockedReason || detectorMeasurement?.reason || "fine-no-frequency",
      centsUpdateReason,
      detectorCents,
      likelyNewNote: detectorMeasurement?.likelyNewNote,
      isHighRegister,
    };
    logPitchDebug(blockedMeasurement);
    return null;
  }

  if (Math.abs(rawCents) > FINE_TRACKER_CONFIG.releaseRangeCents) {
    fineRejectCount += 1;
    smoothedCents = null;
    logPitchDebug({
      ...(detectorMeasurement || {}),
      lockedNote: activeNearestNote.name,
      referenceFrequency: activeNearestNote.frequency,
      rawCents,
      fineTracker: fine,
      fineTrackerGateReason: "fine-release-range-exceeded",
      fineTrackerValid: false,
      fineRejectCount,
      detectionStatus: "blocked",
      blockedReason: "fine-release-range-exceeded",
      centsUpdateReason: "fine-rejected-release-range",
      isHighRegister,
    });
    return null;
  }

  fineRejectCount = 0;
  const smoothingMode = isHighRegister ? "contour" : "fast";
  const smoothingAlpha = isHighRegister ? 0.82 : 0.72;
  const previous = smoothedCents;
  smoothedCents = previous === null || !Number.isFinite(previous)
    ? rawCents
    : previous + (rawCents - previous) * smoothingAlpha;
  const displayCents = Math.round(smoothedCents);
  if (Math.abs(displayCents) > FINE_TRACKER_CONFIG.validRangeCents + 8) {
    fineRejectCount += 1;
    smoothedCents = null;
    logPitchDebug({
      ...(detectorMeasurement || {}),
      lockedNote: activeNearestNote.name,
      referenceFrequency: activeNearestNote.frequency,
      rawCents,
      smoothedCents: displayCents,
      fineTracker: fine,
      fineTrackerGateReason: "smoothed-cents-saturation-guard",
      fineTrackerValid: false,
      detectionStatus: "blocked",
      blockedReason: "smoothed-cents-saturation-guard",
      centsUpdateReason: "fine-rejected-saturation-guard",
      isHighRegister,
    });
    return null;
  }
  const now = performance.now();
  const display = {
    nearestNote: activeNearestNote,
    cents: displayCents,
    detectedFrequency: fine?.frequency || detectorMeasurement?.correctedFrequency || activeNearestNote.frequency,
  };

  const debugMeasurement = {
    ...(detectorMeasurement || {}),
    detectedFrequency: display.detectedFrequency,
    correctedFrequency: detectorMeasurement?.correctedFrequency || fine?.frequency || null,
    referenceFrequency: activeNearestNote.frequency,
    lockedNote: activeNearestNote.name,
    nearestNote: activeNearestNote.name,
    nearestNoteFrequency: activeNearestNote.frequency,
    centsFromNearest: rawCents,
    centsRelativeToLockedNote: rawCents,
    absCents: Math.abs(rawCents),
    rawCents,
    smoothedCents: displayCents,
    fineTrackerFrequency: fine?.frequency || null,
    fineTrackerConfidence: fine?.confidence || 0,
    fineTrackerQuality: fine?.quality || 0,
    fineTrackerReason: fine?.reason || null,
    fineTrackerGateReason: fineGate.reason,
    fineTrackerValid: canUseFineCents,
    fineTrackerActive: canUseFineCents,
    naturalBoundarySwitch: boundarySwitch.switched,
    naturalBoundaryPending: boundarySwitch.pending,
    naturalBoundaryReason: boundarySwitch.reason,
    naturalBoundaryCandidate: boundarySwitch.candidate?.name || null,
    naturalBoundaryPreviousNote: boundarySwitch.previousNote?.name || null,
    isAdjacentSemitoneCandidate: Boolean(boundarySwitch.candidate),
    semitoneSwitchTriggered: boundarySwitch.switched,
    semitoneSwitchReason: boundarySwitch.reason,
    lastLockedNoteBeforeSwitch: boundarySwitch.previousNote?.name || activeNearestNote.name,
    lastLockedNoteAfterSwitch: activeNearestNote.name,
    naturalBoundaryPendingCount,
    boundarySourceFrequency: boundarySwitch.sourceFrequency || null,
    boundaryCentsToCandidate: boundarySwitch.centsToCandidate,
    fineTrackerBufferSize: fine?.activeBufferSize || fineFrame?.activeBufferSize || null,
    selectedFineLag: fine?.selectedFineLag || null,
    minFineLag: fine?.minFineLag || null,
    maxFineLag: fine?.maxFineLag || null,
    fineRejectCount,
    likelyNewNote: detectorMeasurement?.likelyNewNote,
    lastFineAcceptedAt: now,
    vibratoTrackingActive: Math.abs(rawCents) <= VIBRATO_TRACKING_RANGE_CENTS,
    smoothingMode,
    isHighRegister,
    detectionStatus: "detected",
    blockedReason: null,
    centsUpdateReason,
  };
  logPitchDebug(debugMeasurement);
  stablePitchDisplay = display;
  lastPitchAt = now;
  lastFineAcceptedAt = now;
  pitchCentsHistory.push({ at: now, cents: displayCents });
  pitchCentsHistory = pitchCentsHistory.filter((entry) => now - entry.at <= 1000);
  return display;
}

function processPitchMeasurement(measurement) {
  const detectorMeasurement = updateLockedNoteWithDetectorV2(measurement);
  const pitch = updateFineCentsTrackerEveryFrame(detectorMeasurement);
  if (!pitch && detectorMeasurement && !activeNearestNote) {
    logPitchDebug(detectorMeasurement);
  }
  return pitch;
}

function isCandidateReliable(candidate, measurement, config) {
  if (!candidate) return false;
  const isHighRegister = isHighRegisterFrequency(candidate.frequency) || isHighRegisterFrequency(measurement.frequency);
  const harmonicThreshold = isHighRegister ? Math.max(0.04, config.harmonicThreshold - 0.08) : config.harmonicThreshold;
  if (candidate.harmonicScore >= harmonicThreshold) return true;
  const centsToLock = activeNearestNote ? Math.abs(1200 * Math.log2(candidate.frequency / activeNearestNote.frequency)) : Infinity;
  if (Number.isFinite(centsToLock) && centsToLock <= VIBRATO_TRACKING_RANGE_CENTS && (measurement.rms || 0) >= getPitchRmsThreshold()) {
    return true;
  }
  const closeToNote = candidate.absCents <= 18;
  const veryCloseToNote = candidate.absCents <= 10;
  const qualityThreshold = getAdjustedQualityThreshold(candidate.frequency);
  const confidentDetector = (measurement.confidence || 0) >= qualityThreshold + (isHighRegister ? 0.02 : 0.08);
  const strongEnough = (measurement.rms || 0) >= getPitchRmsThreshold() * 1.35;
  return (closeToNote && confidentDetector) || (veryCloseToNote && strongEnough) || (isHighRegister && candidate.source === "raw" && candidate.absCents <= 28);
}

function updateLivePitch() {
  const now = performance.now();
  if (!micAnalyser || isCalibratingMic) {
    updatePitchTuner(stablePitchDisplay, true);
    return;
  }
  if (now - lastPitchAnalysisAt < 38) return;
  lastPitchAnalysisAt = now;
  const measurement = detectPitch();
  const pitch = processPitchMeasurement(measurement);
  if (pitch) {
    if (now - lastPitchUiUpdateAt >= 45) {
      updatePitchTuner(pitch);
      lastPitchUiUpdateAt = now;
    }
    return;
  }
  if (stablePitchDisplay) {
    if (now - lastPitchUiUpdateAt >= 45) {
      updatePitchTuner(stablePitchDisplay);
      updatePitchStatusText(measurement);
      lastPitchUiUpdateAt = now;
    }
  } else {
    updatePitchTuner(stablePitchDisplay, true);
    updatePitchStatusText(measurement);
  }
}

function calculatePitchStability() {
  if (pitchCentsHistory.length < 5) return null;
  const values = pitchCentsHistory.map((entry) => entry.cents);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const sd = Math.sqrt(variance);
  return clampScore(100 - (sd / 30) * 100);
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
  $("#audioCalibrateBtn").textContent = "重新校正";
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
  const rawCurveLevel = isListeningWindow ? signalToCurveLevel(rawSignal) : 0;
  if (isListeningWindow) {
    displayEnvelopeLevel =
      rawCurveLevel > displayEnvelopeLevel
        ? displayEnvelopeLevel * 0.42 + rawCurveLevel * 0.58
        : displayEnvelopeLevel * 0.88 + rawCurveLevel * 0.12;
  } else {
    displayEnvelopeLevel = 0;
  }
  updateLivePitch();

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
    const pitchScore = calculatePitchStability();
    const score = pitchScore ?? calculateStability();
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
    micAnalyser.fftSize = YIN_CONFIG.analyserSize;
    micAnalyser.smoothingTimeConstant = 0.12;
    micData = new Uint8Array(micAnalyser.fftSize);
    micFloatTimeData = new Float32Array(micAnalyser.fftSize);
    micFrequencyData = new Uint8Array(micAnalyser.frequencyBinCount);
    micFloatFrequencyData = new Float32Array(micAnalyser.frequencyBinCount);
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
  $("#exerciseInstruction").textContent = exercise.title;
  $("#beatTotal").textContent = `/ ${exercise.playBeats} 拍`;
  $("#prepareBeats").textContent = `${exercise.prepareBeats} 拍`;
  $("#playBeats").textContent = `${exercise.playBeats} 拍`;
  $("#restBeats").textContent = `${exercise.restBeats} 拍`;
  $("#cycleCount").textContent = totalCycles;
  $("#currentCycle").textContent = cycle;
  $("#cycleTotal").textContent = `/ ${totalCycles} 次`;
  $("#bpmInput").value = bpm;
  $("#bpmValue").textContent = bpm;
  $("#statusBpm").textContent = bpm;
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
  $("#toneCardTitle").textContent = "練習目標";
  $("#stabilityStat").classList.toggle("hidden", !shouldShowStability());
  renderWaveGuide();
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
  $("#currentCycle").textContent = cycle;
  $("#cycleTotal").textContent = `/ ${totalCycles} 次`;
  $("#beatTotal").textContent = phase === "prepare"
    ? `/ ${exercise.prepareBeats} 拍`
    : phase === "rest"
      ? `/ ${exercise.restBeats} 拍`
      : `/ ${exercise.playBeats} 拍`;
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
  let shouldScrollAfterStart = false;
  setPracticeSettingsOpen(false);
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
    shouldScrollAfterStart = true;
  }

  $("#startPauseBtn").textContent = "暫停";
  stepPractice();
  timer = setInterval(stepPractice, 60000 / bpm);
  updateBeatDisplay();
  if (shouldScrollAfterStart) scrollToLongTonePracticeMain();
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
    setPracticeSettingsOpen(false);
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
    setPracticeSettingsOpen(false);
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

  $("#calendarToggle").addEventListener("click", () => {
    const calendar = $("#streakCalendar");
    const isHidden = calendar.classList.toggle("hidden");
    $("#calendarToggle").textContent = isHidden ? "查看日曆" : "收起日曆";
  });

  $("#useFreezeBtn").addEventListener("click", useLearningFreeze);
  $("#dismissFreezeBtn").addEventListener("click", dismissLearningFreezePrompt);

  $("#tuningSelect").addEventListener("change", (event) => {
    tuningA4 = Number(event.target.value);
    $$("[data-tuning-value]").forEach((button) => {
      button.classList.toggle("active", Number(button.dataset.tuningValue) === tuningA4);
    });
    refreshAllowedNotes();
    resetPitchTracker();
  });
  $$("[data-tuning-value]").forEach((button) => {
    button.addEventListener("click", () => {
      $("#tuningSelect").value = button.dataset.tuningValue;
      $("#tuningSelect").dispatchEvent(new Event("change"));
    });
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
  $("#practiceSettingsBtn").addEventListener("click", () => {
    setPracticeSettingsOpen($("#practiceSettingsPanel").classList.contains("hidden"));
  });
  $("#practiceSettingsClose").addEventListener("click", () => setPracticeSettingsOpen(false));
  $("#practiceSettingsPanel").addEventListener("click", (event) => {
    if (event.target.id === "practiceSettingsPanel") {
      setPracticeSettingsOpen(false);
    }
  });
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

window.chromaticDebug = {
  get pitch() {
    return pitchDebugLog[pitchDebugLog.length - 1] || null;
  },
  get pitchLog() {
    return [...pitchDebugLog];
  },
  get pitchDetectionMode() {
    return pitchDetectionMode;
  },
  setPitchDetectionMode(mode) {
    if (!PITCH_DETECTION_MODES[mode]) return false;
    pitchDetectionMode = mode;
    resetPitchTracker();
    return true;
  },
  runFineTrackerSequenceTest() {
    const notes = ["C5", "D5", "E5", "B5", "C6", "D6", "G6", "C7"];
    const results = [];
    resetPitchTracker();
    for (const noteName of notes) {
      const note = {
        name: noteName,
        midi: noteNameToMidi(noteName),
        frequency: midiToFreq(noteNameToMidi(noteName), tuningA4),
      };
      activeNearestNote = note;
      resetFineTrackerForNoteSwitch();
      const inTune = { valid: true, frequency: note.frequency, cents: 0, confidence: 0.4, quality: 0.4, selectedFineLag: 40, minFineLag: 30, maxFineLag: 50 };
      const gateInTune = validateFinePitchResult(inTune, note);
      const wrongReference = {
        valid: true,
        frequency: note.frequency * 2 ** (220 / 1200),
        cents: 220,
        confidence: 0.4,
        quality: 0.4,
        selectedFineLag: 40,
        minFineLag: 30,
        maxFineLag: 50,
      };
      const gateWrongReference = validateFinePitchResult(wrongReference, note);
      results.push({
        note: noteName,
        acceptsInTune: gateInTune.valid,
        rejectsSaturatedCents: !gateWrongReference.valid,
        rejectReason: gateWrongReference.reason,
      });
    }
    const boundaryPairs = [
      ["C6", "C#6"],
      ["C#6", "C6"],
      ["D6", "D#6"],
      ["D#6", "D6"],
      ["E5", "F5"],
      ["E6", "F6"],
      ["F6", "F#6"],
      ["F#6", "F6"],
      ["G6", "G#6"],
      ["G#6", "G6"],
      ["B5", "C6"],
      ["B6", "C7"],
      ["F5", "E5"],
      ["C6", "B5"],
    ];
    const boundaryResults = boundaryPairs.map(([fromName, toName]) => {
      const from = {
        name: fromName,
        midi: noteNameToMidi(fromName),
        frequency: midiToFreq(noteNameToMidi(fromName), tuningA4),
      };
      const to = {
        name: toName,
        midi: noteNameToMidi(toName),
        frequency: midiToFreq(noteNameToMidi(toName), tuningA4),
      };
      activeNearestNote = from;
      resetFineTrackerForNoteSwitch();
      const fine = {
        valid: true,
        frequency: to.frequency,
        rawFrequency: to.frequency,
        cents: 1200 * Math.log2(to.frequency / from.frequency),
        confidence: 0.35,
        quality: 0.35,
        rms: 0.02,
      };
      const measurement = {
        correctedFrequency: to.frequency,
        detectedFrequency: to.frequency,
        nearestNote: to.name,
        selectedCandidate: { nearestNote: to.name },
        confidence: 0.45,
        rms: 0.02,
      };
      const switched = maybeSwitchAdjacentSemitone(fine.cents, fine, measurement);
      return {
        from: fromName,
        to: toName,
        rawCents: Math.round(fine.cents),
        switched: switched.switched,
        reason: switched.reason,
        lockedNote: activeNearestNote?.name || null,
      };
    });
    resetPitchTracker();
    return { gateResults: results, boundaryResults };
  },
};

bindEvents();
registerServiceWorker();
refreshAllowedNotes();
resetPitchTracker();
renderNoteMap();
renderExercise();
updateBeatDisplay();
renderMicCurve();
