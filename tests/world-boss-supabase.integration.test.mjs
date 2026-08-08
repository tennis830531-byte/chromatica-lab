import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const apiUrl = process.env.API_URL || "";
const anonKey = process.env.ANON_KEY || "";
const serviceRoleKey = process.env.SERVICE_ROLE_KEY || "";
const password = process.env.LEADERBOARD_TEST_PASSWORD || "";
const host = (() => { try { return new URL(apiUrl).hostname; } catch { return ""; } })();
assert.ok(["localhost", "127.0.0.1"].includes(host), "World Boss integration requires local Supabase");
assert.ok(anonKey && serviceRoleKey && password, "local credentials required");

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(apiUrl, serviceRoleKey, options);
let user;
let client;
let eventId;

async function rpc(name, args = {}) {
  const result = await client.rpc(name, args);
  if (result.error) throw new Error(`${name}: ${result.error.message}`);
  return result.data;
}

async function failure(action, pattern) {
  let message = "";
  try { await action(); } catch (error) { message = String(error?.message || error); }
  assert.match(message, pattern);
}

before(async () => {
  await admin.from("world_boss_events").delete().in("event_key", ["2099-01-02", "2099-01-09", "2099-01-16", "2099-01-23", "2099-02-06"]);
  const email = `world-boss-${crypto.randomUUID()}@example.test`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(created.error);
  user = created.data.user;
  client = createClient(apiUrl, anonKey, options);
  assert.ifError((await client.auth.signInWithPassword({ email, password })).error);
  assert.ifError((await admin.from("leaderboard_profiles").insert({
    user_id: user.id, is_active: true, profile_completed: true, display_name: "Boss測試",
    custom_avatar_path: `${crypto.createHash("md5").update(user.id).digest("hex")}/avatar.webp`,
    featured_spirit_species: "melody-sprout", featured_spirit_name: "旋律森使",
    featured_spirit_stage: 3, joined_at: new Date().toISOString(), consented_at: new Date().toISOString(),
  })).error);
  assert.ifError((await admin.from("leaderboard_spirit_progress").insert([
    { user_id: user.id, species: "melody-sprout", stage: 3 },
    { user_id: user.id, species: "mushroom-spirit", stage: 3 },
    { user_id: user.id, species: "flower-spirit", stage: 3 },
  ])).error);
  assert.ifError((await admin.from("game_saves").insert({
    user_id: user.id, revision: 1, schema_version: 1,
    snapshot: { data: {
      "chromatica.waterDrops": "130",
      "chromatica.spiritCollection": JSON.stringify([
        { species: "melody-sprout", stage: 3, harvested: true },
        { species: "mushroom-spirit", stage: 3, harvested: true },
        { species: "flower-spirit", stage: 3, harvested: true },
      ]),
      "chromatica.currentPlant": JSON.stringify({
        id: "current-lucky-clover",
        species: "lucky-clover-spirit",
        stage: 2,
        waterProgress: 150,
        harvested: false,
      }),
    } },
  })).error);
  const event = await admin.from("world_boss_events").insert({
    event_key: "2099-01-02", boss_key: "tree-sparrow",
    scheduled_at: new Date().toISOString(),
    starts_at: new Date(Date.now() - 60_000).toISOString(),
    ends_at: new Date(Date.now() + 3_600_000).toISOString(),
    status: "active", max_hp: 3000, remaining_hp: 3000,
  }).select("id").single();
  assert.ifError(event.error);
  eventId = event.data.id;
});

after(async () => {
  if (user?.id) await admin.auth.admin.deleteUser(user.id);
  await admin.from("world_boss_events").delete().in("event_key", ["2099-01-02", "2099-01-09", "2099-01-16", "2099-01-23", "2099-02-06"]);
});

test("skill learning is server-side, costs 100 once, and is idempotent", async () => {
  const requestId = crypto.randomUUID();
  const first = await rpc("learn_world_boss_skill", { p_species: "melody-sprout", p_request_id: requestId });
  assert.equal(first[0].skill_name, "森律共鳴・萬葉齊奏");
  assert.equal(first[0].water_drops, 30);
  assert.equal(first[0].game_save_snapshot.data["chromatica.waterDrops"], "30");
  const repeated = await rpc("learn_world_boss_skill", { p_species: "melody-sprout", p_request_id: crypto.randomUUID() });
  assert.equal(repeated[0].applied_revision, first[0].applied_revision);
  const save = await admin.from("game_saves").select("snapshot").eq("user_id", user.id).single();
  assert.equal(save.data.snapshot.data["chromatica.waterDrops"], "30");
});

