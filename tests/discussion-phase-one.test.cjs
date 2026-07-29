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

test("shared 180-second cooldown is locked and updated only after successful insert", () => {
  for (const functionName of ["create_discussion_post_service", "create_discussion_comment_service"]) {
    const body = migration.match(new RegExp(`create function public\\.${functionName}[\\s\\S]*?\\n\\$\\$;`))?.[0] || "";
    assert.match(body, /for update/);
    assert.match(body, /discussion-cooldown/);
    assert.match(body, /interval '180 seconds'/);
    assert.ok(body.indexOf("insert into public.discussion_") < body.lastIndexOf("next_allowed_at ="));
  }
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
  assert.match(runtime, /cooldownSeconds/);
});
