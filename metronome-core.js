(function initMetronomeCore(global) {
  "use strict";

  const MIN_BPM = 30;
  const MAX_BPM = 240;
  const TAP_RESET_MS = 2500;
  const MAX_TAP_INTERVALS = 6;
  const RHYTHM_PATTERNS = Object.freeze({
    quarter: Object.freeze({ id: "quarter", stepCount: 1, hits: Object.freeze([1]), group: "basic", name: "四分音符", ariaLabel: "四分音符" }),
    eighth: Object.freeze({ id: "eighth", stepCount: 2, hits: Object.freeze([1, 1]), group: "eighth", name: "八分音符", ariaLabel: "八分音符" }),
    "eighth-offbeat": Object.freeze({ id: "eighth-offbeat", stepCount: 2, hits: Object.freeze([0, 1]), group: "eighth", name: "八分反拍", ariaLabel: "八分音符，第一拍休止，反拍發聲" }),
    triplet: Object.freeze({ id: "triplet", stepCount: 3, hits: Object.freeze([1, 1, 1]), group: "triplet", name: "三連音", ariaLabel: "三連音" }),
    "triplet-middle-rest": Object.freeze({ id: "triplet-middle-rest", stepCount: 3, hits: Object.freeze([1, 0, 1]), group: "triplet", name: "三連音中間空拍", ariaLabel: "三連音，中間一拍休止" }),
    "triplet-last-rest": Object.freeze({ id: "triplet-last-rest", stepCount: 3, hits: Object.freeze([1, 1, 0]), group: "triplet", name: "三連音尾拍空拍", ariaLabel: "三連音，最後一拍休止" }),
    sixteenth: Object.freeze({ id: "sixteenth", stepCount: 4, hits: Object.freeze([1, 1, 1, 1]), group: "sixteenth", name: "十六分音符", ariaLabel: "十六分音符" }),
    "sixteenth-alternating": Object.freeze({ id: "sixteenth-alternating", stepCount: 4, hits: Object.freeze([1, 0, 1, 0]), group: "sixteenth", name: "十六分交替", ariaLabel: "十六分音符，第二與第四拍休止" }),
    "sixteenth-middle-rests": Object.freeze({ id: "sixteenth-middle-rests", stepCount: 4, hits: Object.freeze([1, 0, 0, 1]), group: "sixteenth", name: "十六分首尾", ariaLabel: "十六分音符，中間兩拍休止" }),
    "sixteenth-syncopated": Object.freeze({ id: "sixteenth-syncopated", stepCount: 4, hits: Object.freeze([1, 0, 1, 1]), group: "sixteenth", name: "十六分切分", ariaLabel: "十六分音符，第二拍休止" }),
  });
  const LEGACY_SUBDIVISIONS = Object.freeze({ quarter: "quarter", eighth: "eighth", triplet: "triplet", sixteenth: "sixteenth" });
  const SUBDIVISIONS = Object.freeze({ quarter: 1, eighth: 2, triplet: 3, sixteenth: 4 });
  const DENOMINATORS = Object.freeze([2, 4, 8, 16]);
  const ACCENT_STATES = Object.freeze(["normal", "strong", "muted"]);

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalizeBpm(value, fallback = 80) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(clamp(parsed, MIN_BPM, MAX_BPM)) : normalizeBpm(fallback, 80);
  }

  function parseMetronomeBpmInput(rawValue, previousBpm = 80) {
    const previous = normalizeBpm(previousBpm);
    const text = String(rawValue ?? "").trim();
    if (!text) return { bpm: previous, valid: false, restored: true };
    const numeric = Number(text);
    if (!Number.isFinite(numeric)) return { bpm: previous, valid: false, restored: true };
    return { bpm: normalizeBpm(numeric, previous), valid: true, restored: false };
  }

  function normalizeTimeSignature(signature = {}) {
    const numerator = Math.round(clamp(Number(signature.numerator) || 4, 1, 12));
    const denominator = DENOMINATORS.includes(Number(signature.denominator)) ? Number(signature.denominator) : 4;
    return { numerator, denominator };
  }

  function normalizeRhythmPatternId(rhythmPatternId, legacySubdivision = "quarter") {
    if (typeof rhythmPatternId === "string" && RHYTHM_PATTERNS[rhythmPatternId]) return rhythmPatternId;
    if (typeof legacySubdivision === "string" && LEGACY_SUBDIVISIONS[legacySubdivision]) return LEGACY_SUBDIVISIONS[legacySubdivision];
    return "quarter";
  }

  function getRhythmPattern(rhythmPatternId, legacySubdivision = rhythmPatternId) {
    return RHYTHM_PATTERNS[normalizeRhythmPatternId(rhythmPatternId, legacySubdivision)];
  }

  function getLegacySubdivision(rhythmPatternId) {
    const pattern = getRhythmPattern(rhythmPatternId);
    if (pattern.group === "triplet") return "triplet";
    if (pattern.group === "sixteenth") return "sixteenth";
    if (pattern.group === "eighth") return "eighth";
    return "quarter";
  }

  function getSubdivisionCount(subdivisionOrPatternId) {
    return getRhythmPattern(subdivisionOrPatternId).stepCount;
  }

  function isRhythmHit(rhythmPatternId, subdivisionIndex, legacySubdivision = rhythmPatternId) {
    const pattern = getRhythmPattern(rhythmPatternId, legacySubdivision);
    const index = Math.max(0, Math.min(pattern.stepCount - 1, Number(subdivisionIndex) || 0));
    return pattern.hits[index] === 1;
  }

  function getRhythmStepSound({ rhythmPatternId, subdivision, subdivisionIndex = 0, accentState = "normal" } = {}) {
    const patternId = normalizeRhythmPatternId(rhythmPatternId, subdivision);
    if (!isRhythmHit(patternId, subdivisionIndex)) return null;
    if (Number(subdivisionIndex) === 0) {
      if (accentState === "muted") return null;
      return accentState === "strong" ? "strong" : "normal";
    }
    return "subdivision";
  }

  function supportsSwing(rhythmPatternId, legacySubdivision = rhythmPatternId) {
    return normalizeRhythmPatternId(rhythmPatternId, legacySubdivision) === "eighth";
  }

  function getTempoTerm(bpm) {
    const value = normalizeBpm(bpm);
    if (value < 60) return "Largo";
    if (value < 76) return "Adagio";
    if (value < 108) return "Andante";
    if (value < 120) return "Moderato";
    if (value < 168) return "Allegro";
    return "Presto";
  }

  function normalizeAccentPattern(pattern, numerator) {
    const count = normalizeTimeSignature({ numerator, denominator: 4 }).numerator;
    return Array.from({ length: count }, (_, index) => {
      const value = pattern?.[index];
      if (ACCENT_STATES.includes(value)) return value;
      return index === 0 ? "strong" : "normal";
    });
  }

  function cycleAccent(state) {
    const index = ACCENT_STATES.indexOf(state);
    return ACCENT_STATES[(index + 1 + ACCENT_STATES.length) % ACCENT_STATES.length];
  }

  function median(values) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function createTapTempoState() {
    return { lastTapAt: 0, intervals: [], bpm: null };
  }

  function registerTap(state, timestampMs) {
    const next = state || createTapTempoState();
    const now = Number(timestampMs);
    if (!Number.isFinite(now)) return createTapTempoState();
    if (!next.lastTapAt || now - next.lastTapAt > TAP_RESET_MS || now <= next.lastTapAt) {
      return { lastTapAt: now, intervals: [], bpm: null };
    }
    const intervals = [...next.intervals, now - next.lastTapAt].slice(-MAX_TAP_INTERVALS);
    const center = median(intervals);
    const filtered = intervals.filter((value) => value >= center * 0.65 && value <= center * 1.35);
    const effective = filtered.length ? filtered : intervals;
    const bpm = normalizeBpm(60000 / median(effective));
    return { lastTapAt: now, intervals, bpm };
  }

  function getSwingRatio(rhythmPatternId, swingPercent) {
    if (!supportsSwing(rhythmPatternId)) return 0.5;
    return clamp(Number(swingPercent) || 50, 50, 75) / 100;
  }

  function getStepDurationSeconds({ bpm, signature, subdivision, rhythmPatternId, swingPercent = 50, subdivisionIndex = 0 }) {
    const normalizedSignature = normalizeTimeSignature(signature);
    const quarterSeconds = 60 / normalizeBpm(bpm);
    const beatSeconds = quarterSeconds * (4 / normalizedSignature.denominator);
    const patternId = normalizeRhythmPatternId(rhythmPatternId, subdivision);
    const count = getSubdivisionCount(patternId);
    if (supportsSwing(patternId)) {
      const ratio = getSwingRatio(patternId, swingPercent);
      return beatSeconds * (subdivisionIndex % 2 === 0 ? ratio : 1 - ratio);
    }
    return beatSeconds / count;
  }

  function createSchedulerState(settings = {}, startTime = 0) {
    const signature = normalizeTimeSignature(settings.signature);
    return {
      nextNoteTime: Number(startTime) || 0,
      beatIndex: 0,
      subdivisionIndex: 0,
      measure: 0,
      formalMeasures: 0,
      countInMeasuresRemaining: clamp(Number(settings.countInMeasures) || 0, 0, 2),
      signature,
      pendingSignature: null,
      sequence: 0,
    };
  }

  function applyPendingSignatureAtBar(state, accentPattern) {
    if (!state.pendingSignature || state.beatIndex !== 0 || state.subdivisionIndex !== 0) {
      return { state, accentPattern };
    }
    const signature = normalizeTimeSignature(state.pendingSignature);
    return {
      state: { ...state, signature, pendingSignature: null },
      accentPattern: normalizeAccentPattern(accentPattern, signature.numerator),
    };
  }

  function advanceSchedulerState(state, settings) {
    const rhythmPatternId = normalizeRhythmPatternId(settings.rhythmPatternId, settings.subdivision);
    const subdivisionCount = getSubdivisionCount(rhythmPatternId);
    const duration = getStepDurationSeconds({
      bpm: settings.bpm,
      signature: state.signature,
      subdivision: settings.subdivision,
      rhythmPatternId,
      swingPercent: settings.swingPercent,
      subdivisionIndex: state.subdivisionIndex,
    });
    let subdivisionIndex = state.subdivisionIndex + 1;
    let beatIndex = state.beatIndex;
    let measure = state.measure;
    let formalMeasures = state.formalMeasures;
    let countInMeasuresRemaining = state.countInMeasuresRemaining;
    if (subdivisionIndex >= subdivisionCount) {
      subdivisionIndex = 0;
      beatIndex += 1;
    }
    if (beatIndex >= state.signature.numerator) {
      beatIndex = 0;
      measure += 1;
      if (countInMeasuresRemaining > 0) countInMeasuresRemaining -= 1;
      else formalMeasures += 1;
    }
    return {
      ...state,
      nextNoteTime: state.nextNoteTime + duration,
      beatIndex,
      subdivisionIndex,
      measure,
      formalMeasures,
      countInMeasuresRemaining,
      sequence: state.sequence + 1,
    };
  }

  function getTrainerBpm(settings, formalMeasures, currentBpm) {
    const trainer = settings.tempoTrainer;
    if (!trainer?.enabled) return normalizeBpm(currentBpm);
    const start = normalizeBpm(trainer.startBpm);
    const target = normalizeBpm(trainer.targetBpm);
    if (target <= start) return start;
    const interval = [1, 2, 4, 8].includes(Number(trainer.everyMeasures)) ? Number(trainer.everyMeasures) : 1;
    const increment = [1, 2, 5].includes(Number(trainer.increment)) ? Number(trainer.increment) : 1;
    const increases = Math.floor(Math.max(0, formalMeasures) / interval);
    return Math.min(target, start + increases * increment, MAX_BPM);
  }

  function normalizeTempoTrainer(raw = {}, fallbackBpm = 80) {
    const startBpm = Math.min(239, normalizeBpm(raw.startBpm, fallbackBpm));
    const targetBpm = Math.max(startBpm + 1, normalizeBpm(raw.targetBpm, Math.min(240, startBpm + 20)));
    return {
      enabled: Boolean(raw.enabled),
      startBpm,
      targetBpm: Math.min(240, targetBpm),
      increment: [1, 2, 5].includes(Number(raw.increment)) ? Number(raw.increment) : 1,
      everyMeasures: [1, 2, 4, 8].includes(Number(raw.everyMeasures)) ? Number(raw.everyMeasures) : 1,
      keepCurrent: Boolean(raw.keepCurrent),
    };
  }

  function increaseTrainerBpm(currentBpm, trainer = {}) {
    const current = normalizeBpm(currentBpm);
    const normalized = normalizeTempoTrainer(trainer, current);
    return Math.min(current + normalized.increment, normalized.targetBpm, MAX_BPM);
  }

  function getPresentedAudioTime(audioClock = {}) {
    try {
      const timestamp = audioClock.getOutputTimestamp?.();
      if (Number.isFinite(timestamp?.contextTime)) return Math.max(0, timestamp.contextTime);
    } catch {}
    const outputLatency = Number.isFinite(audioClock.outputLatency) ? Math.max(0, audioClock.outputLatency) : null;
    const baseLatency = Number.isFinite(audioClock.baseLatency) ? Math.max(0, audioClock.baseLatency) : 0;
    return Math.max(0, (Number(audioClock.currentTime) || 0) - (outputLatency ?? baseLatency));
  }

  function consumeDueVisualEvents(events = [], presentedAudioTime = 0) {
    let dueCount = 0;
    let latestDue = null;
    for (const event of events) {
      if (event.audioTime > presentedAudioTime) break;
      latestDue = event;
      dueCount += 1;
    }
    return { latestDue, remaining: events.slice(dueCount), dueCount };
  }

  function shouldAutoStop(settings, state, elapsedFormalMs) {
    const stop = settings.autoStop || { mode: "off" };
    if (stop.mode === "minutes") return elapsedFormalMs >= clamp(Number(stop.value) || 1, 1, 10) * 60000;
    if (stop.mode === "measures") return state.formalMeasures >= clamp(Math.round(Number(stop.value) || 1), 1, 999);
    return false;
  }

  function normalizePresetName(value, fallback = "") {
    const normalized = Array.from(String(value ?? "").trim()).slice(0, 20).join("");
    return normalized || fallback;
  }

  function isPresetNameAvailable(existing, name, index = null) {
    const normalized = normalizePresetName(name);
    if (!normalized) return false;
    const list = Array.isArray(existing) ? existing : [];
    return !list.some((preset, presetIndex) => presetIndex !== index && normalizePresetName(preset?.name) === normalized);
  }

  function normalizePreset(raw = {}) {
    const signature = normalizeTimeSignature(raw.signature);
    const rhythmPatternId = normalizeRhythmPatternId(raw.rhythmPatternId, raw.subdivision);
    const subdivision = getLegacySubdivision(rhythmPatternId);
    return {
      name: normalizePresetName(raw.name, "節拍器設定"),
      bpm: normalizeBpm(raw.bpm),
      signature,
      subdivision,
      rhythmPatternId,
      swingPercent: clamp(Number(raw.swingPercent) || 50, 50, 75),
      accents: normalizeAccentPattern(raw.accents, signature.numerator),
      sound: ["wood", "mechanical", "soft"].includes(raw.sound) ? raw.sound : "wood",
      volume: Number.isFinite(Number(raw.volume)) ? clamp(Number(raw.volume), 0, 100) : 70,
      countInMeasures: clamp(Number(raw.countInMeasures) || 0, 0, 2),
      tempoTrainer: normalizeTempoTrainer(raw.tempoTrainer, raw.bpm),
      autoStop: { ...(raw.autoStop || { mode: "off" }) },
    };
  }

  function savePresetList(existing, preset, index = null) {
    const list = Array.isArray(existing) ? existing.slice(0, 5).map(normalizePreset) : [];
    const targetIndex = Number.isInteger(index) && index >= 0 && index < list.length ? index : null;
    const name = normalizePresetName(preset?.name);
    if (!isPresetNameAvailable(list, name, targetIndex)) return list;
    const normalized = normalizePreset({ ...preset, name });
    if (targetIndex !== null) list[targetIndex] = normalized;
    else if (list.length < 5) list.push(normalized);
    return list;
  }

  global.ChromaticaMetronomeCore = Object.freeze({
    MIN_BPM, MAX_BPM, TAP_RESET_MS, SUBDIVISIONS, RHYTHM_PATTERNS, DENOMINATORS, ACCENT_STATES,
    normalizeBpm, parseMetronomeBpmInput, normalizeTimeSignature,
    normalizeRhythmPatternId, getRhythmPattern, getLegacySubdivision, getSubdivisionCount, isRhythmHit, getRhythmStepSound, supportsSwing, getTempoTerm,
    normalizeAccentPattern, cycleAccent, createTapTempoState, registerTap,
    getSwingRatio, getStepDurationSeconds, createSchedulerState,
    applyPendingSignatureAtBar, advanceSchedulerState, getTrainerBpm, normalizeTempoTrainer, increaseTrainerBpm,
    getPresentedAudioTime, consumeDueVisualEvents, shouldAutoStop, normalizePresetName, isPresetNameAvailable, normalizePreset, savePresetList,
  });
})(typeof window !== "undefined" ? window : globalThis);
