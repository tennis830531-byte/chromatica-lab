const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const coreSource = read("discussion-core.js");
const runtime = read("discussion.js");
const html = read("index.html");
const app = read("app.js");
const styles = read("styles.css");
const migration = read("supabase/migrations/202607280001_create_discussion_phase_one.sql");
const splitCooldownMigration = read("supabase/migrations/202607290002_split_discussion_post_comment_cooldowns.sql");
const fn = read("supabase/functions/discussion-actions/index.ts");
const config = read("supabase/config.toml");
const build = read("scripts/build-web.mjs");
const sw = read("sw.js");
const sandbox = { window: {}, globalThis: {}, Date, Intl };
vm.runInNewContext(coreSource, sandbox);
const core = sandbox.window.ChromaticaDiscussionCore;

test("discussion exposes six tabs while hot and latest are query modes", () => {
  assert.deepEqual(Array.from(core.TABS, (item) => item.label), ["熱門", "最新", "口琴硬體", "口琴技術", "音樂分享", "使用回饋"]);
  assert.deepEqual(Object.keys(core.CATEGORY_LABELS), ["harmonica_hardware", "harmonica_technique", "music_sharing", "app_feedback"]);
  assert.doesNotMatch(migration, /category in \([^)]*'hot'|category in \([^)]*'latest'/);
});

test("post and comment validation trims and enforces centralized limits", () => {
  assert.equal(core.validatePost({ category: "music_sharing", title: "  合法標題  ", body: "  內文  " }).value.title, "合法標題");
  assert.equal(core.validatePost({ category: "music_sharing", title: " ", body: "" }).ok, false);
  assert.equal(core.validatePost({ category: "music_sharing", title: "a".repeat(81), body: "" }).ok, false);
  assert.equal(core.validatePost({ category: "music_sharing", title: "合法", body: "a".repeat(10001) }).ok, false);
  assert.equal(core.validateComment("   ").ok, false);
  assert.equal(core.validateComment("a".repeat(3001)).ok, false);
});

test("hot sorts recent interaction by comments then activity and latest has stable id tie-break", () => {
  const now = Date.parse("2026-07-28T00:00:00Z");
  const posts = [
    { id: "a", status: "published", category: "app_feedback", comment_count: 2, created_at: "2026-07-27T01:00:00Z", last_activity_at: "2026-07-27T02:00:00Z" },
    { id: "b", status: "published", category: "app_feedback", comment_count: 8, created_at: "2026-07-27T00:00:00Z", last_activity_at: "2026-07-27T01:00:00Z" },
    { id: "old", status: "published", category: "app_feedback", comment_count: 99, created_at: "2026-07-01T00:00:00Z", last_activity_at: "2026-07-01T00:00:00Z" },
  ];
  assert.deepEqual(Array.from(core.sortPosts(posts, "hot", now), (post) => post.id), ["b", "a"]);
  assert.deepEqual(Array.from(core.sortPosts(posts.slice(0, 2), "latest", now), (post) => post.id), ["a", "b"]);
});

test("cooldown message formats the required two minute example", () => {
  assert.equal(core.formatRetryAfter(154), "請等待 2 分 34 秒後再發表");
  assert.equal(core.formatRetryAfter(54, "create_comment"), "請等待 54 秒後再留言");
});

