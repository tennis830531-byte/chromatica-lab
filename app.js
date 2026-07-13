const dynamics = {
  pp: 1,
  p: 2,
  mp: 3,
  mf: 4,
  f: 5,
};

const targetVolumes = ["p", "mp", "mf", "f"];
const CYCLE_OPTIONS = [2, 4, 6, 8];
const MIN_REWARD_CYCLES = 2;
const MAX_SELECTABLE_CYCLES = 8;
const MAX_DAILY_WATER_REWARD = 25;
const DAILY_GOAL_REQUIRED_COMBOS = 2;
const INTERVAL_DAILY_GOAL_STATE_KEY = "intervalUniqueCombos";
const INTERVAL_DAILY_GOAL_TASKS = [
  { id: "interval-variety-3", title: "音程組合挑戰 3 次", required: 3 },
  { id: "interval-variety-8", title: "音程組合挑戰 8 次", required: 8 },
];
const PLANT_STAGE_WATER_REQUIREMENTS = [20, 30, 40];
const PLANT_WATER_REQUIRED = PLANT_STAGE_WATER_REQUIREMENTS.reduce((total, amount) => total + amount, 0);
const GARDEN_EVOLUTION_NOTICE_DELAY_MS = 2300;
const RAIN_BONUS_AMOUNT = 5;
const RAIN_BONUS_CHANCE = 0.5;
const GARDEN_WATERING_CAN_SRC = "./public/assets/garden/icons/watering-can.png";
const GARDEN_SHOVEL_SRC = "./public/assets/garden/icons/garden-shovel.png";

const gardenSpecies = [
  {
    species: "melody-sprout",
    name: "旋律芽芽",
    description: "一株剛從音符泥土裡冒出的口琴小芽，葉片會隨著練習聲音輕輕搖晃。個性溫和，喜歡穩定的長音，是陪伴初學者累積基本功的小精靈。",
    images: [
      "./public/assets/garden/plants/melody-sprout-stage1.png",
      "./public/assets/garden/plants/melody-sprout-stage2.png?v=clean-2",
      "./public/assets/garden/plants/melody-sprout-stage3.png?v=clean-2",
    ],
  },
  {
    species: "flower-spirit",
    name: "花樂精靈",
    description: "由旋律盛開而成的花系口琴精靈，花瓣裡藏著明亮的音色與節奏感。個性開朗，澆水後會灑出小音符，象徵練習慢慢開花。",
    images: [
      "./public/assets/garden/plants/flower-spirit-stage1.png",
      "./public/assets/garden/plants/flower-spirit-stage2.png",
      "./public/assets/garden/plants/flower-spirit-stage3.png",
    ],
  },
  {
    species: "mushroom-spirit",
    name: "菇鳴靈",
    description: "住在濕潤音樂土壤裡的菇系口琴精靈，菇帽像小小的口琴共鳴箱，能聽見細微的氣息變化。個性安靜但很有靈氣，適合代表專注、耐心與穩定成長。",
    images: [
      "./public/assets/garden/plants/mushroom-spirit-stage1.png",
      "./public/assets/garden/plants/mushroom-spirit-stage2.png",
      "./public/assets/garden/plants/mushroom-spirit-stage3.png",
    ],
  },
  {
    species: "lucky-leaf-spirit",
    name: "幸葉靈",
    description: "從幸運葉片中誕生的口琴精靈，會用柔和旋律陪伴練習者，讓每一次練習都多一點好心情。",
    images: [
      "./public/assets/garden/plants/lucky-leaf-spirit-stage1.png",
      "./public/assets/garden/plants/lucky-leaf-spirit-stage2.png",
      "./public/assets/garden/plants/lucky-leaf-spirit-stage3.png",
    ],
  },
];

const gardenStorageKeys = {
  waterDrops: "chromatica.waterDrops",
  currentPlant: "chromatica.currentPlant",
  collection: "chromatica.spiritCollection",
  featured: "chromatica.featuredSpiritId",
  featuredStage: "chromatica.featuredSpiritStage",
  rainBonus: "chromatica.rainBonusState",
  dailyReward: "chromatica.dailyWaterReward",
};

const PRACTICE_SETTINGS_KEY = "chromatica.settings.practice";
const SOUND_SETTINGS_KEY = "chromatica.settings.sound";
const DISPLAY_SETTINGS_KEY = "chromatica.settings.display";
const INTERVAL_PRACTICE_HISTORY_KEY = "chromatica.intervalPracticeHistory";
const INTERVAL_GROUPS_PER_PAGE = 4;
const INTERVAL_KEYS = {
  C: { label: "C 大調", notes: ["C", "D", "E", "F", "G", "A", "B"], signature: [] },
  G: { label: "G 大調", notes: ["G", "A", "B", "C", "D", "E", "F#"], signature: ["F#"] },
  D: { label: "D 大調", notes: ["D", "E", "F#", "G", "A", "B", "C#"], signature: ["F#", "C#"] },
  A: { label: "A 大調", notes: ["A", "B", "C#", "D", "E", "F#", "G#"], signature: ["F#", "C#", "G#"] },
  E: { label: "E 大調", notes: ["E", "F#", "G#", "A", "B", "C#", "D#"], signature: ["F#", "C#", "G#", "D#"] },
  B: { label: "B 大調", notes: ["B", "C#", "D#", "E", "F#", "G#", "A#"], signature: ["F#", "C#", "G#", "D#", "A#"] },
  F: { label: "F 大調", notes: ["F", "G", "A", "Bb", "C", "D", "E"], signature: ["Bb"] },
  Bb: { label: "Bb 大調", notes: ["Bb", "C", "D", "Eb", "F", "G", "A"], signature: ["Bb", "Eb"] },
  Eb: { label: "Eb 大調", notes: ["Eb", "F", "G", "Ab", "Bb", "C", "D"], signature: ["Bb", "Eb", "Ab"] },
  Ab: { label: "Ab 大調", notes: ["Ab", "Bb", "C", "Db", "Eb", "F", "G"], signature: ["Bb", "Eb", "Ab", "Db"] },
  Db: { label: "Db 大調", notes: ["Db", "Eb", "F", "Gb", "Ab", "Bb", "C"], signature: ["Bb", "Eb", "Ab", "Db", "Gb"] },
  Gb: { label: "Gb 大調", notes: ["Gb", "Ab", "Bb", "Cb", "Db", "Eb", "F"], signature: ["Bb", "Eb", "Ab", "Db", "Gb", "Cb"] },
};
const INTERVAL_LABELS = { 2: "二度", 3: "三度", 4: "四度", 5: "五度", 6: "六度", 7: "七度", 8: "八度" };
const INTERVAL_DIRECTION_LABELS = {
  ascending: "上行",
  descending: "下行",
  continuousBoth: "連續上下行",
};
const DEFAULT_PRACTICE_SETTINGS = {
  defaultBpm: 60,
  defaultCycles: 4,
};
const DEFAULT_SOUND_SETTINGS = {
  appSound: true,
  metronomeVolume: "medium",
  cueSound: true,
  completionSound: true,
  wateringSound: true,
  evolutionSound: true,
  gardenMusic: true,
};
const DEFAULT_DISPLAY_SETTINGS = {
  animationMode: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "simple" : "full",
  plantIdleMotion: true,
  evolutionEffects: true,
  showFeaturedSpirit: true,
};

const soundMap = {
  uiTap: "點擊音效.mp3",
  close: "關閉音效.mp3",
  practiceComplete: "練習完成音效.mp3",
  watering: "澆水聲.mp3",
  evolveStart: "進化開始音效.mp3",
  evolveComplete: "進化完成音效.mp3",
  harvest: "收成採收音效.mp3",
  gardenBgm: "花園音樂BGM.wav",
};

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
      { beat: 5, dynamic: "mf" },
      { beat: 7, dynamic: "f" },
    ],
    instruction: "分辨四段音量層次，音量改變時不要讓音色變粗。",
    variants: [
      {
        label: "p / mp / mf / f",
        pattern: [
          { beat: 1, dynamic: "p" },
          { beat: 3, dynamic: "mp" },
          { beat: 5, dynamic: "mf" },
          { beat: 7, dynamic: "f" },
        ],
      },
      {
        label: "f / mf / mp / p",
        pattern: [
          { beat: 1, dynamic: "f" },
          { beat: 3, dynamic: "mf" },
          { beat: 5, dynamic: "mp" },
          { beat: 7, dynamic: "p" },
        ],
      },
      {
        label: "p / mp / mf / p",
        pattern: [
          { beat: 1, dynamic: "p" },
          { beat: 3, dynamic: "mp" },
          { beat: 5, dynamic: "mf" },
          { beat: 7, dynamic: "p" },
        ],
      },
      {
        label: "mp / mf / f / mp",
        pattern: [
          { beat: 1, dynamic: "mp" },
          { beat: 3, dynamic: "mf" },
          { beat: 5, dynamic: "f" },
          { beat: 7, dynamic: "mp" },
        ],
      },
      {
        label: "p / mf / mp / f",
        pattern: [
          { beat: 1, dynamic: "p" },
          { beat: 3, dynamic: "mf" },
          { beat: 5, dynamic: "mp" },
          { beat: 7, dynamic: "f" },
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
        label: "p → mp",
        pattern: [
          { beat: 1, dynamic: "p" },
          { beat: 8, dynamic: "mp" },
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
        label: "mp → p",
        pattern: [
          { beat: 1, dynamic: "mp" },
          { beat: 8, dynamic: "p" },
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
      {
        label: "p → f → p",
        pattern: [
          { beat: 1, dynamic: "p" },
          { beat: 6, dynamic: "f" },
          { beat: 12, dynamic: "p" },
        ],
      },
      {
        label: "mp → mf → mp",
        pattern: [
          { beat: 1, dynamic: "mp" },
          { beat: 6, dynamic: "mf" },
          { beat: 12, dynamic: "mp" },
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

const mapHarmonicaImages = {
  16: "./public/assets/chromatic-refresh/feature/harmonica_16_clean.png",
  14: "./public/assets/chromatic-refresh/feature/harmonica_14_silver.png",
  12: "./public/assets/chromatic-refresh/feature/harmonica_12_black.png",
};

let currentView = "intro";
let currentViewTarget = "";
let selectedHoles = 16;
let selectedMapHole = null;
let selectedExercise = 0;
let bpm = exercises[0].bpm;
let selectedTargetVolume = "mp";
let selectedVariants = {};
let selectedGardenSpiritId = "";
let selectedGardenSpiritStage = 3;
let gardenHopTimer = null;
let gardenIdleResumeTimer = null;
let phase = "idle";
let beat = 0;
let totalCycles = 4;
let cycle = 1;
const scoringStartDelayMs = 350;
let playStartedAt = 0;
let timer = null;
let intervalMetronomeTimer = null;
let intervalMetronomeBeat = 0;
let intervalMetronomePlaying = false;
let intervalPracticeState = null;
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

let gardenBgmAudio = null;
let hasSoundInteraction = false;
let soundFeedbackBound = false;

function getSoundAssetPath(fileName) {
  return `./public/assets/sounds/${fileName}`;
}

function clampPracticeBpm(value) {
  return Math.max(60, Math.min(180, Math.round(Number(value) || DEFAULT_PRACTICE_SETTINGS.defaultBpm)));
}

function getPracticeSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(PRACTICE_SETTINGS_KEY) || "{}");
    const settings = { ...DEFAULT_PRACTICE_SETTINGS, ...stored };
    return {
      defaultBpm: clampPracticeBpm(settings.defaultBpm),
      defaultCycles: normalizeSelectedCycleCount(settings.defaultCycles),
    };
  } catch (error) {
    console.warn("Unable to read practice settings.", error);
    return { ...DEFAULT_PRACTICE_SETTINGS };
  }
}

function savePracticeSettings(nextSettings) {
  try {
    localStorage.setItem(PRACTICE_SETTINGS_KEY, JSON.stringify(nextSettings));
  } catch (error) {
    console.warn("Unable to save practice settings.", error);
  }
}

function setPracticeSettings(patch) {
  const current = getPracticeSettings();
  const nextSettings = {
    defaultBpm: clampPracticeBpm(patch.defaultBpm ?? current.defaultBpm),
    defaultCycles: normalizeSelectedCycleCount(patch.defaultCycles ?? current.defaultCycles),
  };
  savePracticeSettings(nextSettings);
  applyPracticeSettings(nextSettings);
  renderPracticeSettings();
}

function applyPracticeSettings(settings = getPracticeSettings()) {
  totalCycles = normalizeSelectedCycleCount(settings.defaultCycles);
  setBpm(settings.defaultBpm);
  stopPractice(false);
  renderExercise();
}

function renderPracticeSettings() {
  const settings = getPracticeSettings();
  const bpmInput = $("#defaultBpmInput");
  if (bpmInput) bpmInput.value = settings.defaultBpm;
  $$("[data-default-cycles]").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.defaultCycles) === settings.defaultCycles);
    button.setAttribute("aria-checked", Number(button.dataset.defaultCycles) === settings.defaultCycles ? "true" : "false");
  });
}