test("event-start and daily-practice energy are separate and concurrency-safe", async () => {
  const firstContext = await rpc("get_world_boss_battle_context_v2", { p_log_limit: 5 });
  const secondContext = await rpc("get_world_boss_battle_context_v2", { p_log_limit: 5 });
  assert.equal(firstContext.light_energy, 1);
  assert.equal(secondContext.light_energy, 1);
  const eventStartGrants = await admin.from("world_boss_energy_grants")
    .select("id", { count: "exact" })
    .eq("event_id", firstContext.event_id)
    .eq("user_id", user.id)
    .eq("source", "event_start");
  assert.ifError(eventStartGrants.error);
  assert.equal(eventStartGrants.count, 1);

  const attempts = await Promise.all(Array.from({ length: 6 }, () => rpc(
    "grant_world_boss_practice_energy_v2",
    { p_request_id: crypto.randomUUID() },
  )));
  assert.equal(attempts.filter((rows) => rows[0].world_boss_daily_practice_energy_granted).length, 1);
  assert.equal(attempts.some((rows) => rows[0].world_boss_event_start_energy_granted), false);
  const finalContext = await rpc("get_world_boss_battle_context_v2", { p_log_limit: 5 });
  assert.equal(finalContext.light_energy, 2);
});

test("exchange-and-attack is atomic and returns the authoritative water snapshot", async () => {
  const atomicEvent = await admin.from("world_boss_events").insert({
    event_key: "2099-02-06", boss_key: "tree-sparrow", scheduled_at: new Date().toISOString(),
    starts_at: new Date(Date.now() - 60_000).toISOString(),
    ends_at: new Date(Date.now() + 3_600_000).toISOString(),
    status: "active", max_hp: 3000, remaining_hp: 3000,
  }).select("id").single();
  assert.ifError(atomicEvent.error);
  assert.ifError((await admin.from("world_boss_player_states").insert({
    event_id: atomicEvent.data.id, user_id: user.id, light_energy: 0,
  })).error);
  assert.ifError((await admin.from("world_boss_energy_grants").insert({
    event_id: atomicEvent.data.id, user_id: user.id, source: "event_start",
    quantity: 1, consumed_quantity: 1, request_id: crypto.randomUUID(),
  })).error);

  const current = await admin.from("game_saves").select("snapshot,revision").eq("user_id", user.id).single();
  const twoDrops = structuredClone(current.data.snapshot);
  twoDrops.data["chromatica.waterDrops"] = "2";
  assert.ifError((await admin.from("game_saves").update({
    snapshot: twoDrops, revision: current.data.revision + 1,
  }).eq("user_id", user.id)).error);
  const beforeAttacks = await admin.from("world_boss_attacks")
    .select("id", { count: "exact", head: true }).eq("event_id", atomicEvent.data.id);
  await failure(() => rpc("exchange_and_attack_world_boss", {
    p_event_id: atomicEvent.data.id, p_species: "melody-sprout", p_stage: 3,
    p_attack_type: "normal", p_exchange_request_id: crypto.randomUUID(),
    p_attack_request_id: crypto.randomUUID(),
  }), /insufficient water/);
  const failedSave = await admin.from("game_saves").select("snapshot").eq("user_id", user.id).single();
  const failedEvent = await admin.from("world_boss_events").select("remaining_hp").eq("id", atomicEvent.data.id).single();
  const failedAttacks = await admin.from("world_boss_attacks")
    .select("id", { count: "exact", head: true }).eq("event_id", atomicEvent.data.id);
  assert.equal(failedSave.data.snapshot.data["chromatica.waterDrops"], "2");
  assert.equal(failedEvent.data.remaining_hp, 3000);
  assert.equal(failedAttacks.count, beforeAttacks.count);

  const failedSaveRow = await admin.from("game_saves").select("snapshot,revision").eq("user_id", user.id).single();
  const tenDrops = structuredClone(failedSaveRow.data.snapshot);
  tenDrops.data["chromatica.waterDrops"] = "10";
  assert.ifError((await admin.from("game_saves").update({
    snapshot: tenDrops, revision: failedSaveRow.data.revision + 1,
  }).eq("user_id", user.id)).error);
  const attackRequestId = crypto.randomUUID();
  const exchangeRequestId = crypto.randomUUID();
  const success = await rpc("exchange_and_attack_world_boss", {
    p_event_id: atomicEvent.data.id, p_species: "melody-sprout", p_stage: 3,
    p_attack_type: "normal", p_exchange_request_id: exchangeRequestId,
    p_attack_request_id: attackRequestId,
  });
  assert.equal(success[0].water_drops, 7);
  assert.equal(success[0].game_save_snapshot.data["chromatica.waterDrops"], "7");
  assert.equal(success[0].effective_damage, 60);
  const repeated = await rpc("exchange_and_attack_world_boss", {
    p_event_id: atomicEvent.data.id, p_species: "melody-sprout", p_stage: 3,
    p_attack_type: "normal", p_exchange_request_id: exchangeRequestId,
    p_attack_request_id: attackRequestId,
  });
  assert.equal(repeated[0].water_drops, 7);
  const attackCount = await admin.from("world_boss_attacks")
    .select("id", { count: "exact", head: true })
    .eq("event_id", atomicEvent.data.id).eq("user_id", user.id);
  assert.equal(attackCount.count, 1);
  const restoreRow = await admin.from("game_saves").select("snapshot,revision").eq("user_id", user.id).single();
  const restored = structuredClone(restoreRow.data.snapshot);
  restored.data["chromatica.waterDrops"] = "250";
  assert.ifError((await admin.from("game_saves").update({
    snapshot: restored, revision: restoreRow.data.revision + 1,
  }).eq("user_id", user.id)).error);
});

