const ALLOWED_ORIGINS = new Set([
  "https://tennis830531-byte.github.io",
  "capacitor://localhost",
  "http://localhost",
  "https://localhost",
  "http://127.0.0.1",
]);

const CATEGORIES = new Set([
  "功能異常",
  "帳號與雲端同步",
  "練習與音準偵測",
  "介面或操作建議",
  "其他",
]);

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") || "";
  return {
    ...(ALLOWED_ORIGINS.has(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function response(request: Request, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json; charset=utf-8" },
  });
}

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLength);
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin") || "";
  if (origin && !ALLOWED_ORIGINS.has(origin)) return response(request, 403, { error: "origin_not_allowed" });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== "POST") return response(request, 405, { error: "method_not_allowed" });

  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return response(request, 401, { error: "authentication_required" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!supabaseUrl || !anonKey) return response(request, 500, { error: "service_unavailable" });

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: anonKey },
  });
  if (!userResponse.ok) return response(request, 401, { error: "authentication_required" });
  const user = await userResponse.json();
  const email = cleanText(user?.email, 254);
  const metadata = user?.user_metadata || {};
  const displayName = cleanText(
    metadata.full_name || metadata.name || metadata.given_name || "練習者",
    120,
  );

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return response(request, 400, { error: "invalid_request" });
  }
  const category = cleanText(payload.category, 40);
  const description = cleanText(payload.description, 2000);
  const appVersion = cleanText(payload.appVersion, 100);
  const platform = cleanText(payload.platform, 40);
  const currentView = cleanText(payload.currentView, 80);
  const requestId = cleanText(payload.requestId, 100);
  if (!CATEGORIES.has(category) || description.length < 10 || description.length > 2000
    || !/^[A-Za-z0-9-]{16,100}$/.test(requestId)) {
    return response(request, 400, { error: "invalid_fields" });
  }

  const apiKey = Deno.env.get("RESEND_API_KEY") || "";
  const recipient = Deno.env.get("FEEDBACK_RECIPIENT_EMAIL") || "";
  const from = Deno.env.get("FEEDBACK_FROM_EMAIL") || "";
  if (!apiKey || !recipient || !from) return response(request, 500, { error: "feedback_not_configured" });

  const sentAt = new Date().toISOString();
  const text = [
    `分類：${category}`,
    `問題描述：\n${description}`,
    `Google 顯示名稱：${displayName}`,
    `Google Email：${email || "（未提供）"}`,
    `App 版本：${appVersion || "（未提供）"}`,
    `平台：${platform || "（未提供）"}`,
    `當前頁面：${currentView || "（未提供）"}`,
    `發送時間：${sentAt}`,
  ].join("\n\n");

  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": requestId,
    },
    body: JSON.stringify({
      from,
      to: [recipient],
      ...(email ? { reply_to: email } : {}),
      subject: `[Chromatic Lab 問題回報] ${category}`,
      text,
    }),
  });
  if (!resendResponse.ok) return response(request, 502, { error: "delivery_failed" });
  return response(request, 200, { ok: true });
});
