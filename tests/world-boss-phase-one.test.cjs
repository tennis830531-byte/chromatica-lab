const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");

const root = path.resolve(__dirname, "..");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/202607270002_create_world_boss_phase_one.sql"), "utf8");
const runtime = fs.readFileSync(path.join(root, "world-boss.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");

function loadCore() {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, "world-boss-core.js"), "utf8"), context);
  return context.window.ChromaticaWorldBossCore;
}

test("Taipei event is scheduled before Friday 20:00", () => {
  const result = loadCore().getEventWindow(new Date("2026-07-31T11:59:59Z"));
  assert.equal(result.phase, "scheduled");
  assert.equal(result.eventKey, "2026-07-31");
});

test("Taipei event is active from Friday 20:00 through Sunday before 22:00", () => {
  const core = loadCore();
  assert.equal(core.getEventWindow(new Date("2026-07-31T12:00:00Z")).phase, "active");
  assert.equal(core.getEventWindow(new Date("2026-08-02T13:59:59Z")).phase, "active");
});

test("after Sunday 22:00 the next independent weekly event is selected", () => {
  const result = loadCore().getEventWindow(new Date("2026-08-02T14:00:00Z"));
  assert.equal(result.phase, "scheduled");
  assert.equal(result.eventKey, "2026-08-07");
});

test("normal stage damage is fixed at 10, 30, and 60", () => {
  assert.deepEqual([1, 2, 3].map(loadCore().getNormalDamage), [10, 30, 60]);
});

test("formal special skill names are fixed", () => {
  const core = loadCore();
  assert.equal(core.getSkill("melody-sprout").skillName, "森靈共鳴曲");
  assert.equal(core.getSkill("mushroom-spirit").skillName, "萬孢迴響陣");
  assert.equal(core.getSkill("flower-spirit").skillName, "百花綻奏舞");
});

test("schema contains the eight phase-one core tables", () => {
  for (const table of [
    "world_boss_definitions", "world_boss_events", "world_boss_player_states",
    "world_boss_energy_grants", "world_boss_skill_unlocks", "world_boss_attacks",
    "world_boss_rewards", "world_boss_settlement_snapshots",
  ]) assert.match(migration, new RegExp(`create table public\\.${table}`));
});

test("first boss has 3000 HP and weekly rows reset to full health", () => {
  assert.match(migration, /'tree-sparrow'[\s\S]*?3000/);
  assert.match(migration, /values \([\s\S]*v_window\.event_key[\s\S]*3000, 3000[\s\S]*on conflict \(event_key\) do nothing/);
});

test("all server states and immutable settlement snapshots are present", () => {
  for (const state of ["scheduled", "active", "defeated", "expired", "settling", "closed"]) {
    assert.match(migration, new RegExp(`'${state}'`));
  }
  assert.match(migration, /world_boss_settlement_snapshots_immutable/);
  assert.match(migration, /raise exception 'world boss settlement snapshots are immutable'/);
});

test("attack transaction locks event and player before deductions", () => {
  const attack = migration.slice(migration.indexOf("create function public.attack_world_boss"));
  assert.match(attack, /world_boss_events event[\s\S]*for update/);
  assert.match(attack, /world_boss_player_states player[\s\S]*for update/);
  assert.match(attack, /least\(v_attempted, v_event\.remaining_hp\)/);
  assert.match(attack, /v_event\.status <> 'active' or v_event\.remaining_hp <= 0/);
});

test("first and final hits are unique per event", () => {
  assert.match(migration, /world_boss_attacks_first_hit_uidx[\s\S]*where is_first_hit/);
  assert.match(migration, /world_boss_attacks_final_hit_uidx[\s\S]*where is_final_hit/);
});

test("special attack is 100, consumes one energy, and is capped twice per event", () => {
  assert.match(migration, /v_player\.special_attack_count >= 2/);
  assert.match(migration, /v_player\.light_energy < 1/);
  assert.match(migration, /v_attempted := 100/);
  assert.match(migration, /light_energy = player\.light_energy - case when p_attack_type = 'special' then 1/);
});

test("daily practice energy and ten-energy exchange limit are unique and atomic", () => {
  assert.match(migration, /world_boss_energy_daily_practice_uidx/);
  assert.match(migration, /purchased_energy_count between 0 and 10/);
  assert.match(migration, /v_player\.purchased_energy_count \+ p_quantity > 10/);
  assert.match(migration, /v_cost := p_quantity \* 3/);
});

test("dead boss validation precedes water deduction in exchange transaction", () => {
  const exchange = migration.slice(
    migration.indexOf("create function public.exchange_world_boss_energy"),
    migration.indexOf("create function public.attack_world_boss"),
  );
  assert.ok(exchange.indexOf("boss is not active") < exchange.indexOf("update public.game_saves"));
});

test("skill learning requires harvested stage three and deducts water exactly once", () => {
  const skill = migration.slice(
    migration.indexOf("create function public.learn_world_boss_skill"),
    migration.indexOf("create function public.initialize_world_boss_player"),
  );
  assert.match(skill, /world_boss_harvested_stage\(v_user_id, p_species\) <> 3/);
  assert.match(skill, /if v_water < 100/);
  assert.match(skill, /v_water - 100/);
  assert.match(migration, /world_boss_skill_unlocks[\s\S]*primary key \(user_id, species\)/);
});

test("runtime supplies safe unavailable fallback without endless loading", () => {
  assert.match(runtime, /state\.status = isUnavailable\(error\) \? "unavailable" : "error"/);
  assert.match(runtime, /世界 Boss 服務準備中/);
  assert.match(html, /id="worldBossHp"[\s\S]*世界 Boss 服務準備中/);
});

test("skill success UI uses official names and only opens after a successful RPC", () => {
  const learningFlow = runtime.slice(runtime.indexOf("async function learnSelectedSkill"));
  assert.match(learningFlow, /await rpc\("learn_world_boss_skill"/);
  assert.ok(learningFlow.indexOf("await rpc(\"learn_world_boss_skill\"") < learningFlow.indexOf("showSkillSuccess(species)"));
  assert.match(css, /\.world-boss-skill-success h2[\s\S]*color: #b42318/);
  assert.match(css, /prefers-reduced-motion[\s\S]*worldBossSkillReduced/);
});

test("all ten supplied assets are byte-identical to their source files", () => {
  const names = [
    "100水滴習得技能的icon.png", "光之能量.png", "攻擊按鈕.png", "攻擊特效.png",
    "專屬攻擊技能按鈕.png", "第一隻boss 樹麻雀 狂暴狀態.png", "第一隻boss 樹麻雀.png",
    "第一隻boss樹麻雀 死亡狀態.png", "boss入口icon.png", "boss入口iocn(死亡狀態）.png",
  ];
  const digest = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  for (const name of names) {
    assert.equal(
      digest(path.join(root, "public/assets/world-boss", name)),
      digest(path.join("/Users/pengyirui/Downloads", name)),
      name,
    );
  }
});
