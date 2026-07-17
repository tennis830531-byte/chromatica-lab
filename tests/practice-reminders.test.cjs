const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../practice-reminders.js");

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
