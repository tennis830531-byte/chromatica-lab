import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const apiUrl = process.env.API_URL || "";
const anonKey = process.env.ANON_KEY || "";
const serviceRoleKey = process.env.SERVICE_ROLE_KEY || "";
const password = process.env.LEADERBOARD_TEST_PASSWORD || "";
const host = (() => { try { return new URL(apiUrl).hostname; } catch { return ""; } })();

assert.ok(["localhost", "127.0.0.1"].includes(host), "integration tests require a local Supabase API");
assert.ok(anonKey && serviceRoleKey && password, "local integration credentials are required");
assert.doesNotMatch(apiUrl, /supabase\.co/i);

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(apiUrl, serviceRoleKey, options);
const users = [];
const clients = [];
const uploadedPaths = [];
const bucket = "leaderboard-avatars";
const validWebp = Buffer.from("524946461000000057454250565038200400000000000000", "hex");
const validJpeg = Buffer.from("ffd8ffe000104a4649460001ffd9", "hex");
const validPng = Buffer.from("89504e470d0a1a0a0000000049454e44ae426082", "hex");

function localDate(offset = 0) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now).reduce((out, part) => ({ ...out, [part.type]: part.value }), {});
  const base = new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + offset);
  return base.toISOString().slice(0, 10);
}

