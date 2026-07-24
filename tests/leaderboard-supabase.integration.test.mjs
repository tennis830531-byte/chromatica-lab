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
const validPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const validJpeg = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EH//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EH//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EH//2Q==", "base64");
let validWebp = Buffer.alloc(0);
let lastUploadMetadata = null;

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

async function upload(client, index, body = validPng, contentType = "image/png") {
  const form = new FormData();
  form.append("file", new File([body], `fixture-${index}`, { type: contentType }));
  form.append("display_name", `測試玩家${index + 1}`);
  form.append("consent", "true");
  form.append("featured_spirit_species", "melody-sprout");
  form.append("featured_spirit_name", `芽芽${index + 1}`);
  form.append("featured_spirit_stage", "2");
  const { data, error } = await client.functions.invoke("upload-leaderboard-avatar", {
    body: form,
    headers: { Origin: "http://localhost" },
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
  lastUploadMetadata = data;
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

async function recordWeekly(index, cycles, dates = streakDates(1), eventId = crypto.randomUUID(), extra = {}) {
  return rpc(clients[index], "record_weekly_leaderboard_practice", {
    p_event_id: eventId,
    p_completed_cycles: cycles,
    p_practice_date: dates[0],
    p_protected_dates: dates,
    ...extra,
  });
}

async function resetWeekly() {
  const targets = [
    ["leaderboard_notification_deliveries", "user_id"], ["leaderboard_notification_queue", "user_id"],
    ["leaderboard_weekly_rank_state", "user_id"], ["weekly_leaderboard_results", "user_id"],
    ["weekly_leaderboard_scores", "user_id"], ["leaderboard_push_device_tokens", "user_id"],
    ["leaderboard_push_preferences", "user_id"],
    ["announcements", "id"], ["app_admins", "user_id"],
  ];
  for (const [table, column] of targets) {
    const { error } = await admin.from(table).delete().not(column, "is", null);
    if (error) throw error;
  }
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
  await resetWeekly();
  await resetScores();
  const localUsers = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (localUsers.error) throw localUsers.error;
  for (const existing of localUsers.data.users.filter((user) => user.email?.toLowerCase() === "leaderboard-local-admin@example.invalid")) {
    const removed = await admin.auth.admin.deleteUser(existing.id);
    if (removed.error) throw removed.error;
  }
  for (let index = 0; index < 20; index += 1) {
    const email = index === 0 ? "leaderboard-local-admin@example.invalid" : `leaderboard-local-${crypto.randomUUID()}@example.invalid`;
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
  const generatedPath = await upload(clients[19], 19, validPng, "image/png");
  const generated = await admin.storage.from(bucket).download(generatedPath);
  assert.ifError(generated.error);
  validWebp = Buffer.from(await generated.data.arrayBuffer());
  assert.equal(validWebp.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(validWebp.subarray(8, 12).toString("ascii"), "WEBP");
  assert.ok(validWebp.length > 0 && validWebp.length <= 300 * 1024);
});

after(async () => {
  if (uploadedPaths.length) await admin.storage.from(bucket).remove(uploadedPaths);
  await resetWeekly();
  await resetScores();
  for (const user of users) {
    const removed = await admin.auth.admin.deleteUser(user.id);
    if (removed.error) throw removed.error;
  }
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

test("Edge Function decodes JPEG PNG and WebP inputs", async () => {
  await upload(clients[1], 1, validJpeg, "image/jpeg");
  await upload(clients[2], 2, validPng, "image/png");
  await upload(clients[3], 3, validWebp, "image/webp");
  assert.equal(lastUploadMetadata?.mime, "image/webp");
  assert.ok(Number(lastUploadMetadata?.width) > 0);
  assert.equal(lastUploadMetadata?.width, lastUploadMetadata?.height);
  assert.ok(Number(lastUploadMetadata?.width) <= 512);
  assert.ok(Number(lastUploadMetadata?.bytes) <= 300 * 1024);
});

test("twenty complete public profiles contain no Google or provider identity fields", async () => {
  for (let index = 0; index < 20; index += 1) {
    await join(index, index >= 18 ? "同名玩家" : `測試玩家${index + 1}`);
  }
  const { data, error } = await admin.from("leaderboard_profiles").select("*").in("user_id", users.map((user) => user.id));
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
      .update({ created_at: new Date(Date.now() - 11 * 60 * 1000).toISOString() }).eq("user_id", users[1].id);
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

test("Function and Storage accept bounded images and reject SVG GIF fake MIME corruption and oversize", async () => {
  const accepted = [
    ["jpg", validJpeg, "image/jpeg"], ["png", validPng, "image/png"], ["webp", validWebp, "image/webp"],
  ];
  for (const [extension, body, mime] of accepted) {
    const result = await adminBucketUpload(clients[2], extension, body, mime);
    assert.equal(result.error, null);
  }
  await expectFailure(() => upload(clients[2], 2, Buffer.from("not-a-webp"), "image/webp"), /invalid|non-2xx|upload/i);
  await expectFailure(() => upload(clients[2], 2, validWebp, "image/png"), /non-2xx|upload/i);
  await expectFailure(() => upload(clients[2], 2, Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>") , "image/svg+xml"), /non-2xx|upload/i);
  await expectFailure(() => upload(clients[2], 2, Buffer.from("GIF89a", "ascii"), "image/gif"), /non-2xx|upload/i);
  await expectFailure(() => upload(clients[2], 2, Buffer.from("89504e470d0a1a0a00010203", "hex"), "image/png"), /non-2xx|upload/i);
  const oversizedPng = Buffer.alloc(2 * 1024 * 1024 + 1);
  validPng.copy(oversizedPng, 0, 0, 8);
  await expectFailure(() => upload(clients[2], 2, oversizedPng, "image/png"), /non-2xx|upload/i);
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

test("Taipei server week changes exactly at Sunday 00:00", async () => {
  assert.equal(await rpc(admin, "taipei_leaderboard_week_start", { p_timestamp: "2026-07-25T15:59:59Z" }), "2026-07-19");
  assert.equal(await rpc(admin, "taipei_leaderboard_week_start", { p_timestamp: "2026-07-25T16:00:00Z" }), "2026-07-26");
  await expectFailure(() => recordWeekly(0, 1, streakDates(1), crypto.randomUUID(), { p_week_start: "1999-01-03" }), /function|parameter|schema cache/i);
});

test("weekly RPC accumulates accepted events once and returns server ranks", async () => {
  await resetScores();
  await resetWeekly();
  const eventId = crypto.randomUUID();
  const first = await recordWeekly(0, 4, streakDates(1), eventId);
  const replay = await recordWeekly(0, 4, streakDates(1), eventId);
  assert.equal(first?.[0]?.accepted, true);
  assert.equal(first?.[0]?.current_rank, 1);
  assert.equal(replay?.[0]?.accepted, false);
  const rows = await rpc(clients[0], "get_weekly_leaderboard");
  assert.equal(rows.find((row) => row.is_current_user)?.score, 4);
});

test("weekly RPC ranks every active joined member including zero cycles without write side effects", async () => {
  await resetScores();
  await resetWeekly();
  const originalProfilesResult = await admin.from("leaderboard_profiles").select("*").in("user_id", users.map((user) => user.id));
  assert.ifError(originalProfilesResult.error);
  const originalProfiles = originalProfilesResult.data;
  const ids = users.slice(0, 6).map((user) => user.id);
  const [playerA, playerB, playerC, exited, cleared, disabled] = ids;
  const publicKey = (userId) => crypto.createHash("md5").update(userId).digest("hex");
  const countForUsers = async (table, userIds) => {
    const result = await admin.from(table).select("*", { count: "exact", head: true }).in("user_id", userIds);
    assert.ifError(result.error);
    return result.count;
  };
  const setProfile = async (userId, values) => {
    const result = await admin.from("leaderboard_profiles").update(values).eq("user_id", userId);
    assert.ifError(result.error);
  };

  try {
    assert.ifError((await admin.from("leaderboard_profiles").update({ is_active: false }).not("user_id", "is", null)).error);
    await setProfile(playerA, { is_active: true, joined_at: "2026-07-01T00:00:00Z" });
    await setProfile(playerB, { is_active: true, joined_at: "2026-07-02T00:00:00Z" });
    await setProfile(playerC, { is_active: true, joined_at: "2026-07-03T00:00:00Z" });
    await setProfile(exited, { is_active: false, left_at: "2026-07-04T00:00:00Z" });
    await setProfile(cleared, {
      is_active: false,
      profile_completed: false,
      custom_avatar_path: null,
      consented_at: null,
      left_at: "2026-07-04T00:00:00Z",
    });
    await setProfile(disabled, { is_active: false });

    for (let index = 0; index < 11; index += 1) {
      const result = await recordWeekly(0, 8);
      assert.equal(result?.[0]?.accepted, true);
    }

    const zeroIds = [playerB, playerC];
    const before = {
      scores: await countForUsers("weekly_leaderboard_scores", zeroIds),
      events: await countForUsers("leaderboard_practice_events", zeroIds),
      queue: await countForUsers("leaderboard_notification_queue", zeroIds),
    };
    assert.deepEqual(before, { scores: 0, events: 0, queue: 0 });

    const ranked = await rpc(clients[0], "get_weekly_leaderboard");
    assert.deepEqual(ranked.map((row) => [row.position, row.public_key, row.score]), [
      [1, publicKey(playerA), 88],
      [2, publicKey(playerB), 0],
      [3, publicKey(playerC), 0],
    ]);
    assert.deepEqual(
      (await rpc(clients[0], "get_weekly_leaderboard")).map((row) => [row.position, row.public_key, row.score]),
      ranked.map((row) => [row.position, row.public_key, row.score]),
    );
    for (const excluded of [exited, cleared, disabled]) {
      assert.equal(ranked.some((row) => row.public_key === publicKey(excluded)), false);
    }
    assert.deepEqual({
      scores: await countForUsers("weekly_leaderboard_scores", zeroIds),
      events: await countForUsers("leaderboard_practice_events", zeroIds),
      queue: await countForUsers("leaderboard_notification_queue", zeroIds),
    }, before);

    await resetScores();
    await resetWeekly();
    const allZero = await rpc(clients[0], "get_weekly_leaderboard");
    assert.deepEqual(allZero.map((row) => [row.position, row.public_key, row.score]), [
      [1, publicKey(playerA), 0],
      [2, publicKey(playerB), 0],
      [3, publicKey(playerC), 0],
    ]);

    for (const index of [1, 2]) {
      for (const cycles of [8, 8, 4]) assert.equal((await recordWeekly(index, cycles))?.[0]?.accepted, true);
    }
    const tiedPositive = await rpc(clients[0], "get_weekly_leaderboard");
    assert.deepEqual(tiedPositive.map((row) => [row.position, row.public_key, row.score]), [
      [1, publicKey(playerB), 20],
      [2, publicKey(playerC), 20],
      [3, publicKey(playerA), 0],
    ]);

    await resetScores();
    await resetWeekly();
    const sameJoinTime = "2026-07-02T00:00:00Z";
    await setProfile(playerB, { joined_at: sameJoinTime });
    await setProfile(playerC, { joined_at: sameJoinTime });
    const stableByUserId = await rpc(clients[0], "get_weekly_leaderboard");
    const expectedZeroOrder = [playerB, playerC].sort().map(publicKey);
    assert.deepEqual(stableByUserId.slice(1).map((row) => row.public_key), expectedZeroOrder);
    assert.deepEqual(stableByUserId.map((row) => row.position), [1, 2, 3]);
  } finally {
    await resetWeekly();
    await resetScores();
    for (const row of originalProfiles) {
      const { user_id: userId, ...values } = row;
      await setProfile(userId, values);
    }
  }
});

test("crossing the top-ten boundary queues one transition and respects cooldown before a later transition", async () => {
  await resetScores();
  await resetWeekly();
  const week = await rpc(admin, "taipei_leaderboard_week_start");
  const reached = new Date(Date.now() - 60_000).toISOString();
  const seeded = Array.from({ length: 11 }, (_, index) => ({
    week_start: week,
    user_id: users[index].id,
    completed_cycles: index < 9 ? 100 - index : 11 - index,
    score_reached_at: reached,
  }));
  assert.ifError((await admin.from("weekly_leaderboard_scores").upsert(seeded, { onConflict: "week_start,user_id" })).error);
  await rpc(admin, "refresh_weekly_leaderboard_rank_state", { p_week_start: week });

  const firstMove = await recordWeekly(10, 2);
  assert.equal(firstMove?.[0]?.previous_rank, 11);
  assert.equal(firstMove?.[0]?.current_rank, 10);
  let dropped = await admin.from("leaderboard_notification_queue").select("id,user_id,transition_sequence").eq("week_start", week).eq("notification_type", "dropped_out_of_top_ten");
  assert.ifError(dropped.error);
  assert.equal(dropped.data.filter((row) => row.user_id === users[9].id).length, 1);

  await recordWeekly(10, 1);
  dropped = await admin.from("leaderboard_notification_queue").select("id,user_id").eq("week_start", week).eq("notification_type", "dropped_out_of_top_ten");
  assert.equal(dropped.data.filter((row) => row.user_id === users[9].id).length, 1);

  await recordWeekly(9, 4);
  await recordWeekly(10, 4);
  dropped = await admin.from("leaderboard_notification_queue").select("id,user_id").eq("week_start", week).eq("notification_type", "dropped_out_of_top_ten");
  assert.equal(dropped.data.filter((row) => row.user_id === users[9].id).length, 1, "cooldown suppresses a rapid second drop");

  assert.ifError((await admin.from("leaderboard_weekly_rank_state").update({ last_drop_notified_at: new Date(Date.now() - 31 * 60_000).toISOString() }).eq("week_start", week).eq("user_id", users[9].id)).error);
  await recordWeekly(9, 4);
  await recordWeekly(10, 4);
  dropped = await admin.from("leaderboard_notification_queue").select("id,user_id,transition_sequence").eq("week_start", week).eq("notification_type", "dropped_out_of_top_ten");
  assert.equal(dropped.data.filter((row) => row.user_id === users[9].id).length, 2);
  assert.equal(new Set(dropped.data.map((row) => `${row.user_id}:${row.transition_sequence}`)).size, dropped.data.length);
});

test("push token ownership is singular and missing tokens never block rankings", async () => {
  await resetWeekly();
  const token = `local-mock-${crypto.randomBytes(32).toString("hex")}`;
  assert.equal(await rpc(clients[0], "register_leaderboard_push_token", { p_token: token, p_platform: "android", p_enabled: true }), true);
  assert.equal(await rpc(clients[1], "register_leaderboard_push_token", { p_token: token, p_platform: "android", p_enabled: true }), true);
  const rows = await admin.from("leaderboard_push_device_tokens").select("user_id,is_active");
  assert.ifError(rows.error);
  assert.equal(rows.data.length, 1);
  assert.equal(rows.data[0].user_id, users[1].id);
  assert.equal(await rpc(clients[1], "disable_leaderboard_push_token"), true);
  assert.equal((await admin.from("leaderboard_push_device_tokens").select("is_active").single()).data.is_active, false);
});

test("weekly results and top-ten movement preferences default on and disable independently", async () => {
  await resetWeekly();
  const defaults = await rpc(clients[0], "get_leaderboard_push_preferences");
  assert.equal(defaults?.[0]?.weekly_results, true);
  assert.equal(defaults?.[0]?.top_ten_changes, true);
  assert.equal(await rpc(clients[0], "set_leaderboard_push_preferences", { p_weekly_results: false, p_top_ten_changes: true }), true);
  const changed = await rpc(clients[0], "get_leaderboard_push_preferences");
  assert.equal(changed?.[0]?.weekly_results, false);
  assert.equal(changed?.[0]?.top_ten_changes, true);
  assert.equal(await rpc(clients[0], "set_leaderboard_push_preferences", { p_weekly_results: false, p_top_ten_changes: false }), true);
  const accepted = await recordWeekly(0, 5);
  assert.equal(accepted?.[0]?.accepted, true);
  const week = accepted?.[0]?.week_start;
  let queued = await admin.from("leaderboard_notification_queue").select("id").eq("user_id", users[0].id);
  assert.ifError(queued.error);
  assert.equal(queued.data.length, 0, "disabled movement preference must not enqueue");
  await rpc(admin, "finalize_weekly_leaderboard", { p_week_start: week });
  queued = await admin.from("leaderboard_notification_queue").select("id").eq("user_id", users[0].id);
  assert.equal(queued.data.length, 0, "disabled weekly preference must not enqueue");
});

test("announcement drafts and admin writes are protected by server authorization", async () => {
  await resetWeekly();
  assert.equal((await rpc(clients[0], "get_announcement_admin_status"))?.[0]?.is_admin, false);
  assert.ok((await clients[1].from("announcements").insert({ large_topic: "違規", title: "違規", body: "不應成功", published_at: new Date().toISOString(), created_by: users[1].id, updated_by: users[1].id })).error);
  await expectFailure(() => rpc(clients[1], "save_announcement", { p_id: null, p_large_topic: "一般使用者", p_title: "不可寫入", p_body: "伺服器必須拒絕", p_published_at: new Date().toISOString(), p_publish: false }), /admin required/i);
  assert.ifError((await admin.from("app_admins").insert({ user_id: users[0].id })).error);
  assert.equal((await rpc(clients[0], "get_announcement_admin_status"))?.[0]?.is_admin, true);
  assert.equal((await rpc(clients[1], "get_announcement_admin_status"))?.[0]?.is_admin, false);
  const draft = await rpc(clients[0], "save_announcement", { p_id: null, p_large_topic: "測試主題", p_title: "安全公告", p_body: "這是一則純文字測試公告", p_published_at: new Date(Date.now() - 1000).toISOString(), p_publish: false });
  assert.ok(draft?.id || draft?.[0]?.id);
  assert.equal((await rpc(clients[1], "get_published_announcements")).length, 0);
  const id = draft?.id || draft?.[0]?.id;
  assert.equal(await rpc(clients[0], "set_announcement_published", { p_id: id, p_publish: true }), true);
  const published = await rpc(clients[1], "get_published_announcements");
  assert.equal(published.length, 1);
  assert.equal(published[0].body, "這是一則純文字測試公告");
});

test("announcement galleries preserve legacy cover fields and cascade cleanly", async () => {
  await resetWeekly();
  assert.ifError((await admin.from("app_admins").insert({ user_id: users[0].id })).error);
  const draft = await rpc(clients[0], "save_announcement", {
    p_id: null,
    p_large_topic: "多圖測試",
    p_title: "相容公告",
    p_body: "第一張是封面",
    p_published_at: new Date(Date.now() - 1000).toISOString(),
    p_publish: true,
  });
  const id = draft?.id || draft?.[0]?.id;
  const paths = [`announcement-${crypto.randomUUID()}.webp`, `announcement-${crypto.randomUUID()}.webp`];
  assert.equal(await rpc(admin, "replace_announcement_images_service", {
    p_announcement_id: id,
    p_image_paths: paths,
    p_image_versions: [11, 12],
  }), true);
  const published = await rpc(clients[1], "get_published_announcements_v2");
  assert.deepEqual(published[0].image_paths, paths);
  assert.equal(published[0].image_path, paths[0]);
  assert.equal(published[0].image_version, 11);
  const rows = await admin.from("announcement_images").select("image_path,sort_order").eq("announcement_id", id).order("sort_order");
  assert.ifError(rows.error);
  assert.deepEqual(rows.data.map((row) => row.image_path), paths);
  assert.equal(await rpc(admin, "delete_announcement_service", { p_announcement_id: id }), true);
  const after = await admin.from("announcement_images").select("id", { count: "exact", head: true }).eq("announcement_id", id);
  assert.ifError(after.error);
  assert.equal(after.count, 0);
});

test("announcement comments use joined public identities and enforce idempotent ownership", async () => {
  await resetWeekly();
  await join(0, "管理芽芽");
  await join(1, "留言芽芽");
  assert.ifError((await admin.from("leaderboard_profiles").delete().eq("user_id", users[2].id)).error);
  assert.ifError((await admin.from("app_admins").insert({ user_id: users[0].id })).error);
  const draft = await rpc(clients[0], "save_announcement", {
    p_id: null,
    p_large_topic: "留言測試",
    p_title: "安全留言板",
    p_body: "只有公開排行榜身份可留言",
    p_published_at: new Date(Date.now() - 1000).toISOString(),
    p_publish: true,
  });
  const announcementId = draft?.id || draft?.[0]?.id;
  const requestId = crypto.randomUUID();
  const first = await rpc(clients[1], "create_announcement_comment", {
    p_announcement_id: announcementId,
    p_body: " 第一則留言 ",
    p_request_id: requestId,
  });
  assert.equal(first[0].display_name, "留言芽芽");
  assert.equal(first[0].body, "第一則留言");
  await rpc(clients[1], "create_announcement_comment", {
    p_announcement_id: announcementId,
    p_body: "重播不得新增",
    p_request_id: requestId,
  });
  let comments = await rpc(clients[0], "get_announcement_comments", { p_announcement_id: announcementId });
  assert.equal(comments.length, 1);
  assert.equal(comments[0].body, "第一則留言");
  await expectFailure(() => rpc(clients[2], "create_announcement_comment", {
    p_announcement_id: announcementId,
    p_body: "沒有公開資料",
    p_request_id: crypto.randomUUID(),
  }), /leaderboard public profile required/i);
  assert.ok((await clients[1].from("announcement_comments").insert({
    announcement_id: announcementId,
    user_id: users[0].id,
    request_id: crypto.randomUUID(),
    body: "偽造別人身份",
  })).error);
  const adminComment = await rpc(clients[0], "create_announcement_comment", {
    p_announcement_id: announcementId,
    p_body: "管理者留言",
    p_request_id: crypto.randomUUID(),
  });
  assert.equal(await rpc(clients[1], "delete_announcement_comment", { p_comment_id: adminComment[0].id }), false);
  assert.equal(await rpc(clients[0], "delete_announcement_comment", { p_comment_id: first[0].id }), true);
  comments = await rpc(clients[0], "get_announcement_comments", { p_announcement_id: announcementId });
  assert.equal(comments.length, 1);
  assert.equal(comments[0].body, "管理者留言");
  assert.equal(await rpc(admin, "delete_announcement_service", { p_announcement_id: announcementId }), true);
  const after = await admin.from("announcement_comments").select("id", { count: "exact", head: true }).eq("announcement_id", announcementId);
  assert.ifError(after.error);
  assert.equal(after.count, 0);
});

test("authenticated clear-all resets only the caller leaderboard data", async () => {
  const week = await rpc(admin, "taipei_leaderboard_week_start");
  const announcementBefore = await admin.from("announcements").select("id", { count: "exact", head: true });
  assert.ifError(announcementBefore.error);
  const otherProfileBefore = await admin.from("leaderboard_profiles").select("user_id").eq("user_id", users[1].id).single();
  assert.ifError(otherProfileBefore.error);

  assert.ifError((await admin.from("weekly_leaderboard_scores").upsert({
    week_start: week, user_id: users[0].id, completed_cycles: 7,
  }, { onConflict: "week_start,user_id" })).error);
  assert.ifError((await admin.from("weekly_leaderboard_results").upsert({
    week_start: week, user_id: users[0].id, final_rank: 1, completed_cycles: 7,
    score_reached_at: new Date().toISOString(),
  }, { onConflict: "week_start,user_id" })).error);
  assert.ifError((await admin.from("leaderboard_weekly_rank_state").upsert({
    week_start: week, user_id: users[0].id, current_rank: 1,
    was_top_ten: true, is_top_ten: true,
  }, { onConflict: "week_start,user_id" })).error);
  assert.ifError((await admin.from("leaderboard_push_preferences").upsert({
    user_id: users[0].id, weekly_results: true, top_ten_changes: true,
  })).error);
  const queue = await admin.from("leaderboard_notification_queue").insert({
    week_start: week,
    user_id: users[0].id,
    notification_type: "weekly_top_ten_result",
    rank: 1,
    transition_sequence: 0,
    event_key: `reset-test-${crypto.randomUUID()}`,
  }).select("id").single();
  assert.ifError(queue.error);
  assert.ifError((await admin.from("leaderboard_notification_deliveries").insert({
    week_start: week,
    user_id: users[0].id,
    notification_type: "weekly_top_ten_result",
    transition_sequence: 0,
    queue_id: queue.data.id,
  })).error);

  const anon = createClient(apiUrl, anonKey, options);
  await expectFailure(() => rpc(anon, "reset_my_leaderboard_data"), /authentication required|permission denied/i);
  assert.equal(await rpc(clients[0], "reset_my_leaderboard_data"), true);

  for (const table of [
    "leaderboard_notification_deliveries",
    "leaderboard_notification_queue",
    "leaderboard_weekly_rank_state",
    "weekly_leaderboard_results",
    "weekly_leaderboard_scores",
    "leaderboard_practice_days",
    "leaderboard_practice_events",
    "leaderboard_push_preferences",
    "leaderboard_profiles",
  ]) {
    const result = await admin.from(table).select("user_id", { count: "exact", head: true }).eq("user_id", users[0].id);
    assert.ifError(result.error);
    assert.equal(result.count, 0, `${table} must be cleared only for the caller`);
  }

  const otherProfileAfter = await admin.from("leaderboard_profiles").select("user_id").eq("user_id", users[1].id).single();
  assert.ifError(otherProfileAfter.error);
  const announcementAfter = await admin.from("announcements").select("id", { count: "exact", head: true });
  assert.ifError(announcementAfter.error);
  assert.equal(announcementAfter.count, announcementBefore.count);
});
