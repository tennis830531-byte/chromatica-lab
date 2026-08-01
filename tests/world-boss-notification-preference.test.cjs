const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function createNotificationHarness({ worldBossEnabled = true, disableDuringChannel = false } = {}) {
  const listeners = new Map();
  const localNotifications = [];
  const toasts = [];
  const storage = new Map([
    ["chromatica.settings.worldBossNotifications", worldBossEnabled ? "true" : "false"],
  ]);
  const elements = new Map([
    ["#leaderboardWeeklyResultToggle", { checked: true, addEventListener() {} }],
    ["#leaderboardMovementToggle", { checked: true, addEventListener() {} }],
    ["#worldBossNotificationToggle", { checked: true, addEventListener() {} }],
    ["#leaderboardPushStatus", { textContent: "", dataset: {} }],
  ]);
  const window = {
    document: { visibilityState: "visible", addEventListener() {} },
    Capacitor: { Plugins: { LocalNotifications: {
      createChannel: async () => {
        if (disableDuringChannel) storage.set("chromatica.settings.worldBossNotifications", "false");
      },
      schedule: async ({ notifications }) => localNotifications.push(...notifications),
    } } },
    ChromaticaNativePushConfig: { firebaseReady: true },
    chromaticaApp: {
      showNonBlockingToast: (message) => toasts.push(message),
      openHomeFromPushNotification() {},
    },
    chromaticaAuth: {
      isNativeAndroid: () => true,
      getLeaderboardAccount: () => ({ id: "account-a" }),
      leaderboardRpc: async () => ({ data: true, error: null }),
      pushNotifications: {
        addListener: async (name, callback) => listeners.set(name, callback),
        checkPermissions: async () => ({ receive: "denied" }),
      },
    },
    addEventListener() {},
  };
  vm.runInNewContext(read("push-notifications.js"), {
    window,
    globalThis: window,
    document: { querySelector: (selector) => elements.get(selector) || null },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
    },
    setTimeout,
    clearTimeout,
    console,
  });
  return { window, listeners, localNotifications, toasts };
}

test("settings exposes an independent World Boss notification preference", () => {
  const html = read("index.html");
  const client = read("push-notifications.js");
  assert.match(html, /id="worldBossNotificationToggle"[^>]*checked/);
  assert.match(html, /世界 Boss 提醒通知/);
  assert.match(client, /chromatica\.settings\.worldBossNotifications/);
  assert.match(client, /get_world_boss_push_preference/);
  assert.match(client, /set_world_boss_push_preference/);
});

test("forward migration stores the preference without changing legacy RPC signatures", () => {
  const sql = read("supabase/migrations/202608010002_add_world_boss_notification_preference.sql");
  assert.match(sql, /add column if not exists world_boss_notifications boolean not null default true/i);
  assert.match(sql, /function public\.get_world_boss_push_preference\(\)/i);
  assert.match(sql, /function public\.set_world_boss_push_preference\(p_enabled boolean\)/i);
  assert.match(sql, /auth\.uid\(\)/i);
  assert.doesNotMatch(sql, /\)\s+current_user\b/i);
  assert.match(sql, /grant execute on function public\.get_world_boss_push_preference\(\) to authenticated/i);
  assert.match(sql, /grant execute on function public\.set_world_boss_push_preference\(boolean\) to authenticated/i);
  assert.doesNotMatch(sql, /create or replace function public\.get_leaderboard_push_preferences/i);
  assert.doesNotMatch(sql, /create or replace function public\.set_leaderboard_push_preferences/i);
});

test("World Boss dispatcher skips disabled preferences before reading device tokens", () => {
  const source = read("supabase/functions/process-world-boss-notifications/index.ts");
  const preferenceAt = source.indexOf('.select("world_boss_notifications")');
  const tokenAt = source.indexOf('.select("id,token")');
  assert.ok(preferenceAt >= 0);
  assert.ok(tokenAt > preferenceAt);
  assert.match(source, /preference-disabled/);
  assert.match(source, /status: "skipped"/);
});