function streakDates(length, end = localDate()) {
  return Array.from({ length }, (_, index) => {
    const date = new Date(`${end}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - index);
    return date.toISOString().slice(0, 10);
  });
}

async function rpc(client, name, args = {}) {
  const result = await client.rpc(name, args);
  if (result.error) throw new Error(`${name}: ${result.error.message}`);
  return result.data;
}

async function expectFailure(action, pattern) {
  let message = "";
  try { await action(); } catch (error) { message = String(error?.message || error); }
  assert.match(message, pattern);
}

async function upload(client, index, body = validWebp, contentType = "image/webp") {
  const { data, error } = await client.functions.invoke("upload-leaderboard-avatar", {
    body: new Blob([body], { type: contentType }),
    headers: { "Content-Type": contentType },
  });
  if (error) {
    const status = Number(error?.context?.status || 0);
    let reason = "unknown";
    try {
      const payload = await error.context.clone().json();
      reason = String(payload?.error || "unknown");
    } catch {}
    throw new Error(`upload: status=${status} reason=${reason}`);
  }
  const path = String(data?.path || "");
  assert.match(path, /^[a-f0-9]{32}\/avatar-[a-f0-9-]+\.webp$/i);
  uploadedPaths.push(path);
  return path;
}

async function adminBucketUpload(client, extension, body, contentType) {
  const prefix = await rpc(client, "get_leaderboard_avatar_prefix");
  const path = `${prefix}/bucket-${crypto.randomUUID()}.${extension}`;
  const result = await admin.storage.from(bucket).upload(path, body, { contentType, upsert: false });
  if (!result.error) uploadedPaths.push(path);
  return result;
}

async function join(index, displayName = `測試玩家${index + 1}`) {
  const path = await upload(clients[index], index);
  const data = await rpc(clients[index], "join_global_leaderboard", {
    p_display_name: displayName,
    p_custom_avatar_path: path,
    p_consent: true,
    p_featured_spirit_species: "melody-sprout",
    p_featured_spirit_name: `芽芽${index + 1}`,
    p_featured_spirit_stage: 2,
  });
  assert.equal(data?.[0]?.joined, true);
  return path;
}

async function record(index, cycles, dates = streakDates(1), eventId = crypto.randomUUID()) {
  return rpc(clients[index], "record_leaderboard_practice", {
    p_event_id: eventId,
    p_completed_cycles: cycles,
    p_practice_date: dates[0],
    p_protected_dates: dates,
  });
}

async function resetScores() {
  for (const table of ["leaderboard_practice_events", "leaderboard_practice_days"]) {
    const { error } = await admin.from(table).delete().not("user_id", "is", null);
    if (error) throw error;
  }
  const { error } = await admin.from("leaderboard_profiles")
    .update({ practice_cycles: 0, current_streak_days: 0 })
    .not("user_id", "is", null);
  if (error) throw error;
}

before(async () => {
  for (let index = 0; index < 20; index += 1) {
    const email = `leaderboard-local-${crypto.randomUUID()}@example.invalid`;
    const created = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { full_name: `Google Name ${index}`, avatar_url: "https://example.invalid/google.png", provider_id: `provider-${index}` },
    });
    if (created.error) throw created.error;
    users.push({ id: created.data.user.id, email });
    const client = createClient(apiUrl, anonKey, options);
    const signedIn = await client.auth.signInWithPassword({ email, password });
    if (signedIn.error) throw signedIn.error;
    clients.push(client);
  }
});

after(async () => {
  if (uploadedPaths.length) await admin.storage.from(bucket).remove(uploadedPaths);
  for (const user of users) await admin.auth.admin.deleteUser(user.id);
});

test("unauthenticated and incomplete accounts cannot view or submit", async () => {
  const anon = createClient(apiUrl, anonKey, options);
  await expectFailure(() => rpc(anon, "get_global_leaderboard", { p_metric: "practice" }), /authentication required|permission denied/i);
  await expectFailure(() => rpc(clients[0], "get_global_leaderboard", { p_metric: "practice" }), /completed leaderboard profile/i);
  await expectFailure(() => record(0, 1), /leaderboard membership required/i);
});

test("name avatar and explicit consent are all mandatory", async () => {
  await expectFailure(() => rpc(clients[0], "join_global_leaderboard", {
    p_display_name: " ", p_custom_avatar_path: "", p_consent: true,
    p_featured_spirit_species: "", p_featured_spirit_name: "", p_featured_spirit_stage: 1,
  }), /invalid display name/i);
  const path = await upload(clients[0], 0);
  await expectFailure(() => rpc(clients[0], "join_global_leaderboard", {
    p_display_name: "測試玩家", p_custom_avatar_path: path, p_consent: false,
    p_featured_spirit_species: "", p_featured_spirit_name: "", p_featured_spirit_stage: 1,
  }), /public consent required/i);
  await expectFailure(() => rpc(clients[0], "join_global_leaderboard", {
    p_display_name: "測試玩家", p_custom_avatar_path: "", p_consent: true,
    p_featured_spirit_species: "", p_featured_spirit_name: "", p_featured_spirit_stage: 1,
  }), /avatar required/i);
});

test("twenty complete public profiles contain no Google or provider identity fields", async () => {
  for (let index = 0; index < 20; index += 1) {
    await join(index, index >= 18 ? "同名玩家" : `測試玩家${index + 1}`);
  }
  const { data, error } = await admin.from("leaderboard_profiles").select("*");
  assert.ifError(error);
  assert.equal(data.length, 20);
  for (const row of data) {
    const keys = Object.keys(row).join(" ");
    assert.doesNotMatch(keys, /email|google|provider|metadata/i);
    assert.doesNotMatch(JSON.stringify(row), /Google Name|example\.invalid\/google|provider-/i);
  }
});

test("leaving hides membership and blocks view and submit; rejoin preserves first join and streak", async () => {
  await record(0, 1, streakDates(3));
  const before = await admin.from("leaderboard_profiles").select("joined_at,current_streak_days").eq("user_id", users[0].id).single();
  assert.ifError(before.error);
  assert.equal(await rpc(clients[0], "leave_global_leaderboard"), true);
  await expectFailure(() => rpc(clients[0], "get_global_leaderboard", { p_metric: "streak" }), /completed leaderboard profile/i);
  await expectFailure(() => record(0, 1), /leaderboard membership required/i);
  await join(0, "重新加入者");
  const afterRow = await admin.from("leaderboard_profiles").select("joined_at,current_streak_days").eq("user_id", users[0].id).single();
  assert.ifError(afterRow.error);
  assert.equal(afterRow.data.joined_at, before.data.joined_at);
  assert.equal(afterRow.data.current_streak_days, 3);
});

test("RPC derives auth uid, validates 1..8 integer cycles and de-duplicates event ids", async () => {
  await resetScores();
  for (let cycles = 1; cycles <= 8; cycles += 1) assert.equal(await record(0, cycles), true);
  for (const bad of [0, -1, 9, 1.5]) await expectFailure(() => record(0, bad), /invalid cycle|integer/i);
  const eventId = crypto.randomUUID();
  assert.equal(await record(0, 2, streakDates(1), eventId), true);
  assert.equal(await record(0, 2, streakDates(1), eventId), false);
  await expectFailure(() => rpc(clients[0], "record_leaderboard_practice", {
    p_event_id: crypto.randomUUID(), p_completed_cycles: 1, p_practice_date: localDate(),
    p_protected_dates: streakDates(1), p_user_id: users[1].id,
  }), /function|parameter|schema cache/i);
});

test("canonical local dates handle same day midnight and freeze evidence", async () => {
  await resetScores();
  assert.equal(await record(0, 1, streakDates(1)), true);
  assert.equal(await record(0, 1, streakDates(1)), true);
  let row = await admin.from("leaderboard_profiles").select("current_streak_days").eq("user_id", users[0].id).single();
  assert.equal(row.data.current_streak_days, 1);
  const tomorrow = localDate(1);
  assert.equal(await record(0, 1, streakDates(2, tomorrow)), true);
  row = await admin.from("leaderboard_profiles").select("current_streak_days").eq("user_id", users[0].id).single();
  assert.equal(row.data.current_streak_days, 2);
  assert.equal(await record(0, 1, streakDates(3)), true);
  row = await admin.from("leaderboard_profiles").select("current_streak_days").eq("user_id", users[0].id).single();
  assert.equal(row.data.current_streak_days, 3);
  await expectFailure(() => record(0, 1, [localDate(), localDate(-2)]), /contiguous canonical streak/i);
});

test("ten-minute event rate limit rejects event 31", async () => {
  await resetScores();
  for (let index = 0; index < 30; index += 1) assert.equal(await record(0, 1), true);
  await expectFailure(() => record(0, 1), /rate limit exceeded/i);
});

test("daily 500-cycle cap is enforced independently of the rolling rate window", async () => {
  await resetScores();
  for (let batch = 0; batch < 2; batch += 1) {
    for (let index = 0; index < 30; index += 1) assert.equal(await record(1, 8), true);
    const { error } = await admin.from("leaderboard_practice_events")
      .update({ created_at: `${localDate()}T00:00:00.000Z` }).eq("user_id", users[1].id);
    assert.ifError(error);
  }
  assert.equal(await record(1, 8), true);
  assert.equal(await record(1, 8), true);
  await expectFailure(() => record(1, 8), /daily cycle limit exceeded/i);
});

test("practice and streak rankings return top 15 plus a stable self row", async () => {
  await resetScores();
  for (let index = 0; index < 20; index += 1) {
    let remaining = 20 - index;
    while (remaining > 0) {
      const cycles = Math.min(8, remaining);
      await record(index, cycles, streakDates(20 - index));
      remaining -= cycles;
    }
  }
  for (const metric of ["practice", "streak"]) {
    const top = await rpc(clients[0], "get_global_leaderboard", { p_metric: metric });
    assert.equal(top.length, 15);
    assert.equal(top.filter((row) => row.is_current_user).length, 1);
    const self = await rpc(clients[19], "get_global_leaderboard", { p_metric: metric });
    assert.equal(self.length, 16);
    assert.equal(self.at(-1).position, 20);
    assert.equal(self.at(-1).is_current_user, true);
    assert.deepEqual(self.map((row) => row.public_key), (await rpc(clients[19], "get_global_leaderboard", { p_metric: metric })).map((row) => row.public_key));
    for (const row of self) {
      assert.deepEqual(Object.keys(row).sort(), ["avatar_version", "custom_avatar_path", "display_name", "featured_spirit_name", "featured_spirit_species", "featured_spirit_stage", "is_current_user", "position", "public_key", "score"]);
      assert.doesNotMatch(JSON.stringify(row), /email|provider|google/i);
    }
  }
});

test("RLS blocks anon writes, direct score changes, other paths and storage listing", async () => {
  const anon = createClient(apiUrl, anonKey, options);
  assert.ok((await anon.from("leaderboard_profiles").update({ practice_cycles: 999 }).eq("user_id", users[0].id)).error);
  assert.ok((await clients[0].from("leaderboard_profiles").update({ practice_cycles: 999 }).eq("user_id", users[0].id)).error);
  const prefix1 = await rpc(clients[1], "get_leaderboard_avatar_prefix");
  assert.ok((await clients[0].storage.from(bucket).upload(`${prefix1}/${crypto.randomUUID()}.webp`, validWebp, { contentType: "image/webp" })).error);
  const listing = await clients[0].storage.from(bucket).list("", { limit: 100 });
  assert.equal(listing.error, null);
  assert.deepEqual(listing.data, []);
});

test("Storage accepts bounded JPEG PNG WebP and rejects SVG GIF and files over 2MB", async () => {
  const accepted = [
    ["jpg", validJpeg, "image/jpeg"], ["png", validPng, "image/png"], ["webp", validWebp, "image/webp"],
  ];
  for (const [extension, body, mime] of accepted) {
    const result = await adminBucketUpload(clients[2], extension, body, mime);
    assert.equal(result.error, null);
  }
  await expectFailure(() => upload(clients[2], 2, Buffer.from("not-a-webp"), "image/webp"), /invalid|non-2xx|upload/i);
  await expectFailure(() => upload(clients[2], 2, validWebp, "image/png"), /non-2xx|upload/i);
  for (const [extension, mime] of [["svg", "image/svg+xml"], ["gif", "image/gif"]]) {
    const result = await adminBucketUpload(clients[2], extension, Buffer.from("not-an-image"), mime);
    assert.ok(result.error);
  }
  assert.ok((await adminBucketUpload(clients[2], "png", Buffer.alloc(2 * 1024 * 1024 + 1), "image/png")).error);
  await expectFailure(() => upload(clients[2], 2, Buffer.alloc(300 * 1024), "image/webp"), /non-2xx|upload/i);
});

test("database catalog confirms RLS constraints grants safe search_path and bucket limits", () => {
  const sql = `
    select
      (select bool_and(relrowsecurity) from pg_catalog.pg_class where oid in ('public.leaderboard_profiles'::regclass, 'public.leaderboard_practice_events'::regclass, 'public.leaderboard_practice_days'::regclass)),
      exists (select 1 from pg_catalog.pg_constraint where conrelid='public.leaderboard_practice_events'::regclass and contype='p'),
      not pg_catalog.has_table_privilege('authenticated','public.leaderboard_profiles','UPDATE'),
      not pg_catalog.has_table_privilege('anon','public.leaderboard_practice_events','INSERT'),
      pg_catalog.has_function_privilege('authenticated','public.record_leaderboard_practice(uuid,integer,date,date[])','EXECUTE'),
      not pg_catalog.has_function_privilege('anon','public.record_leaderboard_practice(uuid,integer,date,date[])','EXECUTE'),
      (select bool_and(prosecdef and pg_catalog.array_to_string(proconfig, ',') = 'search_path=""') from pg_catalog.pg_proc where pronamespace='public'::regnamespace and proname in ('join_global_leaderboard','leave_global_leaderboard','record_leaderboard_practice','get_global_leaderboard')),
      (select file_size_limit=2097152 and allowed_mime_types @> array['image/jpeg','image/png','image/webp'] from storage.buckets where id='leaderboard-avatars');`;
  const output = execFileSync("docker", ["exec", "supabase_db_chromatica-lab-local", "psql", "-U", "postgres", "-d", "postgres", "-At", "-F", ",", "-c", sql], { encoding: "utf8" }).trim();
  assert.equal(output, "t,t,t,t,t,t,t,t");
});