test("formal attacks accept a cultivating spirit only through its unlocked stage", async () => {
  const ownedEvent = await admin.from("world_boss_events").insert({
    event_key: "2099-01-23", boss_key: "tree-sparrow", scheduled_at: new Date().toISOString(),
    starts_at: new Date(Date.now() - 60_000).toISOString(),
    ends_at: new Date(Date.now() + 3_600_000).toISOString(),
    status: "active", max_hp: 3000, remaining_hp: 3000,
  }).select("id").single();
  assert.ifError(ownedEvent.error);
  const currentPlantAttack = await rpc("attack_world_boss", {
    p_event_id: ownedEvent.data.id,
    p_species: "lucky-clover-spirit",
    p_stage: 2,
    p_attack_type: "normal",
    p_request_id: crypto.randomUUID(),
  });
  assert.equal(currentPlantAttack[0].effective_damage, 30);
  await failure(() => rpc("attack_world_boss", {
    p_event_id: ownedEvent.data.id,
    p_species: "lucky-clover-spirit",
    p_stage: 3,
    p_attack_type: "normal",
    p_request_id: crypto.randomUUID(),
  }), /spirit stage not owned/);
  await failure(() => rpc("attack_world_boss", {
    p_event_id: ownedEvent.data.id,
    p_species: "lotus-spirit",
    p_stage: 1,
    p_attack_type: "normal",
    p_request_id: crypto.randomUUID(),
  }), /spirit stage not owned/);
  await rpc("exchange_world_boss_energy", {
    p_event_id: ownedEvent.data.id, p_quantity: 1, p_request_id: crypto.randomUUID(),
  });
  await failure(() => rpc("attack_world_boss", {
    p_event_id: ownedEvent.data.id,
    p_species: "flower-spirit",
    p_stage: 3,
    p_attack_type: "special",
    p_request_id: crypto.randomUUID(),
  }), /special skill not learned/);
});

