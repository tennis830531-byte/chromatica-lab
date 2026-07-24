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
    "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
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

type AnnouncementImage = { image_path: string; image_version: number; sort_order: number };
type ImageOrderItem = { kind: "existing"; path: string } | { kind: "new"; index: number };

export function normalizeExistingImages(
  announcement: { image_path?: string | null; image_version?: number | null },
  rows: AnnouncementImage[],
) {
  if (rows.length) return rows.toSorted((a, b) => a.sort_order - b.sort_order);
  const path = String(announcement.image_path || "");
  return path ? [{ image_path: path, image_version: Math.max(1, Number(announcement.image_version || 1)), sort_order: 0 }] : [];
}

export function parseImageOrder(raw: FormDataEntryValue | null, existing: AnnouncementImage[], newFileCount: number): ImageOrderItem[] {
  if (!raw) {
    return [
      ...existing.map((item) => ({ kind: "existing" as const, path: item.image_path })),
      ...Array.from({ length: newFileCount }, (_, index) => ({ kind: "new" as const, index })),
    ];
  }
  let value: unknown;
  try { value = JSON.parse(String(raw)); } catch { throw new Error("invalid-image-order"); }
  if (!Array.isArray(value) || value.length > 10) throw new Error("invalid-image-order");
  const allowedExisting = new Set(existing.map((item) => item.image_path));
  const seenExisting = new Set<string>(); const seenNew = new Set<number>();
  return value.map((item) => {
    if (!item || typeof item !== "object") throw new Error("invalid-image-order");
    const candidate = item as Record<string, unknown>;
    if (candidate.kind === "existing") {
      const path = String(candidate.path || "");
      if (!allowedExisting.has(path) || seenExisting.has(path)) throw new Error("invalid-image-order");
      seenExisting.add(path);
      return { kind: "existing", path };
    }
    if (candidate.kind === "new") {
      const index = Number(candidate.index);
      if (!Number.isInteger(index) || index < 0 || index >= newFileCount || seenNew.has(index)) throw new Error("invalid-image-order");
      seenNew.add(index);
      return { kind: "new", index };
    }
    throw new Error("invalid-image-order");
  });
}

