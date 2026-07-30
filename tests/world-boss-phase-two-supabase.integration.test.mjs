import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const apiUrl = process.env.API_URL || "";
const anonKey = process.env.ANON_KEY || "";
const serviceRoleKey = process.env.SERVICE_ROLE_KEY || "";
const password = process.env.LEADERBOARD_TEST_PASSWORD || "";
const host = (() => { try { return new URL(apiUrl).hostname; } catch { return ""; } })();
assert.ok(["localhost", "127.0.0.1"].includes(host), "World Boss Phase 2 integration requires local Supabase");
assert.ok(anonKey && serviceRoleKey && password, "local credentials required");

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(apiUrl, serviceRoleKey, options);
const users = [];
const clients = [];
const eventKeyBase = new Date(Date.UTC(2200, 0, 1 + crypto.randomInt(0, 18_000)));
const eventKeys = [0, 7, 14].map((dayOffset) => {
  const date = new Date(eventKeyBase);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return date.toISOString().slice(0, 10);
});

async function adminRpc(name, args = {}) {
  const result = await admin.rpc(name, args);
  if (result.error) throw new Error(`${name}: ${result.error.message}`);
  return result.data;
}

async function clientRpc(index, name, args = {}) {
  const result = await clients[index].rpc(name, args);
  if (result.error) throw new Error(`${name}: ${result.error.message}`);
  return result.data;
}

async function createEvent(eventKey, fields = {}) {
  const result = await admin.from("world_boss_events").insert({
    event_key: eventKey,
    boss_key: "tree-sparrow",
    scheduled_at: new Date().toISOString(),
    starts_at: new Date(Date.now() - 60_000).toISOString(),
    ends_at: new Date(Date.now() + 3_600_000).toISOString(),
    status: "active",
    max_hp: 3000,
    remaining_hp: 3000,
    ...fields,
  }).select("id").single();
  assert.ifError(result.error);
  return result.data.id;
}

async function waterFor(userId) {
  const save = await admin.from("game_saves").select("snapshot,revision").eq("user_id", userId).single();
  assert.ifError(save.error);
  return {
    water: Number(save.data.snapshot.data["chromatica.waterDrops"]),
    revision: save.data.revision,
  };
}

before(async () => {
  await admin.from("world_boss_events").delete().in("event_key", eventKeys);
  for (let index = 0; index < 10; index += 1) {
    const email = `world-boss-phase-two-${crypto.randomUUID()}@example.test`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(created.error);
    const user = created.data.user;
    users.push(user);
    const client = createClient(apiUrl, anonKey, options);
    assert.ifError((await client.auth.signInWithPassword({ email, password })).error);
    clients.push(client);
    assert.ifError((await admin.from("leaderboard_profiles").insert({
      user_id: user.id,
      is_active: true,
      profile_completed: true,
      display_name: `二階測試${index + 1}`,
      custom_avatar_path: `${crypto.createHash("md5").update(user.id).digest("hex")}/avatar.webp`,
      featured_spirit_species: "melody-sprout",
      featured_spirit_name: "旋律森使",
      featured_spirit_stage: 3,
      joined_at: new Date(Date.now() + index).toISOString(),
      consented_at: new Date().toISOString(),
    })).error);
    assert.ifError((await admin.from("leaderboard_spirit_progress").insert({
      user_id: user.id, species: "melody-sprout", stage: 3,
    })).error);
    assert.ifError((await admin.from("game_saves").insert({
      user_id: user.id,
      revision: 1,
      schema_version: 1,
      snapshot: { data: {
        "chromatica.waterDrops": "300",
        "chromatica.spiritCollection": JSON.stringify([
          { species: "melody-sprout", stage: 3, harvested: true },
        ]),
      } },
    })).error);
    assert.ifError((await admin.from("world_boss_skill_unlocks").insert({
      user_id: user.id,
      species: "melody-sprout",
      skill_name: "森律共鳴・萬葉齊奏",
      request_id: crypto.randomUUID(),
      applied_revision: 1,
    })).error);
  }
});

after(async () => {
  await admin.from("world_boss_events").delete().in("event_key", eventKeys);
  for (const user of users) await admin.auth.admin.deleteUser(user.id);
});

