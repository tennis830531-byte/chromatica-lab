const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");

test("home daily-goal badge shows unfinished count and a completed check", () => {
  assert.match(html, /data-daily-goal-unfinished/);
  assert.match(app, /const unfinishedCount = Math\.max\(0, tasks\.length - doneCount\)/);
  assert.match(app, /dailyGoalBadge\.textContent = allDone \? "✓" : String\(unfinishedCount\)/);
  assert.match(app, /dailyGoalBadge\.classList\.toggle\("complete", allDone\)/);
  assert.match(styles, /\.daily-goal-unfinished-badge[\s\S]*background:\s*#c52f2f/);
  assert.match(styles, /\.daily-goal-unfinished-badge\.complete[\s\S]*background:\s*#3d8b4f/);
});

test("home garden badge shows a water drop only while the active plant can be watered", () => {
  assert.match(html, /data-garden-water-ready[\s\S]*garden\/icons\/water-drop\.png/);
  assert.match(app, /function renderGardenWaterBadge\(plant = getCurrentPlant\(false\)\)/);
  assert.match(app, /progress < PLANT_WATER_REQUIRED && getWaterDrops\(\) > 0/);
  assert.match(app, /badge\.hidden = !canWater/);
  assert.match(app, /function setWaterDrops[\s\S]*renderGardenWaterBadge\(\)/);
  assert.match(styles, /\.garden-water-ready-badge[\s\S]*width:\s*12px[\s\S]*height:\s*16px[\s\S]*background:\s*transparent/);
  assert.match(styles, /\.quick-card \.garden-water-ready-badge img[\s\S]*width:\s*10px[\s\S]*height:\s*14px/);
});
