const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const migration = read("supabase/migrations/202608010001_add_discussion_google_profiles_editing_hearts.sql");
const fn = read("supabase/functions/discussion-actions/index.ts");
const runtime = read("discussion.js");
const styles = read("styles.css");

test("discussion reads Google Auth display name and avatar without leaderboard identity", () => {
  assert.match(migration, /join auth\.users u on u\.id = p\.author_id/);
  assert.match(migration, /raw_user_meta_data ->> 'full_name'/);
  assert.match(migration, /raw_user_meta_data ->> 'name'/);
  assert.match(migration, /raw_user_meta_data ->> 'avatar_url'/);
  assert.match(migration, /raw_user_meta_data ->> 'picture'/);
  assert.doesNotMatch(migration, /leaderboard_profiles/);
  assert.match(runtime, /post\.author_display_name \|\| "Google 使用者"/);
  assert.match(runtime, /item\.author_display_name \|\| "Google 使用者"/);
});

test("only a published post owner can edit text fields", () => {
  const body = migration.match(/create function public\.update_discussion_post[\s\S]*?\n\$\$;/)?.[0] || "";
  assert.match(body, /auth\.uid\(\) is null/);
  assert.match(body, /author_id = auth\.uid\(\)/);
  assert.match(body, /status = 'published'/);
  assert.match(body, /char_length\(v_title\) not between 2 and 80/);
  assert.match(body, /char_length\(v_body\) > 10000/);
  assert.doesNotMatch(body, /discussion_attachments|discussion_link_previews/);
  assert.match(fn, /action === "update_post"/);
  assert.match(fn, /userClient\.rpc\("update_discussion_post"/);
  assert.match(runtime, /data-discussion-edit-post/);
  assert.match(runtime, /既有圖片、影片與網址預覽會保留/);
  assert.match(runtime, /showSuccessModal\(editing \? "文章已更新" : "文章已發佈"\)/);
});

test("post and comment hearts are one-per-user server-side toggles", () => {
  assert.match(migration, /primary key \(post_id, user_id\)/);
  assert.match(migration, /primary key \(comment_id, user_id\)/);
  assert.match(migration, /create function public\.toggle_discussion_post_heart/);
  assert.match(migration, /create function public\.toggle_discussion_comment_heart/);
  assert.match(migration, /revoke all on public\.discussion_post_hearts, public\.discussion_comment_hearts from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.toggle_discussion_post_heart\(uuid\) to authenticated/);
  assert.match(migration, /grant execute on function public\.toggle_discussion_comment_heart\(uuid\) to authenticated/);
  assert.match(fn, /toggle_post_heart/);
  assert.match(fn, /toggle_comment_heart/);
  assert.match(runtime, /data-discussion-heart-post/);
  assert.match(runtime, /data-discussion-heart-comment/);
  assert.match(styles, /\.discussion-heart\.is-hearted/);
});

test("deleted or hidden content cannot be hearted or returned", () => {
  assert.match(migration, /p\.status = 'published'/);
  assert.match(migration, /c\.status = 'published' and p\.status = 'published'/);
  assert.doesNotMatch(migration, /status in \('published', 'deleted', 'hidden'\)/);
});
