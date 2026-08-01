import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const apiUrl = process.env.API_URL || "";
const anonKey = process.env.ANON_KEY || "";
const serviceRoleKey = process.env.SERVICE_ROLE_KEY || "";
const password = process.env.LEADERBOARD_TEST_PASSWORD || "";
const host = (() => { try { return new URL(apiUrl).hostname; } catch { return ""; } })();
assert.ok(["localhost", "127.0.0.1"].includes(host), "Discussion integration requires local Supabase");
assert.ok(anonKey && serviceRoleKey && password, "local integration credentials are required");

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(apiUrl, serviceRoleKey, options);
const anon = createClient(apiUrl, anonKey, options);
const users = [];
let clientA;
let clientB;
let postId;
let firstTokenHash;
let mediaPostId;

function tokenHash() {
  return crypto.createHash("sha256").update(crypto.randomUUID()).digest("hex");
}

function turnstile(action, hash = tokenHash()) {
  const now = Date.now();
  return {
    p_token_hash: hash,
    p_turnstile_action: action,
    p_turnstile_hostname: "localhost",
    p_verified_at: new Date(now - 1000).toISOString(),
    p_expires_at: new Date(now + 240000).toISOString(),
  };
}

async function createLocalUser(label, userMetadata = {}) {
  const email = `discussion-${label}-${crypto.randomUUID()}@example.test`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: userMetadata,
  });
  assert.ifError(created.error);
  users.push(created.data.user);
  const client = createClient(apiUrl, anonKey, options);
  const signedIn = await client.auth.signInWithPassword({ email, password });
  assert.ifError(signedIn.error);
  return client;
}

async function clearCooldown(userId) {
  const result = await admin.from("discussion_rate_limits")
    .upsert({
      user_id: userId,
      next_allowed_at: "1970-01-01T00:00:00Z",
      next_post_allowed_at: "1970-01-01T00:00:00Z",
      next_comment_allowed_at: "1970-01-01T00:00:00Z",
    });
  assert.ifError(result.error);
}

async function createPost(userId, overrides = {}) {
  return admin.rpc("create_discussion_post_service", {
    p_user_id: userId,
    p_category: "harmonica_technique",
    p_title: "整合測試文章",
    p_body: "只存在於本機 Supabase 的測試內容。",
    ...turnstile("create_post"),
    ...overrides,
  });
}

before(async () => {
  clientA = await createLocalUser("a", {
    full_name: "Google 測試使用者甲",
    avatar_url: "https://example.test/google-avatar-a.png",
  });
  clientB = await createLocalUser("b", {
    name: "Google 測試使用者乙",
    picture: "https://example.test/google-avatar-b.png",
  });
});

after(async () => {
  for (const user of users) {
    await admin.auth.admin.deleteUser(user.id);
  }
});

test("anonymous reads and authenticated direct writes are rejected", async () => {
  const anonymousRead = await anon.rpc("get_discussion_posts", {
    p_mode: "latest", p_category: null, p_limit: 20, p_offset: 0,
  });
  assert.ok(anonymousRead.error);

  const directInsert = await clientA.from("discussion_posts").insert({
    category: "harmonica_technique", title: "不得直寫", body: "",
  });
  assert.ok(directInsert.error);
});

