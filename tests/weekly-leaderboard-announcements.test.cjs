const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/202607210002_create_weekly_leaderboard_announcements.sql"), "utf8");
const oldMigration = fs.readFileSync(path.join(root, "supabase/migrations/202607210001_create_global_leaderboards.sql"), "utf8");

test("Taipei weeks begin Sunday 00:00 using server timestamps", () => {
  assert.match(migration, /at time zone 'Asia\/Taipei'/);
  assert.match(migration, /date_trunc\('week',[\s\S]*\+ interval '1 day'\)[\s\S]*- interval '1 day'/);
  assert.match(migration, /v_week date := public\.taipei_leaderboard_week_start\(pg_catalog\.now\(\)\)/);
  const recordSignature = migration.match(/create or replace function public\.record_weekly_leaderboard_practice\([\s\S]*?\)\nreturns/)?.[0] || "";
  assert.doesNotMatch(recordSignature, /p_week_key|p_week_start|p_timestamp|p_timezone/);
});

test("weekly scores aggregate accepted server-side events without deleting history", () => {
  assert.match(migration, /record_leaderboard_practice\(p_event_id,\s*p_completed_cycles,\s*p_practice_date,\s*p_protected_dates\)/);
  assert.match(migration, /on conflict on constraint weekly_leaderboard_scores_pkey do update set completed_cycles = public\.weekly_leaderboard_scores\.completed_cycles \+ excluded\.completed_cycles/);
  assert.doesNotMatch(migration, /(?:delete|truncate)\s+(?:table\s+)?public\.leaderboard_practice_events/i);
  assert.match(oldMigration, /leaderboard_practice_events/);
});

test("weekly ordering is stable and exposes top fifteen plus self", () => {
  assert.match(migration, /completed_cycles desc,\s*score_reached_at asc,\s*user_id asc/);
  assert.match(migration, /rank_position <= 15/);
  assert.match(migration, /user_id = auth\.uid\(\)/);
});

test("finalization preserves results and is idempotent", () => {
  assert.match(migration, /create table public\.weekly_leaderboard_results/);
  assert.match(migration, /primary key \(week_start, user_id\)/);
  assert.match(migration, /on conflict \(week_start,\s*user_id\) do nothing/);
  assert.match(migration, /weekly_top_ten_result/);
  assert.match(migration, /final_rank <= 10/);
});

test("dropped-out state uses server ranks transition dedup cooldown and weekly cap", () => {
  assert.match(migration, /previous_rank[\s\S]*current_rank[\s\S]*was_top_ten[\s\S]*is_top_ten[\s\S]*changed_at/);
  assert.match(migration, /v_old\.is_top_ten and v_rank\.current_rank > 10/);
  assert.match(migration, /interval '30 minutes'/);
  assert.match(migration, /drop_notification_count < 3/);
  assert.match(migration, /unique \(week_start, user_id, notification_type, transition_sequence\)/);
  assert.match(migration, /dropped_out_of_top_ten/);
});

test("server-side notification preferences gate weekly entered improved and dropped queues", () => {
  assert.match(migration, /create table public\.leaderboard_push_preferences/);
  assert.match(migration, /weekly_results boolean not null default true/);
  assert.match(migration, /top_ten_changes boolean not null default true/);
  for (const type of ["weekly_top_ten_result", "entered_top_ten", "rank_improved", "dropped_out_of_top_ten"]) {
    assert.match(migration, new RegExp(type));
  }
  assert.match(migration, /v_movement_enabled/);
  assert.match(migration, /coalesce\(\(select p\.weekly_results/);
  assert.match(migration, /get_leaderboard_push_preferences/);
  assert.match(migration, /set_leaderboard_push_preferences/);
});

test("practice score and rank-state queue updates share one security-definer transaction", () => {
  const rpc = migration.match(/create or replace function public\.record_weekly_leaderboard_practice[\s\S]*?\$\$;/)?.[0] || "";
  assert.match(rpc, /security definer/);
  assert.match(rpc, /record_leaderboard_practice/);
  assert.match(rpc, /weekly_leaderboard_scores/);
  assert.equal((rpc.match(/refresh_weekly_leaderboard_rank_state/g) || []).length, 2);
});

test("all new private tables use RLS and clients have no direct writes", () => {
  for (const table of ["weekly_leaderboard_scores", "weekly_leaderboard_results", "leaderboard_weekly_rank_state", "leaderboard_push_device_tokens", "leaderboard_notification_queue", "leaderboard_notification_deliveries", "app_admins", "announcements"]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(migration, /revoke all on public\.weekly_leaderboard_scores[\s\S]*from anon, authenticated/);
  assert.doesNotMatch(migration, /grant (?:insert|update|delete)[^;]* to authenticated/i);
});

test("announcement reads are published-only while admin mutations are server-authorized", () => {
  assert.match(migration, /a\.is_published and a\.published_at <= pg_catalog\.now\(\)/);
  assert.match(migration, /if not public\.is_app_admin\(auth\.uid\(\)\) then raise exception 'admin required'/);
  assert.match(migration, /large_topic[\s\S]*between 1 and 30/);
  assert.match(migration, /title[\s\S]*between 1 and 80/);
  assert.match(migration, /body[\s\S]*between 1 and 5000/);
  assert.match(migration, /announcement-images[\s\S]*5242880/);
});

test("every new security-definer function pins an empty search path", () => {
  const definers = migration.match(/security definer/g) || [];
  const paths = migration.match(/set search_path = ''/g) || [];
  assert.equal(paths.length, definers.length);
  assert.match(migration, /public\.weekly_leaderboard_scores/);
  assert.match(migration, /public\.announcements/);
});

test("weekly finalization is scheduled for UTC Saturday 16:00", () => {
  assert.match(migration, /cron\.schedule\('chromatica-finalize-weekly-leaderboard', '0 16 \* \* 6'/);
});

test("notification queue dispatch uses named Vault secrets and a one-minute server schedule", () => {
  assert.match(migration, /leaderboard_notification_function_url/);
  assert.match(migration, /leaderboard_notification_cron_secret/);
  assert.match(migration, /net\.http_post/);
  assert.match(migration, /x-cron-secret/);
  assert.match(migration, /cron\.schedule\('chromatica-dispatch-leaderboard-notifications', '\* \* \* \* \*'/);
  assert.doesNotMatch(migration, /https:\/\/[a-z0-9-]+\.supabase\.co/i);
});
