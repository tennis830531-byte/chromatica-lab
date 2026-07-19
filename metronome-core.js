(function initMetronomeCore(global) {
  "use strict";

  const MIN_BPM = 30;
  const MAX_BPM = 240;
  const TAP_RESET_MS = 2500;
  const MAX_TAP_INTERVALS = 6;
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

  function getSubdivisionCount(subdivision) {
    return SUBDIVISIONS[subdivision] || SUBDIVISIONS.quarter;
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

  function getSwingRatio(subdivision, swingPercent) {
    if (subdivision !== "eighth") return 0.5;
    return clamp(Number(swingPercent) || 50, 50, 75) / 100;
  }

  function getStepDurationSeconds({ bpm, signature, subdivision, swingPercent = 50, subdivisionIndex = 0 }) {
    const normalizedSignature = normalizeTimeSignature(signature);
    const quarterSeconds = 60 / normalizeBpm(bpm);
    const beatSeconds = quarterSeconds * (4 / normalizedSignature.denominator);
    const count = getSubdivisionCount(subdivision);
    if (subdivision === "eighth") {
      const ratio = getSwingRatio(subdivision, swingPercent);
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
    const subdivisionCount = getSubdivisionCount(settings.subdivision);
    const duration = getStepDurationSeconds({
      bpm: settings.bpm,
      signature: state.signature,
      subdivision: settings.subdivision,
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

  function shouldAutoStop(settings, state, elapsedFormalMs) {
    const stop = settings.autoStop || { mode: "off" };
    if (stop.mode === "minutes") return elapsedFormalMs >= clamp(Number(stop.value) || 1, 1, 10) * 60000;
    if (stop.mode === "measures") return state.formalMeasures >= clamp(Math.round(Number(stop.value) || 1), 1, 999);
    return false;
  }

  function normalizePreset(raw = {}) {
    const signature = normalizeTimeSignature(raw.signature);
    const subdivision = SUBDIVISIONS[raw.subdivision] ? raw.subdivision : "quarter";
    return {
      name: String(raw.name || "節拍器設定").trim().slice(0, 20) || "節拍器設定",
      bpm: normalizeBpm(raw.bpm),
      signature,
      subdivision,
      swingPercent: clamp(Number(raw.swingPercent) || 50, 50, 75),
      accents: normalizeAccentPattern(raw.accents, signature.numerator),
      sound: ["wood", "mechanical", "soft"].includes(raw.sound) ? raw.sound : "wood",
      volume: Number.isFinite(Number(raw.volume)) ? clamp(Number(raw.volume), 0, 100) : 70,
      countInMeasures: clamp(Number(raw.countInMeasures) || 0, 0, 2),
      tempoTrainer: { ...(raw.tempoTrainer || {}) },
      autoStop: { ...(raw.autoStop || { mode: "off" }) },
    };
  }

  function savePresetList(existing, preset, index = null) {
    const list = Array.isArray(existing) ? existing.slice(0, 5).map(normalizePreset) : [];
    const normalized = normalizePreset(preset);
    if (Number.isInteger(index) && index >= 0 && index < list.length) list[index] = normalized;
    else if (list.length < 5) list.push(normalized);
    return list;
  }

  global.ChromaticaMetronomeCore = Object.freeze({
    MIN_BPM, MAX_BPM, TAP_RESET_MS, SUBDIVISIONS, DENOMINATORS, ACCENT_STATES,
    normalizeBpm, parseMetronomeBpmInput, normalizeTimeSignature, getSubdivisionCount, getTempoTerm,
    normalizeAccentPattern, cycleAccent, createTapTempoState, registerTap,
    getSwingRatio, getStepDurationSeconds, createSchedulerState,
    applyPendingSignatureAtBar, advanceSchedulerState, getTrainerBpm,
    shouldAutoStop, normalizePreset, savePresetList,
  });
})(typeof window !== "undefined" ? window : globalThis);
