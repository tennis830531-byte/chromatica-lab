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
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const haptics = fs.readFileSync(path.join(root, "haptic-feedback.js"), "utf8");

test("quick entry is between tuner and practice", () => {
  const tuner = html.indexOf("調音器</strong>");
  const metronome = html.indexOf("節拍器</strong>");
  const practice = html.indexOf("開始練習</strong>");
  assert.ok(tuner < metronome && metronome < practice);
});
test("metronome page exposes BPM tap stage pickers interactive beat dots and presets", () => { for (const id of ["metronomeToggle","metronomeBpmRange","metronomeBpmInput","metronomeTap","metronomeSignatureOpen","metronomeRhythmOpen","metronomeBeatDots","metronomeSavePreset"]) assert.match(html, new RegExp(`id="${id}"`)); assert.match(html, /<section id="metronome"[\s\S]*?<h2>節拍器<\/h2>/); assert.doesNotMatch(html, /id="metronomeAccents"/); });
test("preset save and rename use an in-app dialog instead of native prompt", () => { for (const id of ["metronomePresetDialog", "metronomePresetForm", "metronomePresetName", "metronomePresetCancel"]) assert.match(html, new RegExp(`id="${id}"`)); assert.match(ui, /#metronomeSavePreset"\)\?\.addEventListener\("click", \(\) => openPresetPanel\(\)\)/); assert.match(ui, /savePresetDraft/); assert.doesNotMatch(ui, /\bprompt\(/); });
test("metronome stage reuses the bird-free tuner texture with a blue palette", () => { const css=fs.readFileSync(path.join(root,"styles.css"),"utf8"); assert.match(css, /\.metronome-stage\s*\{[^}]*#dff1ff[^}]*#598db8/); assert.match(css, /\.metronome-stage::before\s*\{[^}]*tuner-card-bg\.png[^}]*grayscale\(1\)/); });
test("tuner and metronome page titles use their short labels", () => { assert.match(html, /<section id="tuner"[\s\S]*?<h2>調音器<\/h2>/); assert.match(html, /<section id="metronome"[\s\S]*?<h2>節拍器<\/h2>/); });
test("preset dialog supports focus selection Enter submission and a twenty-character limit", () => { assert.match(html, /id="metronomePresetName"[^>]*maxlength="20"/); assert.match(ui, /requestAnimationFrame\(\(\) => \$\("#metronomePresetName"\)\?\.select\?\.\(\)\)/); assert.match(ui, /metronomePresetForm"\)\?\.addEventListener\("submit"[\s\S]*savePresetDraft\(\)/); });
test("blank and duplicate preset names display App errors", () => { assert.match(ui, /請輸入預設名稱。/); assert.match(ui, /已有相同名稱的預設組合。/); assert.match(ui, /core\.isPresetNameAvailable\(settings\.presets, name, presetDraftIndex\)/); });
test("a sixth preset is blocked by an App notice without deleting an old preset", () => { assert.match(ui, /settings\.presets\.length >= 5/); assert.match(ui, /最多只能儲存 5 組預設，請先刪除一組再新增。/); assert.doesNotMatch(ui, /presets\.(?:shift|pop)\(/); });
test("cancel close backdrop Escape and Android back close without saving", () => { assert.match(ui, /metronomePresetCancel"\)\?\.addEventListener\("click", \(\) => closeTopPanel\(\)\)/); assert.match(ui, /metronomePresetClose"\)\?\.addEventListener\("click", \(\) => closeTopPanel\(\)\)/); assert.match(ui, /event\.target\.id === id\) closeTopPanel\(\{ haptic: true \}\)/); assert.match(ui, /event\.key === "Escape" && closeTopPanel/); assert.match(app, /currentView === "metronome" && window\.ChromaticaMetronome\?\.closeTopPanel\?\.\(\{ haptic: true \}\)/); });
test("preset rendering treats names as text rather than HTML", () => { const render=ui.match(/function renderPresets\(\)[\s\S]*?\n  \}/)?.[0] || ""; assert.match(render, /name\.textContent = preset\.name/); assert.doesNotMatch(render, /innerHTML/); });
test("preset save and reload use device localStorage and normalize legacy entries", () => { assert.match(ui, /STORAGE_KEY = "chromatica\.settings\.metronome"/); assert.match(ui, /localStorage\.getItem\(STORAGE_KEY\)/); assert.match(ui, /base\.presets = Array\.isArray\(base\.presets\)[\s\S]*map\(core\.normalizePreset\)/); assert.match(ui, /localStorage\.setItem\(STORAGE_KEY, JSON\.stringify\(settings\)\)/); });
test("preset close and save use haptics without adding preset audio effects", () => { assert.match(haptics, /closeLike = \/close\|cancel\|back/); assert.match(ui, /ChromaticaHaptics\?\.success\?\.\(\)/); assert.doesNotMatch(ui, /preset[\s\S]{0,80}(?:playSound|clickSound|closeSound)/); });
test("preset dialog and blue stage stay constrained on narrow and enlarged layouts", () => { assert.match(styles, /\.metronome-page[^{]*\{[^}]*max-width: 100%/); assert.match(styles, /\.metronome-page > \*,\s*\.metronome-stage,\s*\.metronome-controls\s*\{[^}]*width: 100%[^}]*max-width: 100%/); assert.match(styles, /\.metronome-panel-sheet[^{]*\{[^}]*width: min\(100%, 520px\)/); assert.match(styles, /@media \(max-width: 340px\)[\s\S]*\.metronome-stage, \.metronome-controls/); });
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
