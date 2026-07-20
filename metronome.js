(function initMetronome(global) {
  "use strict";
  const core = global.ChromaticaMetronomeCore;
  const STORAGE_KEY = "chromatica.settings.metronome";
  const LOOKAHEAD_SECONDS = 0.1;
  const SCHEDULER_TICK_MS = 25;
  const BUILT_IN_SIGNATURES = new Set(["2/4", "3/4", "4/4", "5/4", "6/8", "7/8", "9/8", "12/8"]);
  const SOUND_PROFILES = {
    wood: {
      strong: { frequency: 1100, type: "triangle", level: 0.28, duration: 0.065 },
      normal: { frequency: 760, type: "triangle", level: 0.19, duration: 0.065 },
      subdivision: { frequency: 700, type: "triangle", level: 0.17, duration: 0.075 },
    },
    mechanical: {
      strong: { frequency: 1450, type: "square", level: 0.28, duration: 0.055 },
      normal: { frequency: 980, type: "square", level: 0.19, duration: 0.055 },
      subdivision: { frequency: 660, type: "square", level: 0.1, duration: 0.055 },
    },
    soft: {
      strong: { frequency: 820, type: "sine", level: 0.28, duration: 0.11 },
      normal: { frequency: 620, type: "sine", level: 0.19, duration: 0.11 },
      subdivision: { frequency: 640, type: "sine", level: 0.18, duration: 0.12 },
    },
  };
  const PANEL_IDS = Object.freeze({
    trainer: "metronomeTrainerDialog",
    autoStop: "metronomeAutoStopDialog",
    signature: "metronomeSignatureDialog",
    rhythm: "metronomeRhythmDialog",
  });
  const defaultSettings = {
    bpm: 80,
    signature: { numerator: 4, denominator: 4 },
    subdivision: "quarter",
    rhythmPatternId: "quarter",
    swingPercent: 50,
    accents: ["strong", "normal", "normal", "normal"],
    sound: "wood",
    volume: 70,
    previousVolume: 70,
    muted: false,
    countInMeasures: 0,
    tempoTrainer: { enabled: false, startBpm: 80, targetBpm: 100, increment: 1, everyMeasures: 1, keepCurrent: false },
    autoStop: { mode: "off", value: 1 },
    presets: [],
  };
  let dependencies = {};
  let settings = loadSettings();
  let schedulerState = null;
  let schedulerTimer = null;
  let animationFrame = null;
  let scheduledNodes = new Set();
  let tapState = core.createTapTempoState();
  let playing = false;
  let formalStartedAt = 0;
  let lastVisualSequence = -1;
  let scheduledVisualEvents = [];
  let presentedVisualEvent = null;
  let lastPresentedMainBeatIndex = -1;
  const visualDiagnostics = [];
  let trainerRuntime = { baselineMeasure: 0, nextIncreaseMeasure: null, lastAppliedBpm: null };
  let activePanel = null;
  let panelReturnFocus = null;
  let trainerDraft = null;
  let autoStopDraft = null;
  let signatureDraft = null;

  function $(selector) { return document.querySelector(selector); }
  function $$(selector) { return [...document.querySelectorAll(selector)]; }
  function loadSettings() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      const base = { ...defaultSettings, ...(stored || {}) };
      base.signature = core.normalizeTimeSignature(base.signature);
      base.customSignature = Boolean(base.customSignature || !BUILT_IN_SIGNATURES.has(`${base.signature.numerator}/${base.signature.denominator}`));
      // An older saved object has no rhythmPatternId. Do not let the default
      // value mask its legacy subdivision while migrating it.
      base.rhythmPatternId = core.normalizeRhythmPatternId(stored?.rhythmPatternId, base.subdivision);
      base.subdivision = core.getLegacySubdivision(base.rhythmPatternId);
      base.accents = core.normalizeAccentPattern(base.accents, base.signature.numerator);
      base.tempoTrainer = core.normalizeTempoTrainer(base.tempoTrainer, base.bpm);
      base.presets = Array.isArray(base.presets) ? base.presets.slice(0, 5).map(core.normalizePreset) : [];
      return base;
    } catch { return structuredClone(defaultSettings); }
  }
  function saveSettings() { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); }
  function announce(message) { const node = $("#metronomeLive"); if (node) node.textContent = message; }
  function getAudioContext() { return dependencies.getAudioContext?.() || null; }
  function signatureValue(signature = settings.signature) { return `${signature.numerator}/${signature.denominator}`; }
  function cloneValue(value) { return JSON.parse(JSON.stringify(value)); }
  function toolbarButtonForPanel(name) {
    return name === "trainer" ? $("#metronomeTrainerOpen")
      : name === "autoStop" ? $("#metronomeAutoStopOpen")
        : name === "signature" ? $("#metronomeSignatureOpen")
          : name === "rhythm" ? $("#metronomeRhythmOpen") : null;
  }
  function closeTopPanel({ haptic = false, restoreFocus = true } = {}) {
    if (!activePanel) return false;
    const name = activePanel;
    const panel = $(`#${PANEL_IDS[name]}`);
    panel?.classList.add("hidden");
    toolbarButtonForPanel(name)?.setAttribute("aria-expanded", "false");
    activePanel = null;
    document.body.classList.remove("modal-open");
    if (haptic) void global.ChromaticaHaptics?.close?.();
    const focusTarget = panelReturnFocus;
    panelReturnFocus = null;
    if (restoreFocus) requestAnimationFrame(() => focusTarget?.focus?.());
    return true;
  }
  function openPanel(name) {
    if (!PANEL_IDS[name]) return;
    if (activePanel) closeTopPanel({ restoreFocus: false });
    activePanel = name;
    panelReturnFocus = document.activeElement;
    const panel = $(`#${PANEL_IDS[name]}`);
    panel?.classList.remove("hidden");
    toolbarButtonForPanel(name)?.setAttribute("aria-expanded", "true");
    document.body.classList.add("modal-open");
    requestAnimationFrame(() => panel?.querySelector("button, input, select")?.focus?.());
  }
  function formatAutoStopSummary(autoStop = settings.autoStop) {
    if (autoStop?.mode === "measures") return `自動停止 · ${Math.max(1, Number(autoStop.value) || 1)}小節`;
    if (autoStop?.mode === "minutes") return `自動停止 · ${Math.max(1, Number(autoStop.value) || 1)}分鐘`;
    return "自動停止";
  }
  function renderStageToolbar() {
    const trainerButton = $("#metronomeTrainerOpen");
    if (trainerButton) {
      trainerButton.textContent = settings.tempoTrainer.enabled ? "速度訓練 · 開" : "速度訓練";
      trainerButton.classList.toggle("is-active", settings.tempoTrainer.enabled);
    }
    const autoStopButton = $("#metronomeAutoStopOpen");
    if (autoStopButton) {
      autoStopButton.textContent = formatAutoStopSummary();
      autoStopButton.classList.toggle("is-active", settings.autoStop?.mode !== "off");
    }
  }
  function renderTrainerDraft() {
    if (!trainerDraft) return;
    const enabled = Boolean(trainerDraft.enabled);
    $("#tempoTrainerEnabled").checked = enabled;
    $("#tempoTrainerEnabled").setAttribute("aria-expanded", String(enabled));
    $("#tempoTrainerSettings").classList.toggle("hidden", !enabled);
    $("#tempoTrainerStart").value = String(trainerDraft.startBpm);
    $("#tempoTrainerTarget").value = String(trainerDraft.targetBpm);
    $("#tempoTrainerIncrement").value = String(trainerDraft.increment);
    $("#tempoTrainerEvery").value = String(trainerDraft.everyMeasures);
    $("#tempoTrainerKeep").value = trainerDraft.keepCurrent ? "keep" : "reset";
    $("#tempoTrainerStatus").textContent = `目前 ${settings.bpm} BPM／目標 ${trainerDraft.targetBpm} BPM`;
  }
  function openTrainerPanel() {
    trainerDraft = cloneValue(settings.tempoTrainer);
    renderTrainerDraft();
    openPanel("trainer");
  }
  function readTrainerDraft() {
    return core.normalizeTempoTrainer({
      enabled: $("#tempoTrainerEnabled").checked,
      startBpm: $("#tempoTrainerStart").value,
      targetBpm: $("#tempoTrainerTarget").value,
      increment: $("#tempoTrainerIncrement").value,
      everyMeasures: $("#tempoTrainerEvery").value,
      keepCurrent: $("#tempoTrainerKeep").value === "keep",
    }, settings.bpm);
  }
  function applyTrainerDraft() {
    const previousEnabled = settings.tempoTrainer.enabled;
    settings.tempoTrainer = readTrainerDraft();
    if (settings.tempoTrainer.enabled) {
      const atBarStart = playing && schedulerState?.beatIndex === 0 && schedulerState?.subdivisionIndex === 0;
      const baseline = playing ? schedulerState.formalMeasures + (atBarStart ? 0 : 1) : 0;
      resetTrainerRuntime(baseline);
    } else if (previousEnabled) {
      resetTrainerRuntime(0);
    }
    saveSettings();
    render();
    closeTopPanel();
    announce(settings.tempoTrainer.enabled ? "速度訓練設定已套用" : "速度訓練已關閉");
  }
  function renderAutoStopDraft() {
    if (!autoStopDraft) return;
    const selectValue = autoStopDraft.mode === "measures" ? "measures:1" : `${autoStopDraft.mode}:${autoStopDraft.value || 0}`;
    $("#metronomeAutoStop").value = selectValue;
    $("#metronomeCustomMeasures").value = String(autoStopDraft.value || 1);
    $("#metronomeCustomMeasures").classList.toggle("hidden", autoStopDraft.mode !== "measures");
  }
  function openAutoStopPanel() {
    autoStopDraft = cloneValue(settings.autoStop || { mode: "off", value: 0 });
    renderAutoStopDraft();
    openPanel("autoStop");
  }
  function applyAutoStopDraft() {
    const [mode, selectedValue] = $("#metronomeAutoStop").value.split(":");
    const rawValue = mode === "measures" ? $("#metronomeCustomMeasures").value : selectedValue;
    settings.autoStop = {
      mode,
      value: mode === "measures" ? Math.max(1, Math.min(999, Number(rawValue) || 1)) : Number(rawValue) || 0,
    };
    saveSettings();
    render();
    closeTopPanel();
    announce("自動停止設定已套用");
  }
  function renderSignatureDraft() {
    if (!signatureDraft) return;
    const value = `${signatureDraft.signature.numerator}/${signatureDraft.signature.denominator}`;
    $$("#metronomeSignatureOptions [data-signature-option]").forEach((button) => {
      const active = signatureDraft.custom ? button.dataset.signatureOption === "custom" : button.dataset.signatureOption === value;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    $("#customTimeSignature").classList.toggle("hidden", !signatureDraft.custom);
    $("#customNumerator").value = String(signatureDraft.signature.numerator);
    $("#customDenominator").value = String(signatureDraft.signature.denominator);
  }
  function openSignaturePanel() {
    signatureDraft = { signature: cloneValue(settings.signature), custom: Boolean(settings.customSignature || !BUILT_IN_SIGNATURES.has(signatureValue())) };
    renderSignatureDraft();
    openPanel("signature");
  }
  function selectedRhythmPattern() {
    return core.getRhythmPattern(settings.rhythmPatternId, settings.subdivision);
  }
  function rhythmNotationSvg(pattern, { compact = false } = {}) {
    const width = compact ? 88 : 120;
    const left = compact ? 16 : 18;
    const right = width - left;
    const stepGap = pattern.stepCount > 1 ? (right - left) / (pattern.stepCount - 1) : 0;
    const positions = Array.from({ length: pattern.stepCount }, (_, index) => left + stepGap * index);
    const noteY = compact ? 29 : 32;
    const stemTop = compact ? 12 : 13;
    const notes = positions.map((x, index) => pattern.hits[index]
      ? `<g class="rhythm-note"><ellipse cx="${x}" cy="${noteY}" rx="5" ry="3.8" transform="rotate(-18 ${x} ${noteY})"></ellipse><path d="M ${x + 4} ${noteY - 1} V ${stemTop}"></path></g>`
      : `<g class="rhythm-rest"><path d="M ${x - 3} ${stemTop + 4} l 6 5 -6 5 6 5 -5 7"></path></g>`).join("");
    const hitPositions = positions.filter((_, index) => pattern.hits[index]);
    const beamCount = pattern.group === "sixteenth" ? 2 : pattern.stepCount > 1 ? 1 : 0;
    const beams = beamCount && hitPositions.length > 1
      ? Array.from({ length: beamCount }, (_, index) => `<path class="rhythm-beam" d="M ${hitPositions[0] + 4} ${stemTop + index * 5} H ${hitPositions[hitPositions.length - 1] + 4}"></path>`).join("")
      : "";
    const triplet = pattern.group === "triplet" ? `<path class="rhythm-tuplet" d="M ${left - 3} 7 H ${right + 5}"></path><text x="${width / 2}" y="8">3</text>` : "";
    return `<svg class="rhythm-notation${compact ? " compact" : ""}" viewBox="0 0 ${width} 44" aria-hidden="true" focusable="false">${triplet}${beams}${notes}</svg>`;
  }
  function renderRhythmOptions() {
    const list = $("#metronomeRhythmOptions");
    if (!list) return;
    const selectedId = selectedRhythmPattern().id;
    list.innerHTML = Object.values(core.RHYTHM_PATTERNS).map((pattern) => `<button class="metronome-rhythm-option${pattern.id === selectedId ? " active" : ""}" data-rhythm-option="${pattern.id}" type="button" role="option" aria-selected="${pattern.id === selectedId}" aria-label="${pattern.ariaLabel}">${rhythmNotationSvg(pattern)}<span>${pattern.name}</span></button>`).join("");
  }
  function setRhythmPattern(rhythmPatternId) {
    const next = core.normalizeRhythmPatternId(rhythmPatternId, settings.subdivision);
    if (settings.rhythmPatternId === next) return;
    settings.rhythmPatternId = next;
    settings.subdivision = core.getLegacySubdivision(next);
    saveSettings();
    render();
    announce(`細分節奏已設為${selectedRhythmPattern().name}`);
    if (playing) rescheduleFromNow();
  }
  function resetTrainerRuntime(baselineMeasure = 0) {
    const interval = [1, 2, 4, 8].includes(Number(settings.tempoTrainer.everyMeasures)) ? Number(settings.tempoTrainer.everyMeasures) : 1;
    trainerRuntime = {
      baselineMeasure,
      nextIncreaseMeasure: settings.tempoTrainer.enabled ? baselineMeasure + interval : null,
      lastAppliedBpm: settings.bpm,
    };
  }
  function renderBpmReadout() {
    const bpm = settings.bpm;
    if ($("#metronomeBpm")) $("#metronomeBpm").textContent = String(bpm);
    if ($("#metronomeBpmRange")) $("#metronomeBpmRange").value = String(bpm);
    if ($("#metronomeBpmInput")) $("#metronomeBpmInput").value = String(bpm);
    if ($("#metronomeTempoTerm")) $("#metronomeTempoTerm").textContent = core.getTempoTerm(bpm);
    const trainerStatus = $("#tempoTrainerStatus");
    if (trainerStatus) {
      const target = core.normalizeBpm(settings.tempoTrainer.targetBpm);
      trainerStatus.textContent = bpm >= target ? `已達目標 ${target} BPM` : `目前 ${bpm} BPM／目標 ${target} BPM`;
    }
  }
  function applyTempoTrainerAtBar() {
    if (!settings.tempoTrainer.enabled || !schedulerState || schedulerState.countInMeasuresRemaining > 0) return settings.bpm;
    if (schedulerState.beatIndex !== 0 || schedulerState.subdivisionIndex !== 0) return settings.bpm;
    if (trainerRuntime.nextIncreaseMeasure == null) resetTrainerRuntime(schedulerState.formalMeasures);
    if (schedulerState.formalMeasures < trainerRuntime.nextIncreaseMeasure) return settings.bpm;
    const target = Math.min(240, core.normalizeBpm(settings.tempoTrainer.targetBpm));
    const nextBpm = core.increaseTrainerBpm(settings.bpm, settings.tempoTrainer);
    const interval = [1, 2, 4, 8].includes(Number(settings.tempoTrainer.everyMeasures)) ? Number(settings.tempoTrainer.everyMeasures) : 1;
    trainerRuntime.nextIncreaseMeasure += interval;
    if (nextBpm === settings.bpm) return settings.bpm;
    settings.bpm = nextBpm;
    trainerRuntime.lastAppliedBpm = nextBpm;
    saveSettings();
    renderBpmReadout();
    return nextBpm;
  }
  function setBpm(value, { announceChange = true } = {}) {
    const previous = settings.bpm;
    const next = core.normalizeBpm(value, previous);
    if (next === previous) {
      render();
      return false;
    }
    settings.bpm = next;
    if (settings.tempoTrainer.enabled && !playing) settings.tempoTrainer.startBpm = settings.bpm;
    saveSettings(); render();
    if (playing) rescheduleFromNow();
    if (announceChange) announce(`速度已設為 ${settings.bpm} BPM`);
    return true;
  }
  function commitBpmInput(rawValue, { announceChange = true } = {}) {
    const parsed = core.parseMetronomeBpmInput(rawValue, settings.bpm);
    if (!parsed.valid) {
      render();
      return false;
    }
    return setBpm(parsed.bpm, { announceChange });
  }
  function setSignature(signature, custom = false) {
    const next = core.normalizeTimeSignature(signature);
    settings.accents = core.normalizeAccentPattern(settings.accents, next.numerator);
    settings.signature = next;
    settings.customSignature = custom;
    if (playing && schedulerState) schedulerState.pendingSignature = next;
    else if (schedulerState) schedulerState.signature = next;
    saveSettings(); render(); announce(`拍號已設為 ${next.numerator}/${next.denominator}`);
  }
  function cancelScheduledNodes() {
    scheduledNodes.forEach((node) => { try { node.stop(); } catch {} try { node.disconnect(); } catch {} });
    scheduledNodes.clear();
  }
  function clearScheduledVisualEvents() {
    scheduledVisualEvents = [];
  }
  function getPresentedAudioTime(context) {
    return core.getPresentedAudioTime(context);
  }
  function queueVisualEvent(state, accentState, rhythmPattern, isHit, toneKind) {
    scheduledVisualEvents.push({
      audioTime: state.nextNoteTime,
      sequence: state.sequence,
      beatIndex: state.beatIndex,
      subdivisionIndex: state.subdivisionIndex,
      formalMeasures: state.formalMeasures,
      accentState,
      rhythmPatternId: rhythmPattern.id,
      isHit,
      toneKind,
      countIn: state.countInMeasuresRemaining > 0,
      schedulerState: { ...state, signature: { ...state.signature }, pendingSignature: state.pendingSignature ? { ...state.pendingSignature } : null },
    });
  }
  function scheduleTone(time, kind, countIn = false) {
    if (settings.muted || settings.volume <= 0) return;
    const context = getAudioContext();
    if (!context) return;
    const profile = SOUND_PROFILES[settings.sound] || SOUND_PROFILES.wood;
    const tone = profile[kind] || profile.normal;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = tone.type;
    oscillator.frequency.setValueAtTime(countIn ? tone.frequency * 0.78 : tone.frequency, time);
    const base = settings.volume / 100;
    const level = base * tone.level * (countIn ? 0.62 : 1);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, level), time + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + tone.duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(time); oscillator.stop(time + tone.duration + 0.02);
    scheduledNodes.add(oscillator);
    oscillator.onended = () => { scheduledNodes.delete(oscillator); try { oscillator.disconnect(); gain.disconnect(); } catch {} };
  }
  function scheduleOne(state) {
    const accent = settings.accents[state.beatIndex] || "normal";
    const rhythmPattern = selectedRhythmPattern();
    const isHit = core.isRhythmHit(rhythmPattern.id, state.subdivisionIndex);
    const toneKind = core.getRhythmStepSound({ rhythmPatternId: rhythmPattern.id, subdivisionIndex: state.subdivisionIndex, accentState: accent });
    queueVisualEvent(state, accent, rhythmPattern, isHit, toneKind);
    if (toneKind) scheduleTone(state.nextNoteTime, toneKind, state.countInMeasuresRemaining > 0);
  }
  function schedulerTick() {
    if (!playing || !schedulerState) return;
    const context = getAudioContext();
    if (!context) return;
    while (schedulerState.nextNoteTime < context.currentTime + LOOKAHEAD_SECONDS) {
      const applied = core.applyPendingSignatureAtBar(schedulerState, settings.accents);
      schedulerState = applied.state; settings.accents = applied.accentPattern;
      const nextTrainerBpm = applyTempoTrainerAtBar();
      scheduleOne(schedulerState);
      schedulerState = core.advanceSchedulerState(schedulerState, { ...settings, bpm: nextTrainerBpm });
      const elapsed = formalStartedAt ? Date.now() - formalStartedAt : 0;
      if (schedulerState.countInMeasuresRemaining === 0 && !formalStartedAt) formalStartedAt = Date.now();
      if (formalStartedAt && core.shouldAutoStop(settings, schedulerState, elapsed)) {
        stop({ completed: true }); return;
      }
    }
  }
  function visualTick() {
    if (!playing || !schedulerState) return;
    const context = getAudioContext();
    if (!context) return;
    const presentedAudioTime = getPresentedAudioTime(context);
    const consumed = core.consumeDueVisualEvents(scheduledVisualEvents, presentedAudioTime);
    const { latestDue } = consumed;
    scheduledVisualEvents = consumed.remaining;
    if (latestDue && latestDue.sequence !== lastVisualSequence) {
      lastVisualSequence = latestDue.sequence;
      presentedVisualEvent = latestDue;
      const deltaMs = (presentedAudioTime - latestDue.audioTime) * 1000;
      visualDiagnostics.push({
        scheduledAudioTime: latestDue.audioTime,
        presentedVisualTime: presentedAudioTime,
        deltaMs,
        beatIndex: latestDue.beatIndex,
        subdivisionIndex: latestDue.subdivisionIndex,
      });
      if (visualDiagnostics.length > 160) visualDiagnostics.splice(0, visualDiagnostics.length - 160);
      renderBeat(latestDue);
    }
    animationFrame = requestAnimationFrame(visualTick);
  }
  function rescheduleFromNow() {
    if (!playing) return;
    const context = getAudioContext(); if (!context) return;
    const resumeState = scheduledVisualEvents[0]?.schedulerState || schedulerState;
    cancelScheduledNodes();
    clearScheduledVisualEvents();
    schedulerState = { ...resumeState, signature: { ...resumeState.signature }, pendingSignature: resumeState.pendingSignature ? { ...resumeState.pendingSignature } : null, nextNoteTime: context.currentTime + 0.05 };
  }
  async function start() {
    if (playing) return;
    const context = getAudioContext(); if (!context) return;
    if (context.state === "suspended") await context.resume();
    if (settings.tempoTrainer.enabled) settings.bpm = core.normalizeBpm(settings.tempoTrainer.startBpm, settings.bpm);
    playing = true; formalStartedAt = 0;
    schedulerState = core.createSchedulerState(settings, context.currentTime + 0.08);
    resetTrainerRuntime(0);
    lastVisualSequence = -1;
    presentedVisualEvent = null;
    lastPresentedMainBeatIndex = -1;
    clearScheduledVisualEvents();
    schedulerTimer = window.setInterval(schedulerTick, SCHEDULER_TICK_MS);
    schedulerTick(); animationFrame = requestAnimationFrame(visualTick);
    render(); announce("節拍器已開始");
  }
  function stop({ completed = false } = {}) {
    if (!playing && !schedulerTimer && !animationFrame) return;
    if (schedulerTimer) clearInterval(schedulerTimer);
    if (animationFrame) cancelAnimationFrame(animationFrame);
    schedulerTimer = null; animationFrame = null; playing = false;
    cancelScheduledNodes();
    clearScheduledVisualEvents();
    presentedVisualEvent = null;
    lastPresentedMainBeatIndex = -1;
    if (settings.tempoTrainer.enabled && !settings.tempoTrainer.keepCurrent) settings.bpm = core.normalizeBpm(settings.tempoTrainer.startBpm);
    resetTrainerRuntime(0);
    saveSettings(); render();
    announce(completed ? "節拍器練習完成" : "節拍器已停止");
    if (completed) $("#metronomeComplete")?.classList.remove("hidden");
  }
  function renderSubdivisionProgress(event = null) {
    const node = $("#metronomeSubdivisionPulse");
    if (!node) return;
    const pattern = core.getRhythmPattern(event?.rhythmPatternId || settings.rhythmPatternId, settings.subdivision);
    const currentIndex = event ? event.subdivisionIndex : -1;
    node.innerHTML = pattern.hits.map((hit, index) => `<i class="${hit ? "hit" : "rest"}${index === currentIndex ? " current" : ""}" data-rhythm-step="${index}"></i>`).join("");
  }
  function renderBeat(event) {
    if (!event) return;
    renderSubdivisionProgress(event);
    if (event.subdivisionIndex !== 0) return;
    lastPresentedMainBeatIndex = event.beatIndex;
    $$("#metronomeBeatDots [data-beat-index]").forEach((dot, index) => {
      const current = index === event.beatIndex;
      dot.classList.toggle("active", current);
      if (current) dot.setAttribute("aria-current", "true");
      else dot.removeAttribute("aria-current");
    });
    $("#metronomePendulum")?.classList.toggle("swing-right", event.sequence % 2 === 0);
  }
  function renderBeatDots() {
    const labels = { strong: "強音", normal: "普通", muted: "靜音" };
    const dots = $("#metronomeBeatDots");
    if (!dots) return;
    dots.style.setProperty("--metronome-beat-columns", String(Math.min(4, Math.max(1, settings.accents.length))));
    dots.innerHTML = settings.accents.map((state, index) => {
      const current = Boolean(playing && lastPresentedMainBeatIndex === index);
      return `<button type="button" data-beat-index="${index}" data-accent-state="${state}" aria-label="第 ${index + 1} 拍，${labels[state]}" aria-pressed="${state === "strong"}"${current ? ' aria-current="true" class="active"' : ""}><span>${index + 1}</span>${state === "muted" ? '<i aria-hidden="true">×</i>' : ""}</button>`;
    }).join("");
  }
  function renderPresets() {
    const list = $("#metronomePresetList"); if (!list) return;
    list.innerHTML = settings.presets.map((preset, index) => `<li><button type="button" data-preset-apply="${index}"><strong>${preset.name}</strong><span>${preset.bpm} BPM · ${preset.signature.numerator}/${preset.signature.denominator}</span></button><button type="button" data-preset-rename="${index}">改名</button><button type="button" data-preset-delete="${index}">刪除</button></li>`).join("") || "<li class=\"empty\">尚未儲存預設組合</li>";
  }
  function render() {
    renderBpmReadout();
    renderStageToolbar();
    if ($("#metronomeSignatureDisplay")) $("#metronomeSignatureDisplay").textContent = `${settings.signature.numerator}/${settings.signature.denominator}`;
    const rhythm = selectedRhythmPattern();
    if ($("#metronomeRhythmPreview")) {
      $("#metronomeRhythmPreview").innerHTML = rhythmNotationSvg(rhythm, { compact: true });
      $("#metronomeRhythmPreview").setAttribute("aria-label", rhythm.ariaLabel);
    }
    if ($("#metronomeToggle")) $("#metronomeToggle").textContent = playing ? "停止" : "開始";
    if ($("#metronomeVolume")) $("#metronomeVolume").value = String(settings.volume);
    if ($("#metronomeSound")) $("#metronomeSound").value = settings.sound;
    if ($("#metronomeMute")) $("#metronomeMute").textContent = settings.muted ? "解除靜音" : "靜音";
    const swingAvailable = core.supportsSwing(settings.rhythmPatternId, settings.subdivision);
    if ($("#metronomeSwingRow")) $("#metronomeSwingRow").classList.toggle("hidden", !swingAvailable);
    if ($("#metronomeSwing")) { $("#metronomeSwing").disabled = !swingAvailable; $("#metronomeSwing").value = String(settings.swingPercent); }
    if ($("#metronomeSwingValue")) $("#metronomeSwingValue").textContent = `${settings.swingPercent}%`;
    $$("[data-count-in]").forEach((button) => button.classList.toggle("active", Number(button.dataset.countIn) === settings.countInMeasures));
    const matchingVisualEvent = presentedVisualEvent?.rhythmPatternId === rhythm.id ? presentedVisualEvent : null;
    renderBeatDots(); renderSubdivisionProgress(matchingVisualEvent); renderRhythmOptions(); renderPresets();
  }
  function currentPreset(name) { return core.normalizePreset({ ...settings, name }); }
  function bind() {
    $("#metronomeToggle")?.addEventListener("click", () => playing ? stop() : start());
    $("#metronomeBpmRange")?.addEventListener("input", (event) => setBpm(event.target.value, { announceChange: false }));
    const bpmInput = $("#metronomeBpmInput");
    bpmInput?.addEventListener("change", (event) => commitBpmInput(event.target.value));
    bpmInput?.addEventListener("blur", (event) => commitBpmInput(event.target.value));
    bpmInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commitBpmInput(event.currentTarget.value);
        event.currentTarget.blur();
      } else if (event.key === "Escape") {
        event.preventDefault();
        render();
        event.currentTarget.blur();
      }
    });
    $$('[data-bpm-delta]').forEach((button) => button.addEventListener("click", () => setBpm(settings.bpm + Number(button.dataset.bpmDelta))));
    $("#metronomeTap")?.addEventListener("click", () => { tapState = core.registerTap(tapState, performance.now()); $("#metronomeTapResult").textContent = tapState.bpm ? `${tapState.bpm} BPM` : "再點一下"; if (tapState.bpm) setBpm(tapState.bpm, { announceChange: false }); });
    $("#metronomeTrainerOpen")?.addEventListener("click", openTrainerPanel);
    $("#metronomeAutoStopOpen")?.addEventListener("click", openAutoStopPanel);
    $("#metronomeSignatureOpen")?.addEventListener("click", openSignaturePanel);
    $("#metronomeRhythmOpen")?.addEventListener("click", () => { renderRhythmOptions(); openPanel("rhythm"); });
    $("#metronomeTrainerCancel")?.addEventListener("click", () => closeTopPanel());
    $("#metronomeTrainerApply")?.addEventListener("click", applyTrainerDraft);
    $("#metronomeAutoStopCancel")?.addEventListener("click", () => closeTopPanel());
    $("#metronomeAutoStopApply")?.addEventListener("click", applyAutoStopDraft);
    $("#metronomeSignatureCancel")?.addEventListener("click", () => closeTopPanel());
    $("#metronomeRhythmCancel")?.addEventListener("click", () => closeTopPanel());
    Object.values(PANEL_IDS).forEach((id) => $(`#${id}`)?.addEventListener("click", (event) => {
      if (event.target.id === id) closeTopPanel({ haptic: true });
    }));
    $("#tempoTrainerEnabled")?.addEventListener("change", (event) => {
      const wasEnabled = Boolean(trainerDraft?.enabled);
      trainerDraft = readTrainerDraft();
      trainerDraft.enabled = event.target.checked;
      if (trainerDraft.enabled && !wasEnabled) {
        trainerDraft.startBpm = Math.min(239, settings.bpm);
        if (trainerDraft.targetBpm <= settings.bpm) trainerDraft.targetBpm = Math.min(240, settings.bpm + 1);
      }
      renderTrainerDraft();
    });
    $("#metronomeAutoStop")?.addEventListener("change", (event) => {
      const [mode, value] = event.target.value.split(":");
      autoStopDraft = { mode, value: mode === "measures" ? Number($("#metronomeCustomMeasures").value) || 1 : Number(value) || 0 };
      renderAutoStopDraft();
    });
    $("#metronomeSignatureOptions")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-signature-option]");
      if (!button) return;
      if (button.dataset.signatureOption === "custom") {
        signatureDraft = { signature: cloneValue(settings.signature), custom: true };
        renderSignatureDraft();
        return;
      }
      const [numerator, denominator] = button.dataset.signatureOption.split("/").map(Number);
      setSignature({ numerator, denominator });
      closeTopPanel();
    });
    $("#metronomeSignatureApply")?.addEventListener("click", () => {
      setSignature({ numerator: $("#customNumerator").value, denominator: $("#customDenominator").value }, true);
      closeTopPanel();
    });
    $("#metronomeRhythmOptions")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-rhythm-option]");
      if (!button) return;
      setRhythmPattern(button.dataset.rhythmOption);
      closeTopPanel();
    });
    $("#metronomeSwing")?.addEventListener("input", (event) => { settings.swingPercent = Number(event.target.value); saveSettings(); $("#metronomeSwingValue").textContent = `${settings.swingPercent}%`; if (playing) rescheduleFromNow(); });
    $("#metronomeBeatDots")?.addEventListener("click", (event) => { const button = event.target.closest("[data-beat-index]"); if (!button) return; const index = Number(button.dataset.beatIndex); settings.accents[index] = core.cycleAccent(settings.accents[index]); saveSettings(); renderBeatDots(); });
    $("#metronomeSound")?.addEventListener("change", (event) => { settings.sound = event.target.value; saveSettings(); });
    $("#metronomeVolume")?.addEventListener("input", (event) => { settings.volume = Number(event.target.value); if (settings.volume) settings.previousVolume = settings.volume; settings.muted = settings.volume === 0; saveSettings(); render(); });
    $("#metronomeMute")?.addEventListener("click", () => { settings.muted = !settings.muted; if (!settings.muted && settings.volume === 0) settings.volume = settings.previousVolume || 70; saveSettings(); render(); });
    $$('[data-count-in]').forEach((button) => button.addEventListener("click", () => { settings.countInMeasures = Number(button.dataset.countIn); saveSettings(); render(); }));
    $("#metronomeSavePreset")?.addEventListener("click", () => { if (settings.presets.length >= 5) return announce("最多只能儲存 5 組預設"); const name = prompt("預設名稱", `預設 ${settings.presets.length + 1}`); if (!name) return; settings.presets = core.savePresetList(settings.presets, currentPreset(name)); saveSettings(); render(); });
    $("#metronomePresetList")?.addEventListener("click", (event) => { const apply = event.target.closest("[data-preset-apply]"); const rename = event.target.closest("[data-preset-rename]"); const remove = event.target.closest("[data-preset-delete]"); if (apply) { settings = { ...settings, ...core.normalizePreset(settings.presets[Number(apply.dataset.presetApply)]), presets: settings.presets }; settings.customSignature = !BUILT_IN_SIGNATURES.has(signatureValue()); resetTrainerRuntime(playing && schedulerState ? schedulerState.formalMeasures : 0); saveSettings(); render(); if (playing) rescheduleFromNow(); } if (rename) { const index = Number(rename.dataset.presetRename); const name = prompt("重新命名", settings.presets[index].name); if (name) { settings.presets[index].name = name.slice(0, 20); saveSettings(); render(); } } if (remove) { settings.presets.splice(Number(remove.dataset.presetDelete), 1); saveSettings(); render(); } });
    $("#metronomeCompleteClose")?.addEventListener("click", () => $("#metronomeComplete")?.classList.add("hidden"));
    document.addEventListener("keydown", (event) => { if (event.key === "Escape" && closeTopPanel({ haptic: true })) event.preventDefault(); });
    document.addEventListener("visibilitychange", () => { if (document.hidden) { closeTopPanel({ restoreFocus: false }); stop(); } });
    window.addEventListener("pagehide", () => { closeTopPanel({ restoreFocus: false }); stop(); });
  }
  function init(options = {}) { dependencies = options; bind(); render(); }
  global.ChromaticaMetronome = Object.freeze({
    init,
    start,
    stop,
    closeTopPanel,
    hasOpenPanel: () => Boolean(activePanel),
    isPlaying: () => playing,
    getSettings: () => structuredClone(settings),
    getRuntimeDiagnostics: () => ({
      schedulerTimers: schedulerTimer ? 1 : 0,
      scheduledNodes: scheduledNodes.size,
      animationFrames: animationFrame ? 1 : 0,
      visualQueue: scheduledVisualEvents.length,
      presentedVisualEvent: presentedVisualEvent ? { ...presentedVisualEvent, schedulerState: undefined } : null,
      visualDiagnostics: visualDiagnostics.slice(-40),
      trainerRuntime: { ...trainerRuntime },
    }),
    storageKey: STORAGE_KEY,
  });
})(typeof window !== "undefined" ? window : globalThis);
