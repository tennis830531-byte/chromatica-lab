import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isWebp(bytes: Uint8Array) {
  if (bytes.byteLength < 12) return false;
  return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { error: "method-not-allowed" });
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return json(401, { error: "authentication-required" });
  if ((request.headers.get("Content-Type") || "").split(";", 1)[0].trim().toLowerCase() !== "image/webp") {
    return json(415, { error: "webp-required" });
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json(503, { error: "service-unavailable" });
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json(401, { error: "authentication-required" });
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength < 12 || bytes.byteLength >= 300 * 1024 || !isWebp(bytes)) {
    return json(400, { error: "invalid-webp-avatar" });
  }
  const { data: prefix, error: prefixError } = await userClient.rpc("get_leaderboard_avatar_prefix");
  if (prefixError || !/^[a-f0-9]{32}$/.test(String(prefix || ""))) return json(403, { error: "avatar-prefix-unavailable" });
  const path = `${prefix}/avatar-${crypto.randomUUID()}.webp`;
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { error: uploadError } = await admin.storage.from("leaderboard-avatars").upload(path, bytes, {
    upsert: false,
    cacheControl: "31536000",
    contentType: "image/webp",
  });
  if (uploadError) return json(500, { error: "avatar-upload-failed" });
  return json(200, { path, bytes: bytes.byteLength, mime: "image/webp" });
});