test("auth RPC allowlist permits only the two explicit preference calls", () => {
  const source = read("auth-entry.js");
  assert.match(source, /"get_world_boss_push_preference"/);
  assert.match(source, /"set_world_boss_push_preference"/);
});

test("device-side preference gates residual foreground World Boss FCM without affecting ranking notices", async () => {
  const enabled = createNotificationHarness({ worldBossEnabled: true });
  enabled.window.ChromaticaPushNotifications.init();
  await flush();
  enabled.listeners.get("pushNotificationReceived")({
    title: "世界 Boss 出現！",
    body: "世界 Boss 已現身",
    data: { notification_type: "boss_appeared", notification_id: "enabled-boss", event_id: "event-1" },
  });
  await flush();
  assert.equal(enabled.localNotifications.length, 1);

  const disabled = createNotificationHarness({ worldBossEnabled: false });
  disabled.window.ChromaticaPushNotifications.init();
  await flush();
  disabled.listeners.get("pushNotificationReceived")({
    data: { notification_type: "boss_appeared", notification_id: "disabled-boss", event_id: "event-2" },
  });
  disabled.listeners.get("pushNotificationReceived")({
    data: { notification_type: "entered_top_ten", notification_id: "ranking-1", rank: 8 },
  });
  await flush();
  assert.equal(disabled.localNotifications.length, 0);
  assert.deepEqual(disabled.toasts, ["恭喜進入本週前十名，目前第8名！"]);

  const raced = createNotificationHarness({ worldBossEnabled: true, disableDuringChannel: true });
  raced.window.ChromaticaPushNotifications.init();
  await flush();
  raced.listeners.get("pushNotificationReceived")({
    data: { notification_type: "boss_appeared", notification_id: "raced-boss", event_id: "event-3" },
  });
  await flush();
  assert.equal(raced.localNotifications.length, 0);
});

test("QA background notification uses the same preference gate", async () => {
  const enabled = createNotificationHarness({ worldBossEnabled: true });
  const enabledResult = await enabled.window.ChromaticaPushNotifications.showQaWorldBossNotification("boss_defeated");
  assert.equal(enabledResult, true);
  assert.equal(enabled.localNotifications.length, 1);
  assert.equal(Object.prototype.toString.call(enabled.localNotifications[0].schedule?.at), "[object Date]");
  assert.equal(enabled.localNotifications[0].extra.qa, true);

  const disabled = createNotificationHarness({ worldBossEnabled: false });
  const disabledResult = await disabled.window.ChromaticaPushNotifications.showQaWorldBossNotification("boss_defeated");
  assert.equal(disabledResult, false);
  assert.equal(disabled.localNotifications.length, 0);
});

test("formal and QA in-app World Boss notices are gated before becoming visible", () => {
  const source = read("world-boss.js");
  const formal = source.slice(source.indexOf("async function showNextNotification"), source.indexOf("function showQaNotification"));
  const qa = source.slice(source.indexOf("function showQaNotification"), source.indexOf("async function closeTopNotice"));
  assert.match(formal, /ChromaticaPushNotifications\?\.worldBossEnabled\?\.\(\) === false[\s\S]*worldBossTopNotice[\s\S]*classList\.add\("hidden"\)[\s\S]*return/);
  assert.ok(formal.lastIndexOf("worldBossEnabled") > formal.indexOf("await rpc"));
  assert.match(qa, /ChromaticaPushNotifications\?\.worldBossEnabled\?\.\(\) === false/);
  assert.match(qa, /classList\.add\("hidden"\)/);
  assert.match(qa, /showNonBlockingToast\?\.\("世界 Boss 提醒通知目前已關閉"\)/);
  assert.ok(qa.indexOf("worldBossEnabled") < qa.indexOf("classList.remove"));
  const client = read("push-notifications.js");
  assert.match(client, /preference === PREFERENCES\.worldBoss && !worldBossEnabled\(\)[\s\S]*worldBossTopNotice[\s\S]*classList\.add\("hidden"\)/);
});
