(() => {
  "use strict";

  const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const SPECIES = Object.freeze({
    "melody-sprout": Object.freeze({ spiritName: "旋律森使", skillName: "森律共鳴・萬葉齊奏" }),
    "mushroom-spirit": Object.freeze({ spiritName: "菇鳴賢者", skillName: "菌界低吟・大地回響" }),
    "flower-spirit": Object.freeze({ spiritName: "花樂仙子", skillName: "花舞天音・百華綻放" }),
    "lucky-clover-spirit": Object.freeze({ spiritName: "四葉祝使", skillName: "四葉福音・命運盛放" }),
    "lotus-spirit": Object.freeze({ spiritName: "蓮華樂仙", skillName: "蓮華天籟・萬瓣淨音" }),
    "cactus-spirit": Object.freeze({ spiritName: "荒漠樂將", skillName: "荒沙戰奏・烈日轟鳴" }),
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

  function getBossVisualState(remainingHp, maxHp, status = "active") {
    if (Number(remainingHp) <= 0 || status === "defeated") return "defeated";
    return "normal";
  }

  function formatRemainingTime(target, now = Date.now()) {
    const remaining = Math.max(0, new Date(target).getTime() - Number(now));
    const hours = Math.floor(remaining / 3_600_000);
    const minutes = Math.floor((remaining % 3_600_000) / 60_000);
    const seconds = Math.floor((remaining % 60_000) / 1000);
    return `${hours} 小時 ${minutes} 分 ${seconds} 秒`;
  }

  function notificationCopy(type) {
    const copies = {
      boss_appeared: ["世界 Boss 出現！", "樹麻雀已現身，快帶精靈一起參加討伐！"],
      below_50: ["世界 Boss 戰況", "樹麻雀的 HP 已低於 50%。"],
      below_10: ["世界 Boss 即將被擊倒", "樹麻雀的 HP 已低於 10%。"],
      boss_defeated: ["世界 Boss 討伐成功", "樹麻雀已被擊倒，結算完成後即可查看戰績。"],
      special_attack: ["專屬技能", "有玩家施放了專屬攻擊技能！"],
      first_hit: ["第一擊", "本週討伐的第一擊已經出現！"],
      final_hit: ["最後一擊", "最後一擊完成，本週討伐成功！"],
    };
    return copies[type] || ["世界 Boss", "討伐戰況已更新。"];
  }

  window.ChromaticaWorldBossCore = Object.freeze({
    SPECIES,
    getEventWindow,
    getNormalDamage,
    getSkill,
    getBossVisualState,
    formatRemainingTime,
    notificationCopy,
  });
})();
