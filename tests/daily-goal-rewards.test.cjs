const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const { createController, createRewardKey } = require("../daily-goal-rewards.js");

function harness() {
  const waterByAccount = new Map();
  const markersByAccountDate = new Map();
  let flushes = 0;
  let syncs = 0;
  const controller = createController();
  const claim = ({
    userId = "account-a",
    date = "2026-07-19",
    taskIds = ["steady"],
    source = "formal-practice",
    sync = () => { syncs += 1; },
  } = {}) => {
    const markerKey = `${userId}:${date}`;
    return controller.claim({
      userId,
      date,
      newlyCompletedTaskIds: taskIds,
      rewardedTaskIds: markersByAccountDate.get(markerKey) || [],
      waterBefore: waterByAccount.get(userId) || 0,
      amountPerTask: 5,
      source,
      commit({ rewardedTaskIds, waterAfter }) {
        markersByAccountDate.set(markerKey, rewardedTaskIds);
        waterByAccount.set(userId, waterAfter);
      },
      flush() { flushes += 1; },
      sync,
    });
  };
  return {
    claim,
    controller,
    waterByAccount,
    markersByAccountDate,
    counts: () => ({ flushes, syncs }),
  };
}

test("each daily task grants five drops only on first completion", () => {
  const h = harness();
  assert.equal(h.claim().amount, 5);
  assert.equal(h.claim().amount, 0);
  assert.equal(h.waterByAccount.get("account-a"), 5);
  assert.deepEqual(h.counts(), { flushes: 1, syncs: 1 });
});

test("different tasks each grant five drops and seven tasks cap at thirty-five", () => {
  const h = harness();
  const ids = ["a", "b", "c", "d", "e", "f", "g"];
  ids.forEach((taskId) => assert.equal(h.claim({ taskIds: [taskId] }).amount, 5));
  assert.equal(h.waterByAccount.get("account-a"), 35);
  assert.equal(h.claim({ taskIds: ids }).amount, 0);
});

test("same account and date share markers across quick and formal entry", () => {
  const h = harness();
  assert.equal(h.claim({ source: "quick-practice" }).granted, true);
  assert.equal(h.claim({ source: "formal-practice" }).granted, false);
  assert.equal(h.waterByAccount.get("account-a"), 5);
});

test("different accounts and the next date claim independently", () => {
  const h = harness();
  assert.equal(h.claim({ userId: "account-a", date: "2026-07-19" }).amount, 5);
  assert.equal(h.claim({ userId: "account-b", date: "2026-07-19" }).amount, 5);
  assert.equal(h.claim({ userId: "account-a", date: "2026-07-20" }).amount, 5);
  assert.equal(h.waterByAccount.get("account-a"), 10);
  assert.equal(h.waterByAccount.get("account-b"), 5);
  assert.notEqual(
    createRewardKey({ userId: "account-a", date: "2026-07-19", taskId: "steady" }),
    createRewardKey({ userId: "account-b", date: "2026-07-19", taskId: "steady" }),
  );
});

test("remote apply cannot replay a session claim even if it carries a stale marker", () => {
  const h = harness();
  h.claim();
  h.markersByAccountDate.set("account-a:2026-07-19", []);
  for (let index = 0; index < 10; index += 1) assert.equal(h.claim().granted, false);
  assert.equal(h.waterByAccount.get("account-a"), 5);
});

test("reload uses the persisted marker and does not replay a claim", () => {
  const h = harness();
  h.claim();
  const reloaded = createController();
  const result = reloaded.claim({
    userId: "account-a",
    date: "2026-07-19",
    newlyCompletedTaskIds: ["steady"],
    rewardedTaskIds: h.markersByAccountDate.get("account-a:2026-07-19"),
    waterBefore: h.waterByAccount.get("account-a"),
    amountPerTask: 5,
  });
  assert.equal(result.granted, false);
});

test("offline or failed cloud sync keeps the local marker authoritative", async () => {
  const h = harness();
  assert.equal(h.claim({ sync: () => Promise.reject(new Error("offline")) }).amount, 5);
  await Promise.resolve();
  assert.equal(h.claim().amount, 0);
  assert.deepEqual(h.markersByAccountDate.get("account-a:2026-07-19"), ["steady"]);
});

test("per-task rewards remain separate from the all-goals twenty-drop bonus", () => {
  const app = fs.readFileSync(require.resolve("../app.js"), "utf8");
  assert.match(app, /DAILY_GOAL_ITEM_WATER_BONUS = 5/);
  assert.match(app, /DAILY_TASK_WATER_BONUS = 20/);
  assert.match(app, /DAILY_GOAL_REWARDED_TASKS_KEY = "rewardedTaskIds"/);
  assert.match(app, /dailyGoalRewardController\.claim/);
  assert.match(app, /flushSave\?\.\(\)/);
  assert.match(app, /syncBestEffort\?\.\(\)/);
});

test("reward diagnostics hash account identity and exclude private data", () => {
  const h = harness();
  h.claim({ userId: "private-user-id" });
  const serialized = JSON.stringify(h.controller.getDiagnostics());
  assert.doesNotMatch(serialized, /private-user-id|email|token|snapshot/i);
  assert.match(serialized, /userHash/);
});