function getSoundSettings() {
  try {
    const stored = localStorage.getItem(SOUND_SETTINGS_KEY);
    if (!stored) {
      localStorage.setItem(SOUND_SETTINGS_KEY, JSON.stringify(DEFAULT_SOUND_SETTINGS));
      return { ...DEFAULT_SOUND_SETTINGS };
    }
    return { ...DEFAULT_SOUND_SETTINGS, ...JSON.parse(stored) };
  } catch (error) {
    console.warn("Unable to read sound settings.", error);
    return { ...DEFAULT_SOUND_SETTINGS };
  }
}

function saveSoundSettings(nextSettings) {
  try {
    localStorage.setItem(SOUND_SETTINGS_KEY, JSON.stringify(nextSettings));
  } catch (error) {
    console.warn("Unable to save sound settings.", error);
  }
}

function setSoundSettings(patch) {
  const nextSettings = { ...getSoundSettings(), ...patch };
  saveSoundSettings(nextSettings);
  renderSoundSettings();
  syncGardenBgmWithView();
}

function isSoundAllowed(soundId) {
  const settings = getSoundSettings();
  if (!settings.appSound) return false;
  if (soundId === "uiTap" || soundId === "close") return settings.cueSound !== false;
  if (soundId === "practiceComplete") return settings.completionSound !== false;
  if (soundId === "watering") return settings.wateringSound !== false;
  if (soundId === "evolveStart" || soundId === "evolveComplete") return settings.evolutionSound !== false;
  if (soundId === "gardenBgm") return settings.gardenMusic === true;
  return true;
}

function getSoundVolume(soundId) {
  return soundId === "gardenBgm" ? 0.28 : 0.82;
}

function getMetronomeGain(strong = false) {
  const volume = getSoundSettings().metronomeVolume || "medium";
  const base = volume === "low" ? 0.12 : volume === "high" ? 0.34 : 0.22;
  return strong ? base * 1.25 : base;
}

function isMetronomeAllowed() {
  return getSoundSettings().appSound !== false;
}

function playSound(soundId) {
  const fileName = soundMap[soundId];
  if (!fileName || !isSoundAllowed(soundId)) return;
  try {
    const audio = new Audio(getSoundAssetPath(fileName));
    audio.volume = getSoundVolume(soundId);
    const playPromise = audio.play();
    if (playPromise?.catch) {
      playPromise.catch((error) => console.warn(`Unable to play sound: ${soundId}`, error));
    }
  } catch (error) {
    console.warn(`Unable to create sound: ${soundId}`, error);
  }
}

function getGardenBgmAudio() {
  if (!gardenBgmAudio) {
    gardenBgmAudio = new Audio(getSoundAssetPath(soundMap.gardenBgm));
    gardenBgmAudio.loop = true;
    gardenBgmAudio.volume = getSoundVolume("gardenBgm");
  } else {
    gardenBgmAudio.loop = true;
  }
  return gardenBgmAudio;
}

function setGardenBgmVolume(volume) {
  const audio = getGardenBgmAudio();
  audio.volume = Math.max(0, Math.min(1, Number(volume) || 0));
}

function playGardenBgm() {
  if (!isSoundAllowed("gardenBgm")) {
    stopGardenBgm();
    return;
  }
  try {
    const audio = getGardenBgmAudio();
    audio.loop = true;
    setGardenBgmVolume(0.28);
    const playPromise = audio.play();
    if (playPromise?.catch) {
      playPromise.catch((error) => console.warn("Unable to play garden BGM.", error));
    }
  } catch (error) {
    console.warn("Unable to start garden BGM.", error);
  }
}

function stopGardenBgm() {
  if (gardenBgmAudio) gardenBgmAudio.pause();
}

function syncGardenBgmWithView() {
  if (currentView === "garden" && isSoundAllowed("gardenBgm")) {
    playGardenBgm();
  } else {
    stopGardenBgm();
  }
}

function renderSoundSettings() {
  const settings = getSoundSettings();
  const toggleMap = {
    appSoundToggle: "appSound",
    cueSoundToggle: "cueSound",
    completionSoundToggle: "completionSound",
    wateringSoundToggle: "wateringSound",
    evolutionSoundToggle: "evolutionSound",
    gardenMusicToggle: "gardenMusic",
  };
  Object.entries(toggleMap).forEach(([id, key]) => {
    const toggle = $(`#${id}`);
    if (toggle) toggle.checked = settings[key] !== false;
  });
  const metronomeVolumeSelect = $("#metronomeVolumeSelect");
  if (metronomeVolumeSelect) metronomeVolumeSelect.value = settings.metronomeVolume || "medium";
}

function bindSoundSettings() {
  const toggleMap = {
    appSoundToggle: "appSound",
    cueSoundToggle: "cueSound",
    completionSoundToggle: "completionSound",
    wateringSoundToggle: "wateringSound",
    evolutionSoundToggle: "evolutionSound",
    gardenMusicToggle: "gardenMusic",
  };
  Object.entries(toggleMap).forEach(([id, key]) => {
    const toggle = $(`#${id}`);
    if (!toggle) return;
    toggle.addEventListener("change", () => {
      hasSoundInteraction = true;
      setSoundSettings({ [key]: toggle.checked });
    });
  });
  $("#metronomeVolumeSelect")?.addEventListener("change", (event) => {
    setSoundSettings({ metronomeVolume: event.target.value });
  });
}

function getInteractionSoundId(event) {
  const target = event.target.closest("button, select, input[type='checkbox']");
  if (!target || target.disabled || target.id === "gardenPrimaryAction") return "";
  const closeIds = new Set([
    "goalToastClose",
    "calendarCloseBtn",
    "gardenSpiritModalClose",
    "longToneIntroClose",
    "practiceSettingsClose",
    "micGateSkip",
  ]);
  return closeIds.has(target.id) ? "close" : "uiTap";
}

function bindSoundFeedback() {
  if (soundFeedbackBound) return;
  soundFeedbackBound = true;
  document.addEventListener(
    "pointerdown",
    () => {
      hasSoundInteraction = true;
      syncGardenBgmWithView();
    },
    { once: true }
  );
  document.addEventListener(
    "click",
    (event) => {
      const soundId = getInteractionSoundId(event);
      if (soundId) playSound(soundId);
    },
    true
  );
}

function getDisplaySettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(DISPLAY_SETTINGS_KEY) || "{}");
    return { ...DEFAULT_DISPLAY_SETTINGS, ...stored };
  } catch (error) {
    console.warn("Unable to read display settings.", error);
    return { ...DEFAULT_DISPLAY_SETTINGS };
  }
}

function saveDisplaySettings(nextSettings) {
  try {
    localStorage.setItem(DISPLAY_SETTINGS_KEY, JSON.stringify(nextSettings));
  } catch (error) {
    console.warn("Unable to save display settings.", error);
  }
}

function setDisplaySettings(patch) {
  const nextSettings = { ...getDisplaySettings(), ...patch };
  saveDisplaySettings(nextSettings);
  renderDisplaySettings();
  applyDisplaySettings(nextSettings);
  renderHeroGarden();
}

function applyDisplaySettings(settings = getDisplaySettings()) {
  document.body.classList.toggle("simple-motion", settings.animationMode === "simple");
  document.body.classList.toggle("no-plant-idle", settings.plantIdleMotion === false);
  document.body.classList.toggle("no-evolution-effects", settings.evolutionEffects === false);
  document.body.classList.toggle("hide-featured-spirit", settings.showFeaturedSpirit === false);
  if (settings.plantIdleMotion === false) {
    window.clearTimeout(gardenHopTimer);
    $("#gardenPlantIdleLayer")?.classList.add("is-paused");
    $("#gardenPlantActionLayer")?.classList.remove("is-hopping");
  } else {
    $("#gardenPlantIdleLayer")?.classList.remove("is-paused");
  }
}

function renderDisplaySettings() {
  const settings = getDisplaySettings();
  const animationModeSelect = $("#animationModeSelect");
  if (animationModeSelect) animationModeSelect.value = settings.animationMode || "full";
  const toggleMap = {
    plantIdleMotionToggle: "plantIdleMotion",
    evolutionEffectsToggle: "evolutionEffects",
    showFeaturedSpiritToggle: "showFeaturedSpirit",
  };
  Object.entries(toggleMap).forEach(([id, key]) => {
    const toggle = $(`#${id}`);
    if (toggle) toggle.checked = settings[key] !== false;
  });
}