test("successful settlement ranks deterministically, applies independent rewards once, and freezes snapshot", async () => {
  const eventId = await createEvent(eventKeys[0], {
    status: "defeated",
    remaining_hp: 0,
    total_effective_damage: 3000,
    first_attacker_user_id: users[0].id,
    final_attacker_user_id: users[0].id,
    defeated_at: new Date().toISOString(),
  });
  const successDamage = [600, 500, 400, 350, 300, 250, 200, 150, 150, 100];
  const states = users.map((user, index) => ({
    event_id: eventId,
    user_id: user.id,
    light_energy: 1,
    total_effective_damage: successDamage[index],
    attack_count: 20 - index,
    first_attack_at: new Date(Date.now() - (10 - index) * 1000).toISOString(),
  }));
  assert.ifError((await admin.from("world_boss_player_states").insert(states)).error);

  assert.equal(await adminRpc("settle_world_boss_event", { p_event_id: eventId }), "closed");
  const rewards = await admin.from("world_boss_rewards")
    .select("user_id,final_rank").eq("event_id", eventId).order("final_rank");
  assert.ifError(rewards.error);
  assert.deepEqual(rewards.data.map((row) => row.user_id), users.map((user) => user.id));

  const items = await admin.from("world_boss_reward_items")
    .select("user_id,reward_type,water_amount,status,applied_revision").eq("event_id", eventId);
  assert.ifError(items.error);
  assert.ok(items.data.every((item) => item.status === "applied" && item.applied_revision > 1));
  const totals = new Map(users.map((user) => [
    user.id,
    items.data.filter((item) => item.user_id === user.id).reduce((sum, item) => sum + item.water_amount, 0),
  ]));
  assert.equal(totals.get(users[0].id), 175);
  assert.equal(totals.get(users[1].id), 95);
  assert.equal(totals.get(users[2].id), 75);
  users.slice(3).forEach((user) => assert.equal(totals.get(user.id), 15));
  assert.deepEqual(
    items.data
      .filter((item) => item.user_id === users[0].id)
      .map((item) => [item.reward_type, item.water_amount])
      .sort(([left], [right]) => left.localeCompare(right)),
    [
      ["boss_defeated", 10],
      ["first_hit", 30],
      ["last_hit", 30],
      ["participation", 5],
      ["rank_1", 100],
    ],
  );
  assert.equal(items.data.some((item) => (
    users.slice(3).some((user) => user.id === item.user_id)
    && item.reward_type.startsWith("rank_")
  )), false);

  const before = await Promise.all(users.map((user) => waterFor(user.id)));
  assert.equal(await adminRpc("settle_world_boss_event", { p_event_id: eventId }), "closed");
  const afterRepeat = await Promise.all(users.map((user) => waterFor(user.id)));
  assert.deepEqual(afterRepeat, before);

  const snapshot = await admin.from("world_boss_settlement_snapshots")
    .select("participant_count,total_attack_count,average_attack_count,total_reward_water,snapshot")
    .eq("event_id", eventId).single();
  assert.ifError(snapshot.error);
  assert.equal(snapshot.data.participant_count, 10);
  assert.equal(snapshot.data.total_attack_count, 155);
  assert.equal(snapshot.data.total_reward_water, 450);
  assert.equal(snapshot.data.snapshot.rankings.length, 10);
  const mutation = await admin.from("world_boss_settlement_snapshots")
    .update({ participant_count: 99 }).eq("event_id", eventId);
  assert.ok(mutation.error);
  assert.match(mutation.error.message, /immutable/i);
});

