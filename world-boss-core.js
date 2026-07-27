(() => {
  "use strict";

  const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const SPECIES = Object.freeze({
    "melody-sprout": Object.freeze({ spiritName: "旋律森使", skillName: "森靈共鳴曲" }),
    "mushroom-spirit": Object.freeze({ spiritName: "菇鳴賢者", skillName: "萬孢迴響陣" }),
    "flower-spirit": Object.freeze({ spiritName: "花樂仙子", skillName: "百花綻奏舞" }),
  });

  function taipeiParts(input = new Date()) {
    const shifted = new Date(new Date(input).getTime() + TAIPEI_OFFSET_MS);
    return {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth(),
      date: shifted.getUTCDate(),
      day: shifted.getUTCDay(),
      hour: shifted.getUTCHours(),
      minute: shifted.getUTCMinutes(),
      second: shifted.getUTCSeconds(),
    };
  }

  function taipeiLocalToUtc(year, month, date, hour) {
    return new Date(Date.UTC(year, month, date, hour) - TAIPEI_OFFSET_MS);
  }

  function getEventWindow(input = new Date()) {
    const parts = taipeiParts(input);
    const daysFromMonday = (parts.day + 6) % 7;
    const mondayDate = parts.date - daysFromMonday;
    let start = taipeiLocalToUtc(parts.year, parts.month, mondayDate + 4, 20);
    let end = taipeiLocalToUtc(parts.year, parts.month, mondayDate + 6, 22);
    const now = new Date(input);
    if (now >= end) {
      start = new Date(start.getTime() + 7 * DAY_MS);
      end = new Date(end.getTime() + 7 * DAY_MS);
    }
    const keyDate = new Date(start.getTime() + TAIPEI_OFFSET_MS);
    const eventKey = [
      keyDate.getUTCFullYear(),
      String(keyDate.getUTCMonth() + 1).padStart(2, "0"),
      String(keyDate.getUTCDate()).padStart(2, "0"),
    ].join("-");
    return {
      eventKey,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      phase: now < start ? "scheduled" : now < end ? "active" : "expired",
    };
  }

  function getNormalDamage(stage) {
    return [0, 10, 30, 60][Math.max(0, Math.min(3, Number(stage) || 0))] || 0;
  }

  function getSkill(species) {
    return SPECIES[String(species || "")] || null;
  }

  window.ChromaticaWorldBossCore = Object.freeze({
    SPECIES,
    getEventWindow,
    getNormalDamage,
    getSkill,
  });
})();