test("normal damage, special damage, effective overkill, first/final hit, and dead-boss safety", async () => {
  const normal = await rpc("attack_world_boss", {
    p_event_id: eventId, p_species: "melody-sprout", p_stage: 1,
    p_attack_type: "normal", p_request_id: crypto.randomUUID(),
  });
  assert.equal(normal[0].effective_damage, 10);
  assert.equal(normal[0].is_first_hit, true);
  assert.equal(normal[0].light_energy, 0);
  const emptyState = await admin.from("world_boss_player_states")
    .select("light_energy,attack_count").eq("event_id", eventId).eq("user_id", user.id).single();
  assert.ifError(emptyState.error);
  await failure(() => rpc("attack_world_boss", {
    p_event_id: eventId, p_species: "melody-sprout", p_stage: 2,
    p_attack_type: "normal", p_request_id: crypto.randomUUID(),
  }), /insufficient light energy/);
  const afterEmptyAttack = await admin.from("world_boss_player_states")
    .select("light_energy,attack_count").eq("event_id", eventId).eq("user_id", user.id).single();
  assert.deepEqual(afterEmptyAttack.data, emptyState.data);
  const waterBeforeExchangeAttack = await admin.from("game_saves")
    .select("snapshot,revision").eq("user_id", user.id).single();
  assert.ifError(waterBeforeExchangeAttack.error);
  const exchangedNormal = await rpc("exchange_and_attack_world_boss", {
    p_event_id: eventId,
    p_species: "melody-sprout",
    p_stage: 2,
    p_attack_type: "normal",
    p_exchange_request_id: crypto.randomUUID(),
    p_attack_request_id: crypto.randomUUID(),
  });
  assert.equal(exchangedNormal[0].effective_damage, 30);
  assert.equal(exchangedNormal[0].light_energy, 0);
  const waterAfterExchangeAttack = await admin.from("game_saves")
    .select("snapshot,revision").eq("user_id", user.id).single();
  assert.ifError(waterAfterExchangeAttack.error);
  assert.equal(
    Number(waterAfterExchangeAttack.data.snapshot.data["chromatica.waterDrops"]),
    Number(waterBeforeExchangeAttack.data.snapshot.data["chromatica.waterDrops"]) - 3,
  );
  await failure(() => rpc("exchange_and_attack_world_boss", {
    p_event_id: eventId,
    p_species: "lotus-spirit",
    p_stage: 1,
    p_attack_type: "normal",
    p_exchange_request_id: crypto.randomUUID(),
    p_attack_request_id: crypto.randomUUID(),
  }), /spirit stage not owned/);
  const waterAfterRejectedExchange = await admin.from("game_saves")
    .select("snapshot,revision").eq("user_id", user.id).single();
  assert.deepEqual(waterAfterRejectedExchange.data, waterAfterExchangeAttack.data);
  await rpc("exchange_world_boss_energy", {
    p_event_id: eventId, p_quantity: 2, p_request_id: crypto.randomUUID(),
  });
  const special = await rpc("attack_world_boss", {
    p_event_id: eventId, p_species: "melody-sprout", p_stage: 3,
    p_attack_type: "special", p_request_id: crypto.randomUUID(),
  });
  assert.equal(special[0].effective_damage, 100);
  assert.equal(special[0].light_energy, 1);
  assert.ifError((await admin.from("world_boss_events").update({
    remaining_hp: 5, total_effective_damage: 2995,
  }).eq("id", eventId)).error);
  const tail = await rpc("attack_world_boss", {
    p_event_id: eventId, p_species: "flower-spirit", p_stage: 3,
    p_attack_type: "normal", p_request_id: crypto.randomUUID(),
  });
  assert.equal(tail[0].attempted_damage, 60);
  assert.equal(tail[0].effective_damage, 5);
  assert.equal(tail[0].is_final_hit, true);
  assert.equal(tail[0].light_energy, 0);
  const settledEvent = await admin.from("world_boss_events")
    .select("status").eq("id", eventId).single();
  assert.ifError(settledEvent.error);
  assert.equal(settledEvent.data.status, "closed");
  const settlement = await rpc("get_world_boss_settlement", { p_event_id: eventId });
  assert.equal(settlement.snapshot.success, true);
  const before = await admin.from("world_boss_player_states").select("light_energy").eq("event_id", eventId).eq("user_id", user.id).single();
  await failure(() => rpc("attack_world_boss", {
    p_event_id: eventId, p_species: "melody-sprout", p_stage: 3,
    p_attack_type: "special", p_request_id: crypto.randomUUID(),
  }), /boss is not active/);
  const afterState = await admin.from("world_boss_player_states").select("light_energy").eq("event_id", eventId).eq("user_id", user.id).single();
  assert.equal(afterState.data.light_energy, before.data.light_energy);
  const hits = await admin.from("world_boss_attacks").select("is_first_hit,is_final_hit").eq("event_id", eventId);
  assert.equal(hits.data.filter((row) => row.is_first_hit).length, 1);
  assert.equal(hits.data.filter((row) => row.is_final_hit).length, 1);
});

