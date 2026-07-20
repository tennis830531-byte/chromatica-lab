const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const source = fs.readFileSync(path.join(root, "metronome.js"), "utf8");
const coreSource = fs.readFileSync(path.join(root, "metronome-core.js"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");

test("time signature uses a stage button and modal choices", () => {
  assert.match(html, /id="metronomeSignatureOpen"[^>]*aria-haspopup="dialog"/);
  const options = html.match(/id="metronomeSignatureOptions"([\s\S]*?)<\/div>/)?.[1] || "";
  for (const value of ["2/4", "3/4", "4/4", "5/4", "6/8", "7/8", "9/8", "12/8", "custom"]) assert.match(options, new RegExp(`data-signature-option="${value.replace("/", "\\/")}"`));
});

test("subdivision uses a stage preview and picker panel", () => {
  assert.match(html, /id="metronomeRhythmOpen"[^>]*aria-haspopup="dialog"/);
  assert.match(html, /id="metronomeRhythmPreview"/);
  for (const value of ["quarter", "eighth", "triplet", "sixteenth"]) assert.match(coreSource, new RegExp(`id: "${value}"`));
});

test("custom signature is drafted in the panel and applied explicitly", () => {
  assert.match(source, /button\.dataset\.signatureOption === "custom"/);
  assert.match(source, /customTimeSignature[^\n]*classList\.toggle\("hidden", !signatureDraft\.custom\)/);
  assert.match(source, /metronomeSignatureApply[\s\S]*setSignature/);
});

test("swing UI is available only for eighth-note subdivision", () => {
  assert.match(source, /swingAvailable = core\.supportsSwing/);
  assert.match(source, /metronomeSwingRow[^\n]*classList\.toggle\("hidden", !swingAvailable\)/);
  assert.match(source, /metronomeSwing[^\n]*disabled = !swingAvailable/);
});

test("beat dots own accent interaction and old accent card is absent", () => {
  assert.match(html, /id="metronomeBeatDots"[^>]*role="group"/);
  assert.doesNotMatch(html, /id="metronomeAccents"|每拍重音<\/h3>/);
  assert.match(source, /metronomeBeatDots[^\n]*addEventListener\("click"/);
  assert.match(source, /data-beat-index/);
  assert.doesNotMatch(source, /data-accent-index|renderAccents/);
});

test("beat state is not color-only and current playback remains independent", () => {
  assert.match(source, /aria-label="第 \$\{index \+ 1\} 拍，\$\{labels\[state\]\}"/);
  assert.match(source, /data-accent-state="\$\{state\}"/);
  assert.match(source, /state === "muted"[^\n]*×/);
  assert.match(source, /aria-current/);
  assert.match(css, /data-accent-state="muted"[\s\S]*opacity/);
});

test("trainer settings are hidden until the switch is enabled", () => {
  assert.match(html, /id="tempoTrainerEnabled"[^>]*aria-controls="tempoTrainerSettings"[^>]*aria-expanded="false"/);
  assert.match(html, /id="tempoTrainerSettings" class="hidden"/);
  assert.match(source, /tempoTrainerSettings[^\n]*classList\.toggle\("hidden", !enabled\)/);
  assert.match(source, /tempoTrainerEnabled[^\n]*setAttribute\("aria-expanded"/);
});

test("enabling trainer starts from current BPM with a fresh measure baseline", () => {
  assert.match(source, /trainerDraft\.startBpm = Math\.min\(239, settings\.bpm\)/);
  assert.match(source, /schedulerState\.formalMeasures \+ \(atBarStart \? 0 : 1\)/);
  assert.match(source, /resetTrainerRuntime\(baseline\)/);
});

test("trainer applies only at a formal bar start and refreshes every BPM display", () => {
  assert.match(source, /beatIndex !== 0 \|\| schedulerState\.subdivisionIndex !== 0/);
  assert.match(source, /renderBpmReadout\(\)/);
  for (const id of ["metronomeBpm", "metronomeBpmRange", "metronomeBpmInput", "metronomeTempoTerm", "tempoTrainerStatus"]) assert.match(source, new RegExp(id));
});

test("trainer reaches a target without adding a second scheduler", () => {
  assert.match(source, /Math\.min\(target, settings\.bpm \+ increment, 240\)|increaseTrainerBpm/);
  assert.match(source, /已達目標 \$\{target\} BPM/);
  assert.match(source, /if \(playing\) return/);
  assert.match(source, /schedulerTimers: schedulerTimer \? 1 : 0/);
  assert.equal((source.match(/window\.setInterval\(schedulerTick/g) || []).length, 1);
});

test("disabling trainer stops later increases but retains current BPM", () => {
  assert.match(source, /settings\.tempoTrainer = readTrainerDraft\(\)/);
  assert.match(source, /else if \(previousEnabled\)[\s\S]*resetTrainerRuntime\(0\)/);
  assert.doesNotMatch(source, /else \{\s*settings\.bpm = settings\.tempoTrainer\.startBpm/);
});

test("responsive stage selectors keep two columns at 320px", () => {
  assert.match(css, /\.metronome-stage-selectors[^}]*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 300px\)[\s\S]*\.metronome-stage-selectors[^}]*minmax\(0, 1fr\)/);
  assert.match(css, /\.metronome-beat-dots[^}]*repeat\(var\(--metronome-beat-columns, 4\), minmax\(0, 1fr\)\)/);
});
