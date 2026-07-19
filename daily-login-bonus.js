(function exposeDailyLoginBonusCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ChromaticaDailyLoginBonusCore = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function createDailyLoginBonusCore() {
  function shortHash(value) {
    let hash = 2166136261;
    for (const char of String(value || "")) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0").slice(0, 8);
  }

  function createController({ logger = () => {} } = {}) {
    const attempts = new Map();
    const diagnostics = [];
    const record = (event, details = {}) => {
      const entry = { event, ...details };
      diagnostics.push(entry);
      logger(entry);
      return entry;
    };
    const keyFor = (userId, date) => `${userId}:${date}`;

    function claim({ userId, date, markerDate = "", waterBefore = 0, amount, commit, flush, sync, reason = "" }) {
      const key = keyFor(userId, date);
      const userHash = shortHash(userId);
      const base = { userHash, date, markerExists: Boolean(markerDate), markerDate, waterBefore, initializationReason: reason };
      record("daily login claim checked", base);
      if (attempts.has(key)) {
        record("daily login claim skipped", { ...base, cancellationReason: "session-attempt-exists" });
        return { granted: false, toast: false, reason: "session-attempt-exists" };
      }
      const attempt = { attempted: true, completed: false, toastDisplayed: false };
      attempts.set(key, attempt);
      if (markerDate === date) {
        record("daily login claim skipped", { ...base, cancellationReason: "already-claimed" });
        return { granted: false, toast: false, reason: "already-claimed" };
      }
      const waterAfter = waterBefore + amount;
      commit({ date, waterAfter });
      attempt.completed = true;
      flush();
      record("account snapshot flushed", { ...base, waterAfter });
      try {
        Promise.resolve(sync()).catch(() => {});
      } catch {
        // The local claim remains authoritative and dirty until a later retry.
      }
      record("daily login claim granted", { ...base, waterAfter });
      return { granted: true, toast: true, amount, waterAfter };
    }

    function markToastDisplayed(userId, date) {
      const attempt = attempts.get(keyFor(userId, date));
      if (!attempt?.completed || attempt.toastDisplayed) return false;
      attempt.toastDisplayed = true;
      record("daily login toast displayed", { userHash: shortHash(userId), date, toastDisplayed: true });
      return true;
    }

    return {
      claim,
      markToastDisplayed,
      record(event, { userId = "", ...details } = {}) {
        return record(event, { userHash: shortHash(userId), ...details });
      },
      getDiagnostics: () => diagnostics.map((entry) => ({ ...entry })),
      getAttempt: (userId, date) => ({ ...(attempts.get(keyFor(userId, date)) || {}) }),
    };
  }

  return { createController, shortHash };
}));
