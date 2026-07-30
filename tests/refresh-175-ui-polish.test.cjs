const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");

test("quick practice return and primary action follow their related status copy", () => {
  assert.match(
    html,
    /id="quickPracticeSummary"[\s\S]*id="quickPracticeBackBtn"[\s\S]*id="quickPracticeStateText"[\s\S]*quick-practice-primary-actions[\s\S]*id="quickPracticePrimaryBtn"[\s\S]*id="quickPracticeTaskList"/,
  );
  assert.match(css, /\.quick-practice-heading-back[\s\S]*grid-column:\s*2[\s\S]*white-space:\s*nowrap[\s\S]*writing-mode:\s*horizontal-tb/);
});

test("home practice button stays still while only its surrounding glow breathes", () => {
  assert.match(css, /\.hero-actions \.start-practice-button \{[\s\S]*animation:\s*none/);
  assert.match(css, /\.start-practice-glow \{[\s\S]*animation:\s*startPracticeGlow 3\.4s ease-in-out infinite/);
  assert.match(css, /@keyframes startPracticeGlow[\s\S]*opacity:\s*0\.12[\s\S]*opacity:\s*0\.76/);
});

test("unlocked full art card has a clearly stronger breathing glow", () => {
  assert.match(css, /@keyframes gardenSkillArtCardGlow[\s\S]*drop-shadow\(0 0 4px[\s\S]*drop-shadow\(0 0 70px/);
});
