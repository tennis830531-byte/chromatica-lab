const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/202607300001_fix_world_boss_helper_grants.sql"),
  "utf8",
);

const signatures = [
  "public.ensure_world_boss_event\\(timestamptz\\)",
  "public.initialize_world_boss_player\\(uuid, uuid\\)",
  "public.world_boss_harvested_stage\\(uuid, text\\)",
  "public.world_boss_owned_stage\\(uuid, text\\)",
];

test("World Boss helper hotfix uses every complete function signature", () => {
  for (const signature of signatures) {
    assert.equal(
      (migration.match(new RegExp(signature, "g")) || []).length,
      2,
      signature,
    );
  }
});

test("World Boss helpers are revoked from public clients and granted only to service_role", () => {
  for (const signature of signatures) {
    assert.match(
      migration,
      new RegExp(
        `revoke execute on function ${signature}\\s+from public, anon, authenticated;`,
        "i",
      ),
    );
    assert.match(
      migration,
      new RegExp(
        `grant execute on function ${signature}\\s+to service_role;`,
        "i",
      ),
    );
  }
  assert.doesNotMatch(migration, /grant\s+execute[\s\S]*\bto\s+(public|anon|authenticated)\b/i);
});

test("World Boss helper hotfix changes privileges only", () => {
  assert.match(migration, /^\s*begin;/i);
  assert.match(migration, /commit;\s*$/i);
  assert.doesNotMatch(
    migration,
    /\b(create|alter|drop|truncate|insert|update|delete|merge)\b/i,
  );
});
