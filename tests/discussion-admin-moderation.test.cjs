const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const migration = read("supabase/migrations/202607300003_add_discussion_admin_moderation.sql");
const fn = read("supabase/functions/discussion-actions/index.ts");
const runtime = read("discussion.js");
const styles = read("styles.css");
const coreSource = read("discussion-core.js");
const sandbox = { window: {}, globalThis: {}, Date, Intl };
vm.runInNewContext(coreSource, sandbox);
const core = sandbox.window.ChromaticaDiscussionCore;

test("app_admins remains the only administrator authority", () => {
  assert.match(migration, /public\.is_app_admin\(auth\.uid\(\)\)/);
  assert.doesNotMatch(migration, /profiles\.role|create table public\.profiles/i);
  assert.doesNotMatch(fn, /payload\.(?:user_id|email|display_name)/);
});

test("moderation schema keeps audit fields, constraints, and pinned index", () => {
  for (const field of ["is_pinned", "pinned_at", "pinned_by", "deleted_by", "moderation_reason"]) {
    assert.match(migration, new RegExp(field));
  }
  assert.match(migration, /discussion_posts_pin_state_check/);
  assert.match(migration, /discussion_posts_pinned_idx[\s\S]*where status = 'published' and is_pinned/);
});

test("administrator RPCs derive identity from auth uid and stay authenticated-only", () => {
  for (const rpc of [
    "get_discussion_admin_status",
    "set_discussion_post_pinned",
    "admin_delete_discussion_post",
    "admin_delete_discussion_comment",
  ]) {
    assert.match(migration, new RegExp(`function public\\.${rpc}`));
  }
  assert.match(migration, /revoke all on function public\.set_discussion_post_pinned\(uuid,boolean\) from public, anon/);
  assert.match(migration, /grant execute on function public\.set_discussion_post_pinned\(uuid,boolean\) to authenticated/);
  assert.match(migration, /admin-required/);
});

test("admin soft delete queues media cleanup and hides previews without hard delete", () => {
  const moderation = migration.match(/create function public\.admin_delete_discussion_post[\s\S]*?create function public\.admin_delete_discussion_comment/)?.[0] || "";
  assert.match(moderation, /discussion_media_cleanup_queue/);
  assert.match(moderation, /discussion_link_previews[\s\S]*status = 'deleted'/);
  assert.doesNotMatch(moderation, /\bdelete\s+from\b/i);
});

test("pinned posts sort before every normal hot/latest/category item", () => {
  const now = Date.parse("2026-07-30T00:00:00Z");
  const posts = [
    { id: "new", status: "published", category: "app_feedback", created_at: "2026-07-29T00:00:00Z", last_activity_at: "2026-07-29T00:00:00Z", comment_count: 99 },
    { id: "pin-old", status: "published", category: "app_feedback", created_at: "2026-06-01T00:00:00Z", last_activity_at: "2026-06-01T00:00:00Z", comment_count: 0, is_pinned: true, pinned_at: "2026-07-30T00:00:00Z" },
  ];
  for (const tab of ["hot", "latest", "app_feedback"]) {
    assert.equal(core.sortPosts(posts, tab, now)[0].id, "pin-old");
  }
  assert.match(migration, /p\.is_pinned desc[\s\S]*p\.pinned_at desc nulls last/);
});

test("formal and QA UI share moderation presentation without granting QA authority", () => {
  assert.match(runtime, /Chromatic Harmonica Club/);
  assert.match(runtime, /discussion-new primary-btn[^>]*aria-label="新增文章"[^>]*>\+<\/button>/);
  assert.match(runtime, /討論吧管理模式/);
  assert.match(runtime, /state\.isAdmin \|\| \(state\.qa && state\.qaAdminPreview\)/);
  assert.match(runtime, /QA 僅預覽管理介面，正式操作仍需 app_admins 權限/);
  assert.match(runtime, /api\("get_admin_status"\)/);
  assert.match(runtime, /api\(currentlyPinned \? "unpin_post" : "pin_post"/);
  assert.match(runtime, /discussionModerationModal/);
  assert.match(styles, /\.discussion-header \.discussion-new[\s\S]*width:\s*44px[\s\S]*height:\s*44px/);
  assert.match(styles, /\.discussion-moderation-modal/);
});
