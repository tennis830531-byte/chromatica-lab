import { createClient } from "@supabase/supabase-js";
import {
  ImageMagick,
  initializeImageMagick,
  MagickFormat,
  MagickGeometry,
} from "@imagemagick/magick-wasm";

const wasmBytes = await Deno.readFile(
  new URL("magick.wasm", import.meta.resolve("@imagemagick/magick-wasm")),
);
await initializeImageMagick(wasmBytes);

const BUCKET = "leaderboard-avatars";
const INPUT_LIMIT = 2 * 1024 * 1024;
const OUTPUT_LIMIT = 300 * 1024;
const MAX_PIXELS = 25_000_000;
const MAX_DIMENSION = 10_000;
const OUTPUT_SIZES = [512, 448, 384, 320, 256];
const OUTPUT_QUALITIES = [82, 74, 66, 58, 50, 42];
const MIME_SIGNATURES = new Map<string, (bytes: Uint8Array) => boolean>([
  ["image/jpeg", (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ["image/png", (b) => b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a],
  ["image/webp", (b) => b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP"],
]);
const ALLOWED_ORIGINS = new Set([
  "https://tennis830531-byte.github.io",
  "https://localhost",
  "http://localhost",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

function corsHeaders(origin: string | null) {
  return origin && ALLOWED_ORIGINS.has(origin) ? {
    "Access-Control-Allow-Origin": origin,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  } : {};
}

function json(origin: string | null, status: number, body: Record<string, unknown>) {
  return Response.json(body, { status, headers: corsHeaders(origin) });
}

function isVisibleName(value: string) {
  const length = Array.from(value).length;
  return length >= 2 && length <= 20 && !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
}

function isWebp(bytes: Uint8Array) {
  return MIME_SIGNATURES.get("image/webp")!(bytes);
}

function processImage(input: Uint8Array) {
  let dimensions = { width: 0, height: 0 };
  let outputSize = 0;
  let output = new Uint8Array();
  ImageMagick.readCollection(input, (images) => {
    if (images.length !== 1) throw new Error("animated-image-not-allowed");
    const image = images[0];
    image.autoOrient();
    const width = Number(image.width);
    const height = Number(image.height);
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 ||
      width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > MAX_PIXELS) {
      throw new Error("image-dimensions-invalid");
    }
    dimensions = { width, height };
    const square = Math.min(width, height);
    image.crop(new MagickGeometry(Math.floor((width - square) / 2), Math.floor((height - square) / 2), square, square));
    image.strip();
    for (const requestedSize of OUTPUT_SIZES) {
      const size = Math.min(square, requestedSize);
      if (image.width !== size || image.height !== size) image.resize(size, size);
      for (const quality of OUTPUT_QUALITIES) {
        image.quality = quality;
        const candidate = image.write(MagickFormat.WebP, (data) => Uint8Array.from(data));
        if (candidate.byteLength <= OUTPUT_LIMIT && isWebp(candidate)) {
          output = candidate;
          outputSize = Number(image.width);
          return;
        }
      }
    }
  });
  if (!output.byteLength) throw new Error("avatar-output-too-large");
  return { bytes: output, source: dimensions, width: outputSize, height: outputSize };
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin");
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return json(origin, 403, { error: "origin-not-allowed" });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (request.method !== "POST") return json(origin, 405, { error: "method-not-allowed" });
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return json(origin, 401, { error: "authentication-required" });

  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;")) return json(origin, 415, { error: "multipart-required" });
  let form: FormData;
  try { form = await request.formData(); } catch { return json(origin, 400, { error: "invalid-form" }); }
  const file = form.get("file");
  const displayName = String(form.get("display_name") || "").trim();
  const consent = String(form.get("consent") || "").toLowerCase() === "true";
  if (!(file instanceof File) || file.size <= 0) return json(origin, 400, { error: "file-required" });
  if (file.size > INPUT_LIMIT) return json(origin, 413, { error: "file-too-large" });
  if (!isVisibleName(displayName)) return json(origin, 400, { error: "display-name-invalid" });
  if (!consent) return json(origin, 400, { error: "public-consent-required" });
  const declaredMime = file.type.toLowerCase();
  const signature = MIME_SIGNATURES.get(declaredMime);
  const input = new Uint8Array(await file.arrayBuffer());
  if (!signature || !signature(input)) return json(origin, 415, { error: "image-type-invalid" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json(origin, 503, { error: "service-unavailable" });
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json(origin, 401, { error: "authentication-required" });

  const { data: membership, error: membershipError } = await userClient.rpc("get_my_leaderboard_membership");
  if (membershipError) return json(origin, 403, { error: "membership-unavailable" });
  const current = Array.isArray(membership) ? membership[0] : membership;
  const oldPath = current?.custom_avatar_path ? String(current.custom_avatar_path) : "";
  let processed: ReturnType<typeof processImage>;
  try { processed = processImage(input); } catch { return json(origin, 400, { error: "image-decode-or-processing-failed" }); }

  const { data: prefix, error: prefixError } = await userClient.rpc("get_leaderboard_avatar_prefix");
  if (prefixError || !/^[a-f0-9]{32}$/.test(String(prefix || ""))) return json(origin, 403, { error: "avatar-prefix-unavailable" });
  const path = `${prefix}/avatar-${crypto.randomUUID()}.webp`;
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const upload = await admin.storage.from(BUCKET).upload(path, processed.bytes, { upsert: false, cacheControl: "31536000", contentType: "image/webp" });
  if (upload.error) return json(origin, 500, { error: "avatar-upload-failed" });

  const joined = current?.joined === true;
  const rpcName = joined ? "update_leaderboard_profile" : "join_global_leaderboard";
  const rpcArgs = joined ? { p_display_name: displayName, p_custom_avatar_path: path } : {
    p_display_name: displayName,
    p_custom_avatar_path: path,
    p_consent: true,
    p_featured_spirit_species: String(form.get("featured_spirit_species") || ""),
    p_featured_spirit_name: String(form.get("featured_spirit_name") || ""),
    p_featured_spirit_stage: Math.max(1, Math.min(3, Number(form.get("featured_spirit_stage")) || 1)),
  };
  const profileUpdate = await userClient.rpc(rpcName, rpcArgs);
  if (profileUpdate.error) {
    await admin.storage.from(BUCKET).remove([path]);
    return json(origin, 409, { error: "profile-update-failed" });
  }
  if (oldPath && oldPath !== path && oldPath.startsWith(`${prefix}/`)) {
    const cleanup = await admin.storage.from(BUCKET).remove([oldPath]);
    if (cleanup.error) console.warn("leaderboard-avatar-old-object-cleanup-failed");
  }
  return json(origin, 200, {
    path,
    bytes: processed.bytes.byteLength,
    mime: "image/webp",
    width: processed.width,
    height: processed.height,
    profile: Array.isArray(profileUpdate.data) ? profileUpdate.data[0] : profileUpdate.data,
  });
});
