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
  await admin.from("world_boss_events").delete().in("event_key", ["2099-01-02", "2099-01-09", "2099-01-16"]);
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
      "chromatica.waterDrops": "250",
      "chromatica.spiritCollection": JSON.stringify([
        { species: "melody-sprout", stage: 3, harvested: true },
        { species: "mushroom-spirit", stage: 3, harvested: true },
        { species: "flower-spirit", stage: 3, harvested: true },
      ]),
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
  await admin.from("world_boss_events").delete().in("event_key", ["2099-01-02", "2099-01-09", "2099-01-16"]);
});

test("skill learning is server-side, costs 100 once, and is idempotent", async () => {
  const requestId = crypto.randomUUID();
  const first = await rpc("learn_world_boss_skill", { p_species: "melody-sprout", p_request_id: requestId });
  assert.equal(first[0].skill_name, "森靈共鳴曲");
  const repeated = await rpc("learn_world_boss_skill", { p_species: "melody-sprout", p_request_id: crypto.randomUUID() });
  assert.equal(repeated[0].applied_revision, first[0].applied_revision);
  const save = await admin.from("game_saves").select("snapshot").eq("user_id", user.id).single();
  assert.equal(save.data.snapshot.data["chromatica.waterDrops"], "150");
});

test("normal damage, special damage, effective overkill, first/final hit, and dead-boss safety", async () => {
  const normal = await rpc("attack_world_boss", {
    p_event_id: eventId, p_species: "melody-sprout", p_stage: 1,
    p_attack_type: "normal", p_request_id: crypto.randomUUID(),
  });
  assert.equal(normal[0].effective_damage, 10);
  assert.equal(normal[0].is_first_hit, true);
  const special = await rpc("attack_world_boss", {
    p_event_id: eventId, p_species: "melody-sprout", p_stage: 3,
    p_attack_type: "special", p_request_id: crypto.randomUUID(),
  });
  assert.equal(special[0].effective_damage, 100);
  assert.equal(special[0].light_energy, 0);
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

test("special skill usage is shared and limited to two per event", async () => {
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
  }), /special attack limit reached/);
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
});
