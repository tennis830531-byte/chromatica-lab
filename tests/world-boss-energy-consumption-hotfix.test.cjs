const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/202607300004_require_world_boss_energy_for_all_attacks.sql"), "utf8");
const runtime = fs.readFileSync(path.join(root, "world-boss.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

test("every successful normal or special attack consumes exactly one light energy", () => {
  assert.match(migration, /if v_player\.light_energy < 1 then raise exception 'insufficient light energy'; end if;/);
  assert.match(migration, /set light_energy = player\.light_energy - 1,/);
  assert.match(migration, /v_attempted, v_effective, 1, v_first, v_final/);
  assert.doesNotMatch(migration, /light_energy = player\.light_energy - case when p_attack_type = 'special'/);
});

test("the final attack immediately runs the existing idempotent server settlement", () => {
  assert.match(
    migration,
    /if v_final then\s+perform public\.settle_world_boss_event\(p_event_id, pg_catalog\.now\(\)\);\s+end if;/i,
  );
});

test("energy source accounting is consumed for both attack types", () => {
  const beforeSpecialNotification = migration.split("if new.attack_type = 'special' then", 1)[0];
  assert.match(beforeSpecialNotification, /consumed_quantity = grant_row\.consumed_quantity \+ 1/);
});

test("zero-energy normal and special attacks share the exchange-and-attack path", () => {
  assert.doesNotMatch(runtime, /const requiresEnergy = isQaMode\(\) \|\| type === "special"/);
  assert.match(runtime, /if \(!qaUnlimitedEnergy && Number\(state\.event\?\.light_energy \|\| 0\) <= 0 && !exchange\)/);
  assert.match(runtime, /p_stage: stage,[\s\S]*p_attack_type: type,[\s\S]*p_exchange_request_id/);
  assert.match(migration, /exchange_and_attack_world_boss\(\s*p_event_id uuid,\s*p_species text,\s*p_stage integer,\s*p_attack_type text,/s);
});

test("World Boss help states that all attacks consume energy", () => {
  assert.match(html, /普通攻擊與專屬攻擊技能每次都會消耗 1 顆光之能量/);
  assert.match(html, /普通攻擊與專屬攻擊技能每次攻擊皆消耗 1 顆/);
});

test("hotfix does not create events, rewards, notifications, or modify player water", () => {
  assert.doesNotMatch(migration, /insert into public\.world_boss_(events|rewards|notification_queue)/i);
  assert.doesNotMatch(migration, /update public\.game_saves|delete from|truncate/i);
  assert.match(migration, /grant execute on function public\.exchange_and_attack_world_boss\(uuid,text,integer,text,uuid,uuid\)\s+to authenticated;/i);
});