function bindDisplaySettings() {
  $("#animationModeSelect")?.addEventListener("change", (event) => {
    setDisplaySettings({ animationMode: event.target.value });
  });
  const toggleMap = {
    plantIdleMotionToggle: "plantIdleMotion",
    evolutionEffectsToggle: "evolutionEffects",
    showFeaturedSpiritToggle: "showFeaturedSpirit",
  };
  Object.entries(toggleMap).forEach(([id, key]) => {
    const toggle = $(`#${id}`);
    if (!toggle) return;
    toggle.addEventListener("change", () => setDisplaySettings({ [key]: toggle.checked }));
  });
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
  const pattern = getExercisePattern(exercise);
  if (["crescendo-8", "decrescendo-8"].includes(exercise.id)) {
    const firstDynamic = pattern[0]?.dynamic;
    const lastDynamic = pattern[pattern.length - 1]?.dynamic;
    return firstDynamic === lastDynamic ? [firstDynamic] : [firstDynamic, lastDynamic];
  }
  const markers = pattern.map((item) => item.dynamic);
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
  if (!pattern.length) return "";
  const firstDynamic = pattern[0].dynamic;
  if (pattern.every((item) => item.dynamic === firstDynamic)) {
    return firstDynamic;
  }
  if (pattern.length > 3) {
    return `${firstDynamic} → ${pattern[pattern.length - 1].dynamic}`;
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

function normalizeSelectedCycleCount(cycles) {
  const parsed = Number(cycles);
  if (!Number.isFinite(parsed)) return MIN_REWARD_CYCLES;
  if (parsed < MIN_REWARD_CYCLES) return MIN_REWARD_CYCLES;
  if (parsed > MAX_SELECTABLE_CYCLES) return MAX_SELECTABLE_CYCLES;
  const even = Math.floor(parsed / 2) * 2;
  return Math.max(MIN_REWARD_CYCLES, Math.min(even, MAX_SELECTABLE_CYCLES));
}

function calculateWaterReward(completedCycles) {
  const actual = Math.floor(Number(completedCycles));
  if (!Number.isFinite(actual) || actual < MIN_REWARD_CYCLES) return 0;
  return Math.min(actual, getRemainingDailyWaterReward());
}

function getDailyWaterRewardState() {
  const todayKey = getTodayKey();
  const stored = readJsonStorage(gardenStorageKeys.dailyReward, null);
  if (!stored || stored.date !== todayKey) {
    return { date: todayKey, earned: 0 };
  }
  return {
    date: todayKey,
    earned: Math.max(0, Math.floor(Number(stored.earned) || 0)),
  };
}

function setDailyWaterRewardState(state) {
  localStorage.setItem(gardenStorageKeys.dailyReward, JSON.stringify({
    date: state.date || getTodayKey(),
    earned: Math.max(0, Math.floor(Number(state.earned) || 0)),
  }));
}

function getRemainingDailyWaterReward() {
  const state = getDailyWaterRewardState();
  return Math.max(0, MAX_DAILY_WATER_REWARD - state.earned);
}

function getWaterDrops() {
  const value = Number(localStorage.getItem(gardenStorageKeys.waterDrops));
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function setWaterDrops(value) {
  localStorage.setItem(gardenStorageKeys.waterDrops, String(Math.max(0, Math.floor(Number(value) || 0))));
}

function getGardenCollection() {
  return readJsonStorage(gardenStorageKeys.collection, []).map((item) => ({
    ...item,
    name: normalizeGardenName(item.name, item.species),
  }));
}

function setGardenCollection(collection) {
  localStorage.setItem(gardenStorageKeys.collection, JSON.stringify(collection));
}

function getGardenSpecies(speciesId) {
  return gardenSpecies.find((species) => species.species === speciesId) || gardenSpecies[0];
}

function normalizeGardenName(name, speciesId = "") {
  if (speciesId === "mushroom-spirit" && name === "菌菇口琴靈") return "菇鳴靈";
  return name;
}

function getPlantDisplayName(plant) {
  const species = getGardenSpecies(plant?.species);
  return normalizeGardenName(plant?.name || species.name, plant?.species || species.species);
}

function isValidGardenSpiritName(name) {
  const value = name.trim();
  return /^[\u4e00-\u9fff]{1,7}$/.test(value) || /^[A-Za-z]{1,14}$/.test(value);
}

function getPlantStage(progress) {
  if (progress >= getStageStartProgress(3)) return 3;
  if (progress >= getStageStartProgress(2)) return 2;
  return 1;
}

function getStageStartProgress(stage) {
  return PLANT_STAGE_WATER_REQUIREMENTS
    .slice(0, Math.max(0, stage - 1))
    .reduce((total, amount) => total + amount, 0);
}

function getStageWaterRequired(stage) {
  return PLANT_STAGE_WATER_REQUIREMENTS[Math.max(1, Math.min(3, stage)) - 1];
}

function getStageProgress(progress, stage) {
  const stageStart = getStageStartProgress(stage);
  const stageRequired = getStageWaterRequired(stage);
  return Math.max(0, Math.min(stageRequired, progress - stageStart));
}

function getStageLabel(stage) {
  return stage === 3 ? "成熟前" : stage === 2 ? "成長中" : "幼苗";
}

function createGardenPlant(speciesId = "") {
  const species = speciesId ? getGardenSpecies(speciesId) : gardenSpecies[Math.floor(Math.random() * gardenSpecies.length)];
  const now = new Date().toISOString();
  return {
    id: `plant-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    species: species.species,
    name: species.name,
    stage: 1,
    waterProgress: 0,
    waterRequired: PLANT_WATER_REQUIRED,
    createdAt: now,
    harvested: false,
  };
}

function getCurrentPlant() {
  const stored = readJsonStorage(gardenStorageKeys.currentPlant, null);
  if (stored?.id) {
    const progress = Math.max(0, Math.min(PLANT_WATER_REQUIRED, Number(stored.waterProgress) || 0));
    return {
      ...stored,
      name: normalizeGardenName(stored.name, stored.species),
      waterProgress: progress,
      waterRequired: PLANT_WATER_REQUIRED,
      stage: getPlantStage(progress),
    };
  }
  const plant = createGardenPlant("melody-sprout");
  setCurrentPlant(plant);
  return plant;
}

function setCurrentPlant(plant) {
  localStorage.setItem(gardenStorageKeys.currentPlant, JSON.stringify(plant));
}

function getPlantImage(plant) {
  const species = getGardenSpecies(plant?.species);
  const stage = Math.max(1, Math.min(3, plant?.stage || getPlantStage(plant?.waterProgress || 0)));
  return species.images[stage - 1];
}

function getFeaturedSpiritId() {
  return localStorage.getItem(gardenStorageKeys.featured) || "";
}

function setFeaturedSpiritId(id) {
  if (id) localStorage.setItem(gardenStorageKeys.featured, id);
}

function getFeaturedSpiritStage() {
  const value = Number(localStorage.getItem(gardenStorageKeys.featuredStage));
  return [1, 2, 3].includes(value) ? value : 3;
}

function setFeaturedSpiritStage(stage) {
  const nextStage = Math.max(1, Math.min(3, Number(stage) || 3));
  localStorage.setItem(gardenStorageKeys.featuredStage, String(nextStage));
}

function getCollectedSpiritById(id) {
  return getGardenCollection().find((item) => item.id === id) || null;
}

function updateCollectedSpirit(id, updater) {
  const collection = getGardenCollection();
  const nextCollection = collection.map((item) => (
    item.id === id ? { ...item, ...updater(item) } : item
  ));
  setGardenCollection(nextCollection);
  return nextCollection.find((item) => item.id === id) || null;
}

function addWaterDrops(amount) {
  const added = Math.max(0, Math.floor(Number(amount) || 0));
  if (!added) return 0;
  setWaterDrops(getWaterDrops() + added);
  return added;
}

function addEarnedWaterDrops(amount) {
  const state = getDailyWaterRewardState();
  const added = Math.min(Math.max(0, Math.floor(Number(amount) || 0)), getRemainingDailyWaterReward());
  if (!added) return 0;
  setWaterDrops(getWaterDrops() + added);
  setDailyWaterRewardState({ ...state, earned: state.earned + added });
  return added;
}

function maybeTriggerRainBonus() {
  const todayKey = getTodayKey();
  const state = readJsonStorage(gardenStorageKeys.rainBonus, {});
  if (state.lastTriggeredDate === todayKey && state.todayTriggered) {
    return { triggered: false, amount: 0 };
  }
  const remainingDailyReward = getRemainingDailyWaterReward();
  if (remainingDailyReward <= 0) return { triggered: false, amount: 0 };
  if (Math.random() >= RAIN_BONUS_CHANCE) return { triggered: false, amount: 0 };
  const amount = addEarnedWaterDrops(Math.min(RAIN_BONUS_AMOUNT, remainingDailyReward));
  if (!amount) return { triggered: false, amount: 0 };
  localStorage.setItem(gardenStorageKeys.rainBonus, JSON.stringify({
    lastTriggeredDate: todayKey,
    todayTriggered: true,
  }));
  return { triggered: true, amount };
}

function awardGardenWaterForPractice(completedCycles) {
  const water = calculateWaterReward(completedCycles);
  const addedWater = addEarnedWaterDrops(water);
  const rain = addedWater > 0 ? maybeTriggerRainBonus() : { triggered: false, amount: 0 };
  renderGarden();
  if (rain.triggered) playRainBonusAnimation();
  return { cycles: Math.floor(Number(completedCycles)) || 0, water: addedWater, rain };
}

function formatWaterRewardText(waterResult) {
  if (!waterResult?.water) return "";
  const rainText = waterResult.rain?.triggered
    ? ` 下雨了，額外獲得 ${waterResult.rain.amount} 滴水滴。`
    : "";
  return `獲得 ${waterResult.water} 滴花園水滴。${rainText}`;
}

function restartElementAnimation(element, className, duration = 900) {
  if (!element) return;
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
  window.setTimeout(() => element.classList.remove(className), duration);
}

function clearGardenFx() {
  const layer = $("#gardenFxLayer");
  if (layer) layer.innerHTML = "";
}

function playWateringAnimation(stageChanged = false) {
  const layer = $("#gardenFxLayer");
  const scene = $(".garden-plant-scene");
  const displaySettings = getDisplaySettings();
  if (displaySettings.plantIdleMotion !== false) suspendGardenIdle(stageChanged ? GARDEN_EVOLUTION_NOTICE_DELAY_MS : 760);
  if (stageChanged && displaySettings.evolutionEffects !== false) restartElementAnimation(scene, "is-evolving", 1680);
  restartElementAnimation($("#gardenPrimaryAction"), "is-pressing", 760);
  restartElementAnimation($("#gardenWateringCan"), "is-watering", 860);
  restartElementAnimation($(".water-balance"), "is-updated", 520);
  restartElementAnimation($("#gardenProgressBar")?.parentElement, "is-updated", 760);
  restartElementAnimation($("#gardenPlantActionLayer"), stageChanged ? "is-stage-up" : "is-watered", stageChanged ? 1680 : 680);
  if (!layer) return;
  clearGardenFx();
  const drops = [
    { left: 67, top: 24, delay: 40 },
    { left: 62, top: 28, delay: 120 },
    { left: 70, top: 30, delay: 200 },
    { left: 65, top: 34, delay: 280 },
    { left: 60, top: 37, delay: 360 },
  ];
  drops.forEach((item, index) => {
    const drop = document.createElement("span");
    drop.className = `water-drop-animation watering-droplet droplet-${index + 1}`;
    drop.textContent = "💧";
    drop.style.setProperty("--drop-left", `${item.left}%`);
    drop.style.setProperty("--drop-top", `${item.top}%`);
    drop.style.animationDelay = `${item.delay}ms`;
    layer.appendChild(drop);
  });
  if (stageChanged) {
    const marks = displaySettings.evolutionEffects === false ? ["♪"] : ["♪", "✦", "♬", "✧"];
    marks.forEach((mark, index) => {
      const pop = document.createElement("span");
      pop.className = "stage-pop-animation";
      pop.textContent = mark;
      pop.style.setProperty("--pop-left", `${38 + index * 8}%`);
      pop.style.setProperty("--pop-top", `${32 + (index % 2) * 10}%`);
      pop.style.animationDelay = `${index * 70}ms`;
      layer.appendChild(pop);
    });
  }
  window.setTimeout(clearGardenFx, stageChanged ? 1800 : 1250);
}

function playRainBonusAnimation() {
  const layer = $("#gardenFxLayer");
  if (!layer) return;
  clearGardenFx();
  const cloud = document.createElement("span");
  cloud.className = "rain-bonus-cloud";
  cloud.textContent = "☁️";
  layer.appendChild(cloud);
  [16, 28, 42, 56, 70, 82].forEach((left, index) => {
    const rain = document.createElement("span");
    rain.className = "rain-drop-animation rain-drop";
    rain.textContent = "💧";
    rain.style.setProperty("--rain-left", `${left}%`);
    rain.style.animationDelay = `${index * 55}ms`;
    layer.appendChild(rain);
  });
  suspendGardenIdle(820);
  restartElementAnimation($("#gardenPlantActionLayer"), "is-watered", 720);
  window.setTimeout(clearGardenFx, 1300);
}

function suspendGardenIdle(duration = 900) {
  const idleLayer = $("#gardenPlantIdleLayer");
  const actionLayer = $("#gardenPlantActionLayer");
  if (!idleLayer) return;
  idleLayer.classList.add("is-paused");
  actionLayer?.classList.remove("is-hopping");
  window.clearTimeout(gardenIdleResumeTimer);
  gardenIdleResumeTimer = window.setTimeout(() => {
    idleLayer.classList.remove("is-paused");
  }, duration);
}

function triggerGardenPlantHop() {
  if (getDisplaySettings().plantIdleMotion === false) return;
  const scene = $(".garden-plant-scene");
  const idleLayer = $("#gardenPlantIdleLayer");
  const actionLayer = $("#gardenPlantActionLayer");
  if (!actionLayer || !idleLayer) return;
  if (scene?.classList.contains("is-evolving")) return;
  if (idleLayer.classList.contains("is-paused")) return;
  if (["is-watered", "is-stage-up"].some((className) => actionLayer.classList.contains(className))) return;
  restartElementAnimation(actionLayer, "is-hopping", 680);
}

function scheduleGardenPlantHop() {
  window.clearTimeout(gardenHopTimer);
  if (getDisplaySettings().plantIdleMotion === false) return;
  const delay = 9000 + Math.round(Math.random() * 5000);
  gardenHopTimer = window.setTimeout(() => {
    triggerGardenPlantHop();
    scheduleGardenPlantHop();
  }, delay);
}

function renderHeroGarden() {
  const displaySettings = getDisplaySettings();
  document.body.classList.toggle("hide-featured-spirit", displaySettings.showFeaturedSpirit === false);
  const collection = getGardenCollection();
  const featuredId = getFeaturedSpiritId();
  const featured = collection.find((item) => item.id === featuredId);
  const plant = featured || getCurrentPlant();
  const heroImage = $("#heroGardenPlant");
  if (!heroImage) return;
  const heroSlot = $(".hero-plant-slot");
  if (heroSlot) heroSlot.setAttribute("aria-hidden", displaySettings.showFeaturedSpirit === false ? "true" : "false");
  heroImage.src = featured ? getPlantImage({ ...featured, stage: getFeaturedSpiritStage() }) : getPlantImage(plant);
  $("#heroGardenName").textContent = getPlantDisplayName(plant);
  const heroGardenHint = $("#heroGardenHint");
  if (heroGardenHint) {
    heroGardenHint.textContent = "";
    heroGardenHint.hidden = true;
  }
}

function setGardenSpiritModalOpen(open) {
  const modal = $("#gardenSpiritModal");
  if (!modal) return;
  modal.classList.toggle("hidden", !open);
}

function renderGardenSpiritModal() {
  const spirit = getCollectedSpiritById(selectedGardenSpiritId);
  if (!spirit) return;
  const title = $("#gardenSpiritModalTitle");
  const subtitle = $("#gardenSpiritModalSubtitle");
  const description = $("#gardenSpiritDescription");
  const list = $("#gardenSpiritStageList");
  const species = getGardenSpecies(spirit.species);
  const displayName = getPlantDisplayName(spirit);
  if (title) title.textContent = displayName;
  if (subtitle) subtitle.textContent = "左右滑動查看三種形態，選一個放到首頁展示。";
  if (description) description.textContent = species.description || "";
  if (list) {
    list.innerHTML = [1, 2, 3].map((stage) => `
      <button class="garden-spirit-stage-card stage-${stage} ${stage === selectedGardenSpiritStage ? "active" : ""}" data-spirit-stage="${stage}" type="button" aria-label="查看第 ${stage} 階段">
        <img src="${getPlantImage({ ...spirit, stage })}" alt="" />
        <span>第 ${stage} 階段</span>
      </button>
    `).join("");
    requestAnimationFrame(() => {
      list.querySelector(".garden-spirit-stage-card.active")?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    });
  }
}

function openGardenSpiritModal(id) {
  const spirit = getCollectedSpiritById(id);
  if (!spirit) return;
  selectedGardenSpiritId = id;
  selectedGardenSpiritStage = getFeaturedSpiritId() === id ? getFeaturedSpiritStage() : 3;
  renderGardenSpiritModal();
  setGardenSpiritModalOpen(true);
}

function closeGardenSpiritModal() {
  setGardenSpiritModalOpen(false);
}

function setGardenRenameModalOpen(isOpen) {
  const modal = $("#gardenRenameModal");
  if (!modal) return;
  modal.classList.toggle("hidden", !isOpen);
}

function openGardenRenameModal() {
  const spirit = getCollectedSpiritById(selectedGardenSpiritId);
  const input = $("#gardenRenameInput");
  if (!spirit || !input) return;
  input.value = getPlantDisplayName(spirit);
  setGardenRenameModalOpen(true);
  requestAnimationFrame(() => {
    input.focus();
    input.select();
  });
}

function closeGardenRenameModal() {
  setGardenRenameModalOpen(false);
}

function saveGardenSpiritName() {
  const spirit = getCollectedSpiritById(selectedGardenSpiritId);
  const input = $("#gardenRenameInput");
  if (!spirit || !input) return;
  const name = input.value.trim();
  if (!name) {
    showGardenToast("請輸入名字", "名字可以使用 7 個中文字以內，或 14 個英文字母以內。");
    return;
  }
  if (!isValidGardenSpiritName(name)) {
    showGardenToast("名字太長", "請使用 7 個中文字以內，或 14 個英文字母以內。");
    return;
  }
  const updated = updateCollectedSpirit(spirit.id, () => ({ name }));
  if (!updated) return;
  renderGardenCollection();
  renderHeroGarden();
  renderGardenSpiritModal();
  closeGardenRenameModal();
  showGardenToast("名字已更新", `已改名為「${getPlantDisplayName(updated)}」。`);
}

function editGardenSpiritName() {
  openGardenRenameModal();
}

function setSelectedGardenSpiritFeatured() {
  const spirit = getCollectedSpiritById(selectedGardenSpiritId);
  if (!spirit) return;
  setFeaturedSpiritId(spirit.id);
  setFeaturedSpiritStage(selectedGardenSpiritStage);
  renderGarden();
  closeGardenSpiritModal();
  showGardenToast("已更新首頁展示", `「${getPlantDisplayName(spirit)}」第 ${selectedGardenSpiritStage} 階段會出現在首頁。`);
}

function renderGardenCollection() {
  const container = $("#gardenCollection");
  if (!container) return;
  const collection = getGardenCollection();
  const featuredId = getFeaturedSpiritId();
  const featuredStage = getFeaturedSpiritStage();
  const cells = Array.from({ length: 50 }, (_, index) => {
    const slot = index + 1;
    const collected = collection[index];
    if (collected) {
      const featured = collected.id === featuredId;
      const previewStage = featured ? featuredStage : 3;
      return `
        <div class="garden-collection-cell ${featured ? "featured" : ""}">
          <span class="slot-number">${slot}</span>
          <button data-open-spirit="${collected.id}" type="button" aria-label="查看 ${getPlantDisplayName(collected)}">
            <img class="garden-collection-spirit-thumb collection-${collected.species} collection-stage-${previewStage}" src="${getPlantImage({ ...collected, stage: previewStage })}" alt="" />
          </button>
        </div>
      `;
    }
    if (slot === 1) {
      return `
        <div class="garden-collection-cell empty">
          <span class="slot-number">1</span>
          <img src="./public/assets/garden/collection/starter-pot.png" alt="" />
        </div>
      `;
    }
    if (slot === 2 || slot === 3) {
      return `
        <div class="garden-collection-cell locked">
          <span class="slot-number">${slot}</span>
          <img src="./public/assets/garden/collection/locked-shadow.png" alt="" />
        </div>
      `;
    }
    return `
      <div class="garden-collection-cell empty">
        <span class="slot-number">${slot}</span>
        <img src="./public/assets/garden/collection/spirit-slot-empty.png" alt="" />
      </div>
    `;
  });
  container.innerHTML = cells.join("");
}

function renderGarden() {
  const plant = getCurrentPlant();
  const progress = Math.max(0, Math.min(PLANT_WATER_REQUIRED, plant.waterProgress || 0));
  plant.stage = getPlantStage(progress);
  setCurrentPlant(plant);
  const ready = progress >= PLANT_WATER_REQUIRED;
  const stageRequired = getStageWaterRequired(plant.stage);
  const stageProgress = getStageProgress(progress, plant.stage);
  const stageNeed = Math.max(0, stageRequired - stageProgress);
  const stageNeedText = plant.stage >= 3
    ? `還需要 ${stageNeed} 滴水可採收。`
    : `還需要 ${stageNeed} 滴水進入下一階段。`;
  if ($("#waterDropCount")) $("#waterDropCount").textContent = getWaterDrops();
  if ($("#gardenPlantName")) $("#gardenPlantName").textContent = getPlantDisplayName(plant);
  if ($("#gardenPlantStage")) $("#gardenPlantStage").textContent = ready ? "可採收" : getStageLabel(plant.stage);
  const plantImage = $("#gardenPlantImage");
  if (plantImage) {
    plantImage.src = getPlantImage(plant);
    plantImage.classList.remove("garden-stage-1", "garden-stage-2", "garden-stage-3");
    plantImage.classList.add(`garden-stage-${plant.stage}`);
  }
  ["gardenPlantIdleLayer", "gardenPlantActionLayer"].forEach((id) => {
    const layer = $(`#${id}`);
    if (!layer) return;
    layer.classList.remove("garden-stage-1", "garden-stage-2", "garden-stage-3");
    layer.classList.add(`garden-stage-${plant.stage}`);
  });
  if ($("#gardenProgressText")) $("#gardenProgressText").textContent = `${stageProgress} / ${stageRequired}`;
  if ($("#gardenProgressBar")) $("#gardenProgressBar").style.width = `${Math.min(100, (stageProgress / stageRequired) * 100)}%`;
  if ($("#gardenNeedText")) $("#gardenNeedText").textContent = ready ? "植物已成熟，可以採收。" : stageNeedText;
  const primaryAction = $("#gardenPrimaryAction");
  const actionIcon = $("#gardenWateringCan");
  if (primaryAction) {
    if (ready) {
      primaryAction.setAttribute("aria-label", "採收植物");
      primaryAction.title = "採收植物";
      primaryAction.disabled = false;
      primaryAction.classList.remove("is-empty");
      primaryAction.classList.add("is-harvest-ready");
      if (actionIcon) actionIcon.src = GARDEN_SHOVEL_SRC;
    } else if (getWaterDrops() <= 0) {
      primaryAction.setAttribute("aria-label", "沒有水滴可澆");
      primaryAction.title = "沒有水滴可澆";
      primaryAction.disabled = false;
      primaryAction.classList.remove("is-harvest-ready");
      primaryAction.classList.add("is-empty");
      if (actionIcon) actionIcon.src = GARDEN_WATERING_CAN_SRC;
    } else {
      primaryAction.setAttribute("aria-label", "澆水");
      primaryAction.title = "澆水";
      primaryAction.disabled = false;
      primaryAction.classList.remove("is-harvest-ready");
      primaryAction.classList.remove("is-empty");
      if (actionIcon) actionIcon.src = GARDEN_WATERING_CAN_SRC;
    }
  }
  renderGardenCollection();
  renderHeroGarden();
}

function waterCurrentPlant() {
  const plant = getCurrentPlant();
  const remaining = Math.max(0, PLANT_WATER_REQUIRED - (plant.waterProgress || 0));
  if (remaining <= 0) {
    showGardenToast("植物已成熟", "可以先採收這株植物。");
    return;
  }
  const available = getWaterDrops();
  const used = Math.min(available, remaining);
  if (used <= 0) {
    restartElementAnimation($("#gardenPrimaryAction"), "is-empty-tap", 520);
    restartElementAnimation($(".water-balance"), "is-updated", 520);
    showGardenToast("水滴不夠", "水滴不夠，先去完成練習吧。");
    return;
  }
  const previousProgress = plant.waterProgress || 0;
  const previousStage = getPlantStage(previousProgress);
  setWaterDrops(available - used);
  plant.waterProgress = Math.min(PLANT_WATER_REQUIRED, previousProgress + used);
  plant.stage = getPlantStage(plant.waterProgress);
  setCurrentPlant(plant);
  renderGarden();
  const becameMature = plant.waterProgress >= PLANT_WATER_REQUIRED && previousProgress < PLANT_WATER_REQUIRED;
  const stageChanged = plant.stage > previousStage || becameMature;
  playSound("watering");
  if (stageChanged) {
    playSound("evolveStart");
    window.setTimeout(() => playSound("evolveComplete"), 1650);
  }
  playWateringAnimation(stageChanged);
  if (plant.waterProgress >= PLANT_WATER_REQUIRED) {
    showGardenToastAfterAnimation(`${getPlantDisplayName(plant)}成熟了！`, "可以採收這株植物了。", GARDEN_EVOLUTION_NOTICE_DELAY_MS);
  } else if (plant.stage > previousStage) {
    showGardenToastAfterAnimation(`${getPlantDisplayName(plant)}長大了！`, `進入第 ${plant.stage} 階段。`, GARDEN_EVOLUTION_NOTICE_DELAY_MS);
  }
}

function harvestCurrentPlant() {
  const plant = getCurrentPlant();
  if ((plant.waterProgress || 0) < PLANT_WATER_REQUIRED) return;
  const collection = getGardenCollection();
  const harvestedName = getPlantDisplayName(plant);
  const harvested = {
    ...plant,
    id: `spirit-${Date.now()}-${collection.length + 1}`,
    name: harvestedName,
    stage: 3,
    waterProgress: PLANT_WATER_REQUIRED,
    harvested: true,
    harvestedAt: new Date().toISOString(),
  };
  collection.push(harvested);
  setGardenCollection(collection.slice(0, 50));
  if (!getFeaturedSpiritId()) setFeaturedSpiritId(harvested.id);
  setCurrentPlant(createGardenPlant());
  renderGarden();
  playSound("harvest");
  showGardenToast("採收成功！", `「${harvestedName}」已加入圖鑑。`);
}

function setGoalToastEyebrow(label = "每日目標") {
  const eyebrow = $("#goalToastEyebrow");
  if (eyebrow) eyebrow.textContent = label;
}

function showGardenToast(title, text) {
  setGoalToastEyebrow("精靈花園");
  $("#goalToastTitle").textContent = title;
  $("#goalToastText").textContent = text;
  $("#goalToast").classList.remove("hidden");
}

function showGardenToastAfterAnimation(title, text, delay = 1900) {
  window.setTimeout(() => showGardenToast(title, text), delay);
}

const FREEZE_MAX = 2;
const FREEZE_INITIAL = 0;
const FREEZE_REWARD_INTERVAL = 3;

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
  const stored = localStorage.getItem("chromatica.freezeCount");
  if (stored !== null) {
    const value = Number(stored);
    return Number.isFinite(value) ? value : FREEZE_INITIAL;
  }
  setFreezeCount(FREEZE_INITIAL);
  return FREEZE_INITIAL;
}

function setFreezeCount(value) {
  const nextValue = Math.max(0, Math.min(FREEZE_MAX, value));
  localStorage.setItem("chromatica.freezeCount", String(nextValue));
  localStorage.setItem("freezeCount", String(nextValue));
}

function getLongestStreak() {
  const value = Number(localStorage.getItem("longestStreak"));
  return Number.isFinite(value) ? value : 0;
}

function setLongestStreak(value) {
  localStorage.setItem("longestStreak", String(Math.max(0, value)));
}

function getLastRewardedStreak() {
  const value = Number(localStorage.getItem("chromatica.lastRewardedStreak"));
  return Number.isFinite(value) ? value : 0;
}

function setLastRewardedStreak(value) {
  localStorage.setItem("chromatica.lastRewardedStreak", String(Math.max(0, value)));
}

function getHistoryStatus(entry) {
  if (!entry) return "";
  const status = typeof entry === "string" ? entry : entry.status || "";
  return status === "frozen" ? "freeze" : status;
}

function getHistoryPracticeCount(entry) {
  if (!entry) return 0;
  if (typeof entry === "string") return entry === "completed" ? 1 : 0;
  return entry.practiceCount || (entry.status === "completed" ? 1 : 0);
}

function isPracticeProtected(history, dateKey) {
  const status = getHistoryStatus(history[dateKey]);
  return status === "completed" || status === "freeze";
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
  return Object.entries(history).filter(([dateKey, entry]) => dateKey.startsWith(prefix) && getHistoryStatus(entry) === "completed").length;
}

function updateLongestStreak(history) {
  const current = calculateCurrentStreak(history);
  const longest = Math.max(getLongestStreak(), current);
  setLongestStreak(longest);
  return longest;
}

function parseDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function daysBetweenKeys(startKey, endKey) {
  const start = parseDateKey(startKey);
  const end = parseDateKey(endKey);
  return Math.round((end - start) / 86400000);
}

function getPreviousProtectedDateKey(history, todayKey) {
  return Object.keys(history)
    .filter((dateKey) => dateKey < todayKey && isPracticeProtected(history, dateKey))
    .sort()
    .pop() || "";
}

function maybeRewardFreeze(currentStreak) {
  if (currentStreak <= 0 || currentStreak % FREEZE_REWARD_INTERVAL !== 0) {
    return { rewarded: false, freezeCount: getFreezeCount() };
  }
  if (currentStreak === getLastRewardedStreak()) {
    return { rewarded: false, freezeCount: getFreezeCount() };
  }
  const currentFreezeCount = getFreezeCount();
  const nextFreezeCount = Math.min(FREEZE_MAX, currentFreezeCount + 1);
  setFreezeCount(nextFreezeCount);
  setLastRewardedStreak(currentStreak);
  return { rewarded: nextFreezeCount > currentFreezeCount, freezeCount: nextFreezeCount };
}

function autoApplyFreezeIfNeeded(history, todayKey) {
  const previousKey = getPreviousProtectedDateKey(history, todayKey);
  if (!previousKey) {
    return {
      applied: false,
      usedCount: 0,
      missedDays: 0,
      streakPreserved: false,
      streakRestarted: true,
      insufficient: false,
    };
  }

  const gapDays = daysBetweenKeys(previousKey, todayKey);
  const missedDays = Math.max(0, gapDays - 1);
  if (missedDays === 0) {
    return {
      applied: false,
      usedCount: 0,
      missedDays: 0,
      streakPreserved: true,
      streakRestarted: false,
      insufficient: false,
    };
  }

  const freezeCount = getFreezeCount();
  if (freezeCount < missedDays) {
    return {
      applied: false,
      usedCount: 0,
      missedDays,
      streakPreserved: false,
      streakRestarted: true,
      insufficient: true,
    };
  }

  const previousDate = parseDateKey(previousKey);
  for (let offset = 1; offset <= missedDays; offset += 1) {
    const freezeKey = getDateKey(addDays(previousDate, offset));
    history[freezeKey] = {
      status: "freeze",
      frozenAt: new Date().toISOString(),
    };
  }
  setFreezeCount(freezeCount - missedDays);
  return {
    applied: true,
    usedCount: missedDays,
    missedDays,
    streakPreserved: true,
    streakRestarted: false,
    insufficient: false,
  };
}

function markPracticeCompletedToday() {
  const history = getPracticeHistory();
  const todayKey = getTodayKey();
  const currentEntry = history[todayKey];
  const isFirstCompletionToday = getHistoryStatus(currentEntry) !== "completed";
  let freezeResult = {
    applied: false,
    usedCount: 0,
    missedDays: 0,
    streakPreserved: true,
    streakRestarted: false,
    insufficient: false,
  };
  if (isFirstCompletionToday) {
    freezeResult = autoApplyFreezeIfNeeded(history, todayKey);
    history[todayKey] = {
      status: "completed",
      completedAt: new Date().toISOString(),
      practiceCount: 1,
    };
  } else if (typeof currentEntry === "object") {
    currentEntry.practiceCount = getHistoryPracticeCount(currentEntry) + 1;
    history[todayKey] = currentEntry;
  } else {
    history[todayKey] = {
      status: "completed",
      completedAt: new Date().toISOString(),
      practiceCount: getHistoryPracticeCount(currentEntry) + 1,
    };
  }
  setPracticeHistory(history);
  const currentStreak = calculateCurrentStreak(history);
  updateLongestStreak(history);
  const reward = isFirstCompletionToday
    ? maybeRewardFreeze(currentStreak)
    : { rewarded: false, freezeCount: getFreezeCount() };
  return { isFirstCompletionToday, currentStreak, reward, freezeResult };
}

function getMonthCalendarDays(history) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const leadingBlanks = (firstDay.getDay() + 6) % 7;
  const days = Array.from({ length: leadingBlanks }, () => null);
  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    days.push(new Date(year, month, day));
  }
  while (days.length % 7 !== 0) days.push(null);
  return days.map((date) => {
    if (!date) return { blank: true };
    const key = getDateKey(date);
    const status = getHistoryStatus(history[key]);
    const isToday = key === getTodayKey();
    const isFuture = date > today && !isToday;
    const isPast = date < new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return {
      key,
      day: date.getDate(),
      status,
      isToday,
      isFuture,
      isMissed: isPast && !status,
    };
  });
}

