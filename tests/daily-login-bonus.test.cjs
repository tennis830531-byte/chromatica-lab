const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const { createController } = require("../daily-login-bonus.js");

function harness() {
  const state = new Map();
  let flushes = 0;
  let syncs = 0;
  let toasts = 0;
  const controller = createController();
  const claim = ({ userId = "A", date = "2026-07-19", sync = () => { syncs += 1; } } = {}) => {
    const current = state.get(userId) || { water: 0, marker: "" };
    const result = controller.claim({
      userId, date, markerDate: current.marker, waterBefore: current.water, amount: 5,
      reason: "authenticated-ready",
      commit({ date: claimedDate, waterAfter }) { state.set(userId, { water: waterAfter, marker: claimedDate }); },
      flush() { flushes += 1; }, sync,
    });
    if (result.toast && controller.markToastDisplayed(userId, date)) toasts += 1;
    return result;
  };
  return { state, controller, claim, counts: () => ({ flushes, syncs, toasts }) };
}

test("authenticated ready grants five drops, persists marker, flushes and toasts once", () => {
  const h = harness();
  assert.equal(h.claim().granted, true);
  assert.deepEqual(h.state.get("A"), { water: 5, marker: "2026-07-19" });
  assert.deepEqual(h.counts(), { flushes: 1, syncs: 1, toasts: 1 });
});

test("same-session rerenders and ten remote applies cannot replay claim or toast", () => {
  const h = harness();
  h.claim();
  h.state.set("A", { water: 0, marker: "" });
  for (let index = 0; index < 10; index += 1) assert.equal(h.claim().granted, false);
  assert.deepEqual(h.counts(), { flushes: 1, syncs: 1, toasts: 1 });
  assert.equal(h.controller.getDiagnostics().filter(({ event }) => event === "daily login claim granted").length, 1);
});

test("existing marker survives reload without a reward", () => {
  const h = harness();
  h.state.set("A", { water: 12, marker: "2026-07-19" });
  assert.equal(h.claim().granted, false);
  assert.deepEqual(h.state.get("A"), { water: 12, marker: "2026-07-19" });
  assert.equal(h.counts().toasts, 0);
});

test("next day and a different account each receive one independent claim", () => {
  const h = harness();
  h.claim({ userId: "A", date: "2026-07-19" });
  h.claim({ userId: "A", date: "2026-07-20" });
  h.claim({ userId: "B", date: "2026-07-19" });
  assert.deepEqual(h.state.get("A"), { water: 10, marker: "2026-07-20" });
  assert.deepEqual(h.state.get("B"), { water: 5, marker: "2026-07-19" });
  assert.equal(h.counts().toasts, 3);
});

test("offline or failed sync keeps local claim and never replays it", async () => {
  const h = harness();
  h.claim({ sync: () => Promise.reject(new Error("offline")) });
  await Promise.resolve();
  assert.deepEqual(h.state.get("A"), { water: 5, marker: "2026-07-19" });
  assert.equal(h.claim().granted, false);
  assert.equal(h.counts().toasts, 1);
});

test("render-only paths cannot claim and daily task bonus remains twenty", () => {
  const app = fs.readFileSync(require.resolve("../app.js"), "utf8");
  const render = app.match(/function renderAuthenticatedAccountWorkspace[\s\S]*?\n}/)?.[0] || "";
  assert.match(render, /if \(allowDailyLoginBonus\)/);
  assert.match(app, /DAILY_LOGIN_WATER_BONUS = 5/);
  assert.match(app, /DAILY_TASK_WATER_BONUS = 20/);
  for (const forbidden of ["renderGarden", "renderQuickPractice", "setView"]) {
    const body = app.match(new RegExp(`function ${forbidden}\\([^)]*\\) \\{[\\s\\S]*?\\n}`))?.[0] || "";
    assert.doesNotMatch(body, /awardDailyLoginBonusIfNeeded/);
  }
});

test("diagnostics contain hashes and never raw account identifiers", () => {
  const h = harness();
  h.claim({ userId: "private-user-id" });
  const serialized = JSON.stringify(h.controller.getDiagnostics());
  assert.doesNotMatch(serialized, /private-user-id/);
  assert.match(serialized, /userHash/);
});
