(function exposeDailyGoalRewardCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ChromaticaDailyGoalRewardCore = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function createDailyGoalRewardCore() {
  function shortHash(value) {
    let hash = 2166136261;
    for (const char of String(value || "")) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0").slice(0, 8);
  }

  function createRewardKey({ userId = "", date = "", taskId = "" } = {}) {
    return `${shortHash(userId)}:${date}:${taskId}`;
  }

  function normalizeTaskIds(taskIds) {
    return [...new Set((Array.isArray(taskIds) ? taskIds : []).filter((taskId) => (
      typeof taskId === "string" && taskId.length > 0 && taskId.length <= 80
    )))];
  }

  function createController({ logger = () => {} } = {}) {
    const sessionClaims = new Set();
    const diagnostics = [];
    const record = (event, details = {}) => {
      const entry = { event, ...details };
      diagnostics.push(entry);
      logger(entry);
      return entry;
    };

    function claim({
      userId = "",
      date = "",
      newlyCompletedTaskIds = [],
      rewardedTaskIds = [],
      waterBefore = 0,
      amountPerTask = 5,
      source = "formal-practice",
      commit = () => {},
      flush = () => {},
      sync = () => Promise.resolve(),
    } = {}) {
      const userHash = shortHash(userId);
      const completed = normalizeTaskIds(newlyCompletedTaskIds);
      const rewarded = new Set(normalizeTaskIds(rewardedTaskIds));
      const safeAmount = Math.max(0, Math.floor(Number(amountPerTask) || 0));
      const base = { userHash, date, source, completedCount: completed.length };
      record("daily goal reward checked", base);
      if (!userId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !safeAmount) {
        record("daily goal reward skipped", { ...base, reason: "invalid-context" });
        return { granted: false, amount: 0, awardedTaskIds: [], rewardedTaskIds: [...rewarded], reason: "invalid-context" };
      }
      const awardedTaskIds = completed.filter((taskId) => {
        const rewardKey = createRewardKey({ userId, date, taskId });
        return !rewarded.has(taskId) && !sessionClaims.has(rewardKey);
      });
      if (!awardedTaskIds.length) {
        record("daily goal reward skipped", { ...base, reason: "already-claimed" });
        return { granted: false, amount: 0, awardedTaskIds: [], rewardedTaskIds: [...rewarded], reason: "already-claimed" };
      }
      awardedTaskIds.forEach((taskId) => {
        rewarded.add(taskId);
      });
      const amount = awardedTaskIds.length * safeAmount;
      const waterAfter = Math.max(0, Math.floor(Number(waterBefore) || 0)) + amount;
      commit({ awardedTaskIds, rewardedTaskIds: [...rewarded], amount, waterAfter });
      flush();
      awardedTaskIds.forEach((taskId) => {
        sessionClaims.add(createRewardKey({ userId, date, taskId }));
      });
      record("daily goal reward committed", {
        ...base,
        awardedCount: awardedTaskIds.length,
        amount,
        waterAfter,
      });
      try {
        Promise.resolve(sync()).catch(() => {});
      } catch {
        // The local claim marker remains authoritative until cloud sync retries.
      }
      return { granted: true, amount, awardedTaskIds, rewardedTaskIds: [...rewarded], waterAfter };
    }

    return {
      claim,
      record(event, { userId = "", ...details } = {}) {
        return record(event, { userHash: shortHash(userId), ...details });
      },
      getDiagnostics: () => diagnostics.map((entry) => ({ ...entry })),
      hasSessionClaim({ userId, date, taskId }) {
        return sessionClaims.has(createRewardKey({ userId, date, taskId }));
      },
    };
  }

  return { createController, createRewardKey, normalizeTaskIds, shortHash };
}));