function renderStreakCalendar(history) {
  const today = new Date();
  $("#calendarMonthTitle").textContent = `${today.getFullYear()} 年 ${today.getMonth() + 1} 月`;
  const days = getMonthCalendarDays(history);
  $("#streakCalendarGrid").innerHTML = days
    .map((item) => {
      if (item.blank) return `<span class="calendar-day blank" aria-hidden="true"></span>`;
      const className = [
        item.status === "completed" ? "done" : "",
        item.status === "freeze" ? "frozen" : "",
        item.isMissed ? "missed" : "",
        item.isToday ? "today" : "",
        item.isFuture ? "future" : "",
      ].filter(Boolean).join(" ");
      const marker = item.status === "completed" ? "♪" : item.status === "freeze" ? "❄" : "";
      return `<span class="calendar-day ${className}"><b>${item.day}</b><i>${marker}</i></span>`;
    })
    .join("");
}

function renderStreakSummary() {
  const history = getPracticeHistory();
  const todayCompleted = getHistoryStatus(history[getTodayKey()]) === "completed";
  const currentStreak = calculateCurrentStreak(history);
  const longest = updateLongestStreak(history);
  const todayWeekday = new Date().getDay() || 7;
  $("#streakDays").textContent = currentStreak;
  $("#freezeCount").textContent = getFreezeCount();
  $("#modalFreezeCount").textContent = getFreezeCount();
  $("#modalCurrentStreak").textContent = currentStreak;
  $("#todayPracticeStatus").textContent = todayCompleted ? "今日已完成" : "今日尚未完成";
  $("#todayPracticeStatus").classList.toggle("complete", todayCompleted);
  $("#streakNote").textContent = todayCompleted
    ? "今天已完成練習，明天再來延續紀錄。"
    : "今天完成第一次有效練習，就能延續你的紀錄。";
  $("#longestStreak").textContent = longest;
  $("#monthCompletedDays").textContent = calculateMonthCompletedDays(history);
  $$("[data-weekday]").forEach((day) => {
    day.classList.toggle("today", Number(day.dataset.weekday) === todayWeekday);
  });
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

function getExerciseDailyGoalCombos(exercise) {
  if (exercise.scored) {
    return targetVolumes.map((volume) => ({
      id: `volume-${volume}`,
      label: volume,
      volume,
      variantIndex: null,
      pattern: [
        { beat: 1, dynamic: volume },
        { beat: exercise.playBeats, dynamic: volume },
      ],
    }));
  }
  if (exercise.variants?.length) {
    return exercise.variants.map((variant, variantIndex) => ({
      id: `variant-${variantIndex}`,
      label: variant.label,
      volume: null,
      variantIndex,
      pattern: variant.pattern,
    }));
  }
  return [{
    id: "default",
    label: getPatternSummary(exercise.pattern),
    volume: null,
    variantIndex: null,
    pattern: exercise.pattern,
  }];
}

function getDailyGoalCompletedCombos(state, task) {
  if (task.type === "interval") {
    const entry = state[INTERVAL_DAILY_GOAL_STATE_KEY];
    return [...new Set(Array.isArray(entry?.completedCombos) ? entry.completedCombos : [])];
  }
  const entry = state[task.id];
  if (entry === true) return task.combos.map((combo) => combo.id);
  const storedCombos = Array.isArray(entry?.completedCombos) ? entry.completedCombos : [];
  const legacyCombos = task.combos
    .filter((combo) => {
      if (combo.volume) return state[`${task.id}-${combo.volume}`] === true;
      if (combo.variantIndex !== null && combo.variantIndex !== undefined) {
        return state[`${task.id}-variant-${combo.variantIndex}`] === true;
      }
      return false;
    })
    .map((combo) => combo.id);
  return [...new Set([...storedCombos, ...legacyCombos])]
    .filter((comboId) => task.combos.some((combo) => combo.id === comboId));
}

function getDailyGoalProgress(state, task) {
  const completedCombos = getDailyGoalCompletedCombos(state, task);
  const required = task.type === "interval"
    ? task.required
    : Math.min(DAILY_GOAL_REQUIRED_COMBOS, task.combos.length);
  return {
    completedCombos,
    completedCount: Math.min(completedCombos.length, required),
    required,
    done: completedCombos.length >= required,
  };
}

function getNextDailyGoalCombo(task, state = getDailyGoalState()) {
  if (task.type === "interval") return null;
  const completed = new Set(getDailyGoalCompletedCombos(state, task));
  return task.combos.find((combo) => !completed.has(combo.id)) || task.combos[0];
}

function getDailyGoalTasks() {
  const longToneTasks = exercises.map((exercise, exerciseIndex) => ({
    id: exercise.id,
    type: "longtone",
    exerciseIndex,
    title: exercise.title,
    level: exercise.level,
    playBeats: exercise.playBeats,
    combos: getExerciseDailyGoalCombos(exercise),
  }));
  const intervalTasks = INTERVAL_DAILY_GOAL_TASKS.map((task) => ({
    ...task,
    type: "interval",
    exerciseIndex: null,
    combos: [],
  }));
  return [...longToneTasks, ...intervalTasks];
}

function getCurrentDailyGoalCompletion() {
  const exercise = exercises[selectedExercise];
  if (exercise.scored) return { goalId: exercise.id, comboId: `volume-${selectedTargetVolume}` };
  if (exercise.variants?.length) return { goalId: exercise.id, comboId: `variant-${selectedVariants[exercise.id] || 0}` };
  return { goalId: exercise.id, comboId: "default" };
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
  const harmonicaImage = $("#mapHarmonicaImage");
  const startIndex = selectedHoles === 16 ? 0 : selectedHoles === 14 ? 2 : 4;
  const layout = makeLayout(16).slice(startIndex);

  if (harmonicaImage) {
    harmonicaImage.src = mapHarmonicaImages[selectedHoles] || mapHarmonicaImages[16];
    harmonicaImage.dataset.holes = String(selectedHoles);
  }

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

function activateViewButton(view, target = "") {
  $$("[data-view]").forEach((item) => {
    const itemTarget = item.dataset.navTarget || "";
    const isPracticeNav = item.dataset.view === "practicehub";
    const matches = (item.dataset.view === view && itemTarget === target) || (isPracticeNav && ["longtone", "interval"].includes(view));
    if (item.classList.contains("nav-item") || item.classList.contains("bottom-nav-item") || item.classList.contains("icon-btn")) {
      item.classList.toggle("active", matches);
    }
  });
}

function scrollToSection(sectionId) {
  requestAnimationFrame(() => {
    const target = document.getElementById(sectionId);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function setBpm(nextBpm) {
  bpm = Math.max(60, Math.min(180, Number(nextBpm)));
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

function scrollToLongTonePageTop() {
  requestAnimationFrame(() => {
    const target = $("#longtone");
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
  const progressList = tasks.map((task) => getDailyGoalProgress(state, task));
  const doneCount = progressList.filter((progress) => progress.done).length;
  const summary = `${doneCount} / ${tasks.length}`;
  $("#dailyGoalSummary").textContent = `今日完成 ${summary} 個練習`;
  $$('[data-view="daily"]').forEach((dailyNav) => {
    dailyNav.classList.toggle("complete", doneCount === tasks.length && tasks.length > 0);
  });
  $("#dailyGoalList").innerHTML = tasks
    .map((task, index) => {
      const progress = progressList[index];
      if (task.type === "interval") {
        return `
          <button class="goal-chip ${progress.done ? "done" : ""}" data-goal-type="interval" type="button">
            <span>${progress.done ? "✓" : index + 1}</span>
            <strong>${task.title}</strong>
            <small>任一調性＋任一音程 · 不重複組合 ${progress.completedCount} / ${progress.required} · 相同組合每日只計一次</small>
          </button>
        `;
      }
      const nextCombo = getNextDailyGoalCombo(task, state);
      const completedLabels = task.combos
        .filter((combo) => progress.completedCombos.includes(combo.id))
        .map((combo) => combo.label);
      const comboText = completedLabels.length
        ? `已完成 ${completedLabels.join("、")}`
        : `下一組合：${nextCombo.label}`;
      return `
        <button class="goal-chip ${progress.done ? "done" : ""}" data-goal-exercise="${task.exerciseIndex}" data-goal-combo="${nextCombo.id}" type="button">
          <span>${progress.done ? "✓" : index + 1}</span>
          <strong>${task.title}</strong>
          <small>${localizeLevel(task.level)} · ${task.playBeats} 拍 · 不同組合 ${progress.completedCount} / ${progress.required} · ${comboText}</small>
        </button>
      `;
    })
    .join("");
  renderStreakSummary();
}

function markDailyGoalDone(goalId, comboId) {
  const state = getDailyGoalState();
  const task = getDailyGoalTasks().find((item) => item.id === goalId);
  if (!task) {
    const streakResult = markPracticeCompletedToday();
    renderDailyGoals();
    return { isNew: false, isAllDone: false, streakResult };
  }
  const previousProgress = getDailyGoalProgress(state, task);
  const completedCombos = new Set(previousProgress.completedCombos);
  const normalizedComboId = task.combos.some((combo) => combo.id === comboId) ? comboId : task.combos[0]?.id;
  if (normalizedComboId) completedCombos.add(normalizedComboId);
  state[goalId] = {
    completedCombos: [...completedCombos],
    completedAt: completedCombos.size >= previousProgress.required ? new Date().toISOString() : null,
  };
  setDailyGoalState(state);
  const streakResult = markPracticeCompletedToday();
  renderDailyGoals();
  const tasks = getDailyGoalTasks();
  const nextState = getDailyGoalState();
  const nextProgress = getDailyGoalProgress(nextState, task);
  const isAllDone = tasks.every((item) => getDailyGoalProgress(nextState, item).done);
  return { isNew: !previousProgress.done && nextProgress.done, isAllDone, streakResult };
}

function markIntervalDailyGoalsDone(keyName, intervalSize) {
  const state = getDailyGoalState();
  const comboId = `${keyName}-${intervalSize}`;
  const intervalTasks = getDailyGoalTasks().filter((task) => task.type === "interval");
  const completedCombos = new Set(getDailyGoalCompletedCombos(state, intervalTasks[0]));
  completedCombos.add(comboId);
  state[INTERVAL_DAILY_GOAL_STATE_KEY] = {
    completedCombos: [...completedCombos],
    updatedAt: new Date().toISOString(),
  };
  setDailyGoalState(state);
  const streakResult = markPracticeCompletedToday();
  renderDailyGoals();
  const nextState = getDailyGoalState();
  const isAllDone = getDailyGoalTasks().every((task) => getDailyGoalProgress(nextState, task).done);
  return { isAllDone, streakResult };
}

function showGoalCompletedDialog(title) {
  setGoalToastEyebrow("每日目標");
  $("#goalToastTitle").textContent = "恭喜完成";
  $("#goalToastText").textContent = `你已完成今日目標：「${title}」。`;
  $("#goalToast").classList.remove("hidden");
  playSound("practiceComplete");
}

function showAllGoalsCompletedDialog() {
  setGoalToastEyebrow("每日目標");
  $("#goalToastTitle").textContent = "今日目標完成";
  $("#goalToastText").textContent = "恭喜你已完成今日所有目標。";
  $("#goalToast").classList.remove("hidden");
  playSound("practiceComplete");
}

function showFirstDailyCompletionToast(practiceName, streakResult, waterResult = null) {
  if (!streakResult?.isFirstCompletionToday) return;
  const waterText = formatWaterRewardText(waterResult);
  setGoalToastEyebrow("每日目標");
  $("#goalToastTitle").textContent = `完成「${practiceName}」`;
  if (streakResult.freezeResult?.applied) {
    const used = streakResult.freezeResult.usedCount;
    const gapText = used === 1 ? "補上昨天的空缺" : `補上前 ${used} 天的空缺`;
    const rewardText = streakResult.reward.rewarded ? "並獲得 1 張學習凍結。" : "";
    $("#goalToastText").textContent = `已自動使用 ${used} 張學習凍結，${gapText}。今日連續學習目標已達成，已連續練習 ${streakResult.currentStreak} 天。${rewardText}${waterText ? ` ${waterText}` : ""}`;
  } else if (streakResult.freezeResult?.insufficient) {
    $("#goalToastText").textContent = `今日連續學習目標已達成。因為漏練天數超過持有的學習凍結，連續紀錄已重新開始，今天是新的第 1 天。${waterText ? ` ${waterText}` : ""}`;
  } else if (streakResult.reward.rewarded) {
    $("#goalToastText").textContent = `今日連續學習目標已達成，已連續練習 ${streakResult.currentStreak} 天。獲得 1 張學習凍結。${waterText ? ` ${waterText}` : ""}`;
  } else {
    $("#goalToastText").textContent = `今日連續學習目標已達成，已連續練習 ${streakResult.currentStreak} 天。${waterText ? ` ${waterText}` : ""}`;
  }
  $("#goalToast").classList.remove("hidden");
  playSound("practiceComplete");
}

function showPracticeCompletedToast(practiceName, waterResult = null) {
  const waterText = formatWaterRewardText(waterResult);
  setGoalToastEyebrow("每日目標");
  $("#goalToastTitle").textContent = `完成「${practiceName}」`;
  $("#goalToastText").textContent = waterText || "這項練習已加入今日完成進度。";
  $("#goalToast").classList.remove("hidden");
  playSound("practiceComplete");
}

function setCalendarModalOpen(isOpen) {
  const modal = $("#calendarModal");
  modal.classList.toggle("hidden", !isOpen);
  document.body.classList.toggle("modal-open", isOpen);
  if (isOpen) renderStreakSummary();
}

function setLongToneIntroOpen(isOpen) {
  const modal = $("#longToneIntroModal");
  if (!modal) return;
  modal.classList.toggle("hidden", !isOpen);
  document.body.classList.toggle("modal-open", isOpen);
}

function setLeaderboardModalOpen(isOpen) {
  const modal = $("#leaderboardModal");
  if (!modal) return;
  modal.classList.toggle("hidden", !isOpen);
  document.body.classList.toggle("modal-open", isOpen);
}

function confirmLongToneIntro() {
  setLongToneIntroOpen(false);
  setView("longtone");
  requestAnimationFrame(scrollToLongTonePageTop);
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
        : variantLabel || getPatternSummary(pattern);
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
  totalCycles = normalizeSelectedCycleCount(totalCycles);
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
  $("#cycleSelect").innerHTML = CYCLE_OPTIONS
    .map((option) => `<option value="${option}">${option}</option>`)
    .join("");
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

function getIntervalNoteLetter(noteName) {
  return noteName.charAt(0);
}

function buildIntervalScaleNotes(keyName) {
  return Array.from({ length: 16 }, (_, index) => getIntervalScaleNote(keyName, index));
}

function getIntervalScaleNote(keyName, index) {
  const key = INTERVAL_KEYS[keyName] || INTERVAL_KEYS.C;
  const letters = ["C", "D", "E", "F", "G", "A", "B"];
  const tonicLetterIndex = letters.indexOf(getIntervalNoteLetter(key.notes[0]));
  const pitchIndex = ((index % key.notes.length) + key.notes.length) % key.notes.length;
  const pitch = key.notes[pitchIndex];
  const octave = 4 + Math.floor((tonicLetterIndex + index) / 7);
  return `${pitch}${octave}`;
}

function generateIntervalGroups(keyName, intervalSize, direction) {
  const scale = buildIntervalScaleNotes(keyName);
  const distance = Math.max(1, Number(intervalSize) - 1);
  if (direction === "continuousBoth") {
    const ascendingSequence = [];
    for (let index = 0; index < 7; index += 1) {
      ascendingSequence.push(getIntervalScaleNote(keyName, index), getIntervalScaleNote(keyName, index + distance));
    }
    ascendingSequence.push(getIntervalScaleNote(keyName, 7));
    const descendingSequence = [];
    for (let index = 7; index > 0; index -= 1) {
      descendingSequence.push(getIntervalScaleNote(keyName, index), getIntervalScaleNote(keyName, index - distance));
    }
    descendingSequence.push(getIntervalScaleNote(keyName, 0));
    const sequence = [...ascendingSequence, ...descendingSequence];
    return Array.from({ length: 8 }, (_, measureIndex) => {
      const sectionOffset = measureIndex < 4 ? 0 : 15;
      const localMeasureIndex = measureIndex % 4;
      const start = sectionOffset + localMeasureIndex * 4;
      const end = sectionOffset + (localMeasureIndex === 3 ? 15 : (localMeasureIndex + 1) * 4);
      const notes = sequence.slice(start, end);
      const durations = localMeasureIndex === 3 ? [1, 1, 2] : [1, 1, 1, 1];
      return { notes, durations, label: notes.join(" → ") };
    });
  }
  return Array.from({ length: 8 }, (_, index) => {
    const low = scale[index];
    const high = scale[index + distance];
    const movementNotes = direction === "descending"
      ? [high, low]
      : [low, high];
    const notes = Array.from({ length: 3 }, (_, noteIndex) => movementNotes[noteIndex % movementNotes.length]);
    return { notes, durations: [1, 1, 2], label: movementNotes.join(" → ") };
  });
}

function getIntervalStaffY(noteName) {
  const letters = ["C", "D", "E", "F", "G", "A", "B"];
  const match = noteName.match(/^([A-G])(?:#|b)?(\d)$/);
  if (!match) return 94;
  const diatonicIndex = Number(match[2]) * 7 + letters.indexOf(match[1]);
  const e4Index = 4 * 7 + letters.indexOf("E");
  return 118 - (diatonicIndex - e4Index) * 6;
}

function renderIntervalLedgerLines(x, y) {
  const lines = [];
  if (y >= 124) {
    for (let lineY = 130; lineY <= y + 1; lineY += 12) {
      lines.push(`<line x1="${x - 12}" y1="${lineY}" x2="${x + 12}" y2="${lineY}" class="ledger-line" />`);
    }
  }
  if (y <= 64) {
    for (let lineY = 58; lineY >= y - 1; lineY -= 12) {
      lines.push(`<line x1="${x - 12}" y1="${lineY}" x2="${x + 12}" y2="${lineY}" class="ledger-line" />`);
    }
  }
  return lines.join("");
}

function renderIntervalNote(noteName, x, isActive = false, duration = 1) {
  const y = getIntervalStaffY(noteName);
  const stemDown = y < 92;
  const stemX = stemDown ? x - 7 : x + 7;
  const stemEndY = stemDown ? y + 34 : y - 34;
  const activeClass = isActive ? " active-note" : "";
  const durationClass = duration === 2 ? " half-note" : "";
  return `
    ${renderIntervalLedgerLines(x, y)}
    <ellipse cx="${x}" cy="${y}" rx="8" ry="5.5" transform="rotate(-16 ${x} ${y})" class="staff-note${durationClass}${activeClass}" />
    <line x1="${stemX}" y1="${y}" x2="${stemX}" y2="${stemEndY}" class="note-stem${activeClass}" />
  `;
}

function renderIntervalKeySignature(keyName) {
  const key = INTERVAL_KEYS[keyName] || INTERVAL_KEYS.C;
  const sharpY = [70, 88, 64, 82, 100, 76, 94];
  const flatY = [94, 76, 100, 82, 106, 88, 112];
  return key.signature.map((accidental, index) => {
    const isSharp = accidental.includes("#");
    const x = 62 + index * 10;
    const y = (isSharp ? sharpY : flatY)[index];
    return `<text x="${x}" y="${y + 6}" class="key-signature">${isSharp ? "♯" : "♭"}</text>`;
  }).join("");
}

function createIntervalStaffSvg(groups, keyName, activeGroupIndex = -1, activeNoteIndex = -1) {
  const staffLines = [70, 82, 94, 106, 118]
    .map((y) => `<line x1="18" y1="${y}" x2="622" y2="${y}" class="staff-line" />`)
    .join("");
  const groupStartX = 130;
  const groupWidth = 123;
  const notesAndBars = groups.map((group, groupIndex) => {
    const centerX = groupStartX + groupIndex * groupWidth + groupWidth / 2;
    const offsets = group.notes.length === 4
      ? [-39, -13, 13, 39]
      : group.notes.length === 3
        ? [-39, -13, 13]
        : [-17, 17];
    const notes = group.notes
      .map((noteName, noteIndex) => renderIntervalNote(
        noteName,
        centerX + offsets[noteIndex],
        groupIndex === activeGroupIndex && noteIndex === activeNoteIndex,
        group.durations?.[noteIndex] || 1,
      ))
      .join("");
    const barX = groupStartX + (groupIndex + 1) * groupWidth;
    return `${notes}<line x1="${barX}" y1="70" x2="${barX}" y2="118" class="bar-line" />`;
  }).join("");
  return `
    <svg viewBox="0 0 640 140" role="img" aria-labelledby="intervalStaffSvgTitle" xmlns="http://www.w3.org/2000/svg">
      <title id="intervalStaffSvgTitle">${INTERVAL_KEYS[keyName].label}音程練習五線譜</title>
      <style>
        .staff-line,.bar-line,.ledger-line,.note-stem{stroke:#6f4b32;stroke-width:1.5}.bar-line{stroke-width:1.8}.ledger-line{stroke-width:1.4}.staff-note{fill:#543822;stroke:#543822;stroke-width:1.5;transition:fill .16s ease,stroke .16s ease,filter .16s ease}.staff-note.half-note{fill:#fffdf7;stroke-width:2}.staff-note.active-note{fill:#d34f45;stroke:#d34f45;filter:drop-shadow(0 0 5px rgba(211,79,69,.88))}.staff-note.half-note.active-note{fill:#fffdf7;stroke:#d34f45;stroke-width:2.6}.note-stem.active-note{stroke:#d34f45;stroke-width:2.4;filter:drop-shadow(0 0 3px rgba(211,79,69,.68))}.key-signature{fill:#543822;font:700 25px Georgia,serif}.treble-clef{fill:#543822;font:62px Georgia,serif}
      </style>
      ${staffLines}
      <text x="18" y="119" class="treble-clef">𝄞</text>
      ${renderIntervalKeySignature(keyName)}
      ${notesAndBars}
    </svg>
  `;
}

function getIntervalPracticeSelection() {
  return {
    key: $("#intervalKeySelect").value,
    interval: Number($("#intervalSizeSelect").value),
    direction: $("#intervalDirectionSelect").value,
    bpm: Number($("#intervalBpmInput").value),
    totalCycles: Number($("#intervalCyclesSelect").value),
  };
}

function getIntervalNumberNotation(noteName) {
  const match = noteName.match(/^([A-G])([#b]?)(\d)$/);
  if (!match) return { degree: "?", accidental: "", octave: 0 };
  const fixedDoDegrees = { C: "1", D: "2", E: "3", F: "4", G: "5", A: "6", B: "7" };
  return {
    degree: fixedDoDegrees[match[1]],
    accidental: match[2] === "#" ? "♯" : match[2] === "b" ? "♭" : "",
    octave: Math.max(0, Number(match[3]) - 4),
  };
}

function renderIntervalNumberNote(noteName, isActive = false) {
  const notation = getIntervalNumberNotation(noteName);
  const dots = notation.octave > 0
    ? `<i class="jianpu-octave-dot" aria-hidden="true">${"•".repeat(notation.octave)}</i>`
    : "";
  return `<b class="jianpu-note${isActive ? " active" : ""}" aria-label="${noteName}">${dots}<i class="jianpu-accidental" aria-hidden="true">${notation.accidental}</i>${notation.degree}</b>`;
}

function renderIntervalPractice() {
  if (!intervalPracticeState) return;
  const state = intervalPracticeState;
  state.page = Math.min(
    Math.ceil(state.groups.length / INTERVAL_GROUPS_PER_PAGE) - 1,
    Math.floor(state.groupIndex / INTERVAL_GROUPS_PER_PAGE),
  );
  const key = INTERVAL_KEYS[state.key];
  const intervalLabel = INTERVAL_LABELS[state.interval];
  const directionLabel = INTERVAL_DIRECTION_LABELS[state.direction];
  const totalPages = Math.ceil(state.groups.length / INTERVAL_GROUPS_PER_PAGE);
  const pageStart = state.page * INTERVAL_GROUPS_PER_PAGE;
  const pageGroups = state.groups.slice(pageStart, pageStart + INTERVAL_GROUPS_PER_PAGE);
  const activeNoteIndex = state.phase === "play" ? state.activeNoteIndex : -1;
  const activeGroupOnPage = state.groupIndex - pageStart;
  $("#intervalPracticeTitle").textContent = `${key.label}｜${directionLabel}${intervalLabel}`;
  $("#intervalScoreLabel").textContent = `${key.label} · ${directionLabel}${intervalLabel}`;
  $("#intervalPageStatus").textContent = `第 ${state.groupIndex + 1} / ${state.groups.length} 組 · 第 ${state.page + 1} / ${totalPages} 頁`;
  $("#intervalCycleProgress").textContent = `${state.completedCycles} / ${state.totalCycles}`;
  $("#intervalBpmStatus").textContent = state.bpm;
  $("#intervalMetronomeHelp").textContent = state.direction === "continuousBoth"
    ? "4 拍預備 · 連續上下行 · 每段末音二分音符"
    : "4 拍預備 · 4/4 拍 · 兩個四分音符＋一個二分音符";
  $("#intervalStaff").innerHTML = createIntervalStaffSvg(
    pageGroups,
    state.key,
    activeGroupOnPage,
    activeNoteIndex,
  );
  $("#intervalStaff").setAttribute("aria-label", `${key.label}${directionLabel}${intervalLabel}，${pageGroups.map((group) => group.label).join("；")}`);
  $("#intervalNoteHelp").innerHTML = pageGroups
    .map((group, index) => {
      const groupIndex = pageStart + index;
      const isActiveGroup = groupIndex === state.groupIndex;
      const notes = group.notes
        .map((noteName, noteIndex) => {
          const isActiveNote = isActiveGroup && activeNoteIndex === noteIndex;
          const hold = (group.durations?.[noteIndex] || 1) > 1
            ? `<b class="jianpu-hold${isActiveNote ? " active" : ""}" aria-label="延長一拍">—</b>`
            : "";
          return `${renderIntervalNumberNote(noteName, isActiveNote)}${hold}`;
        })
        .join("");
      return `<span class="${isActiveGroup ? "active" : ""}"><small>第 ${groupIndex + 1} 小節</small><em>${notes}</em></span>`;
    })
    .join("");
}

function updateIntervalMetronomeUi() {
  const button = $("#intervalStartPauseBtn");
  const dot = $("#intervalMetronomeDot");
  const status = $("#intervalMetronomeStatus");
  if (button) {
    button.textContent = intervalMetronomePlaying
      ? "暫停練習"
      : intervalPracticeState?.hasStarted
        ? "繼續練習"
        : "開始練習";
  }
  if (dot) dot.classList.toggle("is-playing", intervalMetronomePlaying);
  if (status) {
    status.textContent = intervalMetronomePlaying && intervalPracticeState?.phase === "prepare"
      ? `預備 ${intervalPracticeState.prepareBeat} / 4`
      : intervalMetronomePlaying
        ? "吹奏中"
      : intervalPracticeState?.hasStarted
        ? "已暫停"
        : "等待開始";
    status.classList.toggle("is-playing", intervalMetronomePlaying);
  }
}

function stopIntervalMetronome() {
  if (intervalMetronomeTimer) clearInterval(intervalMetronomeTimer);
  intervalMetronomeTimer = null;
  intervalMetronomePlaying = false;
  updateIntervalMetronomeUi();
}

function getIntervalNoteIndexAtBeat(group, beat) {
  let elapsedBeats = 0;
  for (let noteIndex = 0; noteIndex < group.notes.length; noteIndex += 1) {
    elapsedBeats += group.durations?.[noteIndex] || 1;
    if (beat < elapsedBeats) return noteIndex;
  }
  return group.notes.length - 1;
}

function stepIntervalPractice() {
  const state = intervalPracticeState;
  if (!state || !intervalMetronomePlaying) return;
  if (state.phase === "prepare") {
    playPrepareClick(state.prepareBeat === 0);
    state.prepareBeat += 1;
    updateIntervalMetronomeUi();
    if (state.prepareBeat >= 4) {
      state.phase = "play";
      state.activeNoteIndex = -1;
      intervalMetronomeBeat = 0;
      renderIntervalPractice();
      updateIntervalMetronomeUi();
    }
    return;
  }

  let currentGroup = state.groups[state.groupIndex];
  const measureBeats = currentGroup.durations?.reduce((sum, duration) => sum + duration, 0) || currentGroup.notes.length;
  if (intervalMetronomeBeat >= measureBeats) {
    intervalMetronomeBeat = 0;
    state.activeNoteIndex = -1;
    state.groupIndex += 1;
    if (state.groupIndex >= state.groups.length) {
      state.completedCycles += 1;
      if (state.completedCycles >= state.totalCycles) {
        finishIntervalPractice();
        return;
      }
      state.groupIndex = 0;
      state.phase = "prepare";
      state.prepareBeat = 0;
      renderIntervalPractice();
      updateIntervalMetronomeUi();
      stepIntervalPractice();
      return;
    }
    currentGroup = state.groups[state.groupIndex];
  }

  state.activeNoteIndex = getIntervalNoteIndexAtBeat(currentGroup, intervalMetronomeBeat);
  playClick(intervalMetronomeBeat === 0);
  intervalMetronomeBeat += 1;
  renderIntervalPractice();
  updateIntervalMetronomeUi();
}

function startIntervalMetronome() {
  if (!intervalPracticeState || intervalMetronomePlaying) return;
  intervalPracticeState.hasStarted = true;
  if (intervalPracticeState.phase === "ready") {
    intervalPracticeState.phase = "prepare";
    intervalPracticeState.prepareBeat = 0;
  }
  intervalMetronomePlaying = true;
  updateIntervalMetronomeUi();
  stepIntervalPractice();
  if (!intervalMetronomePlaying) return;
  intervalMetronomeTimer = setInterval(stepIntervalPractice, 60000 / intervalPracticeState.bpm);
}

function toggleIntervalPractice() {
  if (intervalMetronomePlaying) stopIntervalMetronome();
  else startIntervalMetronome();
}

function beginIntervalPractice() {
  const selection = getIntervalPracticeSelection();
  intervalPracticeState = {
    ...selection,
    groups: generateIntervalGroups(selection.key, selection.interval, selection.direction),
    page: 0,
    groupIndex: 0,
    completedCycles: 0,
    hasStarted: false,
    phase: "ready",
    prepareBeat: 0,
    activeNoteIndex: -1,
  };
  intervalMetronomeBeat = 0;
  $("#intervalSetup").classList.add("hidden");
  $("#intervalComplete").classList.add("hidden");
  $("#intervalPlayer").classList.remove("hidden");
  renderIntervalPractice();
  updateIntervalMetronomeUi();
  scrollToSection("intervalPlayer");
}

function resetIntervalPractice() {
  if (!intervalPracticeState) return;
  stopIntervalMetronome();
  intervalPracticeState.page = 0;
  intervalPracticeState.groupIndex = 0;
  intervalPracticeState.completedCycles = 0;
  intervalPracticeState.hasStarted = false;
  intervalPracticeState.phase = "ready";
  intervalPracticeState.prepareBeat = 0;
  intervalPracticeState.activeNoteIndex = -1;
  intervalMetronomeBeat = 0;
  renderIntervalPractice();
  updateIntervalMetronomeUi();
}

function saveIntervalPracticeRecord(record) {
  const history = readJsonStorage(INTERVAL_PRACTICE_HISTORY_KEY, []);
  const nextHistory = Array.isArray(history) ? history : [];
  nextHistory.push(record);
  localStorage.setItem(INTERVAL_PRACTICE_HISTORY_KEY, JSON.stringify(nextHistory.slice(-100)));
}

function finishIntervalPractice() {
  const state = intervalPracticeState;
  if (!state) return;
  stopIntervalMetronome();
  const goalResult = markIntervalDailyGoalsDone(state.key, state.interval);
  const streakResult = goalResult.streakResult;
  const waterResult = awardGardenWaterForPractice(state.completedCycles);
  saveIntervalPracticeRecord({
    date: getTodayKey(),
    completedAt: new Date().toISOString(),
    type: "interval",
    key: state.key,
    mode: "major",
    interval: state.interval,
    direction: state.direction,
    bpm: state.bpm,
    cyclesCompleted: state.completedCycles,
    waterEarned: waterResult.water,
  });
  renderStreakSummary();
  $("#intervalPlayer").classList.add("hidden");
  $("#intervalComplete").classList.remove("hidden");
  $("#intervalCompleteKey").textContent = INTERVAL_KEYS[state.key].label;
  $("#intervalCompleteSize").textContent = INTERVAL_LABELS[state.interval];
  $("#intervalCompleteDirection").textContent = INTERVAL_DIRECTION_LABELS[state.direction];
  $("#intervalCompleteCycles").textContent = `${state.completedCycles} / ${state.totalCycles}`;
  $("#intervalCompleteWater").textContent = `${waterResult.water} 滴`;
  const notes = [];
  if (waterResult.capped) notes.push("今日練習水滴已達上限，完成紀錄仍已保存。");
  if (streakResult.isFirstCompletionToday) notes.push(`今日連續學習已完成，目前連續 ${streakResult.currentStreak} 天。`);
  $("#intervalCompleteNote").textContent = notes.join("\n");
  playSound("practiceComplete");
  scrollToSection("intervalComplete");
}

function showIntervalSetup() {
  stopIntervalMetronome();
  intervalPracticeState = null;
  $("#intervalPlayer").classList.add("hidden");
  $("#intervalComplete").classList.add("hidden");
  $("#intervalSetup").classList.remove("hidden");
}

function editIntervalPracticeSettings() {
  showIntervalSetup();
  scrollToSection("intervalSetup");
}

function setView(view, options = {}) {
  const target = options.activeTarget || options.scrollTarget || "";
  const changedView = currentView !== view || currentViewTarget !== target;
  currentView = view;
  currentViewTarget = target;
  $$(".view").forEach((element) => element.classList.toggle("active", element.id === view));
  activateViewButton(view, currentViewTarget);
  if (view !== "longtone") stopPractice(false);
  if (view !== "interval") stopIntervalMetronome();
  if (view === "garden") renderGarden();
  syncGardenBgmWithView();
  if (options.scrollTarget) {
    scrollToSection(options.scrollTarget);
  } else if (changedView) {
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }
}

function playClick(strong = false) {
  if (!isMetronomeAllowed()) return;
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = strong ? 1040 : 720;
  gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(getMetronomeGain(strong), audioContext.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.09);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.1);
}

function playPrepareClick(strong = false) {
  if (!isMetronomeAllowed()) return;
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = "triangle";
  oscillator.frequency.value = strong ? 560 : 440;
  gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(getMetronomeGain(false) * 0.72, audioContext.currentTime + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.14);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.15);
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
  const phaseBeatLimit = phase === "prepare"
    ? exercise.prepareBeats
    : phase === "rest"
      ? exercise.restBeats
      : exercise.playBeats;
  if (beat <= phaseBeatLimit) {
    if (phase === "prepare") playPrepareClick(beat === 1);
    else playClick(beat === 1);
  }

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
      const currentGoal = getCurrentDailyGoalCompletion();
      const currentGoalTitle = exercise.scored
        ? `${exercise.title} ${selectedTargetVolume}`
        : exercise.variants?.length
          ? `${exercise.title} ${getExerciseVariantLabel(exercise)}`
          : exercise.title;
      const goalResult = markDailyGoalDone(currentGoal.goalId, currentGoal.comboId);
      const waterResult = awardGardenWaterForPractice(totalCycles);
      if (goalResult.streakResult?.isFirstCompletionToday) {
        showFirstDailyCompletionToast(currentGoalTitle, goalResult.streakResult, waterResult);
      } else {
        showPracticeCompletedToast(currentGoalTitle, waterResult);
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

let startPracticeLaunchLocked = false;

function launchStartPracticeButton(button, navigate) {
  if (startPracticeLaunchLocked) return;
  startPracticeLaunchLocked = true;
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const pressDelay = reduceMotion ? 20 : 130;
  const launchDelay = reduceMotion ? 40 : 380;
  button.classList.add("is-pressing", "is-launching");
  button.setAttribute("aria-busy", "true");
  window.setTimeout(() => {
    button.classList.remove("is-pressing");
  }, pressDelay);
  window.setTimeout(() => {
    button.classList.remove("is-launching");
    button.removeAttribute("aria-busy");
    navigate();
    window.setTimeout(() => {
      startPracticeLaunchLocked = false;
    }, 140);
  }, launchDelay);
}

function bindEvents() {
  $$("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      setView(button.dataset.view, {
        activeTarget: button.dataset.navTarget || "",
        scrollTarget: button.dataset.scrollTarget || "",
      });
    });
  });

  $$("[data-jump]").forEach((button) => {
    button.addEventListener("click", () => {
      const view = button.dataset.jump;
      const navigate = () => setView(view, {
        activeTarget: button.dataset.scrollTarget || "",
        scrollTarget: button.dataset.scrollTarget || "",
      });
      if (button.dataset.startPracticeLaunch === "true") {
        launchStartPracticeButton(button, navigate);
        return;
      }
      navigate();
    });
  });

  $$("[data-longtone-intro]").forEach((button) => {
    button.addEventListener("click", () => setLongToneIntroOpen(true));
  });

  $("#intervalStartBtn")?.addEventListener("click", beginIntervalPractice);
  $("#intervalStartPauseBtn")?.addEventListener("click", toggleIntervalPractice);
  $("#intervalRestartBtn")?.addEventListener("click", resetIntervalPractice);
  $("#intervalSettingsBtn")?.addEventListener("click", editIntervalPracticeSettings);
  $("#intervalAgainBtn")?.addEventListener("click", beginIntervalPractice);
  $("#intervalBackBtn")?.addEventListener("click", () => {
    showIntervalSetup();
    setView("practicehub");
  });

  $$("[data-leaderboard-open]").forEach((button) => {
    button.addEventListener("click", () => setLeaderboardModalOpen(true));
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
    const practiceSettings = getPracticeSettings();
    $("#bpmInput").value = practiceSettings.defaultBpm;
    bpm = practiceSettings.defaultBpm;
    renderExercise();
    resetMicStats();
    updateBeatDisplay();
  });

  $("#bpmInput").addEventListener("input", (event) => {
    setBpm(event.target.value);
  });

  $("#intervalBpmInput")?.addEventListener("input", (event) => {
    $("#intervalBpmValue").textContent = event.target.value;
  });

  $("#bpmMinus").addEventListener("click", () => setBpm(bpm - 2));
  $("#bpmPlus").addEventListener("click", () => setBpm(bpm + 2));

  $("#cycleSelect").addEventListener("change", (event) => {
    totalCycles = normalizeSelectedCycleCount(event.target.value);
    event.target.value = String(totalCycles);
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
    const button = event.target.closest(".goal-chip");
    if (!button) return;
    if (button.dataset.goalType === "interval") {
      setView("interval");
      showIntervalSetup();
      scrollToSection("intervalSetup");
      return;
    }
    setPracticeSettingsOpen(false);
    selectedExercise = Number(button.dataset.goalExercise);
    const exercise = exercises[selectedExercise];
    const comboId = button.dataset.goalCombo || "";
    const task = getDailyGoalTasks().find((item) => item.exerciseIndex === selectedExercise);
    const combo = task?.combos.find((item) => item.id === comboId) || task?.combos[0];
    if (exercise.scored && combo?.volume) selectedTargetVolume = combo.volume;
    if (exercise.variants?.length && combo?.variantIndex !== null && combo?.variantIndex !== undefined) {
      selectedVariants[exercise.id] = Number(combo.variantIndex);
    }
    const practiceSettings = getPracticeSettings();
    $("#bpmInput").value = practiceSettings.defaultBpm;
    bpm = practiceSettings.defaultBpm;
    stopPractice(false);
    setView("longtone");
    renderExercise();
    resetMicStats();
    updateBeatDisplay();
  });

  $("#calendarToggle").addEventListener("click", () => {
    setCalendarModalOpen(true);
  });

  $("#calendarCloseBtn").addEventListener("click", () => setCalendarModalOpen(false));
  $("#calendarModal").addEventListener("click", (event) => {
    if (event.target.id === "calendarModal") {
      playSound("close");
      setCalendarModalOpen(false);
    }
  });

  $("#gardenPrimaryAction").addEventListener("click", () => {
    const plant = getCurrentPlant();
    if ((plant.waterProgress || 0) >= PLANT_WATER_REQUIRED) {
      harvestCurrentPlant();
      return;
    }
    waterCurrentPlant();
  });

  $("#gardenCollection").addEventListener("click", (event) => {
    const button = event.target.closest("[data-open-spirit]");
    if (!button) return;
    openGardenSpiritModal(button.dataset.openSpirit);
  });

  $("#gardenSpiritModalClose").addEventListener("click", closeGardenSpiritModal);
  $("#gardenSpiritModal").addEventListener("click", (event) => {
    if (event.target.id === "gardenSpiritModal") {
      playSound("close");
      closeGardenSpiritModal();
    }
  });
  $("#gardenSpiritStageList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-spirit-stage]");
    if (!button) return;
    selectedGardenSpiritStage = Number(button.dataset.spiritStage) || 3;
    renderGardenSpiritModal();
  });
  $("#gardenSpiritEditName").addEventListener("click", editGardenSpiritName);
  $("#gardenSpiritSetFeatured").addEventListener("click", setSelectedGardenSpiritFeatured);
  $("#gardenRenameClose").addEventListener("click", () => {
    playSound("close");
    closeGardenRenameModal();
  });
  $("#gardenRenameCancel").addEventListener("click", () => {
    playSound("close");
    closeGardenRenameModal();
  });
  $("#gardenRenameSave").addEventListener("click", saveGardenSpiritName);
  $("#gardenRenameModal").addEventListener("click", (event) => {
    if (event.target.id === "gardenRenameModal") {
      playSound("close");
      closeGardenRenameModal();
    }
  });
  $("#gardenRenameInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      saveGardenSpiritName();
    }
    if (event.key === "Escape") {
      playSound("close");
      closeGardenRenameModal();
    }
  });

  $("#longToneIntroClose").addEventListener("click", () => setLongToneIntroOpen(false));
  $("#longToneIntroConfirm").addEventListener("click", confirmLongToneIntro);
  $("#longToneIntroModal").addEventListener("click", (event) => {
    if (event.target.id === "longToneIntroModal") {
      playSound("close");
      setLongToneIntroOpen(false);
    }
  });
  $("#leaderboardModalClose")?.addEventListener("click", () => setLeaderboardModalOpen(false));
  $("#leaderboardModal")?.addEventListener("click", (event) => {
    if (event.target.id === "leaderboardModal") {
      playSound("close");
      setLeaderboardModalOpen(false);
    }
  });

  $("#tuningSelect").addEventListener("change", (event) => {
    tuningA4 = Number(event.target.value);
    refreshAllowedNotes();
    resetPitchTracker();
  });
  $("#calibrateMicBtn").addEventListener("click", calibrateMic);
  $("#audioCalibrateBtn").addEventListener("click", calibrateMic);
  $("#defaultBpmInput")?.addEventListener("change", (event) => {
    setPracticeSettings({ defaultBpm: event.target.value });
  });
  $$("[data-default-cycles]").forEach((button) => {
    button.addEventListener("click", () => {
      setPracticeSettings({ defaultCycles: Number(button.dataset.defaultCycles) });
    });
  });
  $("#googleLoginBtn")?.addEventListener("click", () => {
    const status = $("#googleLoginStatus");
    if (status) status.textContent = "Google 登入準備中";
  });
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
bindSoundSettings();
bindSoundFeedback();
bindDisplaySettings();
renderSoundSettings();
renderPracticeSettings();
renderDisplaySettings();
applyDisplaySettings();
applyPracticeSettings();
registerServiceWorker();
refreshAllowedNotes();
resetPitchTracker();
renderNoteMap();
updateBeatDisplay();
renderMicCurve();
renderGarden();
scheduleGardenPlantHop();
