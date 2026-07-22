import { createClient } from "@supabase/supabase-js";

type NotificationType = "weekly_top_ten_result" | "entered_top_ten" | "rank_improved" | "dropped_out_of_top_ten";
type QueueItem = { id: string; week_start: string; user_id: string; notification_type: NotificationType; rank: number; transition_sequence: number; attempts: number };
type ServiceAccount = { client_email: string; private_key: string; project_id: string };
const MAX_ATTEMPTS = 3;

function base64Url(bytes: Uint8Array | string) {
  const binary = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  return btoa(String.fromCharCode(...binary)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}
function pemBytes(value: string) { return Uint8Array.from(atob(value.replace(/-----[^-]+-----/gu, "").replace(/\s/gu, "")), (char) => char.charCodeAt(0)); }

export function notificationCopy(type: QueueItem["notification_type"], rank: number) {
  if (type === "dropped_out_of_top_ten") return { title: "乖乖練習王", body: `你目前被擠到本週第 ${rank} 名了，快去練習把前十名追回來！` };
  if (type === "entered_top_ten") return { title: "乖乖練習王", body: `恭喜進入本週前十名，目前第 ${rank} 名！` };
  if (type === "rank_improved") return { title: "乖乖練習王", body: `恭喜本週名次上升到第 ${rank} 名！` };
  return { title: "乖乖練習王", body: `恭喜本週在乖乖練習王中獲得第 ${rank} 名！` };
}
export function classifyFcmStatus(status: number) {
  if (status >= 200 && status < 300) return "success";
  if (status === 404 || status === 410) return "invalid";
  if (status === 408 || status === 429 || status >= 500) return "temporary";
  return "permanent";
}

export function classifyFcmResponse(status: number, payload: unknown) {
  if (status === 400) {
    const details = (payload as { error?: { details?: Array<{ errorCode?: string }> } })?.error?.details || [];
    if (details.some((detail) => detail?.errorCode === "UNREGISTERED")) return "invalid";
  }
  return classifyFcmStatus(status);
}

async function createAccessToken(account: ServiceAccount, fetcher = fetch) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(JSON.stringify({ iss: account.client_email, sub: account.client_email, aud: "https://oauth2.googleapis.com/token", scope: "https://www.googleapis.com/auth/firebase.messaging", iat: now, exp: now + 3600 }));
  const key = await crypto.subtle.importKey("pkcs8", pemBytes(account.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claim}`)));
  const response = await fetcher("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${header}.${claim}.${base64Url(signature)}` }) });
  if (!response.ok) throw new Error("fcm-oauth-failed");
  const payload = await response.json(); if (!payload?.access_token) throw new Error("fcm-oauth-invalid"); return String(payload.access_token);
}

