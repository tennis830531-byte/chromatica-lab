import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const apiUrl = process.env.API_URL || "";
const serviceRoleKey = process.env.SERVICE_ROLE_KEY || "";
const host = (() => { try { return new URL(apiUrl).hostname; } catch { return ""; } })();

assert.ok(["localhost", "127.0.0.1"].includes(host), "second Boss integration requires local Supabase");
assert.ok(serviceRoleKey, "local service role key required");

const admin = createClient(apiUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

async function runLifecycle(timestamp) {
  const result = await admin.rpc("run_world_boss_lifecycle", { p_timestamp: timestamp });
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

test("a defeated tree sparrow rotates to a full-health 5000 HP hill myna next week", async () => {
  const firstTimestamp = "2201-01-02T12:00:00.000Z";
  const secondTimestamp = "2201-01-09T12:00:00.000Z";
  const createdKeys = [];

  try {
    const firstLifecycle = await runLifecycle(firstTimestamp);
    createdKeys.push(firstLifecycle.event_key);
    const first = await admin.from("world_boss_events")
      .select("id,boss_key,max_hp,remaining_hp")
      .eq("event_key", firstLifecycle.event_key)
      .single();
    assert.ifError(first.error);
    assert.equal(first.data.boss_key, "tree-sparrow");
    assert.equal(first.data.max_hp, 3000);

    const defeated = await admin.from("world_boss_events").update({
      status: "closed",
      remaining_hp: 0,
      total_effective_damage: 3000,
      defeated_at: firstTimestamp,
      settling_at: firstTimestamp,
      closed_at: firstTimestamp,
    }).eq("id", first.data.id);
    assert.ifError(defeated.error);

    const secondLifecycle = await runLifecycle(secondTimestamp);
    createdKeys.push(secondLifecycle.event_key);
    const second = await admin.from("world_boss_events")
      .select("boss_key,status,max_hp,remaining_hp")
      .eq("event_key", secondLifecycle.event_key)
      .single();
    assert.ifError(second.error);
    assert.equal(second.data.boss_key, "hill-myna");
    assert.equal(second.data.max_hp, 5000);
    assert.equal(second.data.remaining_hp, 5000);
    assert.equal(second.data.status, "active");
  } finally {
    if (createdKeys.length) {
      const cleanup = await admin.from("world_boss_events").delete().in("event_key", createdKeys);
      assert.ifError(cleanup.error);
    }
  }
});
