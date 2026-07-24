const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const image = fs.readFileSync(path.join(root, "supabase/functions/upload-announcement-image/index.ts"), "utf8");
const push = fs.readFileSync(path.join(root, "supabase/functions/process-leaderboard-notifications/index.ts"), "utf8");
const config = fs.readFileSync(path.join(root, "supabase/config.toml"), "utf8");
const pushClient = fs.readFileSync(path.join(root, "push-notifications.js"), "utf8");

test("announcement image function has exact origins and rejects them before auth or decode", () => {
  for (const origin of ["https://tennis830531-byte.github.io", "https://localhost", "http://localhost"]) assert.match(image, new RegExp(`"${origin.replaceAll(".", "\\.")}"`));
  assert.doesNotMatch(image, /ALLOWED_ORIGINS[\s\S]{0,400}["']\*["']|endsWith\([^)]*github\.io|includes\([^)]*github\.io/);
  const originGate = image.indexOf("!origin || !ALLOWED_ORIGINS.has(origin)");
  assert.ok(originGate >= 0 && originGate < image.indexOf('request.headers.get("Authorization")'));
  assert.ok(originGate < image.indexOf("processAnnouncementImage(bytes)"));
});

test("announcement image validates magic bytes, decode, pixels and safe WebP output", () => {
  assert.match(image, /INPUT_LIMIT = 5 \* 1024 \* 1024/);
  assert.match(image, /image\/jpeg[\s\S]*0xff[\s\S]*image\/png[\s\S]*0x89[\s\S]*image\/webp[\s\S]*RIFF[\s\S]*WEBP/);
  assert.match(image, /ImageMagick\.readCollection/);
  assert.match(image, /images\.length !== 1/);
  assert.match(image, /MAX_PIXELS = 36_000_000/);
  assert.match(image, /MAX_DIMENSION = 12_000/);
  assert.match(image, /image\.strip\(\)/);
  assert.match(image, /MagickFormat\.WebP/);
});

test("announcement image upload and deletion are admin-only with replacement compensation", () => {
  assert.match(image, /get_announcement_admin_status/);
  assert.match(image, /status\?\.is_admin !== true/);
  assert.match(image, /crypto\.randomUUID\(\)/);
  assert.match(image, /replace_announcement_images_service/);
  assert.match(image, /announcement-image-cleanup-failed/);
  assert.match(image, /p_image_paths: currentImages\.map/);
  assert.match(image, /request\.method === "DELETE"/);
  assert.match(image, /delete_announcement_service/);
  assert.ok(image.indexOf("storage.from(BUCKET).remove(paths)") < image.indexOf('admin.rpc("delete_announcement_service"'));
});

test("gateway and custom scheduler authentication are explicit", () => {
  assert.match(config, /\[functions\.upload-announcement-image\][\s\S]*verify_jwt = true/);
  assert.match(config, /\[functions\.process-leaderboard-notifications\][\s\S]*verify_jwt = false/);
  assert.match(push, /LEADERBOARD_NOTIFICATION_CRON_SECRET/);
  assert.match(push, /x-cron-secret/);
});

test("FCM uses only secret-provided service credentials and never embeds them", () => {
  assert.match(push, /FCM_SERVICE_ACCOUNT_JSON/);
  assert.match(push, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(push, /-----BEGIN PRIVATE KEY-----|AIza[0-9A-Za-z_-]{20,}/);
  assert.doesNotMatch(push, /console\.(?:log|info|warn|error)\([^\n]*(?:token|user_id)/i);
});

test("FCM invalid tokens stop while temporary errors retry finitely", () => {
  assert.match(push, /MAX_ATTEMPTS = 3/);
  assert.match(push, /UNREGISTERED/);
  assert.match(push, /outcome === "invalid"[\s\S]*is_active: false/);
  assert.match(push, /status === 408 \|\| status === 429 \|\| status >= 500/);
  assert.match(push, /attempts < MAX_ATTEMPTS/);
  assert.match(push, /Math\.min\(900, 30 \* \(2 \*\* Math\.max\(0, item\.attempts - 1\)\)\)/);
});

test("missing tokens skip delivery without failing accepted rankings", () => {
  assert.match(push, /no-active-token/);
  assert.match(push, /status: "skipped"/);
});

test("weekly and all top-ten movement notifications are deduplicated and deep-link safely", () => {
  assert.match(push, /weekly_top_ten_result/);
  assert.match(push, /entered_top_ten/);
  assert.match(push, /rank_improved/);
  assert.match(push, /dropped_out_of_top_ten/);
  assert.match(push, /preference-disabled/);
  assert.match(push, /onConflict: "week_start,user_id,notification_type,transition_sequence"/);
  assert.match(push, /click_action: "OPEN_WEEKLY_LEADERBOARD"/);
});

test("Android without Firebase config never calls the crash-prone native register path", async () => {
  let registrationCalls = 0;
  let permissionChecks = 0;
  const status = { textContent: "", dataset: {} };
  const toggles = {
    "#leaderboardWeeklyResultToggle": { checked: true, addEventListener() {} },
    "#leaderboardMovementToggle": { checked: true, addEventListener() {} },
  };
  const storage = new Map();
  const window = {
    document: { querySelector: (selector) => toggles[selector] || (selector === "#leaderboardPushStatus" ? status : null) },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
    },
    chromaticaAuth: {
      isNativeAndroid: () => true,
      leaderboardRpc: async (name) => name === "get_leaderboard_push_preferences"
        ? { data: [{ weekly_results: true, top_ten_changes: true }], error: null }
        : { data: true, error: null },
      pushNotifications: {
        checkPermissions: async () => { permissionChecks += 1; return { receive: "granted" }; },
        createChannel: async () => {},
        register: async () => { registrationCalls += 1; },
        addListener: async () => ({ remove() {} }),
      },
    },
  };
  window.window = window;
  window.globalThis = window;
  vm.runInNewContext(pushClient, window);
  window.ChromaticaPushNotifications.init();
  window.ChromaticaPushNotifications.setMembership(true);
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(window.ChromaticaPushNotifications.nativePushConfigured(), false);
  assert.equal(permissionChecks, 0);
  assert.equal(registrationCalls, 0);
  assert.equal(status.textContent, "推播服務尚未完成設定；排行榜仍可正常使用。");
});
