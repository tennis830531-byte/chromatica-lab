import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { DISCUSSION_MEDIA, mediaDefinition, validUuid } from "../_shared/discussion-security.ts";

const origins = new Set([
  "https://tennis830531-byte.github.io", "https://localhost", "http://localhost",
  "http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173", "http://127.0.0.1:4173",
]);
function headers(origin: string | null) {
  if (!origin || !origins.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
function json(origin: string | null, status: number, value: Record<string, unknown>) {
  return Response.json(value, { status, headers: headers(origin) });
}

export async function handler(request: Request) {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") return new Response(null, { status: origin && origins.has(origin) ? 204 : 403, headers: headers(origin) });
  if (request.method !== "POST") return json(origin, 405, { error: "method-not-allowed" });
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return json(origin, 401, { error: "authentication-required" });
  const url = Deno.env.get("SUPABASE_URL") || "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !anon || !serviceKey) return json(origin, 503, { error: "service-unavailable" });
  const authClient = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) return json(origin, 401, { error: "authentication-required" });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "");

  if (action === "create_upload_session") {
    const definition = mediaDefinition(body.mime_type);
    if (!validUuid(body.draft_id) || !definition || !["post", "comment"].includes(body.owner_type)
      || !Number.isInteger(body.sort_order) || Number(body.size_bytes) <= 0
      || Number(body.size_bytes) > definition.maximumBytes) {
      return json(origin, 400, { error: "invalid-upload" });
    }
    const { data: attachment, error } = await admin.rpc("create_discussion_upload_service", {
      p_user_id: user.id, p_draft_id: body.draft_id, p_owner_type: body.owner_type,
      p_original_filename: String(body.original_filename || "").slice(0, 255),
      p_mime_type: String(body.mime_type), p_size_bytes: Number(body.size_bytes), p_sort_order: Number(body.sort_order),
    });
    if (error) return json(origin, 400, { error: error.message });
    const { data: signed, error: signError } = await admin.storage.from(DISCUSSION_MEDIA.bucket).createSignedUploadUrl(attachment.storage_path);
    if (signError) return json(origin, 503, { error: "upload-session-unavailable" });
    return json(origin, 200, { attachment, signed_upload_url: signed.signedUrl });
  }

  if (action === "confirm_upload") {
    if (!validUuid(body.attachment_id)) return json(origin, 400, { error: "invalid-attachment" });
    const { data: row } = await admin.from("discussion_attachments").select("id,storage_path,size_bytes,mime_type,uploader_id").eq("id", body.attachment_id).maybeSingle();
    if (!row || row.uploader_id !== user.id) return json(origin, 404, { error: "attachment-not-found" });
    const parts = row.storage_path.split("/");
    const filename = parts.pop();
    const { data: objects, error: listError } = await admin.storage.from(DISCUSSION_MEDIA.bucket).list(parts.join("/"), { search: filename, limit: 2 });
    const object = objects?.find((item) => item.name === filename);
    const actualSize = Number(object?.metadata?.size ?? object?.metadata?.contentLength ?? -1);
    const actualMime = String(object?.metadata?.mimetype ?? object?.metadata?.contentType ?? "");
    if (listError || !object) return json(origin, 400, { error: "uploaded-object-missing" });
    const { data: attachment, error } = await admin.rpc("confirm_discussion_upload_service", {
      p_user_id: user.id, p_attachment_id: row.id,
      p_actual_size_bytes: actualSize, p_actual_mime_type: actualMime,
    });
    if (error || attachment?.upload_status !== "uploaded") {
      return json(origin, 400, { error: "uploaded-object-mismatch" });
    }
    return json(origin, 200, { attachment });
  }

  if (action === "get_signed_media_urls") {
    const ids = Array.isArray(body.attachment_ids) ? body.attachment_ids.filter(validUuid).slice(0, 50) : [];
    const { data: rows, error } = await admin.rpc("get_visible_discussion_attachments_service", { p_user_id: user.id, p_attachment_ids: ids });
    if (error) return json(origin, 400, { error: "media-unavailable" });
    const media = [];
    for (const row of rows || []) {
      const { data } = await admin.storage.from(DISCUSSION_MEDIA.bucket).createSignedUrl(row.storage_path, DISCUSSION_MEDIA.signedReadSeconds);
      if (data?.signedUrl) media.push({ id: row.id, signed_url: data.signedUrl });
    }
    return json(origin, 200, { media, expires_in: DISCUSSION_MEDIA.signedReadSeconds });
  }

  if (action === "discard_draft") {
    if (!validUuid(body.draft_id)) return json(origin, 400, { error: "invalid-draft" });
    const { data, error } = await admin.rpc("discard_discussion_draft_service", { p_user_id: user.id, p_draft_id: body.draft_id });
    if (error) return json(origin, 400, { error: "discard-failed" });
    return json(origin, 200, { discarded: Number(data || 0) });
  }

  if (action === "cleanup_expired_drafts") {
    if (Deno.env.get("DISCUSSION_MEDIA_CLEANUP_QA_ENABLED") !== "true") {
      return json(origin, 404, { error: "cleanup-not-enabled" });
    }
    const { data: rows, error } = await admin.rpc("claim_discussion_media_cleanup_service", {
      p_expired_before: new Date(Date.now() - DISCUSSION_MEDIA.draftExpirySeconds * 1000).toISOString(),
      p_limit: 100,
    });
    if (error) return json(origin, 503, { error: "cleanup-unavailable" });
    let completed = 0;
    let failed = 0;
    for (const row of rows || []) {
      const removal = await admin.storage.from(DISCUSSION_MEDIA.bucket).remove([row.storage_path]);
      const succeeded = !removal.error;
      await admin.rpc("complete_discussion_media_cleanup_service", {
        p_attachment_id: row.attachment_id,
        p_succeeded: succeeded,
      });
      if (succeeded) completed += 1;
      else failed += 1;
    }
    return json(origin, 200, { processed: (rows || []).length, completed, failed });
  }
  return json(origin, 400, { error: "invalid-action" });
}

if (import.meta.main) Deno.serve(handler);
