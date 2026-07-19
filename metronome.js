(function initMetronome(global) {
  "use strict";
  const core = global.ChromaticaMetronomeCore;
  const STORAGE_KEY = "chromatica.settings.metronome";
  const LOOKAHEAD_SECONDS = 0.1;
  const SCHEDULER_TICK_MS = 25;
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

  function $(selector) { return document.querySelector(selector); }
  function $$(selector) { return [...document.querySelectorAll(selector)]; }
  function loadSettings() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      const base = { ...defaultSettings, ...(stored || {}) };
      base.signature = core.normalizeTimeSignature(base.signature);
      base.accents = core.normalizeAccentPattern(base.accents, base.signature.numerator);
      base.presets = Array.isArray(base.presets) ? base.presets.slice(0, 5).map(core.normalizePreset) : [];
      return base;
    } catch { return structuredClone(defaultSettings); }
  }
  function saveSettings() { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); }
  function announce(message) { const node = $("#metronomeLive"); if (node) node.textContent = message; }
  function getAudioContext() { return dependencies.getAudioContext?.() || null; }
  function getCurrentBpm() { return core.getTrainerBpm(settings, schedulerState?.formalMeasures || 0, settings.bpm); }
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
      const nextTrainerBpm = core.getTrainerBpm(settings, schedulerState.formalMeasures, settings.bpm);
      if (settings.tempoTrainer.enabled) settings.bpm = nextTrainerBpm;
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
    if (schedulerState.sequence !== lastVisualSequence) { lastVisualSequence = schedulerState.sequence; renderBeat(); }
    animationFrame = requestAnimationFrame(visualTick);
  }
  function rescheduleFromNow() {
    if (!playing) return;
    const context = getAudioContext(); if (!context) return;
    cancelScheduledNodes();
    schedulerState.nextNoteTime = context.currentTime + 0.05;
  }
  async function start() {
    if (playing) return;
    const context = getAudioContext(); if (!context) return;
    if (context.state === "suspended") await context.resume();
    playing = true; formalStartedAt = 0;
    schedulerState = core.createSchedulerState(settings, context.currentTime + 0.08);
    lastVisualSequence = -1;
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
    if (settings.tempoTrainer.enabled && !settings.tempoTrainer.keepCurrent) settings.bpm = core.normalizeBpm(settings.tempoTrainer.startBpm);
    saveSettings(); render();
    announce(completed ? "節拍器練習完成" : "節拍器已停止");
    if (completed) $("#metronomeComplete")?.classList.remove("hidden");
  }
  function renderBeat() {
    if (!schedulerState) return;
    const beat = schedulerState.beatIndex + 1;
    $("#metronomeCurrentBeat").textContent = String(beat);
    $("#metronomeMeasureCount").textContent = String(schedulerState.formalMeasures + 1);
    $("#metronomeSubdivisionPulse").textContent = schedulerState.subdivisionIndex ? "·" : "●";
    $$("#metronomeBeatDots span").forEach((dot, index) => dot.classList.toggle("active", index === schedulerState.beatIndex));
    $("#metronomePendulum")?.classList.toggle("swing-right", schedulerState.sequence % 2 === 0);
  }
  function renderAccents() {
    const labels = { strong: "強", normal: "普通", muted: "靜音" };
    $("#metronomeAccents").innerHTML = settings.accents.map((state, index) => `<button type="button" data-accent-index="${index}" data-state="${state}" aria-label="第 ${index + 1} 拍，${labels[state]}" aria-pressed="${state === "strong"}"><b>${index + 1}</b><span>${labels[state]}</span></button>`).join("");
  }
  function renderPresets() {
    const list = $("#metronomePresetList"); if (!list) return;
    list.innerHTML = settings.presets.map((preset, index) => `<li><button type="button" data-preset-apply="${index}"><strong>${preset.name}</strong><span>${preset.bpm} BPM · ${preset.signature.numerator}/${preset.signature.denominator}</span></button><button type="button" data-preset-rename="${index}">改名</button><button type="button" data-preset-delete="${index}">刪除</button></li>`).join("") || "<li class=\"empty\">尚未儲存預設組合</li>";
  }
  function render() {
    const bpm = settings.bpm;
    if ($("#metronomeBpm")) $("#metronomeBpm").textContent = String(bpm);
    if ($("#metronomeBpmRange")) $("#metronomeBpmRange").value = String(bpm);
    if ($("#metronomeBpmInput")) $("#metronomeBpmInput").value = String(bpm);
    if ($("#metronomeTempoTerm")) $("#metronomeTempoTerm").textContent = core.getTempoTerm(bpm);
    if ($("#metronomeSignatureDisplay")) $("#metronomeSignatureDisplay").textContent = `${settings.signature.numerator}/${settings.signature.denominator}`;
    if ($("#metronomeToggle")) $("#metronomeToggle").textContent = playing ? "停止" : "開始";
    if ($("#metronomeVolume")) $("#metronomeVolume").value = String(settings.volume);
    if ($("#metronomeSound")) $("#metronomeSound").value = settings.sound;
    if ($("#metronomeMute")) $("#metronomeMute").textContent = settings.muted ? "解除靜音" : "靜音";
    if ($("#metronomeSwingRow")) $("#metronomeSwingRow").classList.toggle("is-disabled", settings.subdivision !== "eighth");
    if ($("#metronomeSwing")) { $("#metronomeSwing").disabled = settings.subdivision !== "eighth"; $("#metronomeSwing").value = String(settings.swingPercent); }
    if ($("#metronomeSwingValue")) $("#metronomeSwingValue").textContent = `${settings.swingPercent}%`;
    if ($("#customNumerator")) $("#customNumerator").value = String(settings.signature.numerator);
    if ($("#customDenominator")) $("#customDenominator").value = String(settings.signature.denominator);
    if ($("#tempoTrainerEnabled")) $("#tempoTrainerEnabled").checked = Boolean(settings.tempoTrainer.enabled);
    if ($("#tempoTrainerStart")) $("#tempoTrainerStart").value = String(settings.tempoTrainer.startBpm);
    if ($("#tempoTrainerTarget")) $("#tempoTrainerTarget").value = String(settings.tempoTrainer.targetBpm);
    if ($("#tempoTrainerIncrement")) $("#tempoTrainerIncrement").value = String(settings.tempoTrainer.increment);
    if ($("#tempoTrainerEvery")) $("#tempoTrainerEvery").value = String(settings.tempoTrainer.everyMeasures);
    if ($("#tempoTrainerKeep")) $("#tempoTrainerKeep").value = settings.tempoTrainer.keepCurrent ? "keep" : "reset";
    if ($("#metronomeAutoStop")) $("#metronomeAutoStop").value = settings.autoStop.mode === "measures" ? "measures:1" : `${settings.autoStop.mode}:${settings.autoStop.value || 0}`;
    if ($("#metronomeCustomMeasures")) { $("#metronomeCustomMeasures").value = String(settings.autoStop.value || 1); $("#metronomeCustomMeasures").classList.toggle("hidden", settings.autoStop.mode !== "measures"); }
    $$("[data-time-signature]").forEach((button) => button.classList.toggle("active", settings.customSignature ? button.dataset.timeSignature === "custom" : button.dataset.timeSignature === `${settings.signature.numerator}/${settings.signature.denominator}`));
    $$("[data-subdivision]").forEach((button) => button.classList.toggle("active", button.dataset.subdivision === settings.subdivision));
    $$("[data-count-in]").forEach((button) => button.classList.toggle("active", Number(button.dataset.countIn) === settings.countInMeasures));
    $("#metronomeBeatDots").innerHTML = settings.accents.map(() => "<span></span>").join("");
    $("#customTimeSignature").classList.toggle("hidden", !settings.customSignature);
    renderAccents(); renderPresets();
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
    $$('[data-time-signature]').forEach((button) => button.addEventListener("click", () => { if (button.dataset.timeSignature === "custom") { settings.customSignature = true; saveSettings(); render(); return; } const [numerator, denominator] = button.dataset.timeSignature.split("/").map(Number); setSignature({ numerator, denominator }); }));
    $("#customNumerator")?.addEventListener("change", () => setSignature({ numerator: $("#customNumerator").value, denominator: $("#customDenominator").value }, true));
    $("#customDenominator")?.addEventListener("change", () => setSignature({ numerator: $("#customNumerator").value, denominator: $("#customDenominator").value }, true));
    $$('[data-subdivision]').forEach((button) => button.addEventListener("click", () => { settings.subdivision = button.dataset.subdivision; saveSettings(); render(); announce("細分音符已更新"); if (playing) rescheduleFromNow(); }));
    $("#metronomeSwing")?.addEventListener("input", (event) => { settings.swingPercent = Number(event.target.value); saveSettings(); $("#metronomeSwingValue").textContent = `${settings.swingPercent}%`; if (playing) rescheduleFromNow(); });
    $("#metronomeAccents")?.addEventListener("click", (event) => { const button = event.target.closest("[data-accent-index]"); if (!button) return; const index = Number(button.dataset.accentIndex); settings.accents[index] = core.cycleAccent(settings.accents[index]); saveSettings(); render(); });
    $("#metronomeSound")?.addEventListener("change", (event) => { settings.sound = event.target.value; saveSettings(); });
    $("#metronomeVolume")?.addEventListener("input", (event) => { settings.volume = Number(event.target.value); if (settings.volume) settings.previousVolume = settings.volume; settings.muted = settings.volume === 0; saveSettings(); render(); });
    $("#metronomeMute")?.addEventListener("click", () => { settings.muted = !settings.muted; if (!settings.muted && settings.volume === 0) settings.volume = settings.previousVolume || 70; saveSettings(); render(); });
    $$('[data-count-in]').forEach((button) => button.addEventListener("click", () => { settings.countInMeasures = Number(button.dataset.countIn); saveSettings(); render(); }));
    $("#tempoTrainerEnabled")?.addEventListener("change", (event) => { settings.tempoTrainer.enabled = event.target.checked; saveSettings(); });
    const trainerFields = { Start: "startBpm", Target: "targetBpm", Increment: "increment", Every: "everyMeasures" };
    Object.entries(trainerFields).forEach(([suffix, key]) => $("#tempoTrainer" + suffix)?.addEventListener("change", (event) => { settings.tempoTrainer[key] = Number(event.target.value); if (settings.tempoTrainer.targetBpm <= settings.tempoTrainer.startBpm) settings.tempoTrainer.targetBpm = core.normalizeBpm(settings.tempoTrainer.startBpm + 1); saveSettings(); render(); }));
    $("#tempoTrainerKeep")?.addEventListener("change", (event) => { settings.tempoTrainer.keepCurrent = event.target.value === "keep"; saveSettings(); });
    $("#metronomeAutoStop")?.addEventListener("change", (event) => { const [mode, value] = event.target.value.split(":"); settings.autoStop = { mode, value: Number(value) || 0 }; $("#metronomeCustomMeasures").classList.toggle("hidden", mode !== "measures"); saveSettings(); });
    $("#metronomeCustomMeasures")?.addEventListener("change", (event) => { settings.autoStop = { mode: "measures", value: Math.max(1, Math.min(999, Number(event.target.value) || 1)) }; saveSettings(); });
    $("#metronomeSavePreset")?.addEventListener("click", () => { if (settings.presets.length >= 5) return announce("最多只能儲存 5 組預設"); const name = prompt("預設名稱", `預設 ${settings.presets.length + 1}`); if (!name) return; settings.presets = core.savePresetList(settings.presets, currentPreset(name)); saveSettings(); render(); });
    $("#metronomePresetList")?.addEventListener("click", (event) => { const apply = event.target.closest("[data-preset-apply]"); const rename = event.target.closest("[data-preset-rename]"); const remove = event.target.closest("[data-preset-delete]"); if (apply) { settings = { ...settings, ...core.normalizePreset(settings.presets[Number(apply.dataset.presetApply)]), presets: settings.presets }; saveSettings(); render(); if (playing) rescheduleFromNow(); } if (rename) { const index = Number(rename.dataset.presetRename); const name = prompt("重新命名", settings.presets[index].name); if (name) { settings.presets[index].name = name.slice(0, 20); saveSettings(); render(); } } if (remove) { settings.presets.splice(Number(remove.dataset.presetDelete), 1); saveSettings(); render(); } });
    $("#metronomeCompleteClose")?.addEventListener("click", () => $("#metronomeComplete")?.classList.add("hidden"));
    document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); });
    window.addEventListener("pagehide", () => stop());
  }
  function init(options = {}) { dependencies = options; bind(); render(); }
  global.ChromaticaMetronome = Object.freeze({ init, start, stop, isPlaying: () => playing, getSettings: () => structuredClone(settings), storageKey: STORAGE_KEY });
})(typeof window !== "undefined" ? window : globalThis);
