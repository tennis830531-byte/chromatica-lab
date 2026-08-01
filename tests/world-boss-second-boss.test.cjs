const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const runtime = fs.readFileSync(path.join(root, "world-boss.js"), "utf8");
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/202607310001_add_hill_myna_world_boss.sql"),
  "utf8",
);

const assets = new Map([
  ["第二隻boss 嘯八哥.png", "747cd65f32cda7ddab7a4d0d5e0266691358fb8de58c3885c809c0ef73de0610"],
  ["第二隻boss 嘯八哥 呼吸狀態.png", "0ea5e2a37656e89e2751335e218058fea0e7d0690aa8e92ffd5bbaf501e5398c"],
  ["第二隻boss 嘯八哥 反擊狀態.png", "50d9cc6b1abcb499345e1c1d2c6f328d0566e10d32627034c8615d5da30cc4cc"],
  ["第二隻boss 嘯八哥 死亡狀態.png", "0a0bdb6fa99e6d0dcdc8930326e9ce5523584e1ed5c057a2c6372901453d7380"],
]);

test("the future second Boss definition is 嘯八哥 with 5000 HP and rotation order two", () => {
  assert.match(migration, /'hill-myna'/);
  assert.match(migration, /'嘯八哥'/);
  assert.match(migration, /5000/);
  assert.match(migration, /rotation_order[\s\S]*2/);
  assert.doesNotMatch(migration, /world_boss_events|world_boss_attacks|world_boss_rewards|notification_queue/);
});

test("嘯八哥 uses the approved two idle, counterattack, and defeated images", () => {
  assert.match(runtime, /"hill-myna"[\s\S]*name: "嘯八哥"[\s\S]*maxHp: 5000/);
  assert.match(runtime, /第二隻boss 嘯八哥\.png[\s\S]*第二隻boss 嘯八哥 呼吸狀態\.png/);
  assert.match(runtime, /counter: `\$\{ASSET_ROOT\}第二隻boss 嘯八哥 反擊狀態\.png`/);
  assert.match(runtime, /defeated: `\$\{ASSET_ROOT\}第二隻boss 嘯八哥 死亡狀態\.png`/);
  for (const [file, expected] of assets) {
    const bytes = fs.readFileSync(path.join(root, "public/assets/world-boss", file));
    assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), expected, file);
  }
});

test("the native web bundle explicitly includes all four uncommitted second Boss assets", () => {
  const build = fs.readFileSync(path.join(root, "scripts/build-web.mjs"), "utf8");
  for (const [file, digest] of assets) {
    assert.match(build, new RegExp(`${file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^\\n]+${digest}`));
  }
});

test("QA Boss switching reuses dynamic presentation and clamps HP to the selected maximum", () => {
  assert.match(runtime, /function defaultQaSession\(selectedBossKey = "tree-sparrow"\)/);
  assert.match(runtime, /boss_name: boss\.name[\s\S]*remaining_hp: boss\.maxHp[\s\S]*max_hp: boss\.maxHp/);
  assert.match(runtime, /Math\.min\(fallback\.event\.max_hp, Number\(value\.event\.remaining_hp\)/);
  assert.match(runtime, /function renderBossIdleImage[\s\S]*bossPresentation\(\)\.idle/);
  assert.match(runtime, /image\.src = bossPresentation\(\)\.counter/);
  assert.match(runtime, /if \(visual === "defeated"\) return presentation\.defeated/);
});
