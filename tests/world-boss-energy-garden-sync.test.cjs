const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const migration = read("supabase/migrations/202608080001_fix_world_boss_energy_and_garden_skill_sync.sql");
const boss = read("world-boss.js");
const app = read("app.js");
const auth = read("auth-entry.js");
const cloud = read("cloud-save.js");
const css = read("styles.css");

test("event-start energy is a separate idempotent server grant claimed by every status refresh", () => {
  assert.match(migration, /claim_world_boss_event_start_energy/);
  assert.match(migration, /insert into public\.world_boss_energy_grants[\s\S]*'event_start'[\s\S]*on conflict do nothing[\s\S]*get diagnostics v_inserted = row_count/);
  assert.match(migration, /if v_inserted = 1 then[\s\S]*light_energy = player\.light_energy \+ 1/);
  assert.match(migration, /get_world_boss_battle_context_v2[\s\S]*claim_world_boss_event_start_energy/);
  assert.match(migration, /get_world_boss_status\(\)[\s\S]*claim_world_boss_event_start_energy/);
  assert.match(boss, /get_world_boss_battle_context_v2/);
});

test("daily practice grant uses the server Taipei date and reports both sources independently", () => {
  assert.match(migration, /v_practice_date date := \(pg_catalog\.now\(\) at time zone 'Asia\/Taipei'\)::date/);
  assert.match(migration, /world_boss_event_start_energy_granted boolean/);
  assert.match(migration, /world_boss_daily_practice_energy_granted boolean/);
  assert.doesNotMatch(migration, /extract\s*\(\s*(?:isodow|dow)|friday|saturday|sunday/i);
  assert.match(boss, /worldBossEventStartEnergyGranted: row\?\.world_boss_event_start_energy_granted === true/);
  assert.match(boss, /worldBossDailyPracticeEnergyGranted: row\?\.world_boss_daily_practice_energy_granted === true/);
});

test("practice settlement only renders actual energy grants with the formal asset", () => {
  assert.match(app, /worldBossDailyPracticeEnergyGranted === true[\s\S]*public\/assets\/world-boss\/光之能量\.png[\s\S]*title: "光之能量"[\s\S]*value: "\+1"/);
  assert.match(app, /worldBossEventStartEnergyGranted === true[\s\S]*活動開始贈送的光之能量/);
  assert.match(app, /if \(item\.iconSrc\)[\s\S]*document\.createElement\("img"\)/);
  assert.match(css, /practice-settlement-item-icon img[^}]*width: 28px[^}]*height: 28px/);
});

