const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "leaderboard-core.js"), "utf8");
const context = { Date, Number, Set };
vm.createContext(context);
vm.runInContext(source, context);
const core = context.ChromaticaLeaderboardCore;

test("leaderboard cache is fresh for at most ten minutes", () => {
  assert.equal(core.CACHE_TTL_MS, 10 * 60 * 1000);
  assert.equal(core.isCacheFresh({ savedAt: 1_000, rows: [] }, 1_000 + core.CACHE_TTL_MS - 1), true);
  assert.equal(core.isCacheFresh({ savedAt: 1_000, rows: [] }, 1_000 + core.CACHE_TTL_MS), false);
});

test("leaderboard rows normalize public fields and preserve top fifteen plus self", () => {
  const rows = Array.from({ length: 15 }, (_, index) => ({
    position: index + 1,
    user_id: `user-${index + 1}`,
    display_name: `玩家 ${index + 1}`,
    score: 100 - index,
  }));
  rows.push({ position: 42, user_id: "self", display_name: "自己的超長名字", score: 7, is_current_user: true });
  const normalized = core.normalizeLeaderboardRows(rows, "practice");
  assert.equal(normalized.length, 16);
  assert.equal(normalized.at(-1).position, 42);
  assert.equal(normalized.at(-1).isCurrentUser, true);
  assert.equal(core.shouldInsertSelfSeparator(normalized), true);
});

test("streak metric and scores cannot be negative", () => {
  const row = core.normalizeLeaderboardRow({ position: 2, user_id: "u", score: -8 }, "streak");
  assert.equal(row.metric, "streak");
  assert.equal(row.score, 0);
});

test("display names are trimmed bounded and reject control characters", () => {
  assert.equal(core.normalizeDisplayName("  小明  "), "小明");
  assert.equal(Array.from(core.normalizeDisplayName("精".repeat(40))).length, 20);
  assert.equal(core.isValidDisplayName("小明"), true);
  assert.equal(core.isValidDisplayName("A"), false);
  assert.equal(core.isValidDisplayName("小\u0000明"), false);
});

test("practice events clamp cycles and retain only canonical local streak evidence", () => {
  const event = core.normalizePracticeEvent({
    eventId: "event-1",
    completedCycles: 99,
    practiceDate: "2026-07-21",
    protectedDates: ["2026-07-21", "2026-07-20", "invalid", "2026-07-20"],
    currentStreak: 8,
    userId: "private",
  });
  assert.equal(event.completedCycles, 8);
  assert.equal(event.practiceDate, "2026-07-21");
  assert.deepEqual(Array.from(event.protectedDates), ["2026-07-21", "2026-07-20"]);
  assert.deepEqual(Object.keys(event).sort(), ["completedCycles", "createdAt", "eventId", "practiceDate", "protectedDates"]);
});
