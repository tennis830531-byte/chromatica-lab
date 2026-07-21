const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "supabase/functions/upload-leaderboard-avatar/index.ts"), "utf8");
const deno = fs.readFileSync(path.join(root, "supabase/functions/upload-leaderboard-avatar/deno.json"), "utf8");
const config = fs.readFileSync(path.join(root, "supabase/config.toml"), "utf8");
const has = (pattern) => () => assert.match(source, pattern);
const originSetSource = source.match(/const ALLOWED_ORIGINS = new Set\(\[([\s\S]*?)\]\);/)?.[1] || "";
const allowedOrigins = new Set(Array.from(originSetSource.matchAll(/"([^"]+)"/g), (match) => match[1]));

test("pins magick-wasm", () => assert.match(deno, /magick-wasm@0\.0\.41/));
test("pins supabase-js", () => assert.match(deno, /supabase-js@2\.56\.1/));
test("loads the packaged wasm", has(/Deno\.readFile[\s\S]*magick\.wasm/));
test("requires gateway JWT verification", () => assert.match(config, /\[functions\.upload-leaderboard-avatar\][\s\S]*verify_jwt = true/));
test("allows only POST and OPTIONS", has(/request\.method === "OPTIONS"[\s\S]*request\.method !== "POST"/));
test("requires bearer auth", has(/authorization\.startsWith\("Bearer "\)/));
test("authenticates the caller", has(/userClient\.auth\.getUser\(\)/));
test("uses multipart form data", has(/multipart\/form-data[\s\S]*request\.formData\(\)/));
test("requires a file", has(/file instanceof File[\s\S]*file-required/));
test("requires a visible name", has(/isVisibleName\(displayName\)/));
test("requires explicit consent", has(/if \(!consent\)/));
test("limits original input to 2MB", has(/INPUT_LIMIT = 2 \* 1024 \* 1024/));
test("accepts JPEG magic", has(/image\/jpeg[\s\S]*0xff[\s\S]*0xd8/));
test("accepts PNG magic", has(/image\/png[\s\S]*0x89[\s\S]*0x50/));
test("accepts WebP magic", has(/image\/webp[\s\S]*RIFF[\s\S]*WEBP/));
test("rejects MIME and magic mismatches", has(/!signature \|\| !signature\(input\)/));
test("decodes with ImageMagick", has(/ImageMagick\.readCollection/));
test("rejects multiple frames", has(/images\.length !== 1/));
test("applies EXIF orientation", has(/image\.autoOrient\(\)/));
test("limits decoded pixels to 25MP", has(/MAX_PIXELS = 25_000_000/));
test("limits either edge to 10000px", has(/MAX_DIMENSION = 10_000/));
test("center crops a square", has(/Math\.floor\(\(width - square\) \/ 2\)[\s\S]*Math\.floor\(\(height - square\) \/ 2\)/));
test("strips metadata", has(/image\.strip\(\)/));
test("emits WebP", has(/MagickFormat\.WebP/));
test("uses bounded quality retries", has(/OUTPUT_QUALITIES = \[82, 74, 66, 58, 50, 42\]/));
test("uses bounded downsize retries", has(/OUTPUT_SIZES = \[512, 448, 384, 320, 256\]/));
test("limits output to 300KB", has(/OUTPUT_LIMIT = 300 \* 1024/));
test("uploads before profile RPC", () => assert.ok(source.indexOf(".upload(path") < source.indexOf("userClient.rpc(rpcName")));
test("cleans new upload after profile failure", has(/profileUpdate\.error[\s\S]*remove\(\[path\]\)/));
test("deletes old image only after profile success", () => assert.ok(source.indexOf("profileUpdate.error") < source.indexOf("remove([oldPath])")));
test("uses an opaque prefix and random UUID", has(/get_leaderboard_avatar_prefix[\s\S]*crypto\.randomUUID\(\)/));
test("rejects unlisted CORS origins", has(/!ALLOWED_ORIGINS\.has\(origin\)[\s\S]*origin-not-allowed/));
test("allows the production GitHub Pages origin", () => assert.equal(allowedOrigins.has("https://tennis830531-byte.github.io"), true));
test("allows the exact Android Capacitor origin", () => assert.equal(allowedOrigins.has("https://localhost"), true));
test("allows the existing local web origin", () => assert.equal(allowedOrigins.has("http://localhost"), true));
test("returns the exact allowed origin in CORS headers", has(/"Access-Control-Allow-Origin": origin/));
test("allows POST in CORS headers", has(/"Access-Control-Allow-Methods": "POST, OPTIONS"/));
test("returns 204 for allowed OPTIONS before the POST JWT gate", has(/request\.method === "OPTIONS"[\s\S]*status: 204[\s\S]*request\.method !== "POST"[\s\S]*authorization\.startsWith/));
test("lets an allowed Android POST continue to the JWT gate", () => {
  assert.equal(allowedOrigins.has("https://localhost"), true);
  assert.ok(source.indexOf("!ALLOWED_ORIGINS.has(origin)") < source.indexOf('request.headers.get("Authorization")'));
});
test("does not allow the production site path as an origin", () => assert.equal(allowedOrigins.has("https://tennis830531-byte.github.io/chromatica-lab/"), false));
test("rejects an unlisted origin", () => assert.equal(allowedOrigins.has("https://example.invalid"), false));
test("rejects a similar attack origin", () => assert.equal(allowedOrigins.has("https://tennis830531-byte.github.io.example.com"), false));
test("rejects other GitHub Pages origins", () => assert.equal(allowedOrigins.has("https://someone-else.github.io"), false));
test("rejects Android lookalike and alternate-port origins", () => {
  assert.equal(allowedOrigins.has("https://localhost.example.com"), false);
  assert.equal(allowedOrigins.has("https://localhost:1234"), false);
  assert.equal(allowedOrigins.has("http://localhost.example.com"), false);
});
test("rejects null origins before request processing", has(/if \(!origin \|\| !ALLOWED_ORIGINS\.has\(origin\)\) return json\(origin, 403/));
test("rejects origins before OPTIONS, JWT, image, Storage, or RPC processing", () => {
  const rejection = source.indexOf("if (!origin || !ALLOWED_ORIGINS.has(origin))");
  for (const marker of [
    'request.method === "OPTIONS"',
    'request.headers.get("Authorization")',
    "processImage(input)",
    ".storage.from(BUCKET)",
    "userClient.rpc(rpcName",
  ]) assert.ok(rejection >= 0 && rejection < source.indexOf(marker), `${marker} must follow the origin gate`);
});
test("uses no wildcard or fuzzy GitHub origin matching", () => {
  assert.equal(allowedOrigins.has("*"), false);
  assert.doesNotMatch(source, /(?:endsWith|includes)\(["']github\.io/);
});