test("authenticated local client can call discussion-actions without production configuration", async () => {
  const session = await clientA.auth.getSession();
  assert.ifError(session.error);
  const response = await fetch(`${apiUrl}/functions/v1/discussion-actions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": "http://localhost:4173",
      "apikey": anonKey,
      "Authorization": `Bearer ${session.data.session.access_token}`,
    },
    body: JSON.stringify({ action: "list_posts", tab: "latest", limit: 20 }),
  });
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  assert.ok(Array.isArray(result.posts));
});

test("Google Auth identity, owner editing, and post/comment hearts stay server-authoritative", async () => {
  await clearCooldown(users[0].id);
  const created = await createPost(users[0].id, {
    p_title: "Google 身分與愛心整合測試",
    ...turnstile("create_post"),
  });
  assert.ifError(created.error);
  const identityPostId = created.data.id;

  const initial = await clientA.rpc("get_discussion_post", { p_post_id: identityPostId });
  assert.ifError(initial.error);
  assert.equal(initial.data[0].author_display_name, "Google 測試使用者甲");
  assert.equal(initial.data[0].author_avatar_url, "https://example.test/google-avatar-a.png");
  assert.equal(initial.data[0].heart_count, 0);
  assert.equal(initial.data[0].is_hearted, false);

  const deniedEdit = await clientB.rpc("update_discussion_post", {
    p_post_id: identityPostId,
    p_category: "music_sharing",
    p_title: "他人不得修改",
    p_body: "這次更新必須失敗。",
  });
  assert.match(deniedEdit.error?.message || "", /not-content-owner/);

  const edited = await clientA.rpc("update_discussion_post", {
    p_post_id: identityPostId,
    p_category: "music_sharing",
    p_title: "作者已更新標題",
    p_body: "既有媒體關聯不受影響。",
  });
  assert.ifError(edited.error);
  assert.equal(edited.data.title, "作者已更新標題");
  assert.equal(edited.data.category, "music_sharing");

  const postHeartA = await clientA.rpc("toggle_discussion_post_heart", { p_post_id: identityPostId });
  assert.ifError(postHeartA.error);
  assert.deepEqual(postHeartA.data[0], { hearted: true, heart_count: 1 });
  const postHeartB = await clientB.rpc("toggle_discussion_post_heart", { p_post_id: identityPostId });
  assert.ifError(postHeartB.error);
  assert.deepEqual(postHeartB.data[0], { hearted: true, heart_count: 2 });
  const postUnheartA = await clientA.rpc("toggle_discussion_post_heart", { p_post_id: identityPostId });
  assert.ifError(postUnheartA.error);
  assert.deepEqual(postUnheartA.data[0], { hearted: false, heart_count: 1 });

  await clearCooldown(users[1].id);
  const comment = await admin.rpc("create_discussion_comment_service", {
    p_user_id: users[1].id,
    p_post_id: identityPostId,
    p_body: "Google 留言身分與愛心",
    ...turnstile("create_comment"),
  });
  assert.ifError(comment.error);
  const commentHeart = await clientA.rpc("toggle_discussion_comment_heart", { p_comment_id: comment.data.id });
  assert.ifError(commentHeart.error);
  assert.deepEqual(commentHeart.data[0], { hearted: true, heart_count: 1 });

  const comments = await clientA.rpc("get_discussion_comments", { p_post_id: identityPostId });
  assert.ifError(comments.error);
  assert.equal(comments.data[0].author_display_name, "Google 測試使用者乙");
  assert.equal(comments.data[0].author_avatar_url, "https://example.test/google-avatar-b.png");
  assert.equal(comments.data[0].heart_count, 1);
  assert.equal(comments.data[0].is_hearted, true);

  const cleanup = await admin.from("discussion_posts").delete().eq("id", identityPostId);
  assert.ifError(cleanup.error);
  await clearCooldown(users[0].id);
  await clearCooldown(users[1].id);
});

test("app_admins exclusively authorizes pinning and moderation", async () => {
  await clearCooldown(users[1].id);
  const created = await createPost(users[1].id, {
    p_title: "管理權限整合測試",
    ...turnstile("create_post"),
  });
  assert.ifError(created.error);
  const moderationPostId = created.data.id;

  const ordinaryPin = await clientB.rpc("set_discussion_post_pinned", {
    p_post_id: moderationPostId,
    p_is_pinned: true,
  });
  assert.ok(ordinaryPin.error);

  const granted = await admin.from("app_admins").insert({
    user_id: users[0].id,
    granted_by: users[0].id,
  });
  assert.ifError(granted.error);

  const adminStatus = await clientA.rpc("get_discussion_admin_status");
  assert.ifError(adminStatus.error);
  assert.equal(adminStatus.data[0].is_admin, true);

  const pinned = await clientA.rpc("set_discussion_post_pinned", {
    p_post_id: moderationPostId,
    p_is_pinned: true,
  });
  assert.ifError(pinned.error);
  assert.equal(pinned.data, true);

  const listed = await clientA.rpc("get_discussion_posts", {
    p_mode: "latest", p_category: null, p_limit: 100, p_offset: 0,
  });
  assert.ifError(listed.error);
  assert.equal(listed.data[0].id, moderationPostId);
  assert.equal(listed.data[0].is_pinned, true);

  await clearCooldown(users[1].id);
  const comment = await admin.rpc("create_discussion_comment_service", {
    p_user_id: users[1].id,
    p_post_id: moderationPostId,
    p_body: "管理刪除留言",
    ...turnstile("create_comment"),
  });
  assert.ifError(comment.error);

  const removedComment = await clientA.rpc("admin_delete_discussion_comment", {
    p_comment_id: comment.data.id,
    p_reason: "本機整合測試",
  });
  assert.ifError(removedComment.error);
  assert.equal(removedComment.data, true);

  const commentAudit = await admin.from("discussion_comments")
    .select("status,deleted_by,moderation_reason").eq("id", comment.data.id).single();
  assert.ifError(commentAudit.error);
  assert.equal(commentAudit.data.status, "deleted");
  assert.equal(commentAudit.data.deleted_by, users[0].id);

  const removedPost = await clientA.rpc("admin_delete_discussion_post", {
    p_post_id: moderationPostId,
    p_reason: "本機整合測試",
  });
  assert.ifError(removedPost.error);
  assert.equal(removedPost.data, true);
  const repeated = await clientA.rpc("admin_delete_discussion_post", {
    p_post_id: moderationPostId,
    p_reason: "重跑仍不可重複處理",
  });
  assert.ifError(repeated.error);
  assert.equal(repeated.data, true);

  const revoked = await admin.from("app_admins")
    .update({ revoked_at: new Date().toISOString() }).eq("user_id", users[0].id);
  assert.ifError(revoked.error);
  const revokedStatus = await clientA.rpc("get_discussion_admin_status");
  assert.ifError(revokedStatus.error);
  assert.equal(revokedStatus.data[0].is_admin, false);
});

test("post and comment cooldowns are independent and retain their own limits", async () => {
  firstTokenHash = tokenHash();
  const created = await createPost(users[0].id, turnstile("create_post", firstTokenHash));
  assert.ifError(created.error);
  postId = created.data.id;

  const createdComment = await admin.rpc("create_discussion_comment_service", {
    p_user_id: users[0].id,
    p_post_id: postId,
    p_body: "發文後仍可立即留言",
    ...turnstile("create_comment"),
  });
  assert.ifError(createdComment.error);

  const rate = await admin.from("discussion_rate_limits")
    .select("next_post_allowed_at,next_comment_allowed_at").eq("user_id", users[0].id).single();
  assert.ifError(rate.error);
  const postWait = new Date(rate.data.next_post_allowed_at).getTime() - Date.now();
  const commentWait = new Date(rate.data.next_comment_allowed_at).getTime() - Date.now();
  assert.ok(postWait > 170000 && postWait <= 180000);
  assert.ok(commentWait > 50000 && commentWait <= 60000);

  const blockedPost = await createPost(users[0].id, { p_title: "發文仍在冷卻", ...turnstile("create_post") });
  assert.match(blockedPost.error?.message || "", /discussion-cooldown/);
  const blockedComment = await admin.rpc("create_discussion_comment_service", {
    p_user_id: users[0].id,
    p_post_id: postId,
    p_body: "留言仍在冷卻",
    ...turnstile("create_comment"),
  });
  assert.match(blockedComment.error?.message || "", /discussion-cooldown/);

  const removed = await admin.rpc("delete_discussion_comment_service", {
    p_user_id: users[0].id,
    p_comment_id: createdComment.data.id,
  });
  assert.ifError(removed.error);
  assert.equal(removed.data, true);
});

test("two concurrent requests for one user allow exactly one success", async () => {
  await clearCooldown(users[0].id);
  const results = await Promise.all([
    createPost(users[0].id, { p_title: "並行文章甲", ...turnstile("create_post") }),
    createPost(users[0].id, { p_title: "並行文章乙", ...turnstile("create_post") }),
  ]);
  assert.equal(results.filter((result) => !result.error).length, 1);
  assert.equal(results.filter((result) => /discussion-cooldown/.test(result.error?.message || "")).length, 1);
});

test("replayed Turnstile token fails without starting cooldown", async () => {
  await clearCooldown(users[0].id);
  const replayed = await createPost(users[0].id, turnstile("create_post", firstTokenHash));
  assert.match(replayed.error?.message || "", /turnstile-token-replayed/);

  const rate = await admin.from("discussion_rate_limits")
    .select("next_post_allowed_at").eq("user_id", users[0].id).single();
  assert.ifError(rate.error);
  assert.ok(new Date(rate.data.next_post_allowed_at).getTime() <= Date.now());
});

test("comment activity, ownership, soft delete, and visible count stay consistent", async () => {
  await clearCooldown(users[1].id);
  const created = await admin.rpc("create_discussion_comment_service", {
    p_user_id: users[1].id,
    p_post_id: postId,
    p_body: "公開可見留言",
    ...turnstile("create_comment"),
  });
  assert.ifError(created.error);

  let post = await admin.from("discussion_posts")
    .select("comment_count,last_activity_at,created_at").eq("id", postId).single();
  assert.ifError(post.error);
  assert.equal(post.data.comment_count, 1);
  assert.ok(new Date(post.data.last_activity_at) >= new Date(post.data.created_at));

  const denied = await admin.rpc("delete_discussion_comment_service", {
    p_user_id: users[0].id, p_comment_id: created.data.id,
  });
  assert.ifError(denied.error);
  assert.equal(denied.data, false);

  const removed = await admin.rpc("delete_discussion_comment_service", {
    p_user_id: users[1].id, p_comment_id: created.data.id,
  });
  assert.ifError(removed.error);
  assert.equal(removed.data, true);

  post = await admin.from("discussion_posts").select("comment_count").eq("id", postId).single();
  assert.ifError(post.error);
  assert.equal(post.data.comment_count, 0);

  const deleted = await admin.rpc("delete_discussion_post_service", {
    p_user_id: users[0].id, p_post_id: postId,
  });
  assert.ifError(deleted.error);
  assert.equal(deleted.data, true);
  const visible = await clientA.rpc("get_discussion_post", { p_post_id: postId });
  assert.ifError(visible.error);
  assert.equal(visible.data.length, 0);
});

test("Phase 2 media tables remain service-only and the bucket is private", async () => {
  const directInsert = await clientA.from("discussion_attachments").insert({
    owner_type: "post",
    uploader_id: users[0].id,
    draft_id: crypto.randomUUID(),
    media_type: "image",
    storage_path: "discussion/not-allowed.png",
    mime_type: "image/png",
    size_bytes: 1,
    sort_order: 0,
  });
  assert.ok(directInsert.error);

  const bucket = await admin.from("buckets").select("public")
    .eq("id", "discussion-media").maybeSingle();
  if (bucket.error) {
    const storageBucket = await admin.storage.getBucket("discussion-media");
    assert.ifError(storageBucket.error);
    assert.equal(storageBucket.data.public, false);
  } else {
    assert.equal(bucket.data.public, false);
  }
});

test("upload drafts enforce MIME, per-file, count, and aggregate limits", async () => {
  const invalidMime = await admin.rpc("create_discussion_upload_service", {
    p_user_id: users[0].id,
    p_draft_id: crypto.randomUUID(),
    p_owner_type: "post",
    p_original_filename: "unsafe.svg",
    p_mime_type: "image/svg+xml",
    p_size_bytes: 100,
    p_sort_order: 0,
  });
  assert.match(invalidMime.error?.message || "", /invalid-media-type/);

  const oversized = await admin.rpc("create_discussion_upload_service", {
    p_user_id: users[0].id,
    p_draft_id: crypto.randomUUID(),
    p_owner_type: "post",
    p_original_filename: "large.png",
    p_mime_type: "image/png",
    p_size_bytes: 10 * 1024 * 1024 + 1,
    p_sort_order: 0,
  });
  assert.match(oversized.error?.message || "", /media-too-large/);

  const countDraft = crypto.randomUUID();
  for (let index = 0; index < 10; index += 1) {
    const created = await admin.rpc("create_discussion_upload_service", {
      p_user_id: users[0].id,
      p_draft_id: countDraft,
      p_owner_type: "post",
      p_original_filename: `${index}.png`,
      p_mime_type: "image/png",
      p_size_bytes: 1,
      p_sort_order: index,
    });
    assert.ifError(created.error);
  }
  const eleventh = await admin.rpc("create_discussion_upload_service", {
    p_user_id: users[0].id,
    p_draft_id: countDraft,
    p_owner_type: "post",
    p_original_filename: "10.png",
    p_mime_type: "image/png",
    p_size_bytes: 1,
    p_sort_order: 10,
  });
  assert.match(eleventh.error?.message || "", /attachment-limit/);

  const totalDraft = crypto.randomUUID();
  for (let index = 0; index < 2; index += 1) {
    const created = await admin.rpc("create_discussion_upload_service", {
      p_user_id: users[0].id,
      p_draft_id: totalDraft,
      p_owner_type: "post",
      p_original_filename: `${index}.mp4`,
      p_mime_type: "video/mp4",
      p_size_bytes: 100 * 1024 * 1024,
      p_sort_order: index,
    });
    assert.ifError(created.error);
  }
  const totalExceeded = await admin.rpc("create_discussion_upload_service", {
    p_user_id: users[0].id,
    p_draft_id: totalDraft,
    p_owner_type: "post",
    p_original_filename: "extra.png",
    p_mime_type: "image/png",
    p_size_bytes: 1,
    p_sort_order: 2,
  });
  assert.match(totalExceeded.error?.message || "", /attachment-total-limit/);
});

test("upload confirmation marks mismatched metadata failed", async () => {
  const created = await admin.rpc("create_discussion_upload_service", {
    p_user_id: users[0].id,
    p_draft_id: crypto.randomUUID(),
    p_owner_type: "post",
    p_original_filename: "image.png",
    p_mime_type: "image/png",
    p_size_bytes: 128,
    p_sort_order: 0,
  });
  assert.ifError(created.error);
  const confirmed = await admin.rpc("confirm_discussion_upload_service", {
    p_user_id: users[0].id,
    p_attachment_id: created.data.id,
    p_actual_size_bytes: 127,
    p_actual_mime_type: "image/png",
  });
  assert.ifError(confirmed.error);
  assert.equal(confirmed.data.upload_status, "failed");
});

test("post, uploaded attachments, and safe link previews bind atomically", async () => {
  await clearCooldown(users[0].id);
  const draftId = crypto.randomUUID();
  const upload = await admin.rpc("create_discussion_upload_service", {
    p_user_id: users[0].id,
    p_draft_id: draftId,
    p_owner_type: "post",
    p_original_filename: "cover.png",
    p_mime_type: "image/png",
    p_size_bytes: 256,
    p_sort_order: 0,
  });
  assert.ifError(upload.error);
  const markedUploaded = await admin.from("discussion_attachments")
    .update({ upload_status: "uploaded" }).eq("id", upload.data.id);
  assert.ifError(markedUploaded.error);
  const cached = await admin.from("discussion_link_metadata_cache").upsert({
    cache_key: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    normalized_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    provider: "youtube",
    site_name: "YouTube",
    title: "YouTube 影片",
    description: "",
    thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    embed_url: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    status: "ready",
    fetched_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
  });
  assert.ifError(cached.error);

  const created = await admin.rpc("create_discussion_post_with_media_service", {
    p_user_id: users[0].id,
    p_category: "music_sharing",
    p_title: "含媒體整合測試",
    p_body: "https://youtu.be/dQw4w9WgXcQ",
    ...turnstile("create_post"),
    p_draft_id: draftId,
    p_attachment_ids: [upload.data.id],
    p_link_previews: [{
      original_url: "https://youtu.be/dQw4w9WgXcQ",
      normalized_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      provider: "youtube",
      title: "不得信任的前端標題",
      embed_url: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
      status: "ready",
      fetched_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    }],
  });
  assert.ifError(created.error);
  mediaPostId = created.data.id;

  const attachment = await admin.from("discussion_attachments")
    .select("owner_id,upload_status,bound_at").eq("id", upload.data.id).single();
  assert.ifError(attachment.error);
  assert.equal(attachment.data.owner_id, mediaPostId);
  assert.equal(attachment.data.upload_status, "bound");
  assert.ok(attachment.data.bound_at);

  const preview = await admin.from("discussion_link_previews")
    .select("provider,title,embed_url,status").eq("owner_id", mediaPostId).single();
  assert.ifError(preview.error);
  assert.equal(preview.data.provider, "youtube");
  assert.equal(preview.data.title, "YouTube 影片");
  assert.equal(preview.data.embed_url, "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
});

test("failed media binding rolls back post, CAPTCHA ledger, and cooldown", async () => {
  await clearCooldown(users[1].id);
  const hash = tokenHash();
  const args = {
    p_user_id: users[1].id,
    p_category: "app_feedback",
    p_title: "必須完整回滾",
    p_body: "",
    ...turnstile("create_post", hash),
    p_draft_id: crypto.randomUUID(),
    p_attachment_ids: [crypto.randomUUID()],
    p_link_previews: [],
  };
  const failed = await admin.rpc("create_discussion_post_with_media_service", args);
  assert.match(failed.error?.message || "", /attachment-validation-failed/);
  const absent = await admin.from("discussion_posts").select("id", { count: "exact", head: true })
    .eq("title", "必須完整回滾");
  assert.ifError(absent.error);
  assert.equal(absent.count, 0);

  const retried = await admin.rpc("create_discussion_post_with_media_service", {
    ...args,
    p_attachment_ids: [],
  });
  assert.ifError(retried.error);
});

test("soft delete hides bound media and queues idempotent cleanup", async () => {
  const removed = await admin.rpc("delete_discussion_post_service", {
    p_user_id: users[0].id,
    p_post_id: mediaPostId,
  });
  assert.ifError(removed.error);
  assert.equal(removed.data, true);

  const attachment = await admin.from("discussion_attachments")
    .select("id,upload_status,deleted_at").eq("owner_id", mediaPostId).single();
  assert.ifError(attachment.error);
  assert.equal(attachment.data.upload_status, "deleted");
  assert.ok(attachment.data.deleted_at);

  const queue = await admin.from("discussion_media_cleanup_queue")
    .select("attachment_id,status").eq("attachment_id", attachment.data.id);
  assert.ifError(queue.error);
  assert.equal(queue.data.length, 1);
  assert.equal(queue.data[0].status, "pending");

  const removedAgain = await admin.rpc("delete_discussion_post_service", {
    p_user_id: users[0].id,
    p_post_id: mediaPostId,
  });
  assert.ifError(removedAgain.error);
  assert.equal(removedAgain.data, false);
  const queueAgain = await admin.from("discussion_media_cleanup_queue")
    .select("attachment_id").eq("attachment_id", attachment.data.id);
  assert.equal(queueAgain.data.length, 1);
});

test("expired draft cleanup is claim-safe and completion is idempotent", async () => {
  const claimed = await admin.rpc("claim_discussion_media_cleanup_service", {
    p_expired_before: new Date(Date.now() + 60000).toISOString(),
    p_limit: 100,
  });
  assert.ifError(claimed.error);
  assert.ok(claimed.data.length > 0);
  assert.equal(
    new Set(claimed.data.map((item) => item.attachment_id)).size,
    claimed.data.length,
  );

  const attachmentId = claimed.data[0].attachment_id;
  const completed = await admin.rpc("complete_discussion_media_cleanup_service", {
    p_attachment_id: attachmentId,
    p_succeeded: true,
  });
  assert.ifError(completed.error);
  assert.equal(completed.data, true);

  const repeated = await admin.rpc("complete_discussion_media_cleanup_service", {
    p_attachment_id: attachmentId,
    p_succeeded: true,
  });
  assert.ifError(repeated.error);
  assert.equal(repeated.data, false);
});
