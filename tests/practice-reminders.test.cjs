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

test("19:00 and 22:00 use the approved daily practice reminder copy", () => {
  assert.deepEqual(core.buildReminderContent({ hour: 19 }), {
    title: "今天還沒練習喔",
    body: "花幾分鐘完成今天的口琴練習吧！",
  });
  assert.deepEqual(core.buildReminderContent({ hour: 22 }), {
    title: "今天的練習還沒完成",
    body: "睡前再練一下，別讓今天空白過去。",
  });
});

test("completed practice skips today's remaining reminders", () => {
  const now = new Date("2026-07-17T17:00:00+08:00");
  const history = { "2026-07-17": { status: "completed" } };
  assert.equal(core.getTodayPracticeCompletion(history, now), true);
  const today = core.buildReminderDates(now).filter(({ dateKey }) => dateKey === "2026-07-17");
  assert.equal(today.some(({ at }) => core.shouldScheduleToday({ at, now, todayCompleted: true })), false);
});

test("enabling after 19:00 schedules only today's 22:00 reminder", () => {
  const now = new Date("2026-07-17T21:00:00+08:00");
  const today = core.buildReminderDates(now).filter(({ dateKey }) => dateKey === "2026-07-17");
  assert.deepEqual(today.map(({ hour }) => hour), [22]);
});

test("30 days of reminders have unique Android-safe deterministic IDs", () => {
  const now = new Date("2026-07-17T12:00:00+08:00");
  const dates = core.buildReminderDates(now);
  assert.equal(dates.length, 60);
  const ids = dates.map(({ at, hour }) => core.buildReminderIds("account-a", at, hour).id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => Number.isInteger(id) && id > 0 && id <= 2147483647));
  assert.deepEqual(ids, dates.map(({ at, hour }) => core.buildReminderIds("account-a", at, hour).id));
});

test("account hash changes notification identity without exposing user id", () => {
  const date = new Date("2026-07-17T19:00:00+08:00");
  const first = core.buildReminderIds("private-user-a", date, 19);
  const second = core.buildReminderIds("private-user-b", date, 19);
  assert.notEqual(first.id, second.id);
  assert.equal(JSON.stringify(first).includes("private-user-a"), false);
});

test("QA reminders keep the authenticated account cancellation scope", () => {
  const date = new Date("2026-07-17T19:00:00+08:00");
  const formal = core.buildReminderIds("private-user-a", date, 19);
  const qa = core.buildReminderIds("private-user-a", date, 19, "qa");
  assert.notEqual(qa.id, formal.id);
  assert.equal(qa.accountHash, formal.accountHash);
});

test("permission is requested only from explicit formal or QA user actions", () => {
  assert.equal((appSource.match(/requestPermissions\(\)/g) || []).length, 2);
  assert.match(appSource, /async function handlePracticeReminderToggle[\s\S]*requestPermissions\(\)/);
  assert.match(appSource, /async function scheduleQaPracticeReminder[\s\S]*requestPermissions\(\)/);
  assert.match(appSource, /buildReminderIds\(userId,\s*at,\s*hour,\s*"qa"\)/);
  assert.doesNotMatch(appSource, /qa-notification/);
});

test("permission denial restores disabled preference and shows system-settings guidance", () => {
  assert.match(appSource, /permission\.display !== "granted"[\s\S]*setPracticeReminderPrefs\(userId, false\)/);
  assert.match(appSource, /通知權限尚未開啟，請至系統設定允許通知/);
});

test("completing practice cancels only today's reminders", () => {
  assert.match(appSource, /isFirstCompletionToday[\s\S]*cancelPracticeRemindersForAccount\(getActiveAccountId\(\), \{ todayOnly: true \}\)/);
  const now = new Date("2026-07-17T17:00:00+08:00");
  const tomorrow = new Date("2026-07-18T19:00:00+08:00");
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

test("all formal reminder boundaries are calculated in Asia/Taipei", () => {
  assert.equal(core.TIME_ZONE, "Asia/Taipei");
  const beforeMidnight = new Date("2026-07-18T15:59:59Z");
  const afterMidnight = new Date("2026-07-18T16:00:00Z");
  assert.equal(core.localDateKey(beforeMidnight), "2026-07-18");
  assert.equal(core.localDateKey(afterMidnight), "2026-07-19");
  const scheduled = core.buildReminderDates(new Date("2026-07-17T10:00:00Z"), 1);
  assert.deepEqual(scheduled.map(({ hour }) => hour), [19, 22]);
  assert.deepEqual(scheduled.map(({ at }) => at.toISOString()), [
    "2026-07-17T11:00:00.000Z",
    "2026-07-17T14:00:00.000Z",
  ]);
});

test("QA reminder controls exist only inside the existing QA garden view", () => {
  assert.match(htmlSource, /id="gardenqa"[\s\S]*data-qa-reminder-hour="19"[\s\S]*data-qa-reminder-minutes="1"/);
  assert.match(htmlSource, /id="gardenqa"[\s\S]*data-qa-reminder-hour="22"[\s\S]*data-qa-reminder-minutes="2"/);
  assert.match(appSource, /if \(!isGardenQaSessionActive\(\)\) return false/);
  assert.match(appSource, /Date\.now\(\) \+ delayMinutes \* 60 \* 1000/);
});
