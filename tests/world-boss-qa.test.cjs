const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const runtime = fs.readFileSync(path.join(root, "world-boss.js"), "utf8");
const gardenQa = fs.readFileSync(path.join(root, "garden-qa.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");

function functionBody(name, nextName) {
  const start = runtime.indexOf(`function ${name}`);
  const end = nextName ? runtime.indexOf(`function ${nextName}`, start + 1) : runtime.length;
  assert.notEqual(start, -1, `${name} exists`);
  assert.notEqual(end, -1, `${nextName} exists`);
  return runtime.slice(start, end);
}

test("World Boss QA is reachable only from the existing isolated QA session", () => {
  assert.match(html, /id="gardenQaWorldBoss"[^>]*>World Boss QA</);
  assert.match(gardenQa, /gardenQaWorldBoss[\s\S]*ChromaticaWorldBoss\?\.openQa/);
  assert.match(runtime, /function isQaMode\(\)[\s\S]*ChromaticaGardenQA\?\.isGardenQaSessionActive/);
  assert.match(functionBody("openQa", "confirmExchangeAndAttack"), /if \(!isQaMode\(\)\) return false/);
  assert.match(html, /id="worldBossQaPanel" class="world-boss-qa-panel hidden"/);
  assert.match(css, /\.world-boss-qa-panel\.hidden \{ display: none; \}/);
});

test("QA session is sessionStorage-only and never uses formal RPC or account persistence", () => {
  const qaStorage = runtime.slice(
    runtime.indexOf("function defaultQaSession"),
    runtime.indexOf("function bossImage"),
  );
  assert.match(runtime, /chromatica\.qaWorldBossSession\.v1/);
  assert.match(qaStorage, /sessionStorage\.getItem\(QA_STORAGE_KEY\)/);
  assert.match(qaStorage, /sessionStorage\.setItem\(QA_STORAGE_KEY/);
  assert.doesNotMatch(qaStorage, /localStorage|leaderboardRpc|rpc\(|game_saves|notification|fetch\(/);
  assert.match(functionBody("refresh", "playAttackEffect"), /if \(isQaMode\(\)\)[\s\S]*applyQaSession/);
  assert.match(functionBody("recordPracticeCompletion", "init"), /if \(isQaMode\(\)\) return null/);
});

test("QA controls include unlimited resources, exact HP presets, both settlements, and reset", () => {
  for (const id of [
    "worldBossQaUnlimitedEnergy",
    "worldBossQaUnlimitedSpecial",
    "worldBossQaSuccess",
    "worldBossQaFailure",
    "worldBossQaReset",
    "worldBossQaZeroEnergy",
    "worldBossQaWater",
    "worldBossQaExchangeCount",
  ]) assert.match(html, new RegExp(`id="${id}"`));
  for (const hp of [3000, 600, 20, 0]) {
    assert.match(html, new RegExp(`data-world-boss-qa-hp="${hp}"`));
  }
  assert.match(runtime, /qa_unlimited_energy[\s\S]*"∞"/);
  assert.match(runtime, /qa_unlimited_special[\s\S]*"∞"/);
});

test("QA special attacks reset to two uses on each Taipei calendar day", () => {
  const qaSession = runtime.slice(
    runtime.indexOf("function defaultQaSession"),
    runtime.indexOf("function loadQaSession"),
  );
  const qaAttack = functionBody("performQaAttack", "createQaSettlement");
  assert.match(runtime, /function taipeiDateKey[\s\S]*timeZone: "Asia\/Taipei"/);
  assert.match(qaSession, /specialAttackDateKey/);
  assert.match(qaSession, /isSameSpecialAttackDay[\s\S]*special_attack_remaining:[\s\S]*: 2/);
  assert.match(qaAttack, /今日專屬技能次數已用完/);
  assert.match(qaAttack, /session\.event\.special_attack_remaining -= 1/);
});

test("QA energy exchange is isolated, immediate, uncapped, and shared by both attack modes", () => {
  const qaAttack = functionBody("performQaAttack", "createQaSettlement");
  assert.match(runtime, /qaWaterDrops: 300/);
  assert.match(runtime, /exchangedEnergy: 0/);
  assert.doesNotMatch(qaAttack, /session\.exchangedEnergy >= 10|本場兌換次數已達上限/);
  assert.match(qaAttack, /session\.qaWaterDrops < 3[\s\S]*水滴不足/);
  assert.match(qaAttack, /session\.qaWaterDrops -= 3[\s\S]*session\.exchangedEnergy \+= 1[\s\S]*session\.event\.light_energy \+= 1/);
  assert.match(qaAttack, /if \(!session\.unlimitedEnergy\) session\.event\.light_energy -= 1/);
  assert.doesNotMatch(qaAttack, /rpc\(|game_saves|leaderboardRpc|fetch\(/);
  assert.match(runtime, /state\.pendingSpecial = \{ species, stage, type \}/);
  assert.match(functionBody("confirmExchangeAndAttack", "renderSkillPanel"), /pendingSpecial\?\.type \|\| "special"/);
  assert.match(html, /目前沒有光之能量，是否花費 3 水滴兌換 1 顆光之能量並立即攻擊世界 Boss？/);
});

test("QA collection skill learning shares formal UI but keeps water and unlocks in session storage", () => {
  assert.match(gardenQa, /qaWaterDrops: 300/);
  assert.match(gardenQa, /worldBossSkillUnlocks: \[\]/);
  assert.match(gardenQa, /learnWorldBossSkill\(species, cost = 100\)/);
  assert.match(gardenQa, /spirit\.species === species && spirit\.harvested === true/);
  assert.match(gardenQa, /state\.qaWaterDrops -= cost/);
  assert.doesNotMatch(gardenQa, /learn_world_boss_skill|game_saves|leaderboardRpc/);
  assert.match(runtime, /adapter\?\.getCollection\?\.\(\)\.some\(\(spirit\) => spirit\.species === species && spirit\.harvested === true\)/);
  assert.match(runtime, /qaAdapter\.learnWorldBossSkill\(species, 100\)/);
  assert.match(html, /id="gardenSpiritSkillPanel"[\s\S]*100水滴習得技能的icon\.png/);
  assert.match(html, /id="worldBossSkillLearnConfirmModal"/);
  for (const skill of [
    "森律共鳴・萬葉齊奏",
    "菌界低吟・大地回響",
    "花舞天音・百華綻放",
    "四葉福音・命運盛放",
    "蓮華天籟・萬瓣淨音",
    "荒沙戰奏・烈日轟鳴",
  ]) {
    assert.match(fs.readFileSync(path.join(root, "world-boss-core.js"), "utf8"), new RegExp(skill));
  }
  const panel = functionBody("renderSkillPanel", "refreshSkillUnlocks");
  assert.match(panel, /spirit\.harvested === true/);
  assert.match(panel, /Number\(stage\) === 3/);
  assert.match(panel, /classList\.toggle\("hidden", !visible\)/);
  assert.match(panel, /已習得：\$\{skill\.skillName\}/);
  assert.match(gardenQa, /resetSandbox\(\)[\s\S]*sessionStorage\.removeItem\(SANDBOX_KEY\)[\s\S]*defaultState\(\)/);
});

test("QA attacks share formal attack and counter presentation without formal writes", () => {
  const qaAttack = functionBody("performQaAttack", "createQaSettlement");
  const formalFlow = functionBody("performAttack", "confirmExchangeAndAttack");
  assert.doesNotMatch(qaAttack, /rpc\(|leaderboardRpc|fetch\(|notification|game_saves/);
  assert.match(formalFlow, /isQaMode\(\)[\s\S]*performQaAttack/);
  assert.match(formalFlow, /playAttackEffect\(type\)/);
  assert.match(formalFlow, /await playBossCounter\(\)/);
  assert.match(qaAttack, /type === "special" \? 100 : Number\(core\(\)\?\.getNormalDamage/);
  assert.match(qaAttack, /Math\.min\(attemptedDamage, session\.event\.remaining_hp\)/);
  assert.match(qaAttack, /is_first_hit: isFirstHit/);
  assert.match(qaAttack, /is_final_hit: isFinalHit/);
  assert.match(qaAttack, /if \(isFinalHit\) session\.event\.status = "defeated"/);
});

test("QA settlement visibly walks defeated or expired through settling to closed", () => {
  const settlement = functionBody("simulateQaSettlement", "setQaHp");
  assert.match(settlement, /success \? "defeated" : "expired"/);
  assert.match(settlement, /await qaDelay\(650\)/);
  assert.match(settlement, /session\.event\.status = "settling"/);
  assert.match(settlement, /session\.event\.status = "closed"/);
  assert.match(settlement, /createQaSettlement\(session, success\)/);
  assert.match(settlement, /worldBossSettlement"\)\?\.scrollIntoView/);
});

test("QA success and failure screens include formal reward-detail shapes without awarding water", () => {
  const settlement = functionBody("createQaSettlement", "simulateQaSettlement");
  for (const reward of [
    /participation", water: 5/,
    /first_hit", water: 30/,
    /rank_1", water: 100/,
    /last_hit", water: 30/,
    /boss_defeated", water: 10/,
    /first_hit", water: 15/,
    /rank_1", water: 50/,
  ]) assert.match(settlement, reward);
  assert.doesNotMatch(settlement, /rpc\(|game_saves|leaderboardRpc|fetch\(/);
  assert.match(settlement, /top_ten/);
  assert.match(settlement, /me:/);
});

test("zero HP immediately uses the death image and disables formal battle controls", () => {
  assert.match(runtime, /if \(visual === "defeated"\) return `\$\{ASSET_ROOT\}第一隻boss樹麻雀 死亡狀態\.png`/);
  assert.match(functionBody("setQaHp", "updateQaOption"), /remaining_hp === 0 \? "defeated" : "active"/);
  assert.match(runtime, /battle\?\.classList\.toggle\("hidden", status !== "active" \|\| remaining <= 0\)/);
});
