(function initLeaderboardCore(global) {
  "use strict";

  const CACHE_TTL_MS = 10 * 60 * 1000;
  const MAX_TOP_ROWS = 15;
  const MIN_DISPLAY_NAME_LENGTH = 2;
  const MAX_DISPLAY_NAME_LENGTH = 20;
  const MAX_COMPLETION_CYCLES = 8;

  function clampInteger(value, minimum, maximum) {
    const parsed = Math.floor(Number(value));
    if (!Number.isFinite(parsed)) return minimum;
    return Math.max(minimum, Math.min(maximum, parsed));
  }

  function normalizeDisplayName(value, fallback = "練習者") {
    const normalized = Array.from(String(value ?? "").trim()).slice(0, MAX_DISPLAY_NAME_LENGTH).join("");
    return normalized || fallback;
  }

  function isValidDisplayName(value) {
    const normalized = String(value ?? "").trim();
    const length = Array.from(normalized).length;
    return length >= MIN_DISPLAY_NAME_LENGTH
      && length <= MAX_DISPLAY_NAME_LENGTH
      && !/[\u0000-\u001f\u007f-\u009f]/u.test(normalized);
  }

  function normalizeMetric(metric) {
    return metric === "cultivator" ? "cultivator" : "weekly";
  }

  function normalizeLeaderboardRow(row = {}, metric = "practice") {
    const normalizedMetric = normalizeMetric(metric);
    return {
      position: clampInteger(row.position, 1, Number.MAX_SAFE_INTEGER),
      userId: typeof row.public_key === "string" ? row.public_key : typeof row.user_id === "string" ? row.user_id : "",
      displayName: normalizeDisplayName(row.display_name),
      customAvatarPath: typeof row.custom_avatar_path === "string" ? row.custom_avatar_path : "",
      avatarVersion: clampInteger(row.avatar_version, 0, Number.MAX_SAFE_INTEGER),
      featuredSpiritSpecies: typeof row.featured_spirit_species === "string" ? row.featured_spirit_species : "",
      featuredSpiritName: typeof row.featured_spirit_name === "string" ? row.featured_spirit_name : "",
      featuredSpiritStage: clampInteger(row.featured_spirit_stage, 1, 3),
      score: clampInteger(row.score, 0, Number.MAX_SAFE_INTEGER),
      secondaryScore: clampInteger(row.secondary_score, 0, Number.MAX_SAFE_INTEGER),
      weekStart: /^\d{4}-\d{2}-\d{2}$/.test(String(row.week_start || "")) ? String(row.week_start) : "",
      isCurrentUser: row.is_current_user === true,
      metric: normalizedMetric,
    };
  }

  function normalizeLeaderboardRows(rows, metric) {
    const seen = new Set();
    return (Array.isArray(rows) ? rows : [])
      .map((row) => normalizeLeaderboardRow(row, metric))
      .filter((row) => row.userId && !seen.has(row.userId) && seen.add(row.userId))
      .sort((left, right) => left.position - right.position);
  }

  function shouldInsertSelfSeparator(rows) {
    const list = Array.isArray(rows) ? rows : [];
    const self = list.find((row) => row.isCurrentUser);
    return Boolean(self && self.position > MAX_TOP_ROWS && list.some((row) => row.position <= MAX_TOP_ROWS));
  }

  function isCacheFresh(cache, now = Date.now()) {
    return Boolean(cache && Array.isArray(cache.rows) && Number(cache.savedAt) > 0 && now - Number(cache.savedAt) < CACHE_TTL_MS);
  }

  function taipeiWeekStartKey(value = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(value).reduce((result, part) => {
      if (part.type !== "literal") result[part.type] = part.value;
      return result;
    }, {});
    const localDate = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
    if (Number(parts.hour) < 12) localDate.setUTCDate(localDate.getUTCDate() - 1);
    localDate.setUTCDate(localDate.getUTCDate() - localDate.getUTCDay());
    return localDate.toISOString().slice(0, 10);
  }

  function normalizePracticeEvent(event = {}) {
    const eventId = typeof event.eventId === "string" ? event.eventId.trim() : "";
    const practiceDate = /^\d{4}-\d{2}-\d{2}$/.test(String(event.practiceDate || ""))
      ? String(event.practiceDate)
      : "";
    const protectedDates = Array.isArray(event.protectedDates)
      ? [...new Set(event.protectedDates.filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value))))].slice(0, 3660)
      : [];
    return {
      eventId,
      completedCycles: clampInteger(event.completedCycles, 1, MAX_COMPLETION_CYCLES),
      practiceDate,
      protectedDates,
      createdAt: typeof event.createdAt === "string" ? event.createdAt : new Date().toISOString(),
      previousRank: Number.isInteger(Number(event.previousRank)) && Number(event.previousRank) > 0
        ? Number(event.previousRank)
        : null,
    };
  }

  function shouldShowRankMovement(previousRank, nextRank) {
    const before = Number(previousRank);
    const after = Number(nextRank);
    return Number.isInteger(after) && after > 0
      && (!Number.isInteger(before) || before <= 0 || after < before);
  }

  function createRankMovement(previousRank, nextRank, eventId = "") {
    if (!shouldShowRankMovement(previousRank, nextRank)) return null;
    const normalizedPreviousRank = Number.isInteger(Number(previousRank)) && Number(previousRank) > 0 ? Number(previousRank) : null;
    return {
      previousRank: normalizedPreviousRank,
      nextRank: Number(nextRank),
      eventId: String(eventId || ""),
      enteredTopRows: (normalizedPreviousRank === null || normalizedPreviousRank > MAX_TOP_ROWS) && Number(nextRank) <= MAX_TOP_ROWS,
    };
  }

  global.ChromaticaLeaderboardCore = Object.freeze({
    CACHE_TTL_MS,
    MAX_TOP_ROWS,
    MIN_DISPLAY_NAME_LENGTH,
    MAX_DISPLAY_NAME_LENGTH,
    MAX_COMPLETION_CYCLES,
    normalizeDisplayName,
    isValidDisplayName,
    normalizeMetric,
    normalizeLeaderboardRow,
    normalizeLeaderboardRows,
    shouldInsertSelfSeparator,
    isCacheFresh,
    taipeiWeekStartKey,
    normalizePracticeEvent,
    shouldShowRankMovement,
    createRankMovement,
  });
})(typeof window !== "undefined" ? window : globalThis);
