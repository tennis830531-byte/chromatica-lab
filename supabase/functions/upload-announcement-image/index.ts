import { createClient } from "@supabase/supabase-js";
import { ImageMagick, initializeImageMagick, MagickFormat } from "@imagemagick/magick-wasm";

const wasmBytes = await Deno.readFile(new URL("magick.wasm", import.meta.resolve("@imagemagick/magick-wasm")));
await initializeImageMagick(wasmBytes);

const BUCKET = "announcement-images";
const INPUT_LIMIT = 5 * 1024 * 1024;
const OUTPUT_LIMIT = 1536 * 1024;
const MAX_PIXELS = 36_000_000;
const MAX_DIMENSION = 12_000;
const MAX_EDGE = 1600;
const ALLOWED_ORIGINS = new Set([
  "https://tennis830531-byte.github.io", "https://localhost", "http://localhost", "http://localhost:5173", "http://127.0.0.1:5173",
]);
const MIME_SIGNATURES = new Map<string, (bytes: Uint8Array) => boolean>([
  ["image/jpeg", (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ["image/png", (b) => b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a],
  ["image/webp", (b) => b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP"],
]);

export function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin, "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}
function json(origin: string | null, status: number, body: Record<string, unknown>) { return Response.json(body, { status, headers: corsHeaders(origin) }); }
function isWebp(bytes: Uint8Array) { return MIME_SIGNATURES.get("image/webp")!(bytes); }

export function processAnnouncementImage(input: Uint8Array) {
  let output = new Uint8Array(); let width = 0; let height = 0; let sourceWidth = 0; let sourceHeight = 0;
  ImageMagick.readCollection(input, (images) => {
    if (images.length !== 1) throw new Error("animated-image-not-allowed");
    const image = images[0]; image.autoOrient();
    sourceWidth = Number(image.width); sourceHeight = Number(image.height);
    if (!Number.isInteger(sourceWidth) || !Number.isInteger(sourceHeight) || sourceWidth <= 0 || sourceHeight <= 0 || sourceWidth > MAX_DIMENSION || sourceHeight > MAX_DIMENSION || sourceWidth * sourceHeight > MAX_PIXELS) throw new Error("image-dimensions-invalid");
    const scale = Math.min(1, MAX_EDGE / Math.max(sourceWidth, sourceHeight));
    width = Math.max(1, Math.round(sourceWidth * scale)); height = Math.max(1, Math.round(sourceHeight * scale));
    if (width !== sourceWidth || height !== sourceHeight) image.resize(width, height);
    image.strip();
    for (const quality of [84, 76, 68, 60, 52, 44]) {
      image.quality = quality;
      const candidate = image.write(MagickFormat.WebP, (data) => Uint8Array.from(data));
      if (candidate.byteLength <= OUTPUT_LIMIT && isWebp(candidate)) { output = candidate; return; }
    }
  });
  if (!output.byteLength) throw new Error("announcement-output-too-large");
  return { bytes: output, width, height, sourceWidth, sourceHeight };
}

export async function handler(request: Request) {
  const origin = request.headers.get("Origin");
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return json(origin, 403, { error: "origin-not-allowed" });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (request.method !== "POST") return json(origin, 405, { error: "method-not-allowed" });
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return json(origin, 401, { error: "authentication-required" });
  if (!(request.headers.get("Content-Type") || "").toLowerCase().startsWith("multipart/form-data;")) return json(origin, 415, { error: "multipart-required" });
  let form: FormData; try { form = await request.formData(); } catch { return json(origin, 400, { error: "invalid-form" }); }
  const file = form.get("file"); const announcementId = String(form.get("announcement_id") || "");
  if (!(file instanceof File) || file.size <= 0 || !/^[0-9a-f-]{36}$/i.test(announcementId)) return json(origin, 400, { error: "invalid-request" });
  if (file.size > INPUT_LIMIT) return json(origin, 413, { error: "file-too-large" });
  const bytes = new Uint8Array(await file.arrayBuffer()); const signature = MIME_SIGNATURES.get(file.type.toLowerCase());
  if (!signature || !signature(bytes)) return json(origin, 415, { error: "image-type-invalid" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""; const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || ""; const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !anonKey || !serviceKey) return json(origin, 503, { error: "service-unavailable" });
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const userResult = await userClient.auth.getUser(); if (userResult.error || !userResult.data.user) return json(origin, 401, { error: "authentication-required" });
  const adminStatus = await userClient.rpc("get_announcement_admin_status");
  const status = Array.isArray(adminStatus.data) ? adminStatus.data[0] : adminStatus.data;
  if (adminStatus.error || status?.is_admin !== true) return json(origin, 403, { error: "admin-required" });
  let processed: ReturnType<typeof processAnnouncementImage>; try { processed = processAnnouncementImage(bytes); } catch { return json(origin, 400, { error: "image-decode-or-processing-failed" }); }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const existing = await admin.from("announcements").select("id,image_path,image_version").eq("id", announcementId).maybeSingle();
  if (existing.error || !existing.data) return json(origin, 404, { error: "announcement-not-found" });
  const newPath = `announcement-${crypto.randomUUID()}.webp`;
  const upload = await admin.storage.from(BUCKET).upload(newPath, processed.bytes, { upsert: false, cacheControl: "3600", contentType: "image/webp" });
  if (upload.error) return json(origin, 500, { error: "image-upload-failed" });
  const update = await admin.from("announcements").update({ image_path: newPath, image_version: Number(existing.data.image_version || 0) + 1, updated_by: userResult.data.user.id, updated_at: new Date().toISOString() }).eq("id", announcementId).select("id,image_path,image_version").single();
  if (update.error) { await admin.storage.from(BUCKET).remove([newPath]); return json(origin, 409, { error: "announcement-update-failed" }); }
  const oldPath = String(existing.data.image_path || "");
  if (oldPath && oldPath !== newPath) { const cleanup = await admin.storage.from(BUCKET).remove([oldPath]); if (cleanup.error) console.warn("announcement-image-old-object-cleanup-failed"); }
  return json(origin, 200, { path: newPath, bytes: processed.bytes.byteLength, mime: "image/webp", width: processed.width, height: processed.height, image_version: update.data.image_version });
}

if (import.meta.main) Deno.serve(handler);
