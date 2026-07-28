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

async function createLocalUser(label) {
  const email = `discussion-${label}-${crypto.randomUUID()}@example.test`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(created.error);
  users.push(created.data.user);
  const client = createClient(apiUrl, anonKey, options);
  const signedIn = await client.auth.signInWithPassword({ email, password });
  assert.ifError(signedIn.error);
  return client;
}

async function clearCooldown(userId) {
  const result = await admin.from("discussion_rate_limits")
    .upsert({ user_id: userId, next_allowed_at: "1970-01-01T00:00:00Z" });
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
  clientA = await createLocalUser("a");
  clientB = await createLocalUser("b");
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
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.ok(Array.isArray(result.posts));
});

test("service transaction creates a post and starts the shared cooldown", async () => {
  firstTokenHash = tokenHash();
  const created = await createPost(users[0].id, turnstile("create_post", firstTokenHash));
  assert.ifError(created.error);
  postId = created.data.id;

  const blockedComment = await admin.rpc("create_discussion_comment_service", {
    p_user_id: users[0].id,
    p_post_id: postId,
    p_body: "同一冷卻內不得留言",
    ...turnstile("create_comment"),
  });
  assert.match(blockedComment.error?.message || "", /discussion-cooldown/);

  const rate = await admin.from("discussion_rate_limits")
    .select("next_allowed_at").eq("user_id", users[0].id).single();
  assert.ifError(rate.error);
  assert.ok(new Date(rate.data.next_allowed_at).getTime() > Date.now());
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
    .select("next_allowed_at").eq("user_id", users[0].id).single();
  assert.ifError(rate.error);
  assert.ok(new Date(rate.data.next_allowed_at).getTime() <= Date.now());
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
