const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const migration = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/202607300002_add_world_boss_notification_dispatcher.sql",
  ),
  "utf8",
);

test("World Boss dispatcher reads only the approved Vault entries", () => {
  assert.match(
    migration,
    /create or replace function public\.dispatch_world_boss_notification_queue\(\)\s+returns boolean/i,
  );
  assert.match(migration, /from vault\.decrypted_secrets/);
  assert.match(migration, /world_boss_notification_function_url/);
  assert.match(migration, /world_boss_notification_cron_secret/);
  assert.doesNotMatch(
    migration,
    /https:\/\/[a-z0-9-]+\.supabase\.co|eyJ[A-Za-z0-9_-]+|service_role\s*=/i,
  );
});

test("World Boss dispatcher sends one protected pg_net request", () => {
  assert.match(migration, /perform net\.http_post\s*\(/);
  assert.match(
    migration,
    /'x-cron-secret',\s*v_cron_secret/,
  );
  assert.match(migration, /body := '\{\}'::jsonb/);
  assert.match(migration, /timeout_milliseconds := 15000/);
});

test("missing Vault values and dispatch errors fail closed", () => {
  assert.match(
    migration,
    /if nullif\(pg_catalog\.btrim\(v_function_url\), ''\) is null[\s\S]*nullif\(pg_catalog\.btrim\(v_cron_secret\), ''\) is null then\s+return false;/i,
  );
  assert.match(
    migration,
    /exception\s+when others then\s+return false;/i,
  );
});

test("dispatcher execution is restricted to service_role", () => {
  const signature = "public\\.dispatch_world_boss_notification_queue\\(\\)";
  assert.match(
    migration,
    new RegExp(
      `revoke all on function ${signature}\\s+from public, anon, authenticated;`,
      "i",
    ),
  );
  assert.match(
    migration,
    new RegExp(`grant execute on function ${signature}\\s+to service_role;`, "i"),
  );
  assert.doesNotMatch(
    migration,
    /grant execute on function public\.dispatch_world_boss_notification_queue\(\)\s+to (public|anon|authenticated)/i,
  );
});

test("both World Boss jobs run every five minutes with exact entry points", () => {
  assert.match(
    migration,
    /cron\.schedule\(\s*'chromatica-world-boss-lifecycle',\s*'\*\/5 \* \* \* \*',\s*'select public\.run_world_boss_lifecycle\(\);'/,
  );
  assert.match(
    migration,
    /cron\.schedule\(\s*'chromatica-dispatch-world-boss-notifications',\s*'\*\/5 \* \* \* \*',\s*'select public\.dispatch_world_boss_notification_queue\(\);'/,
  );
  assert.match(
    migration,
    /where job\.jobname in \([\s\S]*chromatica-world-boss-lifecycle[\s\S]*chromatica-dispatch-world-boss-notifications/,
  );
});

test("dispatcher migration does not touch World Boss gameplay or reward data", () => {
  assert.doesNotMatch(
    migration,
    /\b(insert|update|delete|truncate)\s+(into\s+|from\s+)?public\.(world_boss|game_saves)/i,
  );
  assert.doesNotMatch(
    migration,
    /\b(attack_world_boss|settle_world_boss_event|apply_world_boss_reward_items)\s*\(/i,
  );
});
