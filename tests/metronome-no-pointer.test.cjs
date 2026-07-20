const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const source = fs.readFileSync(path.join(root, "metronome.js"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const stageStart = html.indexOf('<section class="metronome-stage paper-card">');
const stageEnd = html.indexOf('<section class="metronome-controls paper-card">', stageStart);
const stage = html.slice(stageStart, stageEnd);

test("pendulum DOM and its former visual wrapper are removed", () => {
  assert.doesNotMatch(html, /id="metronomePendulum"|class="metronome-pendulum"|class="metronome-visual"/);
});

test("metronome runtime no longer queries or animates a pendulum", () => {
  assert.doesNotMatch(source, /metronomePendulum|metronome-pendulum|swing-right|pendulum/i);
});

test("pendulum and swing direction CSS are completely removed", () => {
  assert.doesNotMatch(css, /\.metronome-pendulum|\.metronome-visual|swing-right/);
});

test("compact stage retains every required control in order", () => {
  const ids = [
    "metronomeStageToolbar",
    "metronomeBpm",
    "metronomeSignatureOpen",
    "metronomeRhythmOpen",
    "metronomeSubdivisionPulse",
    "metronomeBeatDots",
    "metronomeToggle",
  ];
  let previous = -1;
  for (const id of ids) {
    const index = stage.indexOf(`id="${id}"`);
    assert.ok(index > previous, `${id} must appear after the previous stage control`);
    previous = index;
  }
});

test("subdivision progress is a normal-flow compact row without reserved pointer height", () => {
  const rule = css.match(/\.metronome-subdivision-pulse\s*\{([^}]*)\}/)?.[1] || "";
  assert.match(rule, /display:\s*flex/);
  assert.match(rule, /width:\s*fit-content/);
  assert.match(rule, /margin:\s*12px auto 2px/);
  assert.doesNotMatch(rule, /position:\s*absolute|height:\s*120px|translate:/);
  assert.doesNotMatch(css, /height:\s*120px[^}]*metronome|metronome[^}]*height:\s*120px/i);
});

test("subdivision progress distinguishes hits rests and the current step", () => {
  assert.match(source, /pattern\.hits\.map\(\(hit, index\)/);
  assert.match(source, /hit \? "hit" : "rest"/);
  assert.match(source, /index === currentIndex \? " current"/);
  assert.match(css, /\.metronome-subdivision-pulse i\.rest/);
  assert.match(css, /\.metronome-subdivision-pulse i\.current/);
});

test("main beat dots still change only on subdivision zero", () => {
  assert.match(source, /renderSubdivisionProgress\(event\);\s*if \(event\.subdivisionIndex !== 0\) return/);
  assert.match(source, /dot\.classList\.toggle\("active", current\)/);
});

test("audio-timed visual queue and scheduler diagnostics remain intact", () => {
  assert.match(source, /scheduledVisualEvents\.push/);
  assert.match(source, /getPresentedAudioTime/);
  assert.match(source, /schedulerTimers: schedulerTimer \? 1 : 0/);
  assert.match(source, /scheduledNodes: scheduledNodes\.size/);
  assert.match(source, /animationFrames: animationFrame \? 1 : 0/);
  assert.match(source, /visualQueue: scheduledVisualEvents\.length/);
});

test("narrow layouts retain bounded stage controls without horizontal scrolling", () => {
  const selectors = css.match(/\.metronome-stage-selectors\s*\{([^}]*)\}/)?.[1] || "";
  const dots = css.match(/\.metronome-beat-dots\s*\{([^}]*)\}/)?.[1] || "";
  assert.match(selectors, /repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(dots, /minmax\(0, 1fr\)/);
  assert.match(dots, /width:\s*min\(100%, 264px\)/);
  assert.doesNotMatch(`${selectors}${dots}`, /overflow-x/);
});

test("enlarged text can wrap without restoring pointer whitespace", () => {
  assert.match(css, /\.metronome-controls button\s*\{\s*overflow-wrap:\s*anywhere/);
  assert.match(css, /@media \(max-width: 300px\)[\s\S]*metronome-stage-selectors[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.doesNotMatch(stage, /style="[^"]*(?:height|min-height):/);
});
