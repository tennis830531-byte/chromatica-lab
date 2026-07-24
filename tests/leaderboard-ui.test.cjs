const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

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
const weeklyMigration = fs.readFileSync(path.join(root, "supabase/migrations/202607210002_create_weekly_leaderboard_announcements.sql"), "utf8");
const weeklyRankMigration = fs.readFileSync(path.join(root, "supabase/migrations/202607230001_rank_all_joined_weekly_members.sql"), "utf8");
const leaderboardContextMigration = fs.readFileSync(path.join(root, "supabase/migrations/202607240002_expand_weekly_leaderboard_context.sql"), "utf8");
const avatarFunction = fs.readFileSync(path.join(root, "supabase/functions/upload-leaderboard-avatar/index.ts"), "utf8");

test("global leaderboard exposes only the weekly 乖乖練習王", () => {
  assert.match(html, /乖乖練習王/);
  assert.match(html, /role="tablist"[^>]*aria-label="排行榜類別"/);
  assert.match(html, /data-leaderboard-metric="weekly"[^>]*role="tab"[^>]*aria-selected="true"/);
  assert.match(runtime, /renderMetricTabs/);
  assert.doesNotMatch(html, /data-leaderboard-metric="streak"|連續學習王|自 refresh-170 起累積|歷史總循環/);
  assert.match(runtime, /本週 \$\{row\.score\} 次/);
  assert.doesNotMatch(runtime, /連續學習 \$\{row\.score\} 天/);
});

test("home leaderboard title is shown only for the current weekly top ten", () => {
  assert.match(html, /id="homeLeaderboardTitle" class="home-leaderboard-title hidden" aria-live="polite"/);
  assert.match(runtime, /TOP_TEN_RANK_LABELS/);
  assert.match(runtime, /rank >= 1 && rank <= 10/);
  assert.match(runtime, /`乖乖練習王 第\$\{TOP_TEN_RANK_LABELS\[rank\]\}名`/);
  assert.match(runtime, /element\.classList\.toggle\("hidden", !isTopTen\)/);
  assert.match(runtime, /updateWeeklySummary[\s\S]*renderHomeLeaderboardTitle\(\)/);
  assert.match(runtime, /loadLeaderboard\("weekly", \{ force: true, showCache: false \}\)/);
});

test("discussion quick-entry artwork is reviewed and transparent", async () => {
  const file = "public/assets/chromatic-refresh/feature/discussion-forum-icon.png";
  assert.match(html, /data-discussion-open[\s\S]*discussion-forum-icon\.png/);
  assert.match(app, /data-discussion-open[\s\S]*尚未開放/);
  assert.match(build, /public\/assets\/chromatic-refresh\/feature\/discussion-forum-icon\.png/);
  assert.match(sw, /public\/assets\/chromatic-refresh\/feature\/discussion-forum-icon\.png/);
  const { data, info } = await sharp(path.join(root, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 256);
  assert.equal(info.height, 256);
  for (const [x, y] of [[0, 0], [info.width - 1, 0], [0, info.height - 1], [info.width - 1, info.height - 1]]) {
    assert.equal(data[(y * info.width + x) * 4 + 3], 0);
  }
});

test("joined zero-cycle members render as formal ranked rows without a duplicate summary", () => {
  assert.doesNotMatch(html, /leaderboardOwnWeeklyStatus|leaderboardAccountWeeklyStatus|我的本週狀態/);
  assert.doesNotMatch(runtime, /leaderboardOwnWeeklyStatus|leaderboardAccountWeeklyStatus|我的本週狀態/);
  assert.match(runtime, /score\.textContent = `本週 \$\{row\.score\} 次`/);
  assert.match(runtime, /normalized\.some\(\(row\) => row\.isCurrentUser\)/);
  assert.match(runtime, /排行榜服務正在更新中/);
  assert.doesNotMatch(runtime, /weeklyRow\s*==\s*null[\s\S]*MEMBERSHIP\.NOT_JOINED/);
});

test("weekly rank migration includes every active member without creating zero-score rows", () => {
  assert.match(weeklyRankMigration, /create or replace function public\.get_weekly_leaderboard\(\)/);
  assert.match(weeklyRankMigration, /from public\.leaderboard_profiles lp[\s\S]*where lp\.is_active[\s\S]*lp\.profile_completed[\s\S]*lp\.consented_at is not null/);
  assert.match(weeklyRankMigration, /left join public\.weekly_leaderboard_scores ws/);
  assert.match(weeklyRankMigration, /coalesce\(ws\.completed_cycles, 0::bigint\)/);
  assert.match(weeklyRankMigration, /row_number\(\) over[\s\S]*completed_cycles, 0::bigint\) desc,[\s\S]*am\.joined_at asc,[\s\S]*am\.user_id asc/);
  assert.doesNotMatch(weeklyRankMigration, /insert into|update public|delete from|truncate|rank\(\)|dense_rank\(\)/i);
});

