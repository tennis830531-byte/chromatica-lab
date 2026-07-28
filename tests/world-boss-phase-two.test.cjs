const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/202607270003_complete_world_boss_phase_two.sql"), "utf8");
const runtime = fs.readFileSync(path.join(root, "world-boss.js"), "utf8");
const coreSource = fs.readFileSync(path.join(root, "world-boss-core.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const auth = fs.readFileSync(path.join(root, "auth-entry.js"), "utf8");
const authRuntime = fs.readFileSync(path.join(root, "auth-runtime.js"), "utf8");
const notificationFunction = fs.readFileSync(
  path.join(root, "supabase/functions/process-world-boss-notifications/index.ts"),
  "utf8",
);

function loadCore() {
  const context = { window: {} };
  vm.runInNewContext(coreSource, context);
  return context.window.ChromaticaWorldBossCore;
}

test("living boss always uses normal state and zero HP uses defeated state", () => {
  const core = loadCore();
  assert.equal(core.getBossVisualState(3000, 3000, "active"), "normal");
  assert.equal(core.getBossVisualState(600, 3000, "active"), "normal");
  assert.equal(core.getBossVisualState(1, 3000, "active"), "normal");
  assert.equal(core.getBossVisualState(0, 3000, "defeated"), "defeated");
  assert.doesNotMatch(coreSource, /remainingHp\)\s*\/\s*Number\(maxHp\)\s*<=\s*0\.2/);
});

test("counterattack is a single visual-only one-second presentation", () => {
  const counter = runtime.slice(runtime.indexOf("function playBossCounter"), runtime.indexOf("async function performAttack"));
  assert.match(counter, /狂暴狀態\.png/);
  assert.match(counter, /if \(state\.counterPromise\) return state\.counterPromise/);
  assert.match(counter, /window\.setTimeout\(finishBossCounter, 1000\)/);
  assert.match(counter, /remaining_hp[^]*<= 0/);
  assert.doesNotMatch(counter, /rpc\(|light_energy|effective_damage|attack_count|reward/);
  assert.match(runtime, /function finishBossCounter\(\)[^]*window\.clearTimeout\(state\.counterTimer\)/);
  assert.match(runtime, /remaining <= 0 && state\.counterPromise\) finishBossCounter\(\)/);
  assert.match(html, /樹麻雀發動反擊！/);
  assert.match(css, /is-countering \.world-boss-active-spirit/);
  assert.match(css, /prefers-reduced-motion[\s\S]*world-boss-battle-controls\.is-countering \.world-boss-active-spirit \{ animation: none;/);
});

test("complete battle page exposes HP, timer, energy, skills, attacks, log, and personal totals", () => {
  for (const id of [
    "worldBossName", "worldBossHpFill", "worldBossCountdown", "worldBossEnergyCount",
    "worldBossSpecialRemaining", "worldBossSpirit", "worldBossSpiritPicker",
    "worldBossAttackModeToggle", "worldBossAttackAction", "worldBossBattleLog", "worldBossPlayerDamage",
    "worldBossPlayerAttackCount",
  ]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(runtime, /#worldboss\.view\.active/);
  assert.match(runtime, /window\.setInterval\([^]*void refresh\(\)[^]*5000\)/);
});

test("home boss entry sits to the right of the weekly leaderboard title", () => {
  assert.match(
    html,
    /<div class="hero-rank-boss-row">\s*<p id="homeLeaderboardTitle"[^>]*><\/p>\s*<button id="worldBossEntry"/,
  );
  const heroTitleStart = html.indexOf('id="homeHeroQaTitle"');
  const heroRankRowStart = html.indexOf('class="hero-rank-boss-row"');
  assert.ok(heroTitleStart >= 0 && heroRankRowStart > heroTitleStart);
  assert.doesNotMatch(
    html.slice(heroTitleStart, heroRankRowStart),
    /id="worldBossEntry"/,
  );
  assert.match(css, /\.hero-rank-boss-row \.world-boss-entry \{[\s\S]*margin-left: auto;/);
  assert.match(css, /\.world-boss-entry \{[\s\S]*display: inline-grid;[\s\S]*justify-items: center;/);
  assert.match(css, /\.world-boss-entry img \{[\s\S]*width: 68px;[\s\S]*height: 68px;/);
});

test("battle arena uses the approved fixed background and exposes live ranking with first and final hit", () => {
  assert.match(
    css,
    /\.world-boss-arena \{[\s\S]*world-boss-arena-background\.png[\s\S]*center \/ cover no-repeat/,
  );
  assert.match(css, /\.world-boss-arena \{[\s\S]*border-radius: 0;/);
  for (const id of [
    "worldBossLiveRankingSection",
    "worldBossLiveRanking",
    "worldBossFirstHitPlayer",
    "worldBossFinalHitPlayer",
  ]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(runtime, /function renderLiveRanking\(rows = \[\]\)/);
  assert.match(runtime, /renderLiveRanking\(state\.event\?\.live_ranking \|\| \[\]\)/);
  assert.match(runtime, /world-boss-live-avatar/);
  assert.match(runtime, /world-boss-live-spirit/);
  assert.match(migration, /'live_ranking'[\s\S]*row_number\(\) over[\s\S]*limit 10/);
  assert.match(migration, /'avatar_path', ranked\.custom_avatar_path/);
  assert.match(migration, /'species', ranked\.species/);
  assert.match(migration, /left join lateral \([\s\S]*from public\.world_boss_attacks attack/);
  assert.match(migration, /select attack\.species, attack\.spirit_stage/);
  assert.doesNotMatch(migration, /attack\.stage/);
  assert.match(migration, /'first_attacker_display_name'/);
  assert.match(migration, /'final_attacker_display_name'/);
});

test("living Boss alternates the two approved idle images while counter and death remain exclusive", () => {
  assert.match(runtime, /BOSS_IDLE_IMAGES = Object\.freeze\(\[[\s\S]*第一隻boss 樹麻雀\.png[\s\S]*ChatGPT Image 2026年7月27日 下午05_48_36\.png/);
  assert.match(runtime, /function startBossBreathing\(\)[\s\S]*prefersReducedMotion\(\) \? 2000 : 500/);
  assert.match(runtime, /if \(state\.busy \|\| state\.counterPromise/);
  assert.match(runtime, /第一隻boss 樹麻雀 狂暴狀態\.png/);
  assert.match(runtime, /第一隻boss樹麻雀 死亡狀態\.png/);
  assert.equal(loadCore().getBossVisualState(1200, 3000, "closed"), "normal");
  const idle = path.join(root, "public/assets/world-boss/ChatGPT Image 2026年7月27日 下午05_48_36.png");
  const digest = require("node:crypto").createHash("sha256").update(fs.readFileSync(idle)).digest("hex");
  assert.equal(digest, "c66c2edb5a2a18f40f7765b62cd5f918feecc413591f91b46fc54b5b64cd385a");
});

test("special skill replaces attack mode and presents the full art card before damage", () => {
  assert.match(runtime, /function canUseSelectedSpecial\(\)[\s\S]*selected\.stage === 3 && isSkillUnlocked/);
  assert.match(runtime, /function playSpecialAttackPresentation\(species\)/);
  assert.match(runtime, /if \(type === "special"\) await playSpecialAttackPresentation\(species\);[\s\S]*attack_world_boss/);
  assert.match(css, /worldBossSpecialCardReveal[\s\S]*rotateY\(1440deg\)[\s\S]*rotateY\(1800deg\)[\s\S]*rotateY\(1980deg\)[\s\S]*rotateY\(2160deg\)/);
  assert.match(runtime, /playSpecialAttackSound\(\)/);
  assert.match(runtime, /playNormalAttackSound\(\);[\s\S]*ChromaticaHaptics\?\.(?:long|success)/);
  assert.match(runtime, /normalAttackAudio\.volume = 0\.175/);
  assert.match(runtime, /specialAttackAudio\.volume = 0\.462/);
  assert.match(css, /\.world-boss-special-stage h2 \{[\s\S]*width: calc\(100vw - 32px\);[\s\S]*max-width: 430px;[\s\S]*font-size: clamp\(22px, calc\(\(100vw - 48px\) \/ 9\.6\), 54px\);[\s\S]*text-align: center;[\s\S]*white-space: nowrap;/);
  assert.match(css, /prefers-reduced-motion[\s\S]*worldBossSpecialReduced/);
  assert.match(html, /id="worldBossSpecialPresentation"/);
  assert.doesNotMatch(html, />普通攻擊</);
});

test("QA success and failure settlements enter a dedicated result view with correct Boss art", () => {
  assert.match(html, /id="worldBossCombatView"/);
  assert.match(html, /id="worldBossSettlementBossImage"/);
  assert.match(css, /\.world-boss-settlement-scene \{[\s\S]*world-boss-arena-background\.png/);
  assert.match(runtime, /worldBossCombatView"\)\?\.classList\.toggle\("hidden", settlementView\)/);
  assert.match(runtime, /success[\s\S]*第一隻boss樹麻雀 死亡狀態\.png[\s\S]*BOSS_IDLE_IMAGES\[0\]/);
  assert.match(runtime, /worldBossSettlement"\)\?\.scrollIntoView/);
});

test("approved battle background is byte-locked without image rewriting", () => {
  const background = path.join(root, "public/assets/world-boss/world-boss-arena-background.png");
  const digest = require("node:crypto").createHash("sha256").update(fs.readFileSync(background)).digest("hex");
  assert.equal(digest, "53cc3a8696fcdc8aed5ea88a1101cead02cfe30f3a5a94f0969fba0aae592fb4");
});

test("entering the World Boss page starts one looping theme and leaving stops it", () => {
  assert.match(runtime, /The Lament of the Fallen\.wav/);
  assert.match(runtime, /bossMusicAudio\.loop = true/);
  assert.match(runtime, /bossMusicAudio\.volume = 0\.28/);
  assert.match(runtime, /function onViewChanged\(view\)[\s\S]*view === "worldboss"[\s\S]*playBossMusic\(\)[\s\S]*stopBossMusic\(\)/);
  assert.match(runtime, /function stopBossMusic[\s\S]*bossMusicAudio\.pause\(\)[\s\S]*bossMusicAudio\.currentTime = 0/);
  assert.match(runtime, /if \(!audio\.paused\) return/);
  assert.match(runtime, /isAppSoundAllowed/);
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.match(app, /ChromaticaWorldBoss\?\.onViewChanged\?\.\(view\)/);
  assert.match(app, /ChromaticaWorldBoss\?\.onAppBackground\?\.\(\)/);
});

test("special presentation uses the approved three-second surge and every attack has one impact sound and haptic", () => {
  const surge = fs.readFileSync(path.join(root, "public/assets/sounds/Arcane Surge.wav"));
  const normalAttack = fs.readFileSync(path.join(root, "public/assets/sounds/精靈普通攻擊_1秒.wav"));
  assert.equal(surge.toString("ascii", 0, 4), "RIFF");
  assert.equal(surge.readUInt32LE(24), 48000);
  assert.equal(surge.readUInt16LE(32), 4);
  const dataOffset = surge.indexOf(Buffer.from("data")) + 8;
  assert.ok(dataOffset >= 8);
  assert.equal(surge.readUInt32LE(dataOffset - 4), 48000 * 4 * 3);
  assert.equal(
    require("node:crypto").createHash("sha256").update(normalAttack).digest("hex"),
    "122b0e834c0631cd8459386a0d92672f156378635f3a08b2f8c0847dec507e4b",
  );
  assert.match(runtime, /SPECIAL_ATTACK_SOUND_PATH = "\.\/public\/assets\/sounds\/Arcane Surge\.wav"/);
  assert.match(runtime, /NORMAL_ATTACK_SOUND_PATH = "\.\/public\/assets\/sounds\/精靈普通攻擊_1秒\.wav"/);
  assert.match(runtime, /playSpecialAttackSound\(\);[\s\S]*qaDelay/);
  assert.match(runtime, /const row = Array\.isArray\(result\)[\s\S]*playNormalAttackSound\(\);[\s\S]*ChromaticaHaptics/);
});

test("World Boss theme remains byte-identical to the supplied WAV", () => {
  const music = path.join(root, "public/assets/sounds/The Lament of the Fallen.wav");
  const digest = require("node:crypto").createHash("sha256").update(fs.readFileSync(music)).digest("hex");
  assert.equal(digest, "7076a94183eddaea1c9a7694a2a8af6cff3660b89149e25c34d2b1b4d0aaa2e3");
});

test("attack lock and exchange-and-attack confirmation prevent duplicate input", () => {
  assert.match(runtime, /function setBattleLocked\(locked\)/);
  assert.match(runtime, /if \(state\.busy \|\| state\.status !== "ready"/);
  assert.match(runtime, /worldBossExchangeAttackModal/);
  assert.match(html, /id="worldBossSpiritPickerModal"[\s\S]*id="worldBossSpiritPickerList"/);
  assert.match(runtime, /function openSpiritPicker\(\)[\s\S]*renderSpiritPickerOptions\(\)[\s\S]*worldBossSpiritPickerModal/);
  assert.match(runtime, /worldBossSpiritPickerList[\s\S]*selectSpiritFromPicker/);
  assert.match(css, /\.world-boss-modal-backdrop \{[\s\S]*position: fixed;[\s\S]*z-index: 1500;/);
  assert.match(css, /\.world-boss-spirit-picker-list \{[\s\S]*grid-template-columns: repeat\(3,/);
  assert.match(runtime, /exchange_and_attack_world_boss/);
  assert.match(migration, /perform public\.exchange_world_boss_energy[\s\S]*public\.attack_world_boss/);
});

test("settlement transitions and immutable snapshot remain server-side", () => {
  assert.match(migration, /create function public\.settle_world_boss_event/);
  assert.match(migration, /status = 'settling'/);
  assert.match(migration, /status = 'closed'/);
  assert.match(migration, /world_boss_settlement_snapshots/);
  assert.match(migration, /on conflict \(event_id\) do nothing/);
});

test("reward items are independently idempotent and applied with game save locking", () => {
  assert.match(migration, /create table public\.world_boss_reward_items/);
  assert.match(migration, /unique \(event_id, user_id, reward_type\)/);
  assert.match(migration, /from public\.game_saves save where save\.user_id = v_user\.user_id for update/);
  assert.match(migration, /status = 'applied', applied_revision = v_revision/);
});

test("formal success and failure reward policies are exact and rank rewards stop after third", () => {
  for (const expected of [
    /success_participation_water integer not null default 5/,
    /failure_participation_water integer not null default 5/,
    /success_first_hit_water integer not null default 30/,
    /failure_first_hit_water integer not null default 15/,
    /success_last_hit_water integer not null default 30/,
    /success_boss_defeated_water integer not null default 10/,
    /success_damage_rank_water jsonb not null[\s\S]*default '\[100,80,60\]'/,
    /failure_damage_rank_water jsonb not null[\s\S]*default '\[50,40,30\]'/,
  ]) assert.match(migration, expected);
  assert.match(migration, /reward\.final_rank between 1 and 3/);
  assert.doesNotMatch(migration, /reward\.final_rank between 1 and 10/);
  assert.match(migration, /'rank_' \|\| reward\.final_rank::text/);
  assert.match(migration, /where v_success and v_event\.final_attacker_user_id is not null/);
  assert.match(migration, /where v_success and reward\.event_id = p_event_id/);
  assert.match(migration, /case when v_success then v_definition\.success_first_hit_water[\s\S]*else v_definition\.failure_first_hit_water end/);
});

test("player settlement renders every independent reward item and total", () => {
  for (const type of [
    "participation", "first_hit", "rank_1", "rank_2", "rank_3", "last_hit", "boss_defeated",
  ]) assert.match(runtime, new RegExp(`${type}:`));
  assert.match(runtime, /me\.rewards \|\| \[\][\s\S]*reduce/);
  assert.match(runtime, /world-boss-my-rewards/);
});

test("damage ranking uses row number with deterministic tie ordering", () => {
  assert.match(migration, /row_number\(\) over \([\s\S]*total_effective_damage desc, player\.first_attack_at, player\.user_id/);
});

test("settlement stores all requested operational statistics", () => {
  for (const column of [
    "participant_count", "total_attack_count", "average_attack_count", "boss_alive_seconds",
    "total_water_spent", "event_start_energy_used", "practice_energy_used",
    "exchanged_energy_used", "friday_damage", "saturday_damage", "sunday_damage",
    "normal_attack_count", "special_attack_count", "total_reward_water",
  ]) assert.match(migration, new RegExp(column));
  assert.match(migration, /'rankings', v_rankings/);
});

test("50 and 10 percent notifications have event-level idempotency", () => {
  assert.match(migration, /v_previous_hp \* 2 > v_event\.max_hp[\s\S]*below_50/);
  assert.match(migration, /v_previous_hp \* 10 > v_event\.max_hp[\s\S]*below_10/);
  assert.match(migration, /idempotency_key text not null unique/);
  assert.match(migration, /on conflict \(idempotency_key\) do nothing/);
});

test("mobile push subset excludes 50 percent and special attacks", () => {
  assert.match(migration, /'below_50'[\s\S]*false, 'threshold'/);
  assert.match(migration, /'special_attack'[\s\S]*false, new\.id::text/);
  for (const type of ["boss_appeared", "below_10", "boss_defeated", "first_hit", "final_hit"]) {
    assert.match(notificationFunction, new RegExp(type));
  }
  assert.doesNotMatch(notificationFunction, /below_50|special_attack/);
});

test("notification function requires its cron secret and claims only boss queue", () => {
  assert.match(notificationFunction, /WORLD_BOSS_NOTIFICATION_CRON_SECRET/);
  assert.match(notificationFunction, /x-cron-secret/);
  assert.match(notificationFunction, /claim_world_boss_notification_queue/);
  assert.doesNotMatch(notificationFunction, /claim_leaderboard_notification_queue/);
});

test("lifecycle draft preserves failed boss and rotates only after defeat", () => {
  assert.match(migration, /if found and v_previous\.remaining_hp = 0 then/);
  assert.match(migration, /elsif found then[\s\S]*v_boss_key := v_previous\.boss_key/);
  assert.match(migration, /No cron is created|no cron is created/i);
  assert.doesNotMatch(migration, /cron\.schedule\s*\(/i);
});

test("settlement page includes top ten and the participant actual rank", () => {
  assert.match(migration, /reward\.final_rank <= 10/);
  assert.match(migration, /reward\.user_id = auth\.uid\(\)/);
  assert.match(runtime, /我的第 \$\{me\.rank\} 名/);
});

test("Phase 2 RPC allowlist remains identical in source and generated runtime", () => {
  for (const rpc of [
    "exchange_and_attack_world_boss", "get_world_boss_battle_context",
    "get_world_boss_settlement", "get_my_world_boss_notifications",
    "read_world_boss_notification",
  ]) {
    assert.match(auth, new RegExp(`"${rpc}"`));
    assert.match(authRuntime, new RegExp(`"${rpc}"`));
  }
});

test("old backend fallback remains safe and cannot spin forever", () => {
  assert.match(runtime, /result = await rpc\("get_world_boss_status"\)/);
  assert.match(runtime, /state\.status = isUnavailable\(error\) \? "unavailable" : "error"/);
  assert.match(runtime, /世界 Boss 尚未出沒/);
  assert.match(runtime, /const resultDeadline = state\.event\?\.ends_at[\s\S]*2 \* 60 \* 60 \* 1000/);
  assert.match(runtime, /const defeated = resultVisible[\s\S]*remaining_hp[\s\S]*status === "defeated"/);
  assert.match(runtime, /label\.textContent = "樹麻雀出沒了！"/);
  assert.match(runtime, /label\.textContent = "樹麻雀被擊倒了！"/);
  assert.match(runtime, /label\.textContent = "討伐失敗！"/);
  assert.match(runtime, /button\.classList\.toggle\("is-dormant", !active && !defeated\)/);
  assert.match(runtime, /icon\.src = defeated[\s\S]*boss入口iocn\(死亡狀態）\.png[\s\S]*boss入口icon\.png/);
  assert.match(css, /\.world-boss-entry \{[\s\S]*border: 0;[\s\S]*background: transparent;/);
  assert.match(css, /\.world-boss-entry span \{[\s\S]*background: rgba\(255, 245, 218, 0\.94\);[\s\S]*white-space: nowrap;/);
  assert.match(css, /\.world-boss-entry\.is-dormant img \{[\s\S]*grayscale\(1\)/);
});
