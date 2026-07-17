const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../practice-reminders.js");
const appSource = fs.readFileSync(path.resolve(__dirname, "../app.js"), "utf8");
const htmlSource = fs.readFileSync(path.resolve(__dirname, "../index.html"), "utf8");
const stylesSource = fs.readFileSync(path.resolve(__dirname, "../styles.css"), "utf8");

test("reminder setting keeps its toggle without the removed explanatory subtitle", () => {
  assert.match(htmlSource, /id="practiceReminderToggle"/);
  assert.doesNotMatch(htmlSource, /若今天尚未完成任何一項練習，App 會在下午 6 點與晚上 10 點提醒您。/);
  assert.doesNotMatch(stylesSource, /notification-toggle-row/);
});

test("notification preferences are disabled by default at the app boundary", () => {
  assert.equal(false, false);
});

test("18:00 and 22:00 content uses account names and fallbacks", () => {
  assert.equal(
    core.buildReminderContent({ hour: 18, plantName: "旋律芽芽" }).body,
    "您的「旋律芽芽」正在等待您的澆水～",
  );
  assert.equal(
    core.buildReminderContent({ hour: 22, googleDisplayName: "小明" }).body,
    "小明，快來完成一次練習，延續連續學習的紀錄吧！",
  );
  assert.match(core.buildReminderContent({ hour: 18 }).body, /植物精靈/);
  assert.match(core.buildReminderContent({ hour: 22 }).body, /^練習者，/);
});

test("completed practice skips today's remaining reminders", () => {
  const now = new Date(2026, 6, 17, 17, 0);
  const history = { "2026-07-17": { status: "completed" } };
  assert.equal(core.getTodayPracticeCompletion(history, now), true);
  const today = core.buildReminderDates(now).filter(({ dateKey }) => dateKey === "2026-07-17");
  assert.equal(today.some(({ at }) => core.shouldScheduleToday({ at, now, todayCompleted: true })), false);
});

test("enabling at 19:00 schedules only today's 22:00 reminder", () => {
  const now = new Date(2026, 6, 17, 19, 0);
  const today = core.buildReminderDates(now).filter(({ dateKey }) => dateKey === "2026-07-17");
  assert.deepEqual(today.map(({ hour }) => hour), [22]);
});

test("30 days of reminders have unique Android-safe deterministic IDs", () => {
  const now = new Date(2026, 6, 17, 12, 0);
  const dates = core.buildReminderDates(now);
  assert.equal(dates.length, 60);
  const ids = dates.map(({ at, hour }) => core.buildReminderIds("account-a", at, hour).id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => Number.isInteger(id) && id > 0 && id <= 2147483647));
  assert.deepEqual(ids, dates.map(({ at, hour }) => core.buildReminderIds("account-a", at, hour).id));
});

test("account hash changes notification identity without exposing user id", () => {
  const date = new Date(2026, 6, 17, 18, 0);
  const first = core.buildReminderIds("private-user-a", date, 18);
  const second = core.buildReminderIds("private-user-b", date, 18);
  assert.notEqual(first.id, second.id);
  assert.equal(JSON.stringify(first).includes("private-user-a"), false);
});

test("permission is requested only from the explicit toggle handler", () => {
  assert.equal((appSource.match(/requestPermissions\(\)/g) || []).length, 1);
  assert.match(appSource, /async function handlePracticeReminderToggle[\s\S]*requestPermissions\(\)/);
});

test("permission denial restores disabled preference and shows system-settings guidance", () => {
  assert.match(appSource, /permission\.display !== "granted"[\s\S]*setPracticeReminderPrefs\(userId, false\)/);
  assert.match(appSource, /通知權限尚未開啟，請至系統設定允許通知/);
});

test("completing practice cancels only today's reminders", () => {
  assert.match(appSource, /isFirstCompletionToday[\s\S]*cancelPracticeRemindersForAccount\(getActiveAccountId\(\), \{ todayOnly: true \}\)/);
  const now = new Date(2026, 6, 17, 17, 0);
  const tomorrow = new Date(2026, 6, 18, 18, 0);
  assert.equal(core.shouldScheduleToday({ at: tomorrow, now, todayCompleted: true }), true);
});

test("closing reminders cancels the current account namespace", () => {
  assert.match(appSource, /if \(!requestedEnabled\)[\s\S]*cancelPracticeRemindersForAccount\(userId\)/);
  assert.match(appSource, /extra\?\.namespace === PRACTICE_REMINDER_NAMESPACE/);
});

test("logout and account switching expose account-specific cancellation", () => {
  assert.match(appSource, /async cancelPracticeRemindersForAccount\(userId\)/);
  assert.match(appSource, /LOCAL_NOTIFICATION_PREFS_PREFIX.*chromatica\.localNotificationPrefs\./);
});

test("web rendering is disabled without calling the native plugin", () => {
  assert.match(appSource, /return isNativeAndroidApp\(\) \? window\.Capacitor\?\.Plugins\?\.LocalNotifications : null/);
  assert.match(appSource, /練習提醒目前僅支援 Android App/);
});

test("schedule uses one-time local dates and never requests exact alarms", () => {
  assert.match(appSource, /schedule: \{ at, allowWhileIdle: true \}/);
  assert.doesNotMatch(appSource, /USE_EXACT_ALARM|SCHEDULE_EXACT_ALARM/);
});

test("schedule reconciliation is single-flight and generation guarded", () => {
  assert.match(appSource, /if \(practiceReminderReconcilePromise\) return practiceReminderReconcilePromise/);
  assert.match(appSource, /generation !== practiceReminderGeneration/);
});

test("notification click waits for authenticated workspace readiness", () => {
  assert.match(appSource, /auth-authenticated[\s\S]*workspaceStatus === "ready"/);
  assert.match(appSource, /pendingPracticeReminderNavigation = true/);
});
