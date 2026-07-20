const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const source = fs.readFileSync(path.join(root, "metronome.js"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");

test("time signature is a single native select with all built-in choices", () => {
  const select = html.match(/<select id="metronomeTimeSignatureSelect">([\s\S]*?)<\/select>/)?.[1] || "";
  for (const value of ["2/4", "3/4", "4/4", "5/4", "6/8", "7/8", "9/8", "12/8", "custom"]) assert.match(select, new RegExp(`value="${value.replace("/", "\\/")}"`));
  assert.doesNotMatch(html, /data-time-signature/);
});

test("subdivision is a single native select and old buttons are gone", () => {
  const select = html.match(/<select id="metronomeSubdivisionSelect">([\s\S]*?)<\/select>/)?.[1] || "";
  for (const value of ["quarter", "eighth", "triplet", "sixteenth"]) assert.match(select, new RegExp(`value="${value}"`));
  assert.doesNotMatch(html, /data-subdivision/);
});

test("custom signature controls are shown only for custom selection", () => {
  assert.match(source, /metronomeTimeSignatureSelect[\s\S]*event\.target\.value === "custom"/);
  assert.match(source, /customTimeSignature[^\n]*classList\.toggle\("hidden", !settings\.customSignature\)/);
  assert.match(source, /!BUILT_IN_SIGNATURES\.has\(signatureValue\(\)\) \? "custom"/);
});

test("swing UI is available only for eighth-note subdivision", () => {
  assert.match(source, /metronomeSwingRow[^\n]*classList\.toggle\("hidden", settings\.subdivision !== "eighth"\)/);
  assert.match(source, /metronomeSwing[^\n]*disabled = settings\.subdivision !== "eighth"/);
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
  assert.match(source, /tempoTrainerSettings[^\n]*classList\.toggle\("hidden", !settings\.tempoTrainer\.enabled\)/);
  assert.match(source, /tempoTrainerEnabled[^\n]*setAttribute\("aria-expanded"/);
});

test("enabling trainer starts from current BPM with a fresh measure baseline", () => {
  assert.match(source, /startBpm: Math\.min\(239, settings\.bpm\)/);
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
  assert.match(source, /settings\.tempoTrainer\.enabled = enabled/);
  assert.match(source, /else \{\s*resetTrainerRuntime\(0\)/);
  assert.doesNotMatch(source, /else \{\s*settings\.bpm = settings\.tempoTrainer\.startBpm/);
});

test("responsive controls use two columns and collapse at 340px", () => {
  assert.match(css, /\.metronome-select-grid[^}]*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 340px\)[\s\S]*\.metronome-select-grid, \.metronome-trainer-grid[^}]*minmax\(0, 1fr\)/);
  assert.match(css, /\.metronome-beat-dots[^}]*repeat\(var\(--metronome-beat-columns, 4\), minmax\(0, 1fr\)\)/);
});
