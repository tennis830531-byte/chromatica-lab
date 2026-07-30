import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertPublicDestination, parseYouTube, validateMetadataUrl } from "../_shared/discussion-security.ts";

const MAX_REDIRECTS = 3;
const MAX_BYTES = 1024 * 1024;
const TIMEOUT_MS = 5000;
const origins = new Set([
  "https://tennis830531-byte.github.io", "https://localhost", "http://localhost",
  "http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173", "http://127.0.0.1:4173",
]);
function cors(origin: string | null) {
  return origin && origins.has(origin) ? {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin",
  } : {};
}
function json(origin: string | null, status: number, value: Record<string, unknown>) {
  return Response.json(value, { status, headers: cors(origin) });
}
function clean(value: string | null, maximum: number) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maximum);
}
function meta(html: string, names: string[]) {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i"),
      new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, "i"),
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) return clean(match[1], 2000);
    }
  }
  return "";
}
function cacheKey(value: string) {
  const youtube = parseYouTube(value);
  if (youtube) return youtube.normalized_url;
  const checked = validateMetadataUrl(value);
  return checked.ok ? checked.url.toString() : "";
}
function publicPreview(row: Record<string, unknown>) {
  return {
    original_url: row.original_url || row.cache_key,
    normalized_url: row.normalized_url,
    provider: row.provider,
    site_name: row.site_name,
    title: row.title,
    description: row.description,
    thumbnail_url: row.thumbnail_url,
    embed_url: row.embed_url,
    status: row.status,
    fetched_at: row.fetched_at,
    expires_at: row.expires_at,
  };
}
async function boundedHtml(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_BYTES) {
      await reader.cancel();
      throw new Error("response-too-large");
    }
    chunks.push(value);
  }
  const combined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(combined);
}

export async function fetchMetadata(rawUrl: string, fetcher = fetch) {
  const youtube = parseYouTube(rawUrl);
  if (youtube) return { ...youtube, original_url: rawUrl, fetched_at: new Date().toISOString(), expires_at: new Date(Date.now() + 86400000).toISOString() };
  let checked = validateMetadataUrl(rawUrl);
  if (!checked.ok) throw new Error("unsafe-url");
  let current = checked.url;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    await assertPublicDestination(current);
    const response = await fetcher(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": "ChromaticaLab-LinkPreview/1.0", "Accept": "text/html,application/xhtml+xml" },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirects === MAX_REDIRECTS) throw new Error("redirect-limit");
      checked = validateMetadataUrl(new URL(location, current).toString());
      if (!checked.ok) throw new Error("unsafe-redirect");
      current = checked.url;
      continue;
    }
    if (!response.ok) throw new Error("fetch-failed");
    const type = response.headers.get("content-type")?.toLowerCase() || "";
    if (!type.includes("text/html") && !type.includes("application/xhtml+xml")) throw new Error("non-html-response");
    const html = await boundedHtml(response);
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const thumbnail = meta(html, ["og:image", "twitter:image"]);
    const thumbnailChecked = thumbnail ? validateMetadataUrl(new URL(thumbnail, current).toString()) : null;
    let safeThumbnail = "";
    if (thumbnailChecked?.ok) {
      try {
        await assertPublicDestination(thumbnailChecked.url);
        safeThumbnail = thumbnailChecked.url.toString();
      } catch {
        safeThumbnail = "";
      }
    }
    return {
      original_url: rawUrl,
      normalized_url: current.toString(),
      provider: current.hostname.replace(/^www\./, ""),
      site_name: meta(html, ["og:site_name"]) || current.hostname.replace(/^www\./, ""),
      title: meta(html, ["og:title", "twitter:title"]) || clean(titleMatch?.[1] || "", 500),
      description: meta(html, ["og:description", "description", "twitter:description"]),
      thumbnail_url: safeThumbnail,
      embed_url: null,
      status: "ready",
      fetched_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    };
  }
  throw new Error("fetch-failed");
}

export async function handler(request: Request) {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") return new Response(null, { status: origin && origins.has(origin) ? 204 : 403, headers: cors(origin) });
  if (request.method !== "POST") return json(origin, 405, { error: "method-not-allowed" });
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return json(origin, 401, { error: "authentication-required" });
  const url = Deno.env.get("SUPABASE_URL") || "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !anon || !serviceKey) return json(origin, 503, { error: "service-unavailable" });
  const client = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data: { user } } = await client.auth.getUser();
  if (!user) return json(origin, 401, { error: "authentication-required" });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const body = await request.json().catch(() => ({}));
  const urls = Array.isArray(body.urls) ? [...new Set(body.urls.map(String))].slice(0, 5) : [];
  const previews = [];
  for (const item of urls) {
    const key = cacheKey(item);
    if (!key) {
      previews.push({ original_url: item, normalized_url: item, provider: null, status: "failed" });
      continue;
    }
    const cached = await admin.from("discussion_link_metadata_cache")
      .select("*").eq("cache_key", key).gt("expires_at", new Date().toISOString()).maybeSingle();
    if (cached.data) {
      previews.push(publicPreview({ ...cached.data, original_url: item }));
      continue;
    }
    try {
      const preview = await fetchMetadata(item);
      previews.push(preview);
      await admin.from("discussion_link_metadata_cache").upsert({
        cache_key: key,
        normalized_url: preview.normalized_url,
        provider: preview.provider,
        site_name: preview.site_name,
        title: preview.title,
        description: preview.description,
        thumbnail_url: preview.thumbnail_url,
        embed_url: preview.embed_url,
        status: preview.status,
        fetched_at: preview.fetched_at,
        expires_at: preview.expires_at,
      }, { onConflict: "cache_key" });
    }
    catch { previews.push({ original_url: item, normalized_url: item, provider: null, status: "failed" }); }
  }
  return json(origin, 200, { previews });
}

if (import.meta.main) Deno.serve(handler);