test("discussion header uses its feature icon and home entry tracks unread posts per signed-in user", () => {
  assert.match(runtime, /discussion-header-icon[\s\S]*discussion-forum-icon\.png/);
  assert.doesNotMatch(runtime, /discussion-back icon-btn/);
  assert.match(html, /data-discussion-unread[^>]*hidden/);
  assert.match(runtime, /chromatica\.discussion\.last-seen\.v1/);
  assert.match(runtime, /api\("list_posts",\s*\{\s*tab:\s*"latest",\s*limit:\s*100\s*\}\)/);
  assert.match(runtime, /markDiscussionSeen\(\)[\s\S]*setUnreadBadge\(0\)/);
  assert.match(styles, /\.discussion-unread-badge[\s\S]*background:\s*#c52f2f/);
});

test("database contains Phase 1 tables and retained media/link schema", () => {
  for (const table of ["discussion_posts", "discussion_comments", "discussion_rate_limits", "discussion_attachments", "discussion_link_previews", "discussion_turnstile_tokens"]) {
    assert.match(migration, new RegExp(`create table public\\.${table}`));
  }
  assert.match(migration, /discussion_attachments[\s\S]*owner_type in \('post', 'comment'\)/);
  assert.match(migration, /discussion_link_previews[\s\S]*normalized_url/);
});

test("database constraints and indexes implement categories, statuses, hot and latest", () => {
  assert.match(migration, /category in \('harmonica_hardware', 'harmonica_technique', 'music_sharing', 'app_feedback'\)/);
  assert.match(migration, /status in \('published', 'deleted', 'hidden'\)/);
  assert.match(migration, /discussion_posts_latest_idx[\s\S]*created_at desc, id desc/);
  assert.match(migration, /discussion_posts_hot_idx[\s\S]*comment_count desc, last_activity_at desc, created_at desc/);
  assert.match(migration, /discussion_posts_category_latest_idx/);
});

test("comment trigger owns public comment count and last activity", () => {
  assert.match(migration, /discussion_refresh_post_activity/);
  assert.match(migration, /count\(\*\)::integer[\s\S]*c\.status = 'published'/);
  assert.match(migration, /max\(c\.created_at\)/);
  assert.doesNotMatch(runtime, /invokeFunction[\s\S]{0,300}comment_count\s*:/);
});

test("RLS allows authenticated published reads and direct writes remain revoked", () => {
  assert.match(migration, /authenticated read published discussion posts/);
  assert.match(migration, /authenticated read published discussion comments/);
  assert.match(migration, /revoke all on public\.discussion_posts[\s\S]*from anon, authenticated/);
  assert.match(migration, /grant select on public\.discussion_posts, public\.discussion_comments to authenticated/);
  assert.match(migration, /grant select, insert, update, delete on public\.discussion_posts[\s\S]*to service_role/);
  assert.doesNotMatch(migration, /create policy[^;]+for insert/is);
});

test("write RPCs are service-role only and derive ownership from authenticated Edge user", () => {
  assert.match(migration, /revoke all on function public\.create_discussion_post_service[\s\S]*authenticated/);
  assert.match(migration, /grant execute on function public\.create_discussion_post_service[\s\S]*service_role/);
  assert.match(fn, /auth\.data\.user\.id/);
  assert.doesNotMatch(fn, /payload\.author_id/);
});

test("post and comment cooldowns are independently locked and updated after successful inserts", () => {
  const postBody = splitCooldownMigration.match(/create or replace function public\.create_discussion_post_service[\s\S]*?\n\$\$;/)?.[0] || "";
  const commentBody = splitCooldownMigration.match(/create or replace function public\.create_discussion_comment_service[\s\S]*?\n\$\$;/)?.[0] || "";
  assert.match(splitCooldownMigration, /next_post_allowed_at[\s\S]*next_comment_allowed_at/);
  assert.match(postBody, /select next_post_allowed_at[\s\S]*for update/);
  assert.match(postBody, /interval '180 seconds'/);
  assert.doesNotMatch(postBody, /select next_comment_allowed_at into v_next/);
  assert.ok(postBody.indexOf("insert into public.discussion_posts") < postBody.lastIndexOf("next_post_allowed_at ="));
  assert.match(commentBody, /select next_comment_allowed_at[\s\S]*for update/);
  assert.match(commentBody, /interval '60 seconds'/);
  assert.doesNotMatch(commentBody, /select next_post_allowed_at into v_next/);
  assert.ok(commentBody.indexOf("insert into public.discussion_comments") < commentBody.lastIndexOf("next_comment_allowed_at ="));
  assert.match(fn, /get_discussion_rate_limit", \{\s*p_action: action/);
});

test("Turnstile is checked server-side for success action hostname age and errors", () => {
  assert.match(fn, /challenges\.cloudflare\.com\/turnstile\/v0\/siteverify/);
  assert.match(fn, /result\.success !== true/);
  assert.match(fn, /result\.action !== expectedAction/);
  assert.match(fn, /allowedHostnames\.has\(result\.hostname\)/);
  assert.match(fn, /TOKEN_MAX_AGE_MS/);
  assert.match(fn, /"error-codes"/);
  assert.match(fn, /TURNSTILE_SECRET_KEY/);
  assert.doesNotMatch(runtime, /TURNSTILE_SECRET_KEY/);
});

test("Turnstile replay ledger is consumed in the same transaction", () => {
  assert.match(migration, /discussion_turnstile_tokens[\s\S]*token_hash text primary key/);
  assert.match(migration, /insert into public\.discussion_turnstile_tokens[\s\S]*on conflict do nothing/);
  assert.match(migration, /turnstile-token-replayed/);
});

test("completed Turnstile widget is removed before rendering the success state", () => {
  assert.match(runtime, /discussion-captcha-complete[^>]*role="status">驗證完成/);
  const callback = runtime.match(/callback\(token\) \{[\s\S]*?\n\s*\},\n\s*"expired-callback"/)?.[0] || "";
  assert.match(callback, /turnstile\?\.remove\?\.\(completedWidgetId\)/);
  assert.ok(callback.indexOf("turnstile?.remove?.(completedWidgetId)") < callback.indexOf('state.captcha = { status: "success"'));
  assert.ok(callback.indexOf('state.captcha = { status: "success"') < callback.indexOf("render();"));
});

test("rerendering after attachment changes remounts Turnstile instead of leaving a stale widget id", () => {
  assert.match(runtime, /function releaseTurnstileWidget\(\)/);
  const renderBody = runtime.match(/function render\(\) \{[\s\S]*?\n  \}/)?.[0] || "";
  assert.ok(renderBody.indexOf("releaseTurnstileWidget();") < renderBody.indexOf('$(".discussion-content", root).innerHTML'));
  assert.ok(renderBody.indexOf('$(".discussion-content", root).innerHTML') < renderBody.indexOf("mountTurnstile();"));
  assert.match(runtime, /turnstileWidgetSlot = null/);
});

test("post and comment cooldown messages render directly below their submit controls", () => {
  assert.match(runtime, /discussion-actions[\s\S]*cooldownMarkup\("create_post"\)/);
  assert.match(runtime, /type="submit"[\s\S]*cooldownMarkup\("create_comment"\)/);
  assert.match(runtime, /data-discussion-cooldown=/);
  assert.match(runtime, /submit\.disabled = seconds > 0 \|\| uploading \|\| !ready/);
  assert.match(runtime, /submit\.textContent = seconds > 0 \? "冷卻中"[\s\S]*"發表"[\s\S]*"送出留言"[\s\S]*"等待驗證"/);
  assert.match(styles, /\.discussion-cooldown-message/);
});

test("successful post and comment submissions show top-level confirmation modals", () => {
  assert.match(runtime, /showSuccessModal\(editing \? "文章已更新" : "文章已發佈"\)/);
  assert.match(runtime, /showSuccessModal\("留言成功"\)/);
  assert.match(runtime, /function scrollDiscussionToTop\(\)[\s\S]*#discussion[\s\S]*scrollIntoView/);
  assert.match(runtime, /function scrollLatestCommentIntoView\(\)[\s\S]*\.discussion-comment[\s\S]*scrollIntoView/);
  assert.match(runtime, /if \(succeeded\) \{\s*scrollDiscussionToTop\(\);\s*showSuccessModal\(editing \? "文章已更新" : "文章已發佈"\)/);
  assert.match(runtime, /if \(succeeded\) \{\s*scrollLatestCommentIntoView\(\);\s*showSuccessModal\("留言成功"\)/);
  assert.match(runtime, /modal\.id = "discussionSuccessModal"/);
  assert.match(runtime, /modal\.showModal\(\)/);
  assert.match(styles, /\.discussion-success-modal::backdrop/);
});

test("soft delete is owner-only and removes content while preserving rows", () => {
  assert.match(migration, /where id = p_post_id and author_id = p_user_id and status = 'published'/);
  assert.match(migration, /where id = p_comment_id and author_id = p_user_id and status = 'published'/);
  assert.match(migration, /status = 'deleted', title = '內容已刪除', body = ''/);
  assert.match(migration, /status = 'deleted', body = '內容已刪除'/);
  assert.doesNotMatch(migration.match(/delete_discussion_(post|comment)_service[\s\S]*?\n\\$\\$;/g)?.join("") || "", /delete from/i);
});

test("rendering escapes untrusted text instead of accepting HTML", () => {
  assert.match(runtime, /replace\(\/\[&<>\"'\]\/g/);
  assert.match(runtime, /escape\(post\.title\)/);
  assert.match(runtime, /escape\(post\.body/);
  assert.match(runtime, /escape\(item\.body\)/);
  assert.match(runtime, /safeHttpUrl/);
  assert.match(runtime, /youtube-nocookie\.com/);
  assert.doesNotMatch(runtime, /innerHTML\s*=\s*(post|item)\./);
});

test("UI has pagination, preview, loading, empty and error states", () => {
  assert.match(runtime, /pageSize: 20|Core\.LIMITS\.pageSize/);
  assert.match(runtime, /載入更多/);
  assert.match(runtime, /討論內容載入中/);
  assert.match(runtime, /目前還沒有文章/);
  assert.match(runtime, /目前無法載入討論吧/);
  assert.match(runtime, /這是預覽，不會寫入資料庫/);
  assert.match(runtime, /data-discussion-files/);
});

test("QA and formal UI share rendering and QA remains session-local", () => {
  assert.match(runtime, /state\.qa \?/);
  assert.match(runtime, /sessionStorage/);
  assert.match(runtime, /qa:/);
  assert.match(runtime, /state\.qa && state\.qaScenario === "load-error"/);
  assert.match(runtime, /"deleted-post": "已刪除文章"/);
  assert.match(runtime, /"deleted-comment": "已刪除留言"/);
  assert.match(runtime, /wasPublished[\s\S]*comment_count = Math\.max\(0/);
  assert.doesNotMatch(runtime, /localStorage.*discussion\.qa/);
  assert.doesNotMatch(runtime, /invokeFunction.*qa/i);
});

test("CAPTCHA token is single-operation state and clears on background or navigation", () => {
  assert.match(runtime, /function clearCaptcha/);
  assert.match(runtime, /postDraft: \{ category: "", title: "", body: "" \}, commentDraft: ""/);
  assert.match(runtime, /function captureDraft\(form\)/);
  assert.match(runtime, /callback\(token\) \{\s*captureVisibleDraft\(\)/);
  assert.match(runtime, /qaTurnstileSiteKey = "1x00000000000000000000AA"/);
  assert.match(runtime, /challenges\.cloudflare\.com\/turnstile\/v0\/api\.js\?render=explicit/);
  assert.match(runtime, /sitekey = state\.qa \? qaTurnstileSiteKey/);
  assert.match(runtime, /document\.addEventListener\("visibilitychange"[\s\S]*document\.hidden[\s\S]*captureVisibleDraft\(\)[\s\S]*clearCaptcha\(\)[\s\S]*classList\.contains\("active"\)\) render\(\)/);
  assert.match(runtime, /if \(view === "discussion"\) open\(\);[\s\S]*else \{[\s\S]*clearCaptcha\(\)/);
  assert.match(runtime, /clearCaptcha\(\);[\s\S]*state\.submitting = false/);
  assert.doesNotMatch(runtime, /TURNSTILE_SECRET_KEY|1x0000000000000000000000000000000AA/);
});

test("publishing and commenting wait for CAPTCHA before enabling submit", () => {
  assert.match(runtime, /function captchaReady\(action\)/);
  assert.match(runtime, /postIsBusy \|\| !captchaIsReady \? "disabled"/);
  assert.match(runtime, /captchaIsReady \? "發表" : "等待驗證"/);
  assert.match(runtime, /commentIsBusy \|\| !captchaIsReady \? "disabled"/);
  assert.match(runtime, /captchaIsReady \? "送出留言" : "等待驗證"/);
});

test("tabs use connected square rows without whole-page horizontal overflow", () => {
  assert.match(styles, /\.discussion-view \{[^}]*overflow-x: clip/);
  assert.match(runtime, /discussion-tab-modes[\s\S]*Core\.TABS\.slice\(0,\s*2\)/);
  assert.match(runtime, /discussion-tab-categories[\s\S]*Core\.TABS\.slice\(2\)/);
  assert.match(styles, /\.discussion-tab-modes \{[^}]*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(styles, /\.discussion-tab-categories \{[^}]*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(styles, /\.discussion-tabs button \{[^}]*border-radius:\s*0/);
  assert.match(styles, /\.discussion-tab-modes button:first-child\s*\{[^}]*border-radius:\s*12px 0 0 12px/);
  assert.match(styles, /\.discussion-tab-modes button:last-child\s*\{[^}]*border-radius:\s*0 12px 12px 0/);
  assert.match(styles, /\.discussion-tab-categories button\s*\{[^}]*border-radius:\s*0/);
  assert.match(styles, /\.discussion-tabs \{[^}]*overflow:\s*hidden/);
  assert.match(styles, /@media \(max-width: 520px\)/);
});

test("existing entry now opens discussion while web source and cache include runtime files", () => {
  assert.match(html, /data-discussion-open[^>]*aria-label="開啟討論吧"/);
  assert.match(app, /data-discussion-open[\s\S]*setView\("discussion"\)/);
  for (const file of ["discussion-core.js", "discussion.js"]) {
    assert.match(html, new RegExp(file.replace(".", "\\.")));
    assert.match(build, new RegExp(`"${file.replace(".", "\\.")}"`));
    assert.match(sw, new RegExp(file.replace(".", "\\.")));
  }
});

test("discussion Function keeps JWT verification enabled", () => {
  assert.match(config, /\[functions\.discussion-actions\]\s+verify_jwt = true/);
  assert.match(fn, /auth\.getUser\(\)/);
});

test("Phase 1 text, CAPTCHA, cooldown, and soft delete remain intact after Phase 2", () => {
  assert.match(runtime, /validatePost/);
  assert.match(runtime, /validateComment/);
  assert.match(runtime, /clearCaptcha/);
  assert.match(runtime, /softDelete/);
  assert.match(coreSource, /postCooldownSeconds:\s*180/);
  assert.match(coreSource, /commentCooldownSeconds:\s*60/);
});
