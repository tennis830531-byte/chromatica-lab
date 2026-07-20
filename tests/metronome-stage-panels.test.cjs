const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const source = fs.readFileSync(path.join(root, "metronome.js"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const stage = html.slice(html.indexOf('<section class="metronome-stage paper-card">'), html.indexOf('<section class="metronome-controls paper-card">', html.indexOf('<section class="metronome-stage paper-card">')));

test("stage removes visible measure and current-beat text without deleting scheduler state", () => {
  assert.doesNotMatch(stage, /metronomeMeasureCount|metronomeCurrentBeat|小節\s*<|第\s*<b/);
  for (const token of ["formalMeasures", "beatIndex", "subdivisionIndex"]) assert.match(source, new RegExp(token));
});

test("stage toolbar exposes trainer and auto-stop dialogs without absolute positioning", () => {
  assert.match(stage, /id="metronomeStageToolbar"/);
  assert.match(stage, /id="metronomeTrainerOpen"[^>]*aria-haspopup="dialog"[^>]*aria-expanded="false"/);
  assert.match(stage, /id="metronomeAutoStopOpen"[^>]*aria-haspopup="dialog"[^>]*aria-expanded="false"/);
  const rule = css.match(/\.metronome-stage-toolbar\s*\{([^}]*)\}/)?.[1] || "";
  assert.match(rule, /display:\s*flex/);
  assert.match(rule, /justify-content:\s*space-between/);
  assert.doesNotMatch(rule, /position:\s*absolute/);
});

test("signature rhythm and subdivision progress lead into the beat dots", () => {
  const readout = stage.indexOf("metronome-readout");
  const selectors = stage.indexOf("metronome-stage-selectors");
  const progress = stage.indexOf("metronomeSubdivisionPulse");
  const dots = stage.indexOf("metronomeBeatDots");
  assert.ok(readout < selectors && selectors < progress && progress < dots);
  assert.match(stage, /id="metronomeSignatureDisplay"/);
  assert.match(stage, /id="metronomeRhythmPreview"/);
});

test("old lower signature trainer and auto-stop cards are removed", () => {
  assert.doesNotMatch(html, /<section class="metronome-controls paper-card">\s*<h3>拍號與細分<\/h3>/);
  assert.doesNotMatch(html, /<section class="metronome-controls paper-card">\s*<h3>速度訓練<\/h3>/);
  assert.doesNotMatch(html, /<section class="metronome-controls paper-card"><h3>自動停止<\/h3>/);
});

test("all four settings panels exist with bounded bottom-sheet layout", () => {
  for (const id of ["metronomeTrainerDialog", "metronomeAutoStopDialog", "metronomeSignatureDialog", "metronomeRhythmDialog"]) {
    assert.match(html, new RegExp(`id="${id}"[^>]*role="dialog"[^>]*aria-modal="true"`));
  }
  assert.match(css, /\.metronome-panel-backdrop[^}]*align-items:\s*end/);
  assert.match(css, /\.metronome-panel-sheet[^}]*max-height:[^;]*dvh/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
});

test("trainer and auto-stop use drafts and save only on apply", () => {
  assert.match(source, /trainerDraft = cloneValue\(settings\.tempoTrainer\)/);
  assert.match(source, /settings\.tempoTrainer = readTrainerDraft\(\)/);
  assert.match(source, /autoStopDraft = cloneValue\(settings\.autoStop/);
  assert.match(source, /function applyAutoStopDraft[\s\S]*settings\.autoStop =/);
  assert.match(source, /metronomeTrainerCancel[^\n]*closeTopPanel/);
  assert.match(source, /metronomeAutoStopCancel[^\n]*closeTopPanel/);
});

test("backdrop Escape Android back and view changes close only the top panel first", () => {
  assert.match(source, /event\.target\.id === id\) closeTopPanel\(\{ haptic: true \}\)/);
  assert.match(source, /event\.key === "Escape" && closeTopPanel/);
  assert.match(app, /currentView === "metronome" && window\.ChromaticaMetronome\?\.closeTopPanel/);
  assert.match(app, /view !== "metronome"[\s\S]*closeTopPanel[\s\S]*stop/);
});

test("preset application still restores trainer auto-stop and signature settings", () => {
  assert.match(source, /core\.normalizePreset\(settings\.presets/);
  assert.match(source, /settings\.customSignature = !BUILT_IN_SIGNATURES\.has/);
  assert.match(source, /resetTrainerRuntime/);
  assert.match(source, /formatAutoStopSummary/);
});
