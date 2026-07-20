const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

require(path.join(__dirname, "..", "metronome-core.js"));
const core = global.ChromaticaMetronomeCore;
const patterns = Object.values(core.RHYTHM_PATTERNS);
const ui = fs.readFileSync(path.join(__dirname, "..", "metronome.js"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");

test("rhythm pattern ids are unique and the picker exposes ten definitions", () => {
  assert.equal(patterns.length, 10);
  assert.equal(new Set(patterns.map((pattern) => pattern.id)).size, patterns.length);
});

test("every pattern has a matching binary hit mask", () => {
  for (const pattern of patterns) {
    assert.equal(pattern.stepCount, pattern.hits.length, pattern.id);
    assert.ok(pattern.hits.every((hit) => hit === 0 || hit === 1), pattern.id);
  }
});

for (const [id, hits] of Object.entries({
  quarter: [1],
  eighth: [1, 1],
  "eighth-offbeat": [0, 1],
  triplet: [1, 1, 1],
  "triplet-middle-rest": [1, 0, 1],
  "triplet-last-rest": [1, 1, 0],
  sixteenth: [1, 1, 1, 1],
  "sixteenth-alternating": [1, 0, 1, 0],
  "sixteenth-middle-rests": [1, 0, 0, 1],
  "sixteenth-syncopated": [1, 0, 1, 1],
})) {
  test(`${id} uses its requested hit mask`, () => assert.deepEqual([...core.RHYTHM_PATTERNS[id].hits], hits));
}

test("every pattern keeps the total duration of one beat", () => {
  for (const pattern of patterns) {
    const duration = Array.from({ length: pattern.stepCount }, (_, subdivisionIndex) => core.getStepDurationSeconds({
      bpm: 60,
      signature: { numerator: 4, denominator: 4 },
      rhythmPatternId: pattern.id,
      swingPercent: 50,
      subdivisionIndex,
    })).reduce((sum, value) => sum + value, 0);
    assert.ok(Math.abs(duration - 1) < 1e-9, `${pattern.id}: ${duration}`);
  }
});

test("rest steps create no sound while hit steps select an AudioNode tone", () => {
  assert.equal(core.getRhythmStepSound({ rhythmPatternId: "triplet-middle-rest", subdivisionIndex: 1, accentState: "normal" }), null);
  assert.equal(core.getRhythmStepSound({ rhythmPatternId: "triplet-middle-rest", subdivisionIndex: 2, accentState: "normal" }), "subdivision");
  assert.match(ui, /if \(toneKind\) scheduleTone/);
});

test("muted main beats keep later subdivision sounds", () => {
  assert.equal(core.getRhythmStepSound({ rhythmPatternId: "sixteenth", subdivisionIndex: 0, accentState: "muted" }), null);
  assert.equal(core.getRhythmStepSound({ rhythmPatternId: "sixteenth", subdivisionIndex: 1, accentState: "muted" }), "subdivision");
});

test("offbeat rests on the main step and sounds on the second step", () => {
  assert.equal(core.getRhythmStepSound({ rhythmPatternId: "eighth-offbeat", subdivisionIndex: 0, accentState: "strong" }), null);
  assert.equal(core.getRhythmStepSound({ rhythmPatternId: "eighth-offbeat", subdivisionIndex: 1, accentState: "strong" }), "subdivision");
});

test("visual events are queued for hit and rest steps before optional sound", () => {
  assert.match(ui, /const isHit = core\.isRhythmHit/);
  assert.match(ui, /queueVisualEvent\(state, accent, rhythmPattern, isHit, toneKind\);\s*if \(toneKind\) scheduleTone/);
  assert.match(ui, /rhythmPatternId: rhythmPattern\.id/);
  assert.match(ui, /isHit,/);
});

test("main beat dots update only at subdivision index zero", () => {
  assert.match(ui, /renderSubdivisionProgress\(event\);\s*if \(event\.subdivisionIndex !== 0\) return/);
});

test("straight eighth is the only swing-enabled pattern", () => {
  for (const pattern of patterns) assert.equal(core.supportsSwing(pattern.id), pattern.id === "eighth", pattern.id);
  assert.match(ui, /core\.supportsSwing\(settings\.rhythmPatternId, settings\.subdivision\)/);
});

test("legacy settings migrate to the matching basic pattern", () => {
  for (const legacy of ["quarter", "eighth", "triplet", "sixteenth"]) {
    assert.equal(core.normalizeRhythmPatternId(undefined, legacy), legacy);
  }
  assert.equal(core.normalizeRhythmPatternId("missing", "missing"), "quarter");
  assert.match(ui, /normalizeRhythmPatternId\(stored\?\.rhythmPatternId, base\.subdivision\)/);
  assert.doesNotMatch(ui, /normalizeRhythmPatternId\(base\.rhythmPatternId, base\.subdivision\)/);
});

test("legacy presets migrate without losing their old subdivision", () => {
  const preset = core.normalizePreset({ name: "舊預設", subdivision: "triplet", bpm: 90 });
  assert.equal(preset.rhythmPatternId, "triplet");
  assert.equal(preset.subdivision, "triplet");
});

test("new presets retain advanced rhythm pattern ids", () => {
  const preset = core.normalizePreset({ name: "反拍", rhythmPatternId: "eighth-offbeat", subdivision: "eighth", bpm: 90 });
  assert.equal(preset.rhythmPatternId, "eighth-offbeat");
  assert.equal(preset.subdivision, "eighth");
});

test("picker and stage preview use inline notation without external fonts or images", () => {
  assert.match(ui, /function rhythmNotationSvg/);
  assert.match(ui, /<svg class="rhythm-notation/);
  assert.match(ui, /Object\.values\(core\.RHYTHM_PATTERNS\)/);
  assert.match(css, /\.rhythm-notation[^}]*width:/);
  assert.doesNotMatch(ui, /\.png|\.jpg|url\(/);
});

test("all three sound profiles retain an audible subdivision tone", () => {
  for (const sound of ["wood", "mechanical", "soft"]) {
    const block = ui.match(new RegExp(`${sound}: \\{([\\s\\S]*?)\\n    \\},`))?.[1] || "";
    assert.match(block, /subdivision: \{ frequency: \d+, type: "(?:triangle|square|sine)", level: 0\.[1-9]/);
  }
});
