(function initPracticeReminderCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ChromaticaPracticeReminderCore = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function createPracticeReminderCore() {
  const DAYS_TO_SCHEDULE = 30;
  const TIME_ZONE = "Asia/Taipei";
  const UTC_OFFSET_HOURS = 8;
  const SLOTS = [19, 22];
  const ID_BASE = 310000000;
  const ID_RANGE = 900000000;
  const taipeiFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  function taipeiParts(date) {
    return Object.fromEntries(
      taipeiFormatter.formatToParts(date)
        .filter(({ type }) => type !== "literal")
        .map(({ type, value }) => [type, Number(value)]),
    );
  }

  function localDateKey(date) {
    const { year, month, day } = taipeiParts(date);
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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

  function buildReminderIds(userId, date, hour, scope = "formal") {
    const accountHash = shortAccountHash(userId);
    const dateKey = localDateKey(date);
    const identity = scope === "formal"
      ? `practice-reminder|${accountHash}|${dateKey}|${hour}`
      : `practice-reminder|${scope}|${accountHash}|${dateKey}|${hour}`;
    return {
      id: stableId(identity),
      accountHash,
      dateKey,
      slot: String(hour),
    };
  }

  function buildReminderDates(now = new Date(), days = DAYS_TO_SCHEDULE) {
    const current = taipeiParts(now);
    const dates = [];
    for (let offset = 0; offset < days; offset += 1) {
      for (const hour of SLOTS) {
        const at = new Date(Date.UTC(
          current.year,
          current.month - 1,
          current.day + offset,
          hour - UTC_OFFSET_HOURS,
          0,
          0,
          0,
        ));
        if (at > now) dates.push({ at, hour, dateKey: localDateKey(at) });
      }
    }
    return dates;
  }

  function buildReminderContent({ hour }) {
    if (Number(hour) === 19) {
      return {
        title: "今天還沒練習喔",
        body: "花幾分鐘完成今天的口琴練習吧！",
      };
    }
    return {
      title: "今天的練習還沒完成",
      body: "睡前再練一下，別讓今天空白過去。",
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
    TIME_ZONE,
    SLOTS,
    taipeiParts,
    localDateKey,
    shortAccountHash,
    buildReminderIds,
    buildReminderDates,
    buildReminderContent,
    getTodayPracticeCompletion,
    shouldScheduleToday,
  };
}));
