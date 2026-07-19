const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "metronome.js"), "utf8");

function functionBody(name) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `${name} must exist`);
  const next = source.indexOf("\n  function ", start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

test("invalid BPM commit renders the canonical value without calling setBpm", () => {
  const body = functionBody("commitBpmInput");
  assert.match(body, /if \(!parsed\.valid\) \{\s*render\(\);\s*return false/);
  assert.match(body, /return setBpm\(parsed\.bpm/);
});

test("invalid BPM cannot reschedule a playing metronome", () => {
  const body = functionBody("commitBpmInput");
  assert.doesNotMatch(body.slice(body.indexOf("if (!parsed.valid)"), body.indexOf("return setBpm")), /rescheduleFromNow|cancelScheduledNodes|schedulerTimer/);
});

test("only a changed valid BPM reschedules future notes", () => {
  const body = functionBody("setBpm");
  assert.match(body, /if \(next === previous\) \{\s*render\(\);\s*return false/);
  assert.match(body, /if \(playing\) rescheduleFromNow\(\)/);
});

test("blur commits or restores the BPM input", () => {
  assert.match(source, /bpmInput\?\.addEventListener\("blur", \(event\) => commitBpmInput\(event\.target\.value\)\)/);
});

test("Enter commits and then blurs", () => {
  assert.match(source, /event\.key === "Enter"[\s\S]*commitBpmInput\(event\.currentTarget\.value\)[\s\S]*event\.currentTarget\.blur\(\)/);
});

test("Escape restores canonical BPM without committing", () => {
  const escapeBranch = source.match(/else if \(event\.key === "Escape"\) \{([\s\S]*?)\n      \}/)?.[1] || "";
  assert.match(escapeBranch, /render\(\)/);
  assert.match(escapeBranch, /blur\(\)/);
  assert.doesNotMatch(escapeBranch, /commitBpmInput|setBpm|rescheduleFromNow/);
});