test("weekly leaderboard context includes five real ranks before and after the current member", () => {
  assert.match(leaderboardContextMigration, /create or replace function public\.get_weekly_leaderboard\(\)/);
  assert.match(leaderboardContextMigration, /ranked\.rank_position <= 15/);
  assert.match(leaderboardContextMigration, /current_member\.rank_position - 5/);
  assert.match(leaderboardContextMigration, /current_member\.rank_position \+ 5/);
  assert.doesNotMatch(leaderboardContextMigration, /insert into|update public|delete from|truncate/i);
});

test("successful leaderboard loads have no count announcement or empty layout gap", () => {
  assert.doesNotMatch(runtime, /更新完成，共顯示|已顯示最近更新的排行/);
  assert.match(runtime, /renderLeaderboardRows\(rows, activeMetric\);\s*setStatus\("", ""\)/);
  assert.match(css, /\.leaderboard-status:empty\s*\{\s*display:\s*none;/);
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
  assert.match(css, /@media \(max-width: 430px\)[\s\S]*leaderboard-row/);
  assert.match(runtime, /podium-flag-gold-1\.png/);
  assert.match(runtime, /podium-flag-silver-2\.png/);
  assert.match(runtime, /podium-flag-bronze-3\.png/);
  assert.match(runtime, /leaderboard-podium-icon/);
});

test("podium flag assets are RGBA images with transparent corners", async () => {
  for (const file of [
    "public/assets/leaderboard/podium-flag-gold-1.png",
    "public/assets/leaderboard/podium-flag-silver-2.png",
    "public/assets/leaderboard/podium-flag-bronze-3.png",
  ]) {
    const { data, info } = await sharp(path.join(root, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.channels, 4);
    for (const [x, y] of [[0, 0], [info.width - 1, 0], [0, info.height - 1], [info.width - 1, info.height - 1]]) {
      assert.equal(data[(y * info.width + x) * 4 + 3], 0, `${file} corner must be transparent`);
    }
  }
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

test("profile creation shows one blocking progress state and rejects duplicate submits", () => {
  assert.match(html, /id="leaderboardProfileSaving"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(html, /id="leaderboardProfileSavingMessage"[^>]*>正在建立排行榜資料…/);
  assert.match(runtime, /let profileSaving = false/);
  assert.match(runtime, /if \(profileSaving\) return/);
  assert.match(runtime, /showProfileError\(\);\s*setProfileSaving\(true\);/);
  assert.match(runtime, /profileOnboarding \? "正在建立排行榜資料…" : "正在儲存公開資料…"/);
  assert.match(runtime, /form\?\.setAttribute\("aria-busy", String\(profileSaving\)\)/);
  assert.match(css, /\.leaderboard-profile-saving \{[^}]*position: absolute;[^}]*inset: 0;[^}]*z-index: 4;/s);
  assert.match(css, /\.leaderboard-profile-spinner \{[^}]*animation: leaderboard-profile-spin/s);
});

test("profile editor cannot be dismissed by a keyboard-shifted backdrop tap", () => {
  assert.match(runtime, /leaderboardProfileClose"\)\?\.addEventListener\("click", closeProfileEditor\)/);
  assert.match(runtime, /leaderboardProfileCancel"\)\?\.addEventListener\("click", closeProfileEditor\)/);
  assert.doesNotMatch(runtime, /leaderboardProfileModal"\)\?\.addEventListener\("click"[\s\S]*closeProfileEditor/);
});

test("unauthenticated and incomplete profiles cannot fetch rankings", () => {
  assert.match(runtime, /if \(!userId\)[\s\S]*請先登入/);
  assert.match(runtime, /membershipStatus === MEMBERSHIP\.NOT_JOINED[\s\S]*請先完成排行榜公開資料設定/);
  assert.match(migration, /completed leaderboard profile required/);
  assert.match(migration, /is_active = true and profile_completed = true and consented_at is not null/);
});

test("an incomplete account enters onboarding from the leaderboard while member settings only links there", () => {
  assert.match(runtime, /membershipStatus === MEMBERSHIP\.NOT_JOINED[\s\S]*openProfileEditor\(\{ onboarding: true \}\)/);
  assert.match(html, /id="leaderboardAccountSection"[\s\S]*排行榜公開資料/);
  assert.match(html, /id="leaderboardProfileEdit"[^>]*>前往排行榜完成首次設定/);
  assert.match(runtime, /leaderboardProfileEdit[\s\S]*if \(joinedNow\(\)\) openProfileEditor\(\);[\s\S]*else void open\(\)/);
  assert.match(runtime, /onboarding \? "" : core\.normalizeDisplayName/);
});

test("member settings public-profile action stays on one line in both states", () => {
  assert.match(runtime, /joined \? "編輯公開資料／更換頭像" : "前往排行榜完成首次設定"/);
  assert.match(css, /\.leaderboard-account-actions \{[^}]*grid-template-columns: minmax\(0, 1fr\);/s);
  assert.match(css, /\.leaderboard-account-actions button \{[^}]*white-space: nowrap;/s);
});

test("an unavailable backend shows one friendly status instead of opening public profile setup", () => {
  assert.match(runtime, /\.catch\(\(error\) => \{[\s\S]*membershipStatus = MEMBERSHIP\.ERROR/);
  const openUnsafe = runtime.match(/async function openUnsafe\(\) \{[\s\S]*?\n  \}\n\n  async function open\(\)/)?.[0] || "";
  const unavailable = openUnsafe.match(/if \(membershipStatus === MEMBERSHIP\.ERROR\) \{[\s\S]*?return true;\s*\}/)?.[0] || "";
  assert.match(unavailable, /membershipError\?\.message/);
  assert.match(unavailable, /renderLeaderboardRows\(\[\], activeMetric\)/);
  assert.doesNotMatch(unavailable, /openProfileEditor/);
});

test("profile is activated only after processed avatar upload succeeds", () => {
  const uploadIndex = runtime.indexOf('uploadLeaderboardAvatar?.(pendingAvatarFile,');
  const profileIndex = runtime.indexOf("if (uploaded?.profile)");
  assert.ok(uploadIndex >= 0 && profileIndex > uploadIndex);
  assert.match(avatarFunction, /const profileUpdate = await userClient\.rpc\(rpcName, rpcArgs\)/);
  assert.match(avatarFunction, /if \(profileUpdate\.error\)[\s\S]*remove\(\[path\]\)/);
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
  assert.match(avatarFunction, /INPUT_LIMIT = 2 \* 1024 \* 1024/);
  assert.match(avatarFunction, /OUTPUT_LIMIT = 300 \* 1024/);
  assert.match(avatarFunction, /ImageMagick\.readCollection/);
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

test("ordinary users have no leaderboard leave entry or public client helper", () => {
  assert.doesNotMatch(html, /退出排行榜|離開排行榜|停止參加|leaderboardAccountLeave|leaderboardLeaveModal/);
  assert.doesNotMatch(runtime, /leave_global_leaderboard|leaveLeaderboard|openLeaveConfirmation/);
  assert.doesNotMatch(auth, /"leave_global_leaderboard"/);
});

test("high-risk clear-all flow alone resets the current user's leaderboard data", () => {
  assert.match(auth, /resetCurrentWorkspace[\s\S]*supabaseClient\.rpc\("reset_my_leaderboard_data"\)/);
  assert.doesNotMatch(auth.match(/LEADERBOARD_RPC_ALLOWLIST[\s\S]*?\]\);/)?.[0] || "", /reset_my_leaderboard_data/);
  assert.match(weeklyMigration, /create or replace function public\.reset_my_leaderboard_data\(\)/);
  assert.match(weeklyMigration, /v_user_id uuid := auth\.uid\(\)/);
  for (const table of ["leaderboard_profiles", "weekly_leaderboard_scores", "weekly_leaderboard_results", "leaderboard_practice_events", "leaderboard_weekly_rank_state", "leaderboard_notification_queue", "leaderboard_notification_deliveries", "leaderboard_push_preferences"]) {
    assert.match(weeklyMigration, new RegExp(`delete from public\\.${table} where user_id = v_user_id`));
  }
});

test("unfinished or inactive accounts neither queue nor flush practice events", () => {
  assert.match(runtime, /isQaActive\(\) \|\| !joinedNow\(\)/);
  assert.match(runtime, /membershipStatus === MEMBERSHIP\.IDLE \|\| membershipStatus === MEMBERSHIP\.LOADING/);
  assert.match(runtime, /membershipStatus !== MEMBERSHIP\.JOINED\) return \{ status: "not-joined" \}/);
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
  assert.match(runtime, /chromatica\.leaderboard\.weekly\.pending\.v2/);
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
