(function initMetronome(global) {
  "use strict";
  const core = global.ChromaticaMetronomeCore;
  const STORAGE_KEY = "chromatica.settings.metronome";
  const LOOKAHEAD_SECONDS = 0.1;
  const SCHEDULER_TICK_MS = 25;
  const BUILT_IN_SIGNATURES = new Set(["2/4", "3/4", "4/4", "5/4", "6/8", "7/8", "9/8", "12/8"]);
  const SOUND_PROFILES = {
    wood: { strong: [1100, "triangle"], normal: [760, "triangle"], subdivision: [520, "sine"] },
    mechanical: { strong: [1450, "square"], normal: [980, "square"], subdivision: [660, "square"] },
    soft: { strong: [820, "sine"], normal: [620, "sine"], subdivision: [440, "sine"] },
  };
  const defaultSettings = {
    bpm: 80,
    signature: { numerator: 4, denominator: 4 },
    subdivision: "quarter",
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

  function $(selector) { return document.querySelector(selector); }
  function $$(selector) { return [...document.querySelectorAll(selector)]; }
  function loadSettings() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      const base = { ...defaultSettings, ...(stored || {}) };
      base.signature = core.normalizeTimeSignature(base.signature);
      base.customSignature = Boolean(base.customSignature || !BUILT_IN_SIGNATURES.has(`${base.signature.numerator}/${base.signature.denominator}`));
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
  function queueVisualEvent(state, accentState) {
    scheduledVisualEvents.push({
      audioTime: state.nextNoteTime,
      sequence: state.sequence,
      beatIndex: state.beatIndex,
      subdivisionIndex: state.subdivisionIndex,
      formalMeasures: state.formalMeasures,
      accentState,
      countIn: state.countInMeasuresRemaining > 0,
      schedulerState: { ...state, signature: { ...state.signature }, pendingSignature: state.pendingSignature ? { ...state.pendingSignature } : null },
    });
  }
  function scheduleTone(time, kind, countIn = false) {
    if (settings.muted || settings.volume <= 0) return;
    const context = getAudioContext();
    if (!context) return;
    const profile = SOUND_PROFILES[settings.sound] || SOUND_PROFILES.wood;
    const [frequency, type] = profile[kind] || profile.normal;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(countIn ? frequency * 0.78 : frequency, time);
    const base = settings.volume / 100;
    const level = base * (kind === "strong" ? 0.28 : kind === "normal" ? 0.19 : 0.1) * (countIn ? 0.62 : 1);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, level), time + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + (settings.sound === "soft" ? 0.11 : 0.065));
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(time); oscillator.stop(time + 0.13);
    scheduledNodes.add(oscillator);
    oscillator.onended = () => { scheduledNodes.delete(oscillator); try { oscillator.disconnect(); gain.disconnect(); } catch {} };
  }
  function scheduleOne(state) {
    const isMain = state.subdivisionIndex === 0;
    const accent = settings.accents[state.beatIndex] || "normal";
    queueVisualEvent(state, accent);
    if (isMain && accent !== "muted") scheduleTone(state.nextNoteTime, accent === "strong" ? "strong" : "normal", state.countInMeasuresRemaining > 0);
    else if (!isMain) scheduleTone(state.nextNoteTime, "subdivision", state.countInMeasuresRemaining > 0);
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
  function renderBeat(event) {
    if (!event) return;
    $("#metronomeSubdivisionPulse").textContent = event.subdivisionIndex ? "·" : "●";
    if (event.subdivisionIndex !== 0) return;
    lastPresentedMainBeatIndex = event.beatIndex;
    const beat = event.beatIndex + 1;
    $("#metronomeCurrentBeat").textContent = String(beat);
    $("#metronomeMeasureCount").textContent = String(event.formalMeasures + 1);
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
    if ($("#metronomeSignatureDisplay")) $("#metronomeSignatureDisplay").textContent = `${settings.signature.numerator}/${settings.signature.denominator}`;
    if ($("#metronomeToggle")) $("#metronomeToggle").textContent = playing ? "停止" : "開始";
    if ($("#metronomeVolume")) $("#metronomeVolume").value = String(settings.volume);
    if ($("#metronomeSound")) $("#metronomeSound").value = settings.sound;
    if ($("#metronomeMute")) $("#metronomeMute").textContent = settings.muted ? "解除靜音" : "靜音";
    if ($("#metronomeSwingRow")) $("#metronomeSwingRow").classList.toggle("hidden", settings.subdivision !== "eighth");
    if ($("#metronomeSwing")) { $("#metronomeSwing").disabled = settings.subdivision !== "eighth"; $("#metronomeSwing").value = String(settings.swingPercent); }
    if ($("#metronomeSwingValue")) $("#metronomeSwingValue").textContent = `${settings.swingPercent}%`;
    if ($("#customNumerator")) $("#customNumerator").value = String(settings.signature.numerator);
    if ($("#customDenominator")) $("#customDenominator").value = String(settings.signature.denominator);
    if ($("#tempoTrainerEnabled")) $("#tempoTrainerEnabled").checked = Boolean(settings.tempoTrainer.enabled);
    if ($("#tempoTrainerEnabled")) $("#tempoTrainerEnabled").setAttribute("aria-expanded", String(Boolean(settings.tempoTrainer.enabled)));
    if ($("#tempoTrainerSettings")) $("#tempoTrainerSettings").classList.toggle("hidden", !settings.tempoTrainer.enabled);
    if ($("#tempoTrainerStart")) $("#tempoTrainerStart").value = String(settings.tempoTrainer.startBpm);
    if ($("#tempoTrainerTarget")) $("#tempoTrainerTarget").value = String(settings.tempoTrainer.targetBpm);
    if ($("#tempoTrainerIncrement")) $("#tempoTrainerIncrement").value = String(settings.tempoTrainer.increment);
    if ($("#tempoTrainerEvery")) $("#tempoTrainerEvery").value = String(settings.tempoTrainer.everyMeasures);
    if ($("#tempoTrainerKeep")) $("#tempoTrainerKeep").value = settings.tempoTrainer.keepCurrent ? "keep" : "reset";
    if ($("#metronomeAutoStop")) $("#metronomeAutoStop").value = settings.autoStop.mode === "measures" ? "measures:1" : `${settings.autoStop.mode}:${settings.autoStop.value || 0}`;
    if ($("#metronomeCustomMeasures")) { $("#metronomeCustomMeasures").value = String(settings.autoStop.value || 1); $("#metronomeCustomMeasures").classList.toggle("hidden", settings.autoStop.mode !== "measures"); }
    const signatureSelect = $("#metronomeTimeSignatureSelect");
    if (signatureSelect) signatureSelect.value = settings.customSignature || !BUILT_IN_SIGNATURES.has(signatureValue()) ? "custom" : signatureValue();
    if ($("#metronomeSubdivisionSelect")) $("#metronomeSubdivisionSelect").value = settings.subdivision;
    $$("[data-count-in]").forEach((button) => button.classList.toggle("active", Number(button.dataset.countIn) === settings.countInMeasures));
    $("#customTimeSignature").classList.toggle("hidden", !settings.customSignature);
    renderBeatDots(); renderPresets();
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
    $("#metronomeTimeSignatureSelect")?.addEventListener("change", (event) => { if (event.target.value === "custom") { settings.customSignature = true; saveSettings(); render(); return; } const [numerator, denominator] = event.target.value.split("/").map(Number); setSignature({ numerator, denominator }); });
    $("#customNumerator")?.addEventListener("change", () => setSignature({ numerator: $("#customNumerator").value, denominator: $("#customDenominator").value }, true));
    $("#customDenominator")?.addEventListener("change", () => setSignature({ numerator: $("#customNumerator").value, denominator: $("#customDenominator").value }, true));
    $("#metronomeSubdivisionSelect")?.addEventListener("change", (event) => { settings.subdivision = event.target.value; saveSettings(); render(); announce("細分音符已更新"); if (playing) rescheduleFromNow(); });
    $("#metronomeSwing")?.addEventListener("input", (event) => { settings.swingPercent = Number(event.target.value); saveSettings(); $("#metronomeSwingValue").textContent = `${settings.swingPercent}%`; if (playing) rescheduleFromNow(); });
    $("#metronomeBeatDots")?.addEventListener("click", (event) => { const button = event.target.closest("[data-beat-index]"); if (!button) return; const index = Number(button.dataset.beatIndex); settings.accents[index] = core.cycleAccent(settings.accents[index]); saveSettings(); renderBeatDots(); });
    $("#metronomeSound")?.addEventListener("change", (event) => { settings.sound = event.target.value; saveSettings(); });
    $("#metronomeVolume")?.addEventListener("input", (event) => { settings.volume = Number(event.target.value); if (settings.volume) settings.previousVolume = settings.volume; settings.muted = settings.volume === 0; saveSettings(); render(); });
    $("#metronomeMute")?.addEventListener("click", () => { settings.muted = !settings.muted; if (!settings.muted && settings.volume === 0) settings.volume = settings.previousVolume || 70; saveSettings(); render(); });
    $$('[data-count-in]').forEach((button) => button.addEventListener("click", () => { settings.countInMeasures = Number(button.dataset.countIn); saveSettings(); render(); }));
    $("#tempoTrainerEnabled")?.addEventListener("change", (event) => {
      const enabled = event.target.checked;
      settings.tempoTrainer.enabled = enabled;
      if (enabled) {
        settings.tempoTrainer = core.normalizeTempoTrainer({ ...settings.tempoTrainer, enabled: true, startBpm: Math.min(239, settings.bpm), targetBpm: settings.tempoTrainer.targetBpm <= settings.bpm ? Math.min(240, settings.bpm + 1) : settings.tempoTrainer.targetBpm }, settings.bpm);
        const atBarStart = playing && schedulerState?.beatIndex === 0 && schedulerState?.subdivisionIndex === 0;
        const baseline = playing ? schedulerState.formalMeasures + (atBarStart ? 0 : 1) : 0;
        resetTrainerRuntime(baseline);
      } else {
        resetTrainerRuntime(0);
      }
      saveSettings(); render();
    });
    const trainerFields = { Start: "startBpm", Target: "targetBpm", Increment: "increment", Every: "everyMeasures" };
    Object.entries(trainerFields).forEach(([suffix, key]) => $("#tempoTrainer" + suffix)?.addEventListener("change", (event) => {
      settings.tempoTrainer[key] = Number(event.target.value);
      settings.tempoTrainer = core.normalizeTempoTrainer(settings.tempoTrainer, settings.bpm);
      if (key === "everyMeasures" && playing && schedulerState) resetTrainerRuntime(schedulerState.formalMeasures);
      saveSettings(); render();
    }));
    $("#tempoTrainerKeep")?.addEventListener("change", (event) => { settings.tempoTrainer.keepCurrent = event.target.value === "keep"; saveSettings(); render(); });
    $("#metronomeAutoStop")?.addEventListener("change", (event) => { const [mode, value] = event.target.value.split(":"); settings.autoStop = { mode, value: Number(value) || 0 }; $("#metronomeCustomMeasures").classList.toggle("hidden", mode !== "measures"); saveSettings(); });
    $("#metronomeCustomMeasures")?.addEventListener("change", (event) => { settings.autoStop = { mode: "measures", value: Math.max(1, Math.min(999, Number(event.target.value) || 1)) }; saveSettings(); });
    $("#metronomeSavePreset")?.addEventListener("click", () => { if (settings.presets.length >= 5) return announce("最多只能儲存 5 組預設"); const name = prompt("預設名稱", `預設 ${settings.presets.length + 1}`); if (!name) return; settings.presets = core.savePresetList(settings.presets, currentPreset(name)); saveSettings(); render(); });
    $("#metronomePresetList")?.addEventListener("click", (event) => { const apply = event.target.closest("[data-preset-apply]"); const rename = event.target.closest("[data-preset-rename]"); const remove = event.target.closest("[data-preset-delete]"); if (apply) { settings = { ...settings, ...core.normalizePreset(settings.presets[Number(apply.dataset.presetApply)]), presets: settings.presets }; settings.customSignature = !BUILT_IN_SIGNATURES.has(signatureValue()); resetTrainerRuntime(playing && schedulerState ? schedulerState.formalMeasures : 0); saveSettings(); render(); if (playing) rescheduleFromNow(); } if (rename) { const index = Number(rename.dataset.presetRename); const name = prompt("重新命名", settings.presets[index].name); if (name) { settings.presets[index].name = name.slice(0, 20); saveSettings(); render(); } } if (remove) { settings.presets.splice(Number(remove.dataset.presetDelete), 1); saveSettings(); render(); } });
    $("#metronomeCompleteClose")?.addEventListener("click", () => $("#metronomeComplete")?.classList.add("hidden"));
    document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); });
    window.addEventListener("pagehide", () => stop());
  }
  function init(options = {}) { dependencies = options; bind(); render(); }
  global.ChromaticaMetronome = Object.freeze({
    init,
    start,
    stop,
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
