import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const ui = fs.readFileSync(path.join(root, "metronome.js"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const build = fs.readFileSync(path.join(root, "scripts/build-web.mjs"), "utf8");

test("quick entry is between tuner and practice", () => {
  const tuner = html.indexOf("調音器</strong>");
  const metronome = html.indexOf("節拍器</strong>");
  const practice = html.indexOf("開始練習</strong>");
  assert.ok(tuner < metronome && metronome < practice);
});
test("metronome page exposes BPM tap stage pickers interactive beat dots and presets", () => { for (const id of ["metronomeToggle","metronomeBpmRange","metronomeBpmInput","metronomeTap","metronomeSignatureOpen","metronomeRhythmOpen","metronomeBeatDots","metronomeSavePreset"]) assert.match(html, new RegExp(`id="${id}"`)); assert.match(html, /<section id="metronome"[\s\S]*?<h2>節拍器<\/h2>/); assert.doesNotMatch(html, /id="metronomeAccents"/); });
test("metronome stage reuses the bird-free tuner texture with a blue palette", () => { const css=fs.readFileSync(path.join(root,"styles.css"),"utf8"); assert.match(css, /\.metronome-stage\s*\{[^}]*#dff1ff[^}]*#598db8/); assert.match(css, /\.metronome-stage::before\s*\{[^}]*tuner-card-bg\.png[^}]*grayscale\(1\)/); });
test("tuner and metronome page titles use their short labels", () => { assert.match(html, /<section id="tuner"[\s\S]*?<h2>調音器<\/h2>/); assert.match(html, /<section id="metronome"[\s\S]*?<h2>節拍器<\/h2>/); });
test("scheduler uses Web Audio currentTime with 100ms lookahead and 25ms tick", () => { assert.match(ui, /LOOKAHEAD_SECONDS = 0\.1/); assert.match(ui, /SCHEDULER_TICK_MS = 25/); assert.match(ui, /context\.currentTime \+ LOOKAHEAD_SECONDS/); assert.doesNotMatch(ui, /setInterval\([^,]+,\s*60000/); });
test("scheduler is singleton guarded and cancels future nodes", () => { assert.match(ui, /if \(playing\) return/); assert.match(ui, /cancelScheduledNodes/); assert.match(ui, /scheduledNodes = new Set/); });
test("metronome reuses injected application AudioContext", () => { assert.match(app, /ChromaticaMetronome\?\.init\?\.\(\{ getAudioContext: getSharedAudioContext \}\)/); assert.doesNotMatch(ui, /new AudioContext/); });
test("leaving view, background, pagehide and logout stop metronome", () => { assert.match(app, /view !== "metronome".*ChromaticaMetronome\?\.stop/s); assert.match(app, /pauseAudioForAppBackground[\s\S]*ChromaticaMetronome\?\.stop/); assert.match(ui, /visibilitychange/); assert.match(ui, /pagehide/); assert.match(app, /prepareForSignedOutAccount[\s\S]*ChromaticaMetronome\?\.stop/); });
test("metronome does not touch microphone, practice history, rewards or streak", () => { assert.doesNotMatch(ui, /getUserMedia|micStream|practiceHistory|waterDrop|DailyGoal|streak|award|scheduleAccountSnapshotSave/); });
test("muting preserves visual scheduler", () => { assert.match(ui, /if \(settings\.muted \|\| settings\.volume <= 0\) return/); assert.match(ui, /animationFrame = requestAnimationFrame\(visualTick\)/); });
test("wood and soft subdivisions remain audible on phone speakers", () => {
  assert.match(ui, /wood:[\s\S]*subdivision: \{ frequency: 700, type: "triangle", level: 0\.17/);
  assert.match(ui, /soft:[\s\S]*subdivision: \{ frequency: 640, type: "sine", level: 0\.18/);
  assert.match(ui, /const level = base \* tone\.level/);
  assert.match(ui, /time \+ tone\.duration/);
});
test("device preset storage is outside account workspace", () => { assert.match(ui, /chromatica\.settings\.metronome/); assert.doesNotMatch(fs.readFileSync(path.join(root,"account-workspace.js"),"utf8"), /settings\.metronome/); });
test("runtime build explicitly includes all metronome and QA scripts", () => { for (const script of ["metronome-core.js","metronome.js","garden-qa.js"]) assert.match(build, new RegExp(`"${script.replace(".","\\.")}"`)); });
test("reduced motion retains beat and subdivision indicators without a pendulum rule", () => { const css=fs.readFileSync(path.join(root,"styles.css"),"utf8"); assert.doesNotMatch(css, /metronome-pendulum|swing-right/); assert.match(html, /id="metronomeBeatDots"/); assert.match(html, /id="metronomeSubdivisionPulse"/); });
