import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ACCOUNT_MIGRATION_KEY,
  ACTIVE_ACCOUNT_KEY,
  getAccountSnapshotKey,
  storeAccountSnapshot,
} from "../account-workspace.js";
import {
  CLOUD_BACKUP_PREFIX,
  CLOUD_SYNC_META_PREFIX,
  createCloudSaveService,
  fetchCloudGameSave,
  hashAccountSnapshot,
  readCloudSyncMeta,
  saveSnapshotToCloud,
} from "../cloud-save.js";

class MemoryStorage {
  #data = new Map();
  get length() { return this.#data.size; }
  key(index) { return [...this.#data.keys()][index] ?? null; }
  getItem(key) { return this.#data.has(key) ? this.#data.get(key) : null; }
  setItem(key, value) { this.#data.set(String(key), String(value)); }
  removeItem(key) { this.#data.delete(String(key)); }
}

function makeSnapshot(userId, drops, updatedAt = "2026-07-16T00:00:00.000Z") {
  return {
    schemaVersion: 1,
    userId,
    updatedAt,
    data: {
      "chromatica.waterDrops": String(drops),
      "chromatica.currentPlant": JSON.stringify({ id: `plant-${drops}` }),
    },
  };
}

class MockSupabaseClient {
  constructor(rows = new Map()) {
    this.rows = rows;
    this.rpcCalls = [];
    this.readError = null;
    this.rpcError = null;
  }

  from(table) {
    assert.equal(table, "game_saves");
    const rejectDirectWrite = () => {
      throw new Error("Direct game_saves writes are forbidden in tests.");
    };
    return {
      select: () => ({
        eq: (_column, value) => {
          return {
            maybeSingle: async () => ({ data: this.rows.get(value) || null, error: this.readError }),
          };
        },
      }),
      delete: rejectDirectWrite,
      insert: rejectDirectWrite,
      update: rejectDirectWrite,
      upsert: rejectDirectWrite,
    };
  }

  async rpc(name, params) {
    assert.equal(name, "save_game_state");
    this.rpcCalls.push(structuredClone(params));
    if (this.rpcError) return { data: null, error: this.rpcError };
    const userId = params.p_snapshot.userId;
    const current = this.rows.get(userId);
    if (!current && params.p_expected_revision !== 0) return { data: { status: "missing" }, error: null };
    if (current && current.revision !== params.p_expected_revision) {
      return { data: { status: "conflict", remote_revision: current.revision }, error: null };
    }
    const revision = current ? current.revision + 1 : 1;
    const updatedAt = new Date().toISOString();
    this.rows.set(userId, {
      user_id: userId,
      schema_version: params.p_schema_version,
      revision,
      snapshot: structuredClone(params.p_snapshot),
      client_updated_at: params.p_client_updated_at,
      updated_at: updatedAt,
      created_at: current?.created_at || updatedAt,
    });
    return { data: { status: current ? "updated" : "created", revision, updated_at: updatedAt }, error: null };
  }
}

test("snapshot hash is deterministic and ignores updatedAt", async () => {
  const first = makeSnapshot("user-a", 12, "2026-07-16T01:00:00.000Z");
  const second = {
    ...makeSnapshot("user-a", 12, "2026-07-16T02:00:00.000Z"),
    data: {
      "chromatica.currentPlant": JSON.stringify({ id: "plant-12" }),
      "chromatica.waterDrops": "12",
    },
  };
  assert.equal(await hashAccountSnapshot(first), await hashAccountSnapshot(second));
});

test("cloud fetch distinguishes found, missing, and errors", async () => {
  const row = {
    user_id: "user-a",
    schema_version: 1,
    revision: 3,
    snapshot: makeSnapshot("user-a", 8),
    client_updated_at: "2026-07-16T00:00:00.000Z",
    updated_at: "2026-07-16T00:01:00.000Z",
    created_at: "2026-07-16T00:00:00.000Z",
  };
  const client = new MockSupabaseClient(new Map([["user-a", row]]));
  assert.equal((await fetchCloudGameSave(client, "user-a")).kind, "found");
  assert.equal((await fetchCloudGameSave(client, "user-b")).kind, "missing");
  client.readError = { message: "Failed to fetch" };
  assert.equal((await fetchCloudGameSave(client, "user-b")).kind, "error");
});

test("PostgreSQL bigint revisions returned as digit strings are normalized safely", async () => {
  const snapshot = makeSnapshot("user-a", 8);
  const row = {
    user_id: "user-a",
    schema_version: 1,
    revision: "3",
    snapshot,
    client_updated_at: snapshot.updatedAt,
    updated_at: snapshot.updatedAt,
    created_at: snapshot.updatedAt,
  };
  const client = new MockSupabaseClient(new Map([["user-a", row]]));
  const fetched = await fetchCloudGameSave(client, "user-a");
  assert.equal(fetched.kind, "found");
  assert.equal(fetched.row.revision, 3);

  client.rpc = async () => ({
    data: { status: "updated", revision: "4", updated_at: snapshot.updatedAt },
    error: null,
  });
  const saved = await saveSnapshotToCloud(client, snapshot, 3);
  assert.equal(saved.kind, "result");
  assert.equal(saved.revision, 4);
});

test("corrupt cloud metadata is rebuilt without deleting the account snapshot", () => {
  const storage = new MemoryStorage();
  const snapshot = makeSnapshot("user-a", 17);
  storeAccountSnapshot("user-a", snapshot, storage);
  storage.setItem(`${CLOUD_SYNC_META_PREFIX}user-a`, "{not-json");

  const meta = readCloudSyncMeta("user-a", storage);
  assert.equal(meta.status, "pending");
  assert.equal(meta.lastErrorCode, "invalid-local-meta");
  assert.ok(storage.getItem(getAccountSnapshotKey("user-a")));
  assert.equal(storage.getItem(`${CLOUD_SYNC_META_PREFIX}user-a`), null);
});

test("invalid or newer remote data is rejected without touching the local workspace", async () => {
  const storage = new MemoryStorage();
  const local = makeSnapshot("user-a", 9);
  storage.setItem(ACTIVE_ACCOUNT_KEY, "user-a");
  storeAccountSnapshot("user-a", local, storage);
  Object.entries(local.data).forEach(([key, value]) => storage.setItem(key, value));
  const client = new MockSupabaseClient(new Map([["user-a", {
    user_id: "user-a",
    schema_version: 2,
    revision: 4,
    snapshot: { ...local, schemaVersion: 2 },
    updated_at: local.updatedAt,
  }]]));
  const service = createCloudSaveService({ client, storage });

  const result = await service.reconcileStartup("user-a", local);
  assert.equal(result.kind, "fatal");
  assert.equal(result.code, "unsupported-schema");
  assert.equal(storage.getItem("chromatica.waterDrops"), "9");
});

test("a local-only workspace is created remotely with expected revision zero", async () => {
  const storage = new MemoryStorage();
  const client = new MockSupabaseClient();
  const snapshot = makeSnapshot("user-a", 21);
  storage.setItem(ACTIVE_ACCOUNT_KEY, "user-a");
  storeAccountSnapshot("user-a", snapshot, storage);
  Object.entries(snapshot.data).forEach(([key, value]) => storage.setItem(key, value));
  const service = createCloudSaveService({ client, storage });

  const result = await service.reconcileStartup("user-a", snapshot);
  assert.equal(result.kind, "local-ready");
  await service.syncNow("test");
  assert.equal(client.rpcCalls[0].p_expected_revision, 0);
  assert.equal(client.rows.get("user-a").snapshot.data["chromatica.waterDrops"], "21");
  assert.equal(readCloudSyncMeta("user-a", storage).status, "synced");
});

test("an unknown local and remote divergence automatically uses validated cloud progress", async () => {
  const storage = new MemoryStorage();
  const local = makeSnapshot("user-a", 5);
  const remote = makeSnapshot("user-a", 44);
  storage.setItem(ACTIVE_ACCOUNT_KEY, "user-a");
  storeAccountSnapshot("user-a", local, storage);
  Object.entries(local.data).forEach(([key, value]) => storage.setItem(key, value));
  const client = new MockSupabaseClient(new Map([["user-a", {
    user_id: "user-a",
    schema_version: 1,
    revision: 7,
    snapshot: remote,
    client_updated_at: remote.updatedAt,
    updated_at: remote.updatedAt,
    created_at: remote.updatedAt,
  }]]));
  const service = createCloudSaveService({ client, storage });

  const result = await service.reconcileStartup("user-a", local);
  assert.equal(result.kind, "remote-applied");
  assert.equal(storage.getItem("chromatica.waterDrops"), "44");
  assert.equal(readCloudSyncMeta("user-a", storage).conflict, false);
  assert.equal(JSON.parse(storage.getItem(getAccountSnapshotKey("user-a"))).data["chromatica.waterDrops"], "44");
});

test("a concurrent revision conflict automatically reloads the latest cloud progress", async () => {
  const storage = new MemoryStorage();
  const initial = makeSnapshot("user-a", 11);
  storage.setItem(ACTIVE_ACCOUNT_KEY, "user-a");
  storeAccountSnapshot("user-a", initial, storage);
  Object.entries(initial.data).forEach(([key, value]) => storage.setItem(key, value));
  const client = new MockSupabaseClient(new Map([["user-a", {
    user_id: "user-a",
    schema_version: 1,
    revision: 6,
    snapshot: initial,
    client_updated_at: initial.updatedAt,
    updated_at: initial.updatedAt,
    created_at: initial.updatedAt,
  }]]));
  let remoteReloaded = false;
  const service = createCloudSaveService({
    client,
    storage,
    onRemoteApplied: async () => { remoteReloaded = true; },
  });
  assert.equal((await service.reconcileStartup("user-a", initial)).kind, "local-ready");

  const otherDevice = makeSnapshot("user-a", 44, "2026-07-16T01:00:00.000Z");
  client.rows.set("user-a", {
    ...client.rows.get("user-a"),
    revision: 7,
    snapshot: otherDevice,
    updated_at: otherDevice.updatedAt,
  });
  const localChange = makeSnapshot("user-a", 19, "2026-07-16T02:00:00.000Z");
  storeAccountSnapshot("user-a", localChange, storage);
  Object.entries(localChange.data).forEach(([key, value]) => storage.setItem(key, value));

  const result = await service.noteLocalSnapshot(localChange, { immediate: true });
  assert.equal(result.status, "synced");
  assert.equal(remoteReloaded, true);
  assert.equal(storage.getItem("chromatica.waterDrops"), "44");
  assert.equal(client.rows.get("user-a").snapshot.data["chromatica.waterDrops"], "44");
});

test("reset replaces cloud and local progress with the same clean snapshot through RPC", async () => {
  const storage = new MemoryStorage();
  const initial = makeSnapshot("user-a", 28);
  storage.setItem(ACTIVE_ACCOUNT_KEY, "user-a");
  storeAccountSnapshot("user-a", initial, storage);
  Object.entries(initial.data).forEach(([key, value]) => storage.setItem(key, value));
  storage.setItem("chromatica-daily-goal-2026-07-17", JSON.stringify({ completed: true }));
  storage.setItem("chromatica.settings.sound", JSON.stringify({ click: false }));
  storage.setItem(ACCOUNT_MIGRATION_KEY, JSON.stringify({
    schemaVersion: 1,
    migratedToUserId: "user-a",
    migratedAt: "2026-07-16T00:00:00.000Z",
  }));
  storeAccountSnapshot("user-b", makeSnapshot("user-b", 9), storage);
  const client = new MockSupabaseClient(new Map([["user-a", {
    user_id: "user-a",
    schema_version: 1,
    revision: 3,
    snapshot: initial,
    client_updated_at: initial.updatedAt,
    updated_at: initial.updatedAt,
    created_at: initial.updatedAt,
  }]]));
  const service = createCloudSaveService({ client, storage });
  await service.reconcileStartup("user-a", initial);

  client.rpcCalls.length = 0;
  const reset = await service.resetCurrentWorkspace({ userId: "user-a" });
  assert.equal(reset.ok, true);
  assert.equal(client.rpcCalls.length, 1);
  assert.equal(client.rpcCalls[0].p_expected_revision, 3);
  assert.equal(client.rows.get("user-a").revision, 4);
  assert.deepEqual(client.rows.get("user-a").snapshot, reset.snapshot);
  assert.equal(storage.getItem(ACTIVE_ACCOUNT_KEY), "user-a");
  assert.equal(storage.getItem("chromatica.waterDrops"), null);
  assert.equal(storage.getItem("chromatica-daily-goal-2026-07-17"), null);
  assert.equal(storage.getItem("chromatica.settings.sound"), JSON.stringify({ click: false }));
  assert.ok(storage.getItem(getAccountSnapshotKey("user-a")));
  assert.ok(storage.getItem(getAccountSnapshotKey("user-b")));
  assert.ok(storage.getItem(ACCOUNT_MIGRATION_KEY));
  assert.ok([...Array(storage.length).keys()]
    .map((index) => storage.key(index))
    .some((key) => key.startsWith(`${CLOUD_BACKUP_PREFIX}user-a.`)));
  assert.ok(Object.values(reset.snapshot.data).every((value) => value === null));
  const meta = readCloudSyncMeta("user-a", storage);
  assert.equal(meta.baseRevision, 4);
  assert.equal(meta.remoteRevision, null);
  assert.equal(meta.status, "synced");
  assert.equal(meta.dirty, false);
});

test("reset creates a missing remote row with expected revision zero", async () => {
  const storage = new MemoryStorage();
  storage.setItem(ACTIVE_ACCOUNT_KEY, "user-a");
  const client = new MockSupabaseClient();
  const service = createCloudSaveService({ client, storage });
  await service.reconcileStartup("user-a", null);
  client.rpcCalls.length = 0;

  const reset = await service.resetCurrentWorkspace({ userId: "user-a" });
  assert.equal(reset.ok, true);
  assert.equal(client.rpcCalls.length, 1);
  assert.equal(client.rpcCalls[0].p_expected_revision, 0);
  assert.equal(client.rows.get("user-a").revision, 1);
  assert.deepEqual(client.rows.get("user-a").snapshot, reset.snapshot);
});

test("reset fetch and RPC failures preserve the canonical and account snapshots", async () => {
  for (const failure of ["fetch", "rpc"]) {
    const storage = new MemoryStorage();
    const initial = makeSnapshot("user-a", 38);
    storage.setItem(ACTIVE_ACCOUNT_KEY, "user-a");
    storeAccountSnapshot("user-a", initial, storage);
    Object.entries(initial.data).forEach(([key, value]) => storage.setItem(key, value));
    const client = new MockSupabaseClient(new Map([["user-a", {
      user_id: "user-a",
      schema_version: 1,
      revision: 2,
      snapshot: initial,
      updated_at: initial.updatedAt,
    }]]));
    const service = createCloudSaveService({ client, storage });
    await service.reconcileStartup("user-a", initial);
    if (failure === "fetch") client.readError = { message: "Failed to fetch" };
    else client.rpcError = { message: "permission denied", status: 403 };

    const reset = await service.resetCurrentWorkspace({ userId: "user-a" });
    assert.equal(reset.ok, false);
    assert.equal(storage.getItem("chromatica.waterDrops"), "38");
    assert.deepEqual(JSON.parse(storage.getItem(getAccountSnapshotKey("user-a"))).data, initial.data);
    assert.equal(client.rows.get("user-a").snapshot.data["chromatica.waterDrops"], "38");
  }
});

test("reset retries a revision conflict once and never overwrites local data after a second conflict", async () => {
  for (const persistentConflict of [false, true]) {
    const storage = new MemoryStorage();
    const initial = makeSnapshot("user-a", 48);
    storage.setItem(ACTIVE_ACCOUNT_KEY, "user-a");
    storeAccountSnapshot("user-a", initial, storage);
    Object.entries(initial.data).forEach(([key, value]) => storage.setItem(key, value));
    const client = new MockSupabaseClient(new Map([["user-a", {
      user_id: "user-a",
      schema_version: 1,
      revision: 5,
      snapshot: initial,
      updated_at: initial.updatedAt,
    }]]));
    const originalRpc = client.rpc.bind(client);
    let conflicts = 0;
    client.rpc = async (name, params) => {
      if (conflicts < (persistentConflict ? 2 : 1)) {
        conflicts += 1;
        client.rpcCalls.push(structuredClone(params));
        const row = client.rows.get("user-a");
        client.rows.set("user-a", { ...row, revision: row.revision + 1 });
        return { data: { status: "conflict", remote_revision: row.revision + 1 }, error: null };
      }
      return originalRpc(name, params);
    };
    const service = createCloudSaveService({ client, storage });
    await service.reconcileStartup("user-a", initial);
    client.rpcCalls.length = 0;

    const reset = await service.resetCurrentWorkspace({ userId: "user-a" });
    assert.equal(client.rpcCalls.length, 2);
    if (persistentConflict) {
      assert.equal(reset.ok, false);
      assert.equal(reset.code, "reset-conflict");
      assert.equal(storage.getItem("chromatica.waterDrops"), "48");
      assert.equal(JSON.parse(storage.getItem(getAccountSnapshotKey("user-a"))).data["chromatica.waterDrops"], "48");
    } else {
      assert.equal(reset.ok, true);
      assert.equal(storage.getItem("chromatica.waterDrops"), null);
      assert.deepEqual(client.rows.get("user-a").snapshot, reset.snapshot);
    }
  }
});

test("RPC missing stops after one write and does not retry as a new row", async () => {
  const storage = new MemoryStorage();
  const initial = makeSnapshot("user-a", 24);
  storage.setItem(ACTIVE_ACCOUNT_KEY, "user-a");
  storeAccountSnapshot("user-a", initial, storage);
  Object.entries(initial.data).forEach(([key, value]) => storage.setItem(key, value));
  const client = new MockSupabaseClient(new Map([["user-a", {
    user_id: "user-a",
    schema_version: 1,
    revision: 5,
    snapshot: initial,
    client_updated_at: initial.updatedAt,
    updated_at: initial.updatedAt,
    created_at: initial.updatedAt,
  }]]));
  const service = createCloudSaveService({ client, storage });
  await service.reconcileStartup("user-a", initial);
  client.rows.delete("user-a");
  const changed = makeSnapshot("user-a", 25);
  storeAccountSnapshot("user-a", changed, storage);
  Object.entries(changed.data).forEach(([key, value]) => storage.setItem(key, value));
  client.rpcCalls.length = 0;
  const result = await service.noteLocalSnapshot(changed, { immediate: true });
  assert.equal(client.rpcCalls.length, 1);
  assert.equal(client.rpcCalls[0].p_expected_revision, 5);
  assert.equal(result.status, "error");
  assert.equal(result.lastErrorCode, "remote-missing");
});

test("oversized snapshots remain local and are not sent to the RPC", async () => {
  const storage = new MemoryStorage();
  const initial = makeSnapshot("user-a", 1);
  storage.setItem(ACTIVE_ACCOUNT_KEY, "user-a");
  storeAccountSnapshot("user-a", initial, storage);
  Object.entries(initial.data).forEach(([key, value]) => storage.setItem(key, value));
  const client = new MockSupabaseClient(new Map([["user-a", {
    user_id: "user-a",
    schema_version: 1,
    revision: 1,
    snapshot: initial,
    client_updated_at: initial.updatedAt,
    updated_at: initial.updatedAt,
    created_at: initial.updatedAt,
  }]]));
  const service = createCloudSaveService({ client, storage });
  await service.reconcileStartup("user-a", initial);
  const oversized = makeSnapshot("user-a", 2);
  oversized.data["chromatica.waterDrops"] = "x".repeat((2 * 1024 * 1024) + 1);
  storeAccountSnapshot("user-a", oversized, storage);
  Object.entries(oversized.data).forEach(([key, value]) => storage.setItem(key, value));
  client.rpcCalls.length = 0;
  const result = await service.noteLocalSnapshot(oversized, { immediate: true });
  assert.equal(result.status, "error");
  assert.equal(result.lastErrorCode, "snapshot-too-large");
  assert.equal(client.rpcCalls.length, 0);
  assert.ok(storage.getItem(getAccountSnapshotKey("user-a")));
});

test("a remote-only workspace is restored before app initialization", async () => {
  const storage = new MemoryStorage();
  const remote = makeSnapshot("user-a", 33);
  storage.setItem(ACTIVE_ACCOUNT_KEY, "user-a");
  const client = new MockSupabaseClient(new Map([["user-a", {
    user_id: "user-a",
    schema_version: 1,
    revision: 2,
    snapshot: remote,
    client_updated_at: remote.updatedAt,
    updated_at: remote.updatedAt,
    created_at: remote.updatedAt,
  }]]));
  const service = createCloudSaveService({ client, storage });
  const result = await service.reconcileStartup("user-a", null);
  assert.equal(result.kind, "remote-applied");
  assert.equal(storage.getItem("chromatica.waterDrops"), "33");
  assert.equal(readCloudSyncMeta("user-a", storage).baseRevision, 2);
});

test("an in-flight save from a previous account cannot block the next account", async () => {
  const storage = new MemoryStorage();
  const client = new MockSupabaseClient();
  const first = makeSnapshot("user-a", 10);
  const second = makeSnapshot("user-b", 20);
  let releaseFirstSave;
  let markFirstSaveStarted;
  const firstSaveStarted = new Promise((resolve) => { markFirstSaveStarted = resolve; });
  const firstSaveGate = new Promise((resolve) => { releaseFirstSave = resolve; });
  const originalRpc = client.rpc.bind(client);
  client.rpc = async (name, params) => {
    if (params.p_snapshot.userId === "user-a") {
      markFirstSaveStarted();
      await firstSaveGate;
    }
    return originalRpc(name, params);
  };

  storage.setItem(ACTIVE_ACCOUNT_KEY, "user-a");
  storeAccountSnapshot("user-a", first, storage);
  Object.entries(first.data).forEach(([key, value]) => storage.setItem(key, value));
  const service = createCloudSaveService({ client, storage });
  await service.reconcileStartup("user-a", first);
  const oldFlight = service.syncNow("first-account");
  await firstSaveStarted;

  storage.setItem(ACTIVE_ACCOUNT_KEY, "user-b");
  storeAccountSnapshot("user-b", second, storage);
  Object.entries(second.data).forEach(([key, value]) => storage.setItem(key, value));
  await service.reconcileStartup("user-b", second);
  await service.syncNow("second-account");

  assert.equal(client.rows.get("user-b").snapshot.data["chromatica.waterDrops"], "20");
  assert.equal(service.getActiveUserId(), "user-b");
  assert.equal(service.getState().status, "synced");

  releaseFirstSave();
  await oldFlight;
  assert.equal(service.getActiveUserId(), "user-b");
  assert.equal(service.getState().status, "synced");
});

test("account UI has no persistent sync panel and reset has no direct table writes", () => {
  const indexSource = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const appSource = readFileSync(new URL("../app.js", import.meta.url), "utf8");
  const authSource = readFileSync(new URL("../auth-entry.js", import.meta.url), "utf8");
  const cloudSource = readFileSync(new URL("../cloud-save.js", import.meta.url), "utf8");

  assert.doesNotMatch(indexSource, /longToneCompleteScore|平均穩定度/);
  assert.doesNotMatch(appSource, /longToneCompleteScore/);
  assert.doesNotMatch(indexSource, /cloudSyncPanel|cloudSyncNowBtn|已同步至雲端/);
  assert.doesNotMatch(authSource, /handleManualCloudSync|cloudSyncNow/);
  assert.match(appSource, /id:\s*["']interval-variety-5["'][^\n]+required:\s*5/);
  assert.doesNotMatch(cloudSource, /\.from\(["']game_saves["']\)[\s\S]{0,160}\.(?:delete|insert|update|upsert)\s*\(/);
  assert.match(cloudSource, /client\.rpc\(["']save_game_state["']/);
  assert.match(cloudSource, /handleForeground/);
  assert.match(cloudSource, /handleOnline/);
  assert.match(cloudSource, /prepareForSignOut/);
});
