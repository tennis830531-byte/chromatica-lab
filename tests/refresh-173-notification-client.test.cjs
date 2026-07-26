const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const pushSource = fs.readFileSync(path.join(root, "push-notifications.js"), "utf8");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
const activitySource = fs.readFileSync(
  path.join(root, "android/app/src/main/java/com/yrpeng/chromaticalab/MainActivity.java"),
  "utf8",
);
const manifestSource = fs.readFileSync(
  path.join(root, "android/app/src/main/AndroidManifest.xml"),
  "utf8",
);

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function createPushHarness() {
  const listeners = new Map();
  const rpcCalls = [];
  const pluginCalls = [];
  const homeOpenCalls = [];
  const storage = new Map();
  const elements = new Map([
    ["#leaderboardWeeklyResultToggle", { checked: true, addEventListener() {} }],
    ["#leaderboardMovementToggle", { checked: true, addEventListener() {} }],
    ["#leaderboardPushStatus", { textContent: "", dataset: {} }],
  ]);
  const user = { id: "account-a" };
  const window = {
    ChromaticaNativePushConfig: { firebaseReady: true },
    chromaticaApp: {
      openHomeFromPushNotification: () => homeOpenCalls.push("home"),
    },
    addEventListener() {},
    dispatchEvent() {},
    chromaticaAuth: {
      isNativeAndroid: () => true,
      getLeaderboardAccount: () => user,
      leaderboardRpc: async (name, args, options) => {
        rpcCalls.push({ name, args, options });
        return { data: true, error: null };
      },
      pushNotifications: {
        checkPermissions: async () => ({ receive: "granted" }),
        requestPermissions: async () => ({ receive: "granted" }),
        createChannel: async () => pluginCalls.push("channel"),
        register: async () => pluginCalls.push("register"),
        addListener: async (name, callback) => {
          listeners.set(name, callback);
          return { remove() {} };
        },
      },
    },
  };
  const context = {
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
  };
  vm.runInNewContext(pushSource, context);
  return { window, user, listeners, rpcCalls, pluginCalls, homeOpenCalls };
}

test("login registration and token refresh use the existing RPC with runtime deduplication", async () => {
  const harness = createPushHarness();
  harness.window.ChromaticaPushNotifications.init();
  harness.window.ChromaticaPushNotifications.setAuthenticatedAccount("account-a");
  await flush();
  assert.equal(harness.pluginCalls.filter((name) => name === "register").length, 1);

  const firstToken = { value: "token-value-long-enough-for-registration-a" };
  harness.listeners.get("registration")(firstToken);
  harness.listeners.get("registration")(firstToken);
  await flush();
  let registrations = harness.rpcCalls.filter(({ name }) => name === "register_leaderboard_push_token");
  assert.equal(registrations.length, 1);
  assert.equal(registrations[0].options.expectedUserId, "account-a");
  harness.window.ChromaticaPushNotifications.setMembership(true);
  await flush();
  assert.equal(harness.pluginCalls.filter((name) => name === "register").length, 1);

  harness.listeners.get("registration")({ value: "token-value-long-enough-for-registration-b" });
  await flush();
  registrations = harness.rpcCalls.filter(({ name }) => name === "register_leaderboard_push_token");
  assert.equal(registrations.length, 2);
});

test("logout disables the current token and ignores stale registration callbacks", async () => {
  const harness = createPushHarness();
  harness.window.ChromaticaPushNotifications.init();
  harness.window.ChromaticaPushNotifications.setAuthenticatedAccount("account-a");
  await flush();
  harness.listeners.get("registration")({ value: "token-value-long-enough-for-registration-a" });
  await flush();
  await harness.window.ChromaticaPushNotifications.unregisterForSignOut();
  harness.listeners.get("registration")({ value: "token-value-long-enough-for-registration-b" });
  await flush();
  assert.equal(
    harness.rpcCalls.filter(({ name }) => name === "disable_leaderboard_push_token").length,
    1,
  );
  assert.equal(
    harness.rpcCalls.filter(({ name }) => name === "register_leaderboard_push_token").length,
    1,
  );
});

test("push setup is published from native Firebase state without exposing configuration values", () => {
  assert.match(activitySource, /getIdentifier\("google_app_id", "string", getPackageName\(\)\)/);
  assert.match(activitySource, /firebaseReady = googleAppIdResource != 0/);
  assert.match(activitySource, /ChromaticaNativePushConfig=Object\.freeze\(\{firebaseReady:/);
  assert.match(activitySource, /chromatica:native-push-config-ready/);
  assert.doesNotMatch(activitySource, /getString\(googleAppIdResource\)|api[_-]?key|service[_-]?account/i);
});

test("notification permission remains behind explicit user actions and missing Firebase is safe", () => {
  assert.match(appSource, /async function handlePracticeReminderToggle[\s\S]*plugin\.requestPermissions\(\)/);
  assert.match(pushSource, /async function requestPermissionFromUserGesture[\s\S]*requestPermissions\(\)/);
  assert.match(pushSource, /if \(!nativePushConfigured\(\)\) return reportUnavailablePushSetup\(\)/);
  assert.doesNotMatch(pushSource, /console\.(?:log|info|debug)\([^)]*token/i);
});

test("daily reminder completion, disabling, account switching, and deep link remain wired", () => {
  assert.match(appSource, /isFirstCompletionToday[\s\S]*cancelPracticeRemindersForAccount\(getActiveAccountId\(\), \{ todayOnly: true \}\)/);
  assert.match(appSource, /if \(!requestedEnabled\)[\s\S]*cancelPracticeRemindersForAccount\(userId\)/);
  assert.match(appSource, /async cancelPracticeRemindersForAccount\(userId\)/);
  assert.match(appSource, /localNotificationActionPerformed[\s\S]*setView\("practicehub"\)/);
});

test("FCM click action resolves to the single app task in background and task-removed states", () => {
  assert.match(manifestSource, /android:launchMode="singleTask"/);
  assert.match(
    manifestSource,
    /<intent-filter>\s*<action android:name="OPEN_WEEKLY_LEADERBOARD"\s*\/>\s*<category android:name="android\.intent\.category\.DEFAULT"\s*\/>\s*<\/intent-filter>/,
  );
  assert.match(activitySource, /protected void onNewIntent\(Intent intent\)\s*\{\s*setIntent\(intent\);\s*super\.onNewIntent\(intent\);\s*\}/);
});

test("notification taps route once to home while foreground delivery does not navigate", async () => {
  const harness = createPushHarness();
  harness.window.ChromaticaPushNotifications.init();
  await flush();

  harness.listeners.get("pushNotificationActionPerformed")({
    notification: { data: {} },
  });
  assert.equal(harness.homeOpenCalls.length, 1, "missing route data safely opens home");

  harness.listeners.get("pushNotificationReceived")({
    data: { notification_type: "weekly_top_ten_result" },
  });
  assert.equal(harness.homeOpenCalls.length, 1, "foreground receipt must not perform navigation");
});

test("home routing waits for authenticated workspace and then returns to intro", () => {
  assert.match(
    appSource,
    /openHomeFromPushNotification\(\)[\s\S]*auth-authenticated[\s\S]*workspaceStatus === "ready"[\s\S]*completeMicGate\(\);\s*setView\("intro", \{ reason: "push-notification-open" \}\)/,
  );
  assert.match(
    appSource,
    /pendingPushNotificationHomeNavigation[\s\S]*pendingPushNotificationHomeNavigation = false;\s*completeMicGate\(\);\s*setView\("intro"\)/,
  );
});
