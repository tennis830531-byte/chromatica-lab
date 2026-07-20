const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const haptics = fs.readFileSync(path.join(root, "haptic-feedback.js"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const qa = fs.readFileSync(path.join(root, "garden-qa.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

test("shared haptic module exposes tap close success long and support checks", () => {
  for (const name of ["tap", "close", "success", "long", "isSupported"]) assert.match(haptics, new RegExp(`function ${name}\\(`));
  assert.match(haptics, /impact\(\{ style: "LIGHT" \}\)/);
  assert.match(haptics, /impact\(\{ style: "MEDIUM" \}\)/);
  assert.match(haptics, /notification\(\{ type: "SUCCESS" \}\)/);
  assert.match(haptics, /duration: FALLBACK_DURATIONS\.long/);
});

test("web without native haptics or vibration remains a quiet no-op", async () => {
  const context = vm.createContext({});
  context.window = context;
  vm.runInContext(haptics, context);
  assert.equal(context.ChromaticaHaptics.isSupported(), false);
  assert.equal(await context.ChromaticaHaptics.tap(), false);
  assert.equal(await context.ChromaticaHaptics.close(), false);
});

test("runtime click and close sounds are no longer called", () => {
  assert.doesNotMatch(app, /playSound\("(?:uiTap|close)"\)/);
  assert.doesNotMatch(app, /bindSoundFeedback|getInteractionSoundId/);
  assert.match(app, /ChromaticaHaptics\?\.bindGlobalFeedback/);
});

test("global feedback excludes disabled synthetic and manual controls", () => {
  assert.match(haptics, /if \(!event\.isTrusted\) return/);
  assert.match(haptics, /control\.disabled \|\| control\.getAttribute\("aria-disabled"\) === "true"/);
  assert.doesNotMatch(haptics, /input\[type='range'\]|textarea|input\[type='text'\]/);
  assert.match(haptics, /explicit === "none" \|\| explicit === "manual"/);
});

test("hidden QA title never leaks global haptic feedback", () => {
  assert.match(html, /id="homeHeroQaTitle" data-haptic="none"/);
  assert.match(qa, /titleClicks < REQUIRED_CLICKS/);
});

test("formal and QA stage changes request one long haptic while ordinary water uses tap", () => {
  assert.match(app, /if \(stageChanged\) \{\s*void window\.ChromaticaHaptics\?\.long\?\.\(\)/);
  assert.match(app, /else void window\.ChromaticaHaptics\?\.tap\?\.\(\)/);
  assert.match(app, /playGardenEffect: \(evolved\) => \{[\s\S]*if \(evolved\) \{\s*void window\.ChromaticaHaptics\?\.long/);
  assert.match(html, /data-qa-action="(?:water|fill|mature)" data-haptic="manual"/);
});
