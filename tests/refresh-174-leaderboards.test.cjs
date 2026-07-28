const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const migration = read("supabase/migrations/202607270001_add_cultivator_leaderboard_weekly_rewards.sql");
const leaderboard = read("leaderboard.js");
const app = read("app.js");
const html = read("index.html");
const coreSource = read("leaderboard-core.js");
const authEntry = read("auth-entry.js");
const authRuntime = read("auth-runtime.js");

const sandbox = { window: {}, globalThis: {}, Intl, Date };
vm.runInNewContext(coreSource, sandbox);
const core = sandbox.window.ChromaticaLeaderboardCore;

test("cultivator metric remains distinct and ranks species before total stages", () => {
  assert.equal(core.normalizeMetric("cultivator"), "cultivator");
  assert.equal(core.normalizeMetric("weekly"), "weekly");
  assert.match(migration, /create table if not exists public\.leaderboard_spirit_progress/);
  assert.match(migration, /order by coalesce\(progress\.species_count, 0\) desc,[\s\S]*coalesce\(progress\.stage_total, 0\) desc/);
  assert.match(migration, /pg_catalog\.count\(\*\)::bigint species_count[\s\S]*pg_catalog\.sum\(lsp\.stage\)/);
  assert.doesNotMatch(migration.match(/create or replace function public\.get_spirit_cultivator_leaderboard\(\)[\s\S]*?end;\n\\$\\$;/)?.[0] || "", /week_start|notification_queue|water_rewards/);
  assert.match(leaderboard, /get_spirit_cultivator_leaderboard/);
  assert.match(leaderboard, /永久排行榜，不會隨每週重置/);
});

test("cultivator sync keeps one validated stage per owned species", () => {
  assert.match(app, /function getLeaderboardCultivatorProgress\(\)[\s\S]*progress\.set\(species, Math\.max\(progress\.get\(species\) \|\| 0, stage\)\)/);
  assert.match(leaderboard, /sync_spirit_cultivator_progress[\s\S]*getCultivatorProgress/);
  assert.match(migration, /species in \('melody-sprout', 'mushroom-spirit', 'flower-spirit', 'lucky-clover-spirit', 'lotus-spirit', 'cactus-spirit'\)/);
  assert.match(migration, /stage smallint not null check \(stage between 1 and 3\)/);
  assert.match(migration, /on conflict \(user_id, species\) do update[\s\S]*greatest\(public\.leaderboard_spirit_progress\.stage, excluded\.stage\)/);
});

test("Sunday 11:59 stays in the old Taipei week and noon starts the new week", () => {
  assert.equal(core.taipeiWeekStartKey(new Date("2026-07-26T03:59:59Z")), "2026-07-19");
  assert.equal(core.taipeiWeekStartKey(new Date("2026-07-26T04:00:00Z")), "2026-07-26");
  assert.match(migration, /at time zone 'Asia\/Taipei'\) - interval '12 hours'/);
  assert.match(migration, /'0 4 \* \* 0'/);
  assert.match(html, /每週日 12:00（Asia\/Taipei）開始新一週/);
  assert.match(leaderboard, /cache\?\.weekStart === core\.taipeiWeekStartKey\(\)/);
});

test("weekly top-ten rewards are exact and server-idempotent", () => {
  const expected = [20, 18, 16, 14, 12, 10, 8, 6, 4, 2];
  assert.deepEqual(expected.map((_, index) => 22 - ((index + 1) * 2)), expected);
  assert.match(migration, /22 - \(results\.final_rank \* 2\)/);
  assert.match(migration, /primary key \(week_start, user_id\)/);
  assert.match(migration, /on conflict \(week_start, user_id\) do nothing/);
  assert.match(migration, /results\.final_rank between 1 and 10/);
  assert.match(migration, /leaderboard_weekly_reward_settings[\s\S]*eligible_week_start/);
  assert.match(migration, /status text not null default 'pending'/);
  assert.match(migration, /update public\.game_saves save[\s\S]*revision = v_next_revision/);
  assert.match(migration, /jsonb_set\([\s\S]*chromatica\.waterDrops/);
});

test("weekly reward application survives interruption and isolates notice claims across devices", () => {
  assert.match(migration, /where reward\.user_id = v_user_id[\s\S]*for update skip locked/);
  assert.match(migration, /if v_reward\.status = 'pending'[\s\S]*status = 'applied'/);
  assert.match(migration, /notice_claim_token = p_notice_claim_token/);
  assert.match(migration, /notice_claimed_at < pg_catalog\.now\(\) - interval '30 seconds'/);
  assert.match(migration, /ack_my_weekly_water_reward_notice/);
  assert.match(leaderboard, /claim_my_weekly_water_reward/);
  assert.match(leaderboard, /prepareWeeklyWaterReward/);
  assert.match(leaderboard, /refreshWeeklyWaterReward/);
  assert.match(leaderboard, /ack_my_weekly_water_reward_notice/);
  assert.doesNotMatch(app, /applyWeeklyLeaderboardWaterReward/);
  assert.match(leaderboard, /rewardClaimGeneration === context\.generation/);
  assert.match(leaderboard, /恭喜你上一週在乖乖練習王獲得第 \$\{rank\} 名，獲得 \$\{water\} 水滴！/);
  assert.match(html, /id="leaderboardWeeklyRewardModal"/);
});

test("leaderboard details modal follows the active tab without changing ranking logic", () => {
  assert.match(html, /id="leaderboardDetailsOpen"[^>]*>詳細說明</);
  assert.match(html, /排名依每週完成的有效練習次數計算/);
  assert.match(html, /每週日中午 12:00（Asia\/Taipei）重置/);
  for (const [rank, water] of [[1,20],[2,18],[3,16],[4,14],[5,12],[6,10],[7,8],[8,6],[9,4],[10,2]]) {
    assert.match(html, new RegExp(`第${rank}名 ${water}💧`));
  }
  assert.match(html, /排名先比較已獲得的精靈種類數/);
  assert.match(html, /第一階段＝1、第二階段＝2、第三階段＝3/);
  assert.match(html, /永久累積，不會每週重置/);
  assert.match(leaderboard, /function openLeaderboardDetails/);
  assert.match(leaderboard, /leaderboardWeeklyDetails[\s\S]*leaderboardCultivatorDetails/);
});

test("existing weekly RPC and notification contract remain compatible", () => {
  const finalize = migration.match(/create or replace function public\.finalize_weekly_leaderboard[\s\S]*?end;\n\\$\\$;/)?.[0] || "";
  assert.doesNotMatch(finalize, /drop table|truncate|delete from/i);
  assert.match(migration, /create or replace function public\.finalize_weekly_leaderboard\(p_week_start date default null\)/);
  assert.match(migration, /'weekly_top_ten_result'/);
  assert.doesNotMatch(migration.match(/get_spirit_cultivator_leaderboard[\s\S]*?end;\n\\$\\$;/)?.[0] || "", /leaderboard_notification_queue/);
});

test("new RPC allowlist is identical in source and generated auth runtime", () => {
  for (const rpcName of [
    "get_spirit_cultivator_leaderboard",
    "sync_spirit_cultivator_progress",
    "claim_my_weekly_water_reward",
    "ack_my_weekly_water_reward_notice",
  ]) {
    assert.match(authEntry, new RegExp(`"${rpcName}"`));
    assert.match(authRuntime, new RegExp(`"${rpcName}"`));
  }
});
