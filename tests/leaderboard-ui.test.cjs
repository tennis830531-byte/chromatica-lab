const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const auth = fs.readFileSync(path.join(root, "auth-entry.js"), "utf8");
const runtime = fs.readFileSync(path.join(root, "leaderboard.js"), "utf8");
const core = fs.readFileSync(path.join(root, "leaderboard-core.js"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const build = fs.readFileSync(path.join(root, "scripts/build-web.mjs"), "utf8");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/202607210001_create_global_leaderboards.sql"), "utf8");
const avatarFunction = fs.readFileSync(path.join(root, "supabase/functions/upload-leaderboard-avatar/index.ts"), "utf8");

test("global leaderboard exposes practice and streak rankings with the refresh-170 period note", () => {
  assert.match(html, /data-leaderboard-metric="practice"[^>]*>練習王/);
  assert.match(html, /data-leaderboard-metric="streak"[^>]*>連續學習王/);
  assert.match(html, /自 refresh-170 起累積/);
  assert.match(runtime, /練習循環 \$\{row\.score\} 次/);
  assert.match(runtime, /連續學習 \$\{row\.score\} 天/);
});

test("ranking query returns top fifteen and current user with stable tie ordering", () => {
  assert.match(migration, /rank_position <= 15/);
  assert.match(migration, /user_id = auth\.uid\(\) and rank_position > 15/);
  assert.match(migration, /practice_cycles end desc,[\s\S]*lp\.joined_at asc,[\s\S]*lp\.user_id asc/);
  assert.match(runtime, /leaderboard-ellipsis/);
  assert.match(runtime, /（你）/);
});

test("podium rules and empty state remain explicit", () => {
  for (const className of ["is-gold", "is-silver", "is-bronze"]) {
    assert.match(runtime, new RegExp(className));
    assert.match(css, new RegExp(`\\.leaderboard-row\\.${className}`));
  }
  assert.match(runtime, /目前還沒有排行成績/);
  assert.match(css, /@media \(max-width: 390px\)[\s\S]*leaderboard-row/);
});

test("leaderboard public identity never uses Google name avatar or provider metadata", () => {
  assert.doesNotMatch(runtime, /getPublicUserProfile|google_avatar|googleAvatar|provider_metadata|email/i);
  assert.doesNotMatch(migration, /google|provider|email/i);
  assert.match(auth, /getLeaderboardAccount\(\)[\s\S]*\{ id: currentAuthUser\.id \}/);
  assert.match(runtime, /getLeaderboardAccount/);
});

test("first entry requires a custom name avatar and explicit consent", () => {
  assert.match(html, /id="leaderboardProfileName"[^>]*minlength="2"[^>]*maxlength="20"/);
  assert.match(html, /id="leaderboardProfileAvatarInput"/);
  assert.match(html, /id="leaderboardProfileConsent" type="checkbox"/);
  assert.match(html, /你的排行榜名字、頭像、展示精靈與排行成績，將公開顯示給其他排行榜使用者/);
  assert.match(html, /id="leaderboardProfileSubmit"[^>]*>儲存公開資料/);
  assert.match(runtime, /profileOnboarding && !pendingAvatarFile/);
  assert.match(runtime, /leaderboardProfileConsent[\s\S]*checked !== true/);
  assert.doesNotMatch(html, /leaderboardUseGoogleAvatar/);
});

test("unauthenticated and incomplete profiles cannot fetch rankings", () => {
  assert.match(runtime, /if \(!getPublicUser\(\)\)[\s\S]*請先登入/);
  assert.match(runtime, /if \(joined !== true\)[\s\S]*請先完成排行榜公開資料設定/);
  assert.match(migration, /completed leaderboard profile required/);
  assert.match(migration, /is_active = true and profile_completed = true and consented_at is not null/);
});

test("opening an incomplete account goes directly to profile setup without reading the list", () => {
  assert.match(runtime, /ensureMembership\(\{ force: true \}\)[\s\S]*if \(!joined\)[\s\S]*openProfileEditor\(\{ onboarding: true \}\)[\s\S]*return/);
  assert.match(runtime, /onboarding \? "" : core\.normalizeDisplayName/);
});

test("an unavailable backend shows one friendly status instead of opening public profile setup", () => {
  assert.match(runtime, /\.catch\(\(error\) => \{[\s\S]*membershipUnavailable = true/);
  const unavailable = runtime.match(/if \(membershipUnavailable\) \{[\s\S]*?return;[\s\S]*?\}/)?.[0] || "";
  assert.match(unavailable, /排行榜服務正在準備中，請稍後再試。/);
  assert.match(unavailable, /renderLeaderboardRows\(\[\], activeMetric\)/);
  assert.doesNotMatch(unavailable, /openProfileEditor/);
});

test("profile is activated only after processed avatar upload succeeds", () => {
  const uploadIndex = runtime.indexOf('uploadLeaderboardAvatar?.(pendingAvatarFile)');
  const joinIndex = runtime.indexOf('rpc("join_global_leaderboard"');
  assert.ok(uploadIndex >= 0 && joinIndex > uploadIndex);
  assert.match(runtime, /if \(uploaded\?\.path\) void authApi\(\)\?\.deleteLeaderboardAvatar/);
  assert.match(migration, /valid uploaded avatar required/);
});

test("avatar processing verifies magic bytes and emits a bounded square WebP", () => {
  assert.match(auth, /detectLeaderboardAvatarMime/);
  assert.match(auth, /0xff[\s\S]*0xd8[\s\S]*0x89[\s\S]*RIFF[\s\S]*WEBP/);
  assert.match(auth, /LEADERBOARD_AVATAR_INPUT_LIMIT = 2 \* 1024 \* 1024/);
  assert.match(auth, /LEADERBOARD_AVATAR_OUTPUT_LIMIT = 300 \* 1024/);
  assert.match(auth, /LEADERBOARD_AVATAR_MAX_EDGE = 512/);
  assert.match(auth, /drawImage\(source, cropX, cropY, cropSize, cropSize, 0, 0, size, size\)/);
  assert.match(auth, /"image\/webp"/);
  assert.doesNotMatch(auth, /avatar\.\$\{extension\}|upsert: true/);
});

test("avatar bytes are uploaded through the validating edge function instead of direct client storage writes", () => {
  assert.match(auth, /functions\.invoke\("upload-leaderboard-avatar"/);
  assert.doesNotMatch(auth, /storage\.from\("leaderboard-avatars"\)\.upload/);
  assert.match(avatarFunction, /request\.headers\.get\("Content-Type"\)/);
  assert.match(avatarFunction, /bytes\.byteLength >= 300 \* 1024/);
  assert.match(avatarFunction, /RIFF[\s\S]*WEBP/);
  assert.match(avatarFunction, /serviceRoleKey/);
  assert.doesNotMatch(migration, /on storage\.objects for (insert|update) to authenticated/);
});

test("avatar replacement keeps the old image until profile update succeeds and cache busts URLs", () => {
  const updateIndex = runtime.indexOf('rpc("update_leaderboard_profile"');
  const deleteIndex = runtime.indexOf('deleteLeaderboardAvatar?.(oldAvatarPath)');
  assert.ok(updateIndex >= 0 && deleteIndex > updateIndex);
  assert.match(auth, /getLeaderboardAvatarUrl\(path, version = 0\)/);
  assert.match(auth, /encodeURIComponent\(String\(version \|\| 0\)\)/);
});

test("public avatar references use an opaque prefix instead of the raw Supabase UUID", () => {
  assert.match(auth, /get_leaderboard_avatar_prefix/);
  assert.doesNotMatch(auth, /const path = `\$\{currentAuthUser\.id\}\//);
  assert.match(avatarFunction, /get_leaderboard_avatar_prefix/);
  assert.match(migration, /foldername\(name\)\)\[1\] = md5\(auth\.uid\(\)::text\)/);
  assert.match(migration, /split_part\(v_avatar_path, '\/', 1\) <> md5\(v_user_id::text\)/);
});

test("leaving hides the profile and clears account cache and pending queue", () => {
  assert.match(html, /id="leaderboardLeaveButton"/);
  assert.match(runtime, /leave_global_leaderboard/);
  assert.match(runtime, /writePendingEvents\(user\.id, \[\]\)/);
  assert.match(runtime, /invalidateCache\(\)/);
  assert.match(migration, /profile_completed = false/);
  assert.match(migration, /consented_at = null/);
});

test("leaving requires full setup and consent again", () => {
  assert.match(runtime, /joined = false/);
  assert.match(runtime, /openProfileEditor\(\{ onboarding: true \}\)/);
  assert.match(runtime, /leaderboardProfileConsent[\s\S]*checked = false/);
});

test("unfinished or inactive accounts neither queue nor flush practice events", () => {
  assert.match(runtime, /isQaActive\(\) \|\| joined !== true/);
  assert.match(runtime, /if \(joined === true\) return enqueuePracticeCompletion/);
  assert.match(migration, /leaderboard membership required/);
});

test("record RPC derives the user from auth and accepts no user total or rank", () => {
  assert.match(migration, /record_leaderboard_practice\(\s*p_event_id uuid,\s*p_completed_cycles integer/);
  assert.match(migration, /v_user_id uuid := auth\.uid\(\)/);
  assert.doesNotMatch(migration, /record_leaderboard_practice\([\s\S]{0,180}p_user_id|p_total|p_rank/);
  assert.match(migration, /p_completed_cycles < 1 or p_completed_cycles > 8/);
  assert.match(migration, /completed_cycles > 500/);
});

test("event replay is unique per account and cannot increment twice", () => {
  assert.match(migration, /primary key \(user_id, event_id\)/);
  assert.match(migration, /on conflict \(user_id, event_id\) do nothing/);
  assert.match(migration, /if v_inserted_count = 0 then return false/);
  assert.match(runtime, /crypto\?\.randomUUID/);
});

test("server time and anomaly limits are used for accepted practice events", () => {
  assert.match(migration, /created_at timestamptz not null default pg_catalog\.now\(\)/);
  assert.match(migration, /v_recent_events >= 30/);
  assert.match(migration, /interval '10 minutes'/);
  assert.match(migration, /daily cycle limit exceeded/);
  assert.match(migration, /v_server_utc_date date := \(pg_catalog\.now\(\) at time zone 'UTC'\)::date/);
  assert.match(migration, /p_practice_date < v_server_utc_date - 1/);
});

test("streak uses canonical local practiceHistory and freeze dates instead of leaderboard event days", () => {
  assert.match(app, /getCanonicalLeaderboardStreakEvidence/);
  assert.match(app, /isPracticeProtected\(history, dateKey\)/);
  assert.match(runtime, /p_practice_date: event\.practiceDate/);
  assert.match(runtime, /p_protected_dates: event\.protectedDates/);
  assert.match(migration, /protected dates must be a contiguous canonical streak ending on the local practice date/);
  assert.match(migration, /current_streak_days = v_protected_count/);
  assert.doesNotMatch(migration, /calculate_leaderboard_streak/);
  assert.doesNotMatch(migration, /values \(v_user_id, current_date/);
  assert.doesNotMatch(runtime, /p_current_streak/);
  assert.doesNotMatch(migration, /p_current_streak/);
});

test("RLS and grants prevent direct score or other-user writes", () => {
  assert.match(migration, /leaderboard_profiles enable row level security/);
  assert.match(migration, /leaderboard_practice_events enable row level security/);
  assert.match(migration, /leaderboard_practice_days enable row level security/);
  assert.match(migration, /using \(user_id = auth\.uid\(\)\)[\s\S]*with check \(user_id = auth\.uid\(\)\)/);
  assert.match(migration, /revoke all on public\.leaderboard_profiles from anon, authenticated/);
  assert.match(migration, /revoke all on public\.leaderboard_practice_events from anon, authenticated/);
  assert.doesNotMatch(migration, /grant (insert|update|delete) on public\.leaderboard/);
});

test("security definer functions pin an empty search path and qualify SQL objects", () => {
  const definers = migration.match(/security definer/g) || [];
  const paths = migration.match(/set search_path = ''/g) || [];
  assert.equal(paths.length, definers.length);
  assert.match(migration, /public\.leaderboard_profiles/);
  assert.match(migration, /public\.leaderboard_practice_events/);
  assert.match(migration, /storage\.objects/);
});

test("public ranking result exposes only anonymous public fields", () => {
  const returnBlock = migration.match(/create or replace function public\.get_global_leaderboard[\s\S]*?language plpgsql/)?.[0] || "";
  assert.match(returnBlock, /public_key text/);
  assert.doesNotMatch(returnBlock, /user_id uuid|email|provider|google/i);
  assert.match(migration, /md5\(selected\.user_id::text\) as public_key/);
});

test("names are rendered with textContent and duplicate display names remain distinct by anonymous keys", () => {
  assert.match(runtime, /name\.textContent =/);
  assert.doesNotMatch(runtime, /name\.innerHTML/);
  assert.match(core, /seen\.has\(row\.userId\)/);
  assert.match(migration, /public_key/);
});

test("leaderboard remains a ten minute foreground refresh without realtime", () => {
  assert.match(runtime, /PROFILE_REFRESH_INTERVAL_MS = 10 \* 60 \* 1000/);
  assert.match(runtime, /setInterval/);
  assert.doesNotMatch(runtime, /\.channel\(|postgres_changes|supabase\.realtime/);
});

test("leaderboard data is isolated from account snapshot and QA garden", () => {
  assert.match(runtime, /isQaActive\(\)/);
  assert.match(runtime, /chromatica\.leaderboard\.pending\.v1/);
  assert.doesNotMatch(runtime, /scheduleAccountSnapshotSave|flushSave|syncBestEffort|save_game_state/);
  assert.match(app, /isQaActive: isGardenQaSessionActive/);
});

test("new runtimes are declared in page build and service worker", () => {
  for (const file of ["leaderboard-core.js", "leaderboard.js"]) {
    assert.match(html, new RegExp(file.replace(".", "\\.")));
    assert.match(build, new RegExp(`"${file.replace(".", "\\.")}"`));
    assert.match(sw, new RegExp(file.replace(".", "\\.")));
  }
});