export async function handler(request: Request) {
  const origin = request.headers.get("Origin");
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return json(origin, 403, { error: "origin-not-allowed" });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (!["POST", "DELETE"].includes(request.method)) return json(origin, 405, { error: "method-not-allowed" });
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return json(origin, 401, { error: "authentication-required" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""; const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || ""; const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !anonKey || !serviceKey) return json(origin, 503, { error: "service-unavailable" });
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const userResult = await userClient.auth.getUser(); if (userResult.error || !userResult.data.user) return json(origin, 401, { error: "authentication-required" });
  const adminStatus = await userClient.rpc("get_announcement_admin_status");
  const status = Array.isArray(adminStatus.data) ? adminStatus.data[0] : adminStatus.data;
  if (adminStatus.error || status?.is_admin !== true) return json(origin, 403, { error: "admin-required" });

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  let announcementId = "";
  let form: FormData | null = null;
  if (request.method === "POST") {
    if (!(request.headers.get("Content-Type") || "").toLowerCase().startsWith("multipart/form-data;")) return json(origin, 415, { error: "multipart-required" });
    try { form = await request.formData(); } catch { return json(origin, 400, { error: "invalid-form" }); }
    announcementId = String(form.get("announcement_id") || "");
  } else {
    try { announcementId = String((await request.json())?.announcement_id || ""); } catch { return json(origin, 400, { error: "invalid-json" }); }
  }
  if (!/^[0-9a-f-]{36}$/i.test(announcementId)) return json(origin, 400, { error: "invalid-request" });

  const existing = await admin.from("announcements").select("id,image_path,image_version").eq("id", announcementId).maybeSingle();
  if (existing.error || !existing.data) return json(origin, 404, { error: "announcement-not-found" });
  const imageRows = await admin.from("announcement_images").select("image_path,image_version,sort_order").eq("announcement_id", announcementId).order("sort_order");
  if (imageRows.error) return json(origin, 503, { error: "announcement-images-unavailable" });
  const currentImages = normalizeExistingImages(existing.data, (imageRows.data || []) as AnnouncementImage[]);

  if (request.method === "DELETE") {
    const paths = currentImages.map((item) => item.image_path);
    if (paths.length) {
      const storageDelete = await admin.storage.from(BUCKET).remove(paths);
      if (storageDelete.error) return json(origin, 500, { error: "announcement-image-cleanup-failed" });
    }
    const deletion = await admin.rpc("delete_announcement_service", { p_announcement_id: announcementId });
    if (deletion.error || deletion.data !== true) return json(origin, 409, { error: "announcement-delete-failed" });
    return json(origin, 200, { deleted: true, removed_images: paths.length });
  }

  const legacyFile = form!.get("file");
  const suppliedFiles = form!.getAll("files").filter((item): item is File => item instanceof File);
  const files = suppliedFiles.length ? suppliedFiles : legacyFile instanceof File ? [legacyFile] : [];
  if (files.length > 10) return json(origin, 413, { error: "too-many-images" });
  for (const file of files) {
    if (file.size <= 0 || file.size > INPUT_LIMIT) return json(origin, 413, { error: "file-too-large" });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const signature = MIME_SIGNATURES.get(file.type.toLowerCase());
    if (!signature || !signature(bytes)) return json(origin, 415, { error: "image-type-invalid" });
  }

  let order: ImageOrderItem[];
  try { order = parseImageOrder(form!.get("image_order"), currentImages, files.length); }
  catch { return json(origin, 400, { error: "invalid-image-order" }); }
  if (order.length > 10) return json(origin, 413, { error: "too-many-images" });

  const uploaded: Array<AnnouncementImage & { bytes: number; width: number; height: number }> = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const bytes = new Uint8Array(await file.arrayBuffer());
    let processed: ReturnType<typeof processAnnouncementImage>;
    try { processed = processAnnouncementImage(bytes); }
    catch {
      if (uploaded.length) await admin.storage.from(BUCKET).remove(uploaded.map((item) => item.image_path));
      return json(origin, 400, { error: "image-decode-or-processing-failed" });
    }
    const path = `announcement-${crypto.randomUUID()}.webp`;
    const upload = await admin.storage.from(BUCKET).upload(path, processed.bytes, { upsert: false, cacheControl: "3600", contentType: "image/webp" });
    if (upload.error) {
      if (uploaded.length) await admin.storage.from(BUCKET).remove(uploaded.map((item) => item.image_path));
      return json(origin, 500, { error: "image-upload-failed" });
    }
    uploaded.push({ image_path: path, image_version: Date.now() + index, sort_order: index, bytes: processed.bytes.byteLength, width: processed.width, height: processed.height });
  }

  const currentByPath = new Map(currentImages.map((item) => [item.image_path, item]));
  const finalImages = order.map((item, sortOrder) => {
    const source = item.kind === "existing" ? currentByPath.get(item.path) : uploaded[item.index];
    if (!source) throw new Error("invalid-image-order");
    return { ...source, sort_order: sortOrder };
  });
  const replacement = await admin.rpc("replace_announcement_images_service", {
    p_announcement_id: announcementId,
    p_image_paths: finalImages.map((item) => item.image_path),
    p_image_versions: finalImages.map((item) => item.image_version),
  });
  if (replacement.error || replacement.data !== true) {
    if (uploaded.length) await admin.storage.from(BUCKET).remove(uploaded.map((item) => item.image_path));
    return json(origin, 409, { error: "announcement-update-failed" });
  }
  await admin.from("announcements").update({ updated_by: userResult.data.user.id, updated_at: new Date().toISOString() }).eq("id", announcementId);

  const finalPaths = new Set(finalImages.map((item) => item.image_path));
  const removedPaths = currentImages.map((item) => item.image_path).filter((path) => !finalPaths.has(path));
  if (removedPaths.length) {
    const cleanup = await admin.storage.from(BUCKET).remove(removedPaths);
    if (cleanup.error) {
      await admin.rpc("replace_announcement_images_service", {
        p_announcement_id: announcementId,
        p_image_paths: currentImages.map((item) => item.image_path),
        p_image_versions: currentImages.map((item) => item.image_version),
      });
      if (uploaded.length) await admin.storage.from(BUCKET).remove(uploaded.map((item) => item.image_path));
      return json(origin, 500, { error: "announcement-image-cleanup-failed" });
    }
  }

  return json(origin, 200, {
    images: finalImages.map((item) => ({ path: item.image_path, image_version: item.image_version })),
    uploaded: uploaded.map((item) => ({ path: item.image_path, bytes: item.bytes, mime: "image/webp", width: item.width, height: item.height })),
  });
}

if (import.meta.main) Deno.serve(handler);
