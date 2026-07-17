(function initPracticeReminderCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ChromaticaPracticeReminderCore = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function createPracticeReminderCore() {
  const DAYS_TO_SCHEDULE = 30;
  const SLOTS = [20, 22];
  const ID_BASE = 310000000;
  const ID_RANGE = 900000000;

  function localDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function shortAccountHash(userId) {
    let hash = 2166136261;
    for (const character of String(userId || "")) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36).slice(0, 7);
  }

  function stableId(value) {
    let hash = 0;
    for (const character of value) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) | 0;
    return ID_BASE + ((hash >>> 0) % ID_RANGE);
  }

  function buildReminderIds(userId, date, hour) {
    const accountHash = shortAccountHash(userId);
    const dateKey = localDateKey(date);
    return {
      id: stableId(`practice-reminder|${accountHash}|${dateKey}|${hour}`),
      accountHash,
      dateKey,
      slot: String(hour),
    };
  }

  function buildReminderDates(now = new Date(), days = DAYS_TO_SCHEDULE) {
    const dates = [];
    for (let offset = 0; offset < days; offset += 1) {
      for (const hour of SLOTS) {
        const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, hour, 0, 0, 0);
        if (at > now) dates.push({ at, hour, dateKey: localDateKey(at) });
      }
    }
    return dates;
  }

  function buildReminderContent({ hour, googleDisplayName, plantName }) {
    if (Number(hour) === 20) {
      return {
        title: "半音階口琴練習室",
        body: `您的「${String(plantName || "植物精靈").trim() || "植物精靈"}」正在等待您的澆水～`,
      };
    }
    return {
      title: "半音階口琴練習室",
      body: `${String(googleDisplayName || "練習者").trim() || "練習者"}，快來完成一次練習，延續連續學習的紀錄吧！`,
    };
  }

  function getTodayPracticeCompletion(history, now = new Date()) {
    const entry = history?.[localDateKey(now)];
    return (typeof entry === "string" ? entry : entry?.status) === "completed";
  }

  function shouldScheduleToday({ at, now = new Date(), todayCompleted = false }) {
    return localDateKey(at) !== localDateKey(now) || (!todayCompleted && at > now);
  }

  return {
    DAYS_TO_SCHEDULE,
    SLOTS,
    localDateKey,
    shortAccountHash,
    buildReminderIds,
    buildReminderDates,
    buildReminderContent,
    getTodayPracticeCompletion,
    shouldScheduleToday,
  };
}));
