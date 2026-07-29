import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://tennis830531-byte.github.io",
  "https://localhost",
  "http://localhost",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
]);
const CATEGORY_VALUES = new Set(["harmonica_hardware", "harmonica_technique", "music_sharing", "app_feedback"]);
const CREATE_ACTIONS = new Set(["create_post", "create_comment"]);
const TOKEN_MAX_AGE_MS = 5 * 60 * 1000;

export function corsHeaders(origin: string | null) {
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(origin: string | null, status: number, body: Record<string, unknown>) {
  return Response.json(body, { status, headers: corsHeaders(origin) });
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

export function validatePostPayload(payload: Record<string, unknown>) {
  const category = text(payload.category);
  const title = text(payload.title);
  const body = text(payload.body);
  if (!CATEGORY_VALUES.has(category)) return { ok: false, error: "invalid-category" };
  if (title.length < 2 || title.length > 80) return { ok: false, error: "invalid-title" };
  if (body.length > 10000) return { ok: false, error: "invalid-body" };
  return { ok: true, value: { category, title, body } };
}

export function validateCommentPayload(payload: Record<string, unknown>) {
  const body = text(payload.body);
  if (!body || body.length > 3000) return { ok: false, error: "invalid-comment" };
  if (!/^[0-9a-f-]{36}$/i.test(text(payload.post_id))) return { ok: false, error: "invalid-post-id" };
  return { ok: true, value: { post_id: text(payload.post_id), body } };
}

type TurnstileResult = {
  success?: boolean;
  action?: string;
  hostname?: string;
  challenge_ts?: string;
  "error-codes"?: string[];
};

export async function verifyTurnstile(
  token: string,
  expectedAction: string,
  remoteIp: string,
  fetcher: typeof fetch = fetch,
) {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY") || "";
  const allowedHostnames = new Set(
    (Deno.env.get("TURNSTILE_ALLOWED_HOSTNAMES") || "tennis830531-byte.github.io,localhost")
      .split(",").map((item) => item.trim()).filter(Boolean),
  );
  if (!secret) return { ok: false as const, status: 503, error: "turnstile-not-configured" };
  if (!token) return { ok: false as const, status: 400, error: "turnstile-required" };
  const form = new FormData();
  form.set("secret", secret);
  form.set("response", token);
  if (remoteIp) form.set("remoteip", remoteIp);
  let response: Response;
  try {
    response = await fetcher("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return { ok: false as const, status: 503, error: "turnstile-unavailable" };
  }
  if (!response.ok) return { ok: false as const, status: 503, error: "turnstile-unavailable" };
  const result = await response.json() as TurnstileResult;
  const verifiedAt = new Date(result.challenge_ts || "");
  const age = Date.now() - verifiedAt.getTime();
  if (
    result.success !== true
    || result.action !== expectedAction
    || !result.hostname
    || !allowedHostnames.has(result.hostname)
    || !Number.isFinite(age)
    || age < -60000
    || age > TOKEN_MAX_AGE_MS
  ) {
    return {
      ok: false as const,
      status: 400,
      error: age > TOKEN_MAX_AGE_MS ? "turnstile-expired" : "turnstile-failed",
      error_codes: Array.isArray(result["error-codes"]) ? result["error-codes"].slice(0, 6) : [],
    };
  }
  return {
    ok: true as const,
    hostname: result.hostname,
    action: expectedAction,
    verifiedAt: verifiedAt.toISOString(),
    expiresAt: new Date(verifiedAt.getTime() + TOKEN_MAX_AGE_MS).toISOString(),
  };
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, "0")).join("");
}

function statusForDatabaseError(message: string) {
  if (message.includes("cooldown")) return 429;
  if (message.includes("not-found")) return 404;
  if (message.includes("replayed") || message.includes("duplicate")) return 409;
  if (message.includes("invalid")) return 400;
  return 409;
}

function retryAfter(message: string) {
  const match = message.match(/discussion-cooldown:(\d+)/);
  return match ? Number(match[1]) : 0;
}

async function enrichDiscussionRows(admin: ReturnType<typeof createClient>, rows: Record<string, unknown>[], ownerType: "post" | "comment") {
  const ownerIds = rows.map((row) => String(row.id || "")).filter(Boolean);
  if (!ownerIds.length) return rows;
  const [attachments, previews] = await Promise.all([
    admin.from("discussion_attachments")
      .select("id,owner_id,media_type,mime_type,size_bytes,sort_order,width,height,duration_ms,original_filename")
      .eq("owner_type", ownerType).eq("upload_status", "bound").in("owner_id", ownerIds).order("sort_order"),
    admin.from("discussion_link_previews")
      .select("id,owner_id,original_url,normalized_url,provider,site_name,title,description,thumbnail_url,embed_url,status")
      .eq("owner_type", ownerType).in("owner_id", ownerIds).neq("status", "deleted"),
  ]);
  return rows.map((row) => ({
    ...row,
    attachments: (attachments.data || []).filter((item) => item.owner_id === row.id),
    link_previews: (previews.data || []).filter((item) => item.owner_id === row.id),
  }));
}

export async function handler(request: Request) {
  const origin = request.headers.get("Origin");
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return json(origin, 403, { error: "origin-not-allowed" });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (request.method !== "POST") return json(origin, 405, { error: "method-not-allowed" });
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return json(origin, 401, { error: "authentication-required" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !anonKey || !serviceKey) return json(origin, 503, { error: "service-unavailable" });
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const auth = await userClient.auth.getUser();
  if (auth.error || !auth.data.user) return json(origin, 401, { error: "authentication-required" });
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  let payload: Record<string, unknown>;
  try { payload = await request.json(); }
  catch { return json(origin, 400, { error: "invalid-json" }); }
  const action = text(payload.action);

  if (action === "list_posts") {
    const tab = text(payload.tab) || "hot";
    const mode = CATEGORY_VALUES.has(tab) ? "category" : tab === "latest" ? "latest" : "hot";
    const result = await userClient.rpc("get_discussion_posts", {
      p_mode: mode,
      p_category: mode === "category" ? tab : null,
      p_limit: Math.min(100, Math.max(1, Number(payload.limit) || 20)),
      p_offset: Math.max(0, Number(payload.offset) || 0),
    });
    if (result.error) return json(origin, 503, { error: "discussion-read-failed" });
    const posts = await enrichDiscussionRows(admin, result.data || [], "post");
    return json(origin, 200, { posts });
  }

  if (action === "get_post") {
    const postId = text(payload.post_id);
    if (!/^[0-9a-f-]{36}$/i.test(postId)) return json(origin, 400, { error: "invalid-post-id" });
    const [post, comments] = await Promise.all([
      userClient.rpc("get_discussion_post", { p_post_id: postId }),
      userClient.rpc("get_discussion_comments", { p_post_id: postId }),
    ]);
    if (post.error || comments.error) return json(origin, 503, { error: "discussion-read-failed" });
    const enrichedPost = await enrichDiscussionRows(admin, post.data || [], "post");
    const enrichedComments = await enrichDiscussionRows(admin, comments.data || [], "comment");
    return json(origin, 200, { post: enrichedPost[0] || null, comments: enrichedComments });
  }

  if (CREATE_ACTIONS.has(action)) {
    const validation = action === "create_post" ? validatePostPayload(payload) : validateCommentPayload(payload);
    if (!validation.ok) return json(origin, 400, { error: validation.error });
    const rawToken = text(payload.turnstile_token);
    const verified = await verifyTurnstile(
      rawToken,
      action,
      request.headers.get("CF-Connecting-IP") || "",
    );
    if (!verified.ok) return json(origin, verified.status, { error: verified.error, error_codes: verified.error_codes || [] });
    const tokenHash = await sha256(rawToken);
    const args = {
      p_user_id: auth.data.user.id,
      p_token_hash: tokenHash,
      p_turnstile_action: verified.action,
      p_turnstile_hostname: verified.hostname,
      p_verified_at: verified.verifiedAt,
      p_expires_at: verified.expiresAt,
      p_draft_id: /^[0-9a-f-]{36}$/i.test(text(payload.draft_id)) ? text(payload.draft_id) : null,
      p_attachment_ids: Array.isArray(payload.attachment_ids)
        ? payload.attachment_ids.map(text).filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 10)
        : [],
      p_link_previews: Array.isArray(payload.link_previews) ? payload.link_previews.slice(0, 5) : [],
      ...(action === "create_post"
        ? {
          p_category: validation.value.category,
          p_title: validation.value.title,
          p_body: validation.value.body,
        }
        : {
          p_post_id: validation.value.post_id,
          p_body: validation.value.body,
        }),
    };
    const result = await admin.rpc(
      action === "create_post" ? "create_discussion_post_with_media_service" : "create_discussion_comment_with_media_service",
      args,
    );
    if (result.error) {
      const message = String(result.error.message || "");
      const wait = retryAfter(message);
      return json(origin, statusForDatabaseError(message), {
        error: wait ? "discussion-cooldown" : message.includes("replayed") ? "turnstile-token-replayed" : "discussion-write-failed",
        retry_after_seconds: wait,
      });
    }
    const cooldown = await userClient.rpc("get_discussion_rate_limit");
    const nextAllowedAt = cooldown.data?.[0]?.next_allowed_at || null;
    return json(origin, 200, action === "create_post"
      ? { post: result.data, next_allowed_at: nextAllowedAt }
      : { comment: result.data, next_allowed_at: nextAllowedAt });
  }

  if (action === "delete_post" || action === "delete_comment") {
    const id = text(action === "delete_post" ? payload.post_id : payload.comment_id);
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json(origin, 400, { error: "invalid-content-id" });
    const result = await admin.rpc(
      action === "delete_post" ? "delete_discussion_post_service" : "delete_discussion_comment_service",
      action === "delete_post"
        ? { p_user_id: auth.data.user.id, p_post_id: id }
        : { p_user_id: auth.data.user.id, p_comment_id: id },
    );
    if (result.error) return json(origin, 409, { error: "discussion-delete-failed" });
    if (result.data !== true) return json(origin, 403, { error: "not-content-owner" });
    return json(origin, 200, { deleted: true });
  }

  return json(origin, 400, { error: "unsupported-action" });
}

if (import.meta.main) Deno.serve(handler);
