import { createClient } from "@supabase/supabase-js";

type NotificationType = "boss_appeared" | "below_10" | "boss_defeated" | "first_hit" | "final_hit";
type QueueItem = {
  id: string;
  event_id: string;
  user_id: string;
  notification_type: NotificationType;
  payload: Record<string, unknown>;
  attempts: number;
};
type ServiceAccount = { client_email: string; private_key: string; project_id: string };

const MAX_ATTEMPTS = 3;

function base64Url(bytes: Uint8Array | string) {
  const binary = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  return btoa(String.fromCharCode(...binary)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function pemBytes(value: string) {
  return Uint8Array.from(
    atob(value.replace(/-----[^-]+-----/gu, "").replace(/\s/gu, "")),
    (character) => character.charCodeAt(0),
  );
}

export function worldBossNotificationCopy(type: NotificationType) {
  if (type === "boss_appeared") return { title: "世界 Boss 出現！", body: "樹麻雀已現身，快帶精靈一起參加討伐！" };
  if (type === "below_10") return { title: "世界 Boss 即將被擊倒", body: "樹麻雀的 HP 已低於 10%，快來完成最後攻勢！" };
  if (type === "boss_defeated") return { title: "世界 Boss 討伐成功", body: "樹麻雀已被擊倒，回到 App 查看本週結算。" };
  if (type === "first_hit") return { title: "世界 Boss 第一擊", body: "本週討伐的第一擊已經出現！" };
  return { title: "世界 Boss 最後一擊", body: "最後一擊完成，本週討伐成功！" };
}

async function createAccessToken(account: ServiceAccount, fetcher = fetch) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(JSON.stringify({
    iss: account.client_email,
    sub: account.client_email,
    aud: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    iat: now,
    exp: now + 3600,
  }));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemBytes(account.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${header}.${claim}`),
  ));
  const response = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claim}.${base64Url(signature)}`,
    }),
  });
  if (!response.ok) throw new Error("fcm-oauth-failed");
  const payload = await response.json();
  if (!payload?.access_token) throw new Error("fcm-oauth-invalid");
  return String(payload.access_token);
}

export async function sendWorldBossFcm(
  account: ServiceAccount,
  accessToken: string,
  token: string,
  item: QueueItem,
  fetcher = fetch,
) {
  const notification = worldBossNotificationCopy(item.notification_type);
  const response = await fetcher(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.project_id)}/messages:send`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          token,
          notification,
          data: {
            notification_type: item.notification_type,
            notification_id: item.id,
            event_id: item.event_id,
            route: "worldboss",
          },
          android: {
            priority: "high",
            notification: { channel_id: "world-boss", click_action: "OPEN_CHROMATICA_HOME" },
          },
        },
      }),
    },
  );
  if (response.ok) return "success";
  if (response.status === 404 || response.status === 410) return "invalid";
  if (response.status === 408 || response.status === 429 || response.status >= 500) return "temporary";
  return "permanent";
}

export async function handler(request: Request) {
  if (request.method !== "POST") return Response.json({ error: "method-not-allowed" }, { status: 405 });
  const expectedSecret = Deno.env.get("WORLD_BOSS_NOTIFICATION_CRON_SECRET") || "";
  if (!expectedSecret || request.headers.get("x-cron-secret") !== expectedSecret) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const serviceJson = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON") || "";
  if (!url || !serviceKey || !serviceJson) {
    return Response.json({ error: "push-configuration-unavailable" }, { status: 503 });
  }
  let account: ServiceAccount;
  try {
    account = JSON.parse(serviceJson);
  } catch {
    return Response.json({ error: "push-configuration-invalid" }, { status: 503 });
  }
  if (!account.client_email || !account.private_key || !account.project_id) {
    return Response.json({ error: "push-configuration-invalid" }, { status: 503 });
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const claimed = await admin.rpc("claim_world_boss_notification_queue", { p_limit: 20 });
  if (claimed.error) return Response.json({ error: "queue-claim-failed" }, { status: 500 });
  const items = (claimed.data || []) as QueueItem[];
  if (!items.length) return Response.json({ processed: 0, sent: 0, retried: 0, skipped: 0 });

  let accessToken = "";
  try {
    accessToken = await createAccessToken(account);
  } catch {
    return Response.json({ error: "push-auth-failed" }, { status: 503 });
  }
  let sent = 0;
  let retried = 0;
  let skipped = 0;
  for (const item of items) {
    const preference = await admin.from("leaderboard_push_preferences")
      .select("world_boss_notifications").eq("user_id", item.user_id).maybeSingle();
    if (preference.error || preference.data?.world_boss_notifications === false) {
      await admin.from("world_boss_notification_queue").update({
        status: "skipped", processed_at: new Date().toISOString(), last_error_code: preference.error ? "preference-read-failed" : "preference-disabled",
      }).eq("id", item.id).eq("status", "processing");
      skipped += 1;
      continue;
    }
    const tokens = await admin.from("leaderboard_push_device_tokens")
      .select("id,token").eq("user_id", item.user_id).eq("is_active", true);
    if (tokens.error || !tokens.data?.length) {
      await admin.from("world_boss_notification_queue").update({
        status: "skipped", processed_at: new Date().toISOString(), last_error_code: "no-active-token",
      }).eq("id", item.id).eq("status", "processing");
      skipped += 1;
      continue;
    }
    let delivered = false;
    let temporary = false;
    for (const device of tokens.data) {
      const outcome = await sendWorldBossFcm(account, accessToken, device.token, item);
      if (outcome === "success") delivered = true;
      else if (outcome === "invalid") {
        await admin.from("leaderboard_push_device_tokens").update({
          is_active: false, disabled_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq("id", device.id);
      } else if (outcome === "temporary") temporary = true;
    }
    if (delivered) {
      await admin.from("world_boss_notification_queue").update({
        status: "sent", processed_at: new Date().toISOString(), last_error_code: null,
      }).eq("id", item.id).eq("status", "processing");
      sent += 1;
    } else if (temporary && item.attempts < MAX_ATTEMPTS) {
      await admin.from("world_boss_notification_queue").update({
        status: "retry",
        next_attempt_at: new Date(Date.now() + Math.min(900, 30 * (2 ** Math.max(0, item.attempts - 1))) * 1000).toISOString(),
        last_error_code: "temporary-fcm-error",
      }).eq("id", item.id).eq("status", "processing");
      retried += 1;
    } else {
      await admin.from("world_boss_notification_queue").update({
        status: "failed",
        processed_at: new Date().toISOString(),
        last_error_code: temporary ? "retry-limit" : "permanent-fcm-error",
      }).eq("id", item.id).eq("status", "processing");
      skipped += 1;
    }
  }
  return Response.json({ processed: items.length, sent, retried, skipped });
}

if (import.meta.main) Deno.serve(handler);
