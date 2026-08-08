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

test("scheduled World Boss page shows the Friday opening countdown card", () => {
  assert.match(html, /id="worldBossPreviewCountdownCard"[\s\S]*本週五 20:00 開放[\s\S]*樹麻雀即將出沒/);
  assert.match(runtime, /state\.event\?\.starts_at \|\| fallbackWindow\.startsAt/);
  assert.match(runtime, /previewCard\?\.classList\.toggle\("hidden", !scheduled\)/);
  assert.match(runtime, /countdown\?\.classList\.toggle\("hidden", scheduled\)/);
  assert.match(runtime, /image\.classList\.toggle\("hidden", status === "scheduled"\)/);
  assert.match(css, /#worldBossCombatView[\s\S]*width:\s*100%/);
  assert.match(css, /\.world-boss-arena \{[\s\S]*width:\s*100%[\s\S]*world-boss-arena-background\.png/);
  assert.match(runtime, /previewValue\.textContent = `倒數 \$\{remaining\}`/);
  assert.match(css, /\.world-boss-preview-countdown-card[\s\S]*grid-template-columns:\s*82px minmax\(0, 1fr\)/);
});

test("World Boss help explains schedule, damage, energy, exchange, and rewards", () => {
  assert.match(html, /id="worldBossInfoOpen"[\s\S]*>？<\/button>/);
  assert.match(html, /id="worldBossInfoModal"[\s\S]*每週五 20:00 開放，週日 22:00 結束/);
  for (const copy of [
    "第一階段</b><strong>10 傷害",
    "第二階段</b><strong>30 傷害",
    "第三階段</b><strong>60 傷害",
    "專屬攻擊技能</b><strong>100 傷害",
    "3 水滴兌換 1 顆",
    "100／80／60 水滴",
    "50／40／30 水滴",
    "週五、週六、週日每日各可使用 2 次",
  ]) assert.match(html, new RegExp(copy));
  assert.match(html, /活動期間每天第一次有效練習可獲得 1 顆（以台北日期計算）/);
  assert.match(html, /world-boss-info-energy-icon[^>]*光之能量\.png[^>]*\/>光之能量/);
  assert.equal((html.match(/world-boss-info-water-icon[^>]*water-drop\.png/g) || []).length, 2);
  assert.match(css, /\.world-boss-info-modal h3[\s\S]*display:\s*flex[\s\S]*align-items:\s*center/);
  assert.match(css, /\.world-boss-info-energy-icon[\s\S]*width:\s*24px[\s\S]*height:\s*24px/);
  assert.match(css, /\.world-boss-info-water-icon[\s\S]*width:\s*15px[\s\S]*height:\s*20px/);
  assert.match(runtime, /worldBossInfoOpen[\s\S]*worldBossInfoModal/);
  assert.match(runtime, /worldBossInfoClose[\s\S]*worldBossInfoModal/);
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
  assert.equal(core.getSkill("melody-sprout").skillName, "森律共鳴・萬葉齊奏");
  assert.equal(core.getSkill("mushroom-spirit").skillName, "菌界低吟・大地回響");
  assert.equal(core.getSkill("flower-spirit").skillName, "花舞天音・百華綻放");
  assert.equal(core.getSkill("lucky-clover-spirit").skillName, "四葉福音・命運盛放");
  assert.equal(core.getSkill("lotus-spirit").skillName, "蓮華天籟・萬瓣淨音");
  assert.equal(core.getSkill("cactus-spirit").skillName, "荒沙戰奏・烈日轟鳴");
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

test("special attack is 100, consumes one energy, and is capped twice per Taipei day", () => {
  assert.match(migration, /world_boss_attacks_daily_special_idx/);
  assert.match(migration, /v_daily_special_attack_count >= 2/);
  assert.match(migration, /daily special attack limit reached/);
  assert.match(migration, /attack\.created_at at time zone 'Asia\/Taipei'/);
  assert.match(migration, /pg_catalog\.now\(\) at time zone 'Asia\/Taipei'/);
  assert.match(migration, /special_attack_count between 0 and 6/);
  assert.doesNotMatch(migration, /v_player\.special_attack_count >= 2/);
  assert.match(migration, /v_player\.light_energy < 1/);
  assert.match(migration, /v_attempted := 100/);
  assert.match(migration, /light_energy = player\.light_energy - case when p_attack_type = 'special' then 1/);
});

test("daily practice energy is unique and water exchange has no per-event cap", () => {
  assert.match(migration, /world_boss_energy_daily_practice_uidx/);
  assert.match(migration, /purchased_energy_count >= 0/);
  assert.doesNotMatch(migration, /purchased_energy_count \+ p_quantity > 10/);
  assert.doesNotMatch(migration, /event energy exchange limit reached/);
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

test("formal attacks accept the current cultivating spirit without weakening harvested skill learning", () => {
  const ownedStage = migration.slice(
    migration.indexOf("create function public.world_boss_owned_stage"),
    migration.indexOf("create function public.learn_world_boss_skill"),
  );
  const attack = migration.slice(
    migration.indexOf("create function public.attack_world_boss"),
    migration.indexOf("revoke all on function public.world_boss_window"),
  );
  assert.match(ownedStage, /chromatica\.currentPlant/);
  assert.match(ownedStage, /v_current->>'species' <> p_species/);
  assert.match(ownedStage, /when v_progress >= 280 then 3/);
  assert.match(ownedStage, /when v_progress >= 100 then 2/);
  assert.match(attack, /world_boss_owned_stage\(v_user_id, p_species\) < p_stage/);
  assert.match(migration, /world_boss_harvested_stage\(v_user_id, p_species\) <> 3/);
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

test("all ten supplied assets retain their approved bytes", () => {
  const assets = new Map([
    ["100水滴習得技能的icon.png", "3980ef061a250cb2ccf05fbf55603a6444bf036ef09d0709dc6e7ca2ab1bf42b"],
    ["光之能量.png", "ae0a550107730b3825913f602d5dee370a2dc1a5128c94da4809998a83041682"],
    ["攻擊按鈕.png", "2dfbc48d3e365d5e776386b883230f08ab4ffe0e580508ff3e705b6ba821adbb"],
    ["攻擊特效.png", "e5b502fa49076e31083ba6d9762ccc2bb78224073f6636bfe5e7b689df145f03"],
    ["專屬攻擊技能按鈕.png", "e1061f4145d8e10509f64d3e03e231cb0da28d16ab430e525225a57e840b34be"],
    ["第一隻boss 樹麻雀 狂暴狀態.png", "e29846c2077e7e82defe9ba8cda11e38fd4fb6851a2e1830958619144f5b7580"],
    ["第一隻boss 樹麻雀.png", "d9d1a1f3b132462ca69253760250922d36bb86624c3c22302a05c3729f76306a"],
    ["第一隻boss樹麻雀 死亡狀態.png", "8d7f5f35fc7b9e04df9fc1f2e29f81164d31a2e21f0666c6cfdebc946783b076"],
    ["boss入口icon.png", "3f74589b4f14e29659831f521fd5f138a61ef6aadae98e46d4ecc6f24e37dc9f"],
    ["boss入口iocn(死亡狀態）.png", "c7d52e1ddf849fc106357943622f10800b8b0f34a53f4004d2d4958bae5300d2"],
  ]);
  const digest = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  for (const [name, expectedDigest] of assets) {
    assert.equal(digest(path.join(root, "public/assets/world-boss", name)), expectedDigest, name);
  }
});