test("expired failure grants half first/rank rewards, keeps participation at five, and omits success rewards", async () => {
  const eventId = await createEvent(eventKeys[1], {
    status: "expired",
    remaining_hp: 2500,
    total_effective_damage: 500,
    ends_at: new Date(Date.now() - 1000).toISOString(),
    first_attacker_user_id: users[0].id,
  });
  const failureDamage = [100, 80, 70, 60, 50, 40, 30, 25, 25, 20];
  assert.ifError((await admin.from("world_boss_player_states").insert(users.map((user, index) => ({
    event_id: eventId,
    user_id: user.id,
    light_energy: 1,
    total_effective_damage: failureDamage[index],
    attack_count: 10 - index,
    first_attack_at: new Date(Date.now() - (10 - index) * 1000).toISOString(),
  })))).error);
  assert.equal(await adminRpc("settle_world_boss_event", { p_event_id: eventId }), "closed");
  const items = await admin.from("world_boss_reward_items")
    .select("user_id,reward_type,water_amount").eq("event_id", eventId);
  assert.ifError(items.error);
  const totals = new Map(users.map((user) => [
    user.id,
    items.data.filter((item) => item.user_id === user.id).reduce((sum, item) => sum + item.water_amount, 0),
  ]));
  assert.equal(totals.get(users[0].id), 70);
  assert.equal(totals.get(users[1].id), 45);
  assert.equal(totals.get(users[2].id), 35);
  users.slice(3).forEach((user) => assert.equal(totals.get(user.id), 5));
  assert.equal(items.data.some((item) => ["last_hit", "boss_defeated"].includes(item.reward_type)), false);
  assert.equal(items.data.some((item) => (
    users.slice(3).some((user) => user.id === item.user_id)
    && item.reward_type.startsWith("rank_")
  )), false);
  const failureSnapshot = await admin.from("world_boss_settlement_snapshots")
    .select("total_reward_water").eq("event_id", eventId).single();
  assert.ifError(failureSnapshot.error);
  assert.equal(failureSnapshot.data.total_reward_water, 185);
  const result = await clientRpc(0, "get_world_boss_settlement", { p_event_id: eventId });
  assert.equal(result.me.rank, 1);
  assert.equal(result.snapshot.success, false);
});

test("exchange and special attack are one transaction and threshold notices are idempotent", async () => {
  const eventId = await createEvent(eventKeys[2], {
    remaining_hp: 1550,
    total_effective_damage: 1450,
  });
  const before = await waterFor(users[0].id);
  const attack = await clientRpc(0, "exchange_and_attack_world_boss", {
    p_event_id: eventId,
    p_species: "melody-sprout",
    p_exchange_request_id: crypto.randomUUID(),
    p_attack_request_id: crypto.randomUUID(),
  });
  assert.equal(attack[0].effective_damage, 100);
  assert.equal(attack[0].remaining_hp, 1450);
  const afterAttack = await waterFor(users[0].id);
  assert.equal(afterAttack.water, before.water - 3);
  const below50 = await admin.from("world_boss_notification_queue")
    .select("id,user_id").eq("event_id", eventId).eq("notification_type", "below_50");
  assert.ifError(below50.error);
  const activeProfiles = await admin.from("leaderboard_profiles")
    .select("user_id", { count: "exact" }).eq("is_active", true).eq("profile_completed", true);
  assert.ifError(activeProfiles.error);
  assert.equal(below50.data.length, activeProfiles.count);
  assert.equal(new Set(below50.data.map((row) => row.user_id)).size, below50.data.length);

  assert.ifError((await admin.from("world_boss_events").update({
    remaining_hp: 250, total_effective_damage: 2750,
  }).eq("id", eventId)).error);
  assert.ifError((await admin.from("world_boss_attacks").insert({
    event_id: eventId,
    user_id: users[1].id,
    request_id: crypto.randomUUID(),
    species: "melody-sprout",
    spirit_stage: 3,
    attack_type: "normal",
    attempted_damage: 60,
    effective_damage: 60,
  })).error);
  assert.ifError((await admin.from("world_boss_attacks").insert({
    event_id: eventId,
    user_id: users[2].id,
    request_id: crypto.randomUUID(),
    species: "melody-sprout",
    spirit_stage: 3,
    attack_type: "normal",
    attempted_damage: 60,
    effective_damage: 10,
  })).error);
  const below10 = await admin.from("world_boss_notification_queue")
    .select("id,user_id").eq("event_id", eventId).eq("notification_type", "below_10");
  assert.ifError(below10.error);
  const activeProfilesAfter = await admin.from("leaderboard_profiles")
    .select("user_id", { count: "exact" }).eq("is_active", true).eq("profile_completed", true);
  assert.ifError(activeProfilesAfter.error);
  assert.equal(below10.data.length, activeProfilesAfter.count);
  assert.equal(new Set(below10.data.map((row) => row.user_id)).size, below10.data.length);
});
