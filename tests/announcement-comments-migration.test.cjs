const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migration = fs.readFileSync(
  path.join(__dirname, "..", "supabase/migrations/202607240001_expand_announcements_and_comments.sql"),
  "utf8",
);

test("migration 005 keeps legacy images and adds an ordered child table", () => {
  assert.match(migration, /create table public\.announcement_images/);
  assert.match(migration, /announcement_id uuid not null references public\.announcements\(id\) on delete cascade/);
  assert.match(migration, /unique \(announcement_id, sort_order\)/);
  assert.match(migration, /insert into public\.announcement_images[\s\S]*a\.image_path/s);
});

test("comment table has bounded text, idempotency and required indexes", () => {
  assert.match(migration, /create table public\.announcement_comments/);
  assert.match(migration, /char_length\(btrim\(body\)\) between 1 and 300/);
  assert.match(migration, /unique \(user_id, request_id\)/);
  assert.match(migration, /announcement_comments_announcement_time_idx/);
  assert.match(migration, /announcement_comments_user_idx/);
});

test("comment RLS exposes published rows and binds writes to auth uid", () => {
  assert.match(migration, /alter table public\.announcement_comments enable row level security/);
  assert.match(migration, /authenticated read published announcement comments/);
  assert.match(migration, /joined users create their own announcement comments/);
  assert.match(migration, /user_id = auth\.uid\(\)/);
  assert.match(migration, /authors or admins delete announcement comments/);
  assert.match(migration, /user_id = auth\.uid\(\) or public\.is_app_admin\(auth\.uid\(\)\)/);
});

test("comment RPCs never accept public names or avatar paths from clients", () => {
  const createSignature = migration.match(/create or replace function public\.create_announcement_comment\([\s\S]*?\)\nreturns table/)?.[0] || "";
  assert.match(createSignature, /p_announcement_id uuid/);
  assert.match(createSignature, /p_body text/);
  assert.match(createSignature, /p_request_id uuid/);
  assert.doesNotMatch(createSignature, /display_name|avatar_path|user_id/);
  assert.match(migration, /join public\.leaderboard_profiles lp on lp\.user_id = ac\.user_id/);
});

test("service-only image replacement and deletion use fixed search paths", () => {
  assert.match(migration, /replace_announcement_images_service[\s\S]*security definer[\s\S]*set search_path = ''/s);
  assert.match(migration, /delete_announcement_service[\s\S]*security definer[\s\S]*set search_path = ''/s);
  assert.match(migration, /auth\.jwt\(\)\s*->>\s*'role'/);
  assert.match(migration, /grant execute on function public\.replace_announcement_images_service[\s\S]*to service_role/s);
  assert.doesNotMatch(migration, /grant execute on function public\.replace_announcement_images_service[\s\S]*to authenticated/s);
});

test("migration does not touch auth users, rankings, cron, vault or notification queues", () => {
  assert.doesNotMatch(migration, /(?:insert|update|delete)\s+(?:into\s+|from\s+)?auth\.users/i);
  assert.doesNotMatch(migration, /weekly_leaderboard_scores|leaderboard_practice_events|leaderboard_notification_queue/);
  assert.doesNotMatch(migration, /cron\.|vault\.|http_post\s*\(/i);
});
