const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const leaderboard = fs.readFileSync(path.join(root, "leaderboard.js"), "utf8");
const worldBoss = fs.readFileSync(path.join(root, "world-boss.js"), "utf8");

test("renaming a collected spirit synchronizes its leaderboard profile and live Boss roster", () => {
  assert.match(app, /afterRename: \(\) => \{[\s\S]*ChromaticaLeaderboard\?\.syncFeaturedSpirit\?\.\(\)[\s\S]*ChromaticaWorldBoss\?\.refreshSpiritRoster\?\.\(\)/);
  assert.match(leaderboard, /async function syncFeaturedSpirit\(\)[\s\S]*syncOwnProfile\(\)/);
  assert.match(leaderboard, /syncFeaturedSpirit,/);
  assert.match(worldBoss, /function refreshSpiritRoster\(\)/);
  assert.match(worldBoss, /refreshSpiritRoster,/);
});

test("a custom spirit name is shared by all three selectable Boss stages", () => {
  assert.match(app, /name: getPlantDisplayName\(spirit, stage\),\s*customName: isCustomGardenName\(spirit\)/);
  assert.match(worldBoss, /function rosterSpiritName\(spirit, stage = spirit\?\.stage\) \{\s*if \(spirit\?\.customName && spirit\?\.name\) return spirit\.name;/);
  assert.match(worldBoss, /name\.textContent = rosterSpiritName\(spirit, stage\)/);
  assert.match(worldBoss, /worldBossActiveSpiritName"\)\.textContent = rosterSpiritName\(selected, selected\.stage\)/);
});

test("renaming back to an original species name restores per-stage names", () => {
  assert.match(app, /customName: isCustomGardenName\(\{ \.\.\.spirit, name, customName: false \}\)/);
  assert.match(worldBoss, /if \(spirit\?\.customName && spirit\?\.name\) return spirit\.name;[\s\S]*spirit\?\.stageNames/);
});

test("Boss live ranking prefers the server spirit name over static stage labels", () => {
  assert.match(worldBoss, /spiritName\.textContent = row\.spirit_name\s*\|\| row\.featured_spirit_name\s*\|\| QA_STAGE_NAMES/);
  assert.doesNotMatch(worldBoss, /spiritName\.textContent = QA_STAGE_NAMES[\s\S]{0,100}\|\| row\.spirit_name/);
});