test("special skill usage is shared, limited to two per Taipei day, and ignores prior-day uses", async () => {
  const secondEvent = await admin.from("world_boss_events").insert({
    event_key: "2099-01-09", boss_key: "tree-sparrow", scheduled_at: new Date().toISOString(),
    starts_at: new Date(Date.now() - 60_000).toISOString(),
    ends_at: new Date(Date.now() + 3_600_000).toISOString(),
    status: "active", max_hp: 3000, remaining_hp: 3000,
  }).select("id").single();
  assert.ifError(secondEvent.error);
  await rpc("exchange_world_boss_energy", {
    p_event_id: secondEvent.data.id, p_quantity: 2, p_request_id: crypto.randomUUID(),
  });
  const priorTaipeiDay = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  assert.ifError((await admin.from("world_boss_attacks").insert([
    {
      event_id: secondEvent.data.id, user_id: user.id, request_id: crypto.randomUUID(),
      species: "melody-sprout", spirit_stage: 3, attack_type: "special",
      attempted_damage: 100, effective_damage: 100, energy_spent: 1,
      created_at: priorTaipeiDay,
    },
    {
      event_id: secondEvent.data.id, user_id: user.id, request_id: crypto.randomUUID(),
      species: "melody-sprout", spirit_stage: 3, attack_type: "special",
      attempted_damage: 100, effective_damage: 100, energy_spent: 1,
      created_at: priorTaipeiDay,
    },
  ])).error);
  for (const species of ["melody-sprout", "mushroom-spirit"]) {
    if (species === "mushroom-spirit") await rpc("learn_world_boss_skill", { p_species: species, p_request_id: crypto.randomUUID() });
    const result = await rpc("attack_world_boss", {
      p_event_id: secondEvent.data.id, p_species: species, p_stage: 3,
      p_attack_type: "special", p_request_id: crypto.randomUUID(),
    });
    assert.equal(result[0].effective_damage, 100);
  }
  await failure(() => rpc("attack_world_boss", {
    p_event_id: secondEvent.data.id, p_species: "melody-sprout", p_stage: 3,
    p_attack_type: "special", p_request_id: crypto.randomUUID(),
  }), /daily special attack limit reached/);
  const playerState = await admin.from("world_boss_player_states")
    .select("special_attack_count")
    .eq("event_id", secondEvent.data.id)
    .eq("user_id", user.id)
    .single();
  assert.ifError(playerState.error);
  assert.equal(playerState.data.special_attack_count, 2);
  const attacks = await admin.from("world_boss_attacks")
    .select("created_at")
    .eq("event_id", secondEvent.data.id)
    .eq("user_id", user.id)
    .eq("attack_type", "special");
  assert.ifError(attacks.error);
  const todayInTaipei = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  const todayUses = attacks.data.filter((attack) => new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(attack.created_at)) === todayInTaipei);
  assert.equal(todayUses.length, 2);
});

test("concurrent tail attacks produce one final hit and no double deduction", async () => {
  const event = await admin.from("world_boss_events").insert({
    event_key: "2099-01-16", boss_key: "tree-sparrow", scheduled_at: new Date().toISOString(),
    starts_at: new Date(Date.now() - 60_000).toISOString(),
    ends_at: new Date(Date.now() + 3_600_000).toISOString(),
    status: "active", max_hp: 3000, remaining_hp: 10, total_effective_damage: 2990,
  }).select("id").single();
  assert.ifError(event.error);
  const attempts = await Promise.allSettled([1, 2].map(() => rpc("attack_world_boss", {
    p_event_id: event.data.id, p_species: "melody-sprout", p_stage: 1,
    p_attack_type: "normal", p_request_id: crypto.randomUUID(),
  })));
  assert.equal(attempts.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(attempts.filter((result) => result.status === "rejected").length, 1);
  const attacks = await admin.from("world_boss_attacks").select("effective_damage,is_final_hit").eq("event_id", event.data.id);
  assert.equal(attacks.data.length, 1);
  assert.equal(attacks.data[0].effective_damage, 10);
  assert.equal(attacks.data[0].is_final_hit, true);
  const player = await admin.from("world_boss_player_states")
    .select("light_energy,attack_count").eq("event_id", event.data.id).eq("user_id", user.id).single();
  assert.ifError(player.error);
  assert.equal(player.data.light_energy, 0);
  assert.equal(player.data.attack_count, 1);
  const settledEvent = await admin.from("world_boss_events")
    .select("status").eq("id", event.data.id).single();
  assert.ifError(settledEvent.error);
  assert.equal(settledEvent.data.status, "closed");
});