export async function sendFcm(account: ServiceAccount, accessToken: string, token: string, item: QueueItem, fetcher = fetch) {
  const copy = notificationCopy(item.notification_type, item.rank);
  const response = await fetcher(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.project_id)}/messages:send`, {
    method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message: { token, notification: copy, data: { notification_type: item.notification_type, rank: String(item.rank), notification_id: item.id, transition_id: `${item.week_start}:${item.transition_sequence}` }, android: { priority: "high", notification: { channel_id: "leaderboard-rankings", click_action: "OPEN_WEEKLY_LEADERBOARD" } } } }),
  });
  const payload = response.ok ? null : await response.json().catch(() => null);
  return classifyFcmResponse(response.status, payload);
}

export async function handler(request: Request) {
  if (request.method !== "POST") return Response.json({ error: "method-not-allowed" }, { status: 405 });
  const expectedSecret = Deno.env.get("LEADERBOARD_NOTIFICATION_CRON_SECRET") || "";
  if (!expectedSecret || request.headers.get("x-cron-secret") !== expectedSecret) return Response.json({ error: "forbidden" }, { status: 403 });
  const url = Deno.env.get("SUPABASE_URL") || ""; const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""; const serviceJson = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON") || "";
  if (!url || !serviceKey || !serviceJson) return Response.json({ error: "push-configuration-unavailable" }, { status: 503 });
  let account: ServiceAccount; try { account = JSON.parse(serviceJson); } catch { return Response.json({ error: "push-configuration-invalid" }, { status: 503 }); }
  if (!account.client_email || !account.private_key || !account.project_id) return Response.json({ error: "push-configuration-invalid" }, { status: 503 });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const claimed = await admin.rpc("claim_leaderboard_notification_queue", { p_limit: 20 });
  if (claimed.error) return Response.json({ error: "queue-claim-failed" }, { status: 500 });
  const items = (claimed.data || []) as QueueItem[]; if (!items.length) return Response.json({ processed: 0, sent: 0, retried: 0, skipped: 0 });
  let accessToken = ""; try { accessToken = await createAccessToken(account); } catch { return Response.json({ error: "push-auth-failed" }, { status: 503 }); }
  let sent = 0; let retried = 0; let skipped = 0;
  for (const item of items) {
    const preferenceRows = await admin.from("leaderboard_push_preferences").select("weekly_results,top_ten_changes").eq("user_id", item.user_id).maybeSingle();
    const preferenceEnabled = item.notification_type === "weekly_top_ten_result"
      ? preferenceRows.data?.weekly_results !== false
      : preferenceRows.data?.top_ten_changes !== false;
    if (!preferenceEnabled) {
      await admin.from("leaderboard_notification_queue").update({ status: "skipped", processed_at: new Date().toISOString(), last_error_code: "preference-disabled" }).eq("id", item.id);
      skipped += 1;
      continue;
    }
    const tokenRows = await admin.from("leaderboard_push_device_tokens").select("id,token").eq("user_id", item.user_id).eq("is_active", true);
    if (tokenRows.error || !tokenRows.data?.length) { await admin.from("leaderboard_notification_queue").update({ status: "skipped", processed_at: new Date().toISOString(), last_error_code: "no-active-token" }).eq("id", item.id); skipped += 1; continue; }
    let delivered = false; let temporary = false;
    for (const device of tokenRows.data) {
      const outcome = await sendFcm(account, accessToken, device.token, item);
      if (outcome === "success") { delivered = true; await admin.from("leaderboard_push_device_tokens").update({ failure_count: 0, last_success_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", device.id); }
      else if (outcome === "invalid") await admin.from("leaderboard_push_device_tokens").update({ is_active: false, disabled_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", device.id);
      else if (outcome === "temporary") temporary = true;
    }
    if (delivered) {
      await admin.from("leaderboard_notification_deliveries").upsert({ week_start: item.week_start, user_id: item.user_id, notification_type: item.notification_type, transition_sequence: item.transition_sequence, queue_id: item.id }, { onConflict: "week_start,user_id,notification_type,transition_sequence", ignoreDuplicates: true });
      await admin.from("leaderboard_notification_queue").update({ status: "sent", processed_at: new Date().toISOString(), last_error_code: null }).eq("id", item.id); sent += 1;
    } else if (temporary && item.attempts < MAX_ATTEMPTS) {
      const delaySeconds = Math.min(900, 30 * (2 ** Math.max(0, item.attempts - 1)));
      await admin.from("leaderboard_notification_queue").update({ status: "retry", next_attempt_at: new Date(Date.now() + delaySeconds * 1000).toISOString(), last_error_code: "temporary-fcm-error" }).eq("id", item.id); retried += 1;
    } else {
      await admin.from("leaderboard_notification_queue").update({ status: "failed", processed_at: new Date().toISOString(), last_error_code: temporary ? "retry-limit" : "permanent-fcm-error" }).eq("id", item.id); skipped += 1;
    }
  }
  return Response.json({ processed: items.length, sent, retried, skipped });
}

if (import.meta.main) Deno.serve(handler);