test("skill learning applies the authoritative save while the whole formal garden is locked", () => {
  assert.match(migration, /learn_world_boss_skill[\s\S]*game_save_snapshot jsonb/);
  assert.match(migration, /returning save\.\* into v_save/);
  assert.match(boss, /beginFormalGardenMutation/);
  assert.match(boss, /syncBestEffort[\s\S]*learn_world_boss_skill[\s\S]*applyAuthoritativeGardenGameSave/);
  assert.match(boss, /catch \(error\)[\s\S]*refreshAuthoritativeGardenGameSave/);
  assert.match(app, /formalGardenMutationPending[\s\S]*gardenPrimaryAction/);
  assert.match(app, /function waterCurrentPlant\(\) \{\s*if \(formalGardenMutationPending\) return/);
  assert.match(app, /function harvestCurrentPlant\(\) \{\s*if \(formalGardenMutationPending \|\| harvestCardAnimationActive\) return/);
  assert.match(app, /function saveGardenSpiritName\(\) \{\s*if \(formalGardenMutationPending\) return/);
});

test("exchange-and-attack stays atomic, returns the authoritative save, and animates only after success", () => {
  assert.match(migration, /exchange_and_attack_world_boss[\s\S]*perform public\.exchange_world_boss_energy[\s\S]*public\.attack_world_boss/);
  assert.match(migration, /game_save_revision bigint[\s\S]*game_save_snapshot jsonb/);
  assert.match(migration, /where attack\.event_id = p_event_id[\s\S]*attack\.request_id = p_attack_request_id[\s\S]*if not found then/);
  const attack = boss.slice(boss.indexOf("async function performAttack"), boss.indexOf("function performQaAttack"));
  assert.ok(attack.indexOf('await rpc("exchange_and_attack_world_boss"') < attack.indexOf("presentSuccessfulAttack"));
  assert.ok(attack.indexOf("applyAuthoritativeGardenGameSave") < attack.indexOf("presentSuccessfulAttack"));
  assert.match(attack, /if \(!row\?\.attack_id \|\| Number\(row\?\.effective_damage \|\| 0\) <= 0\)/);
  assert.match(attack, /水滴不足，無法兌換光之能量/);
  assert.match(attack, /worldBossAttackErrorCopy[\s\S]*worldBossAttackErrorModal[\s\S]*classList\.remove\("hidden"\)/);
  assert.match(attack, /catch \(error\)[\s\S]*refreshAuthoritativeGardenGameSave/);
  assert.match(attack, /beginFormalGardenMutation[\s\S]*syncBestEffort[\s\S]*exchange_and_attack_world_boss/);
  assert.match(attack, /finally[\s\S]*endFormalGardenMutation/);
  assert.doesNotMatch(boss.slice(boss.indexOf("function setBattleLocked"), boss.indexOf("function renderEntry")), /is-attacking/);
  assert.match(boss.slice(boss.indexOf("function playAttackEffect"), boss.indexOf("function finishBossCounter")), /classList\.add\("is-attacking"\)/);
});

test("normal and special attacks share one post-success presentation gate", () => {
  const attack = boss.slice(boss.indexOf("async function performAttack"), boss.indexOf("function performQaAttack"));
  const success = boss.slice(boss.indexOf("async function presentSuccessfulAttack"), boss.indexOf("async function performAttack"));
  assert.match(attack, /if \(!row\?\.attack_id \|\| Number\(row\?\.effective_damage \|\| 0\) <= 0\) throw/);
  assert.ok(attack.indexOf("applyAuthoritativeGardenGameSave") < attack.indexOf("presentSuccessfulAttack"));
  assert.equal((attack.match(/presentSuccessfulAttack/g) || []).length, 1);
  assert.doesNotMatch(attack.slice(0, attack.indexOf("presentSuccessfulAttack")), /playAttackEffect|playNormalAttackSound|ChromaticaHaptics|playBossCounter/);
  for (const effect of ["playSpecialAttackPresentation", "playNormalAttackSound", "ChromaticaHaptics", "playAttackEffect"]) assert.match(success, new RegExp(effect));
  assert.match(attack, /insufficient\[-_ \]water\|water\[-_ \]insufficient[\s\S]*水滴不足，無法兌換光之能量/);
});

test("attack controls suppress generic click haptics and reserve feedback for server success", () => {
  const html = read("index.html");
  assert.match(html, /id="worldBossAttackAction"[^>]*data-haptic="manual"/);
  assert.match(html, /id="worldBossExchangeAttackConfirm"[^>]*data-haptic="manual"/);
  assert.match(html, /id="worldBossAttackErrorModal"[^>]*role="alertdialog"/);
  assert.match(html, /id="worldBossAttackErrorCopy"[^>]*>攻擊未完成，請稍後再試。<\/p>/);
  assert.match(html, /id="worldBossAttackErrorClose"[^>]*>我知道了<\/button>/);
});

test("authenticated home refresh reloads persisted skill unlocks after cold start", () => {
  const homeRefresh = boss.slice(boss.indexOf("function refreshHomeEntry"), boss.indexOf("async function rpc"));
  assert.match(homeRefresh, /refreshSkillUnlocks\(\)[\s\S]*return refresh\(\)/);
  const skillRefresh = boss.slice(boss.indexOf("async function refreshSkillUnlocks"), boss.indexOf("function showSkillSuccess"));
  assert.match(skillRefresh, /get_my_world_boss_skills/);
  assert.match(skillRefresh, /state\.skillUnlocks = new Map/);
  assert.match(skillRefresh, /refreshGardenSpiritSkillPresentation/);
});

test("one shared account-workspace path applies server game saves", () => {
  assert.match(auth, /applyAuthoritativeGameSave\(payload\)/);
  assert.match(cloud, /async function applyAuthoritativeGameSave/);
  assert.match(cloud, /acceptRemoteAsAuthority\(userId/);
  assert.match(app, /async function applyAuthoritativeGardenGameSave/);
});
