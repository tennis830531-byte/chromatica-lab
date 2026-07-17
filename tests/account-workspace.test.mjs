import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCOUNT_SCOPED_KEYS,
  ACCOUNT_MIGRATION_KEY,
  ACTIVE_ACCOUNT_KEY,
  clearSignedOutWorkspace,
  createCleanAccountSnapshot,
  getAccountSnapshotKey,
  readAccountSnapshot,
  readAccountMigration,
  resetAccountWorkspace,
  saveActiveAccountSnapshot,
  switchAccountWorkspace,
} from "../account-workspace.js";

class MemoryStorage {
  #data = new Map();
  get length() { return this.#data.size; }
  key(index) { return [...this.#data.keys()][index] ?? null; }
  getItem(key) { return this.#data.has(key) ? this.#data.get(key) : null; }
  setItem(key, value) { this.#data.set(String(key), String(value)); }
  removeItem(key) { this.#data.delete(String(key)); }
}

test("clean account snapshot uses the strict account allowlist with null values", () => {
  const snapshot = createCleanAccountSnapshot("user-a", "2026-07-17T00:00:00.000Z");
  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.userId, "user-a");
  assert.equal(snapshot.updatedAt, "2026-07-17T00:00:00.000Z");
  assert.deepEqual(Object.keys(snapshot.data).sort(), [...ACCOUNT_SCOPED_KEYS].sort());
  assert.ok(Object.values(snapshot.data).every((value) => value === null));
  assert.equal(Object.hasOwn(snapshot.data, "chromatica.settings.sound"), false);
  assert.equal(Object.hasOwn(snapshot.data, "chromatica.settings.display"), false);
});

test("legacy data migrates once, accounts stay isolated, and device settings remain shared", () => {
  const storage = new MemoryStorage();
  storage.setItem("chromatica.waterDrops", "17");
  storage.setItem("practiceHistory", JSON.stringify({ legacy: true }));
  storage.setItem("chromatica-daily-goal-2026-07-16", JSON.stringify({ complete: true }));
  storage.setItem("chromatica.settings.sound", JSON.stringify({ click: false }));
  storage.setItem("chromatica.settings.display", JSON.stringify({ motion: true }));

  const accountA = switchAccountWorkspace("user-a", storage);
  assert.equal(accountA.mode, "migrated");
  assert.equal(readAccountMigration(storage).migratedToUserId, "user-a");
  assert.equal(readAccountMigration(storage).schemaVersion, 1);
  assert.equal(readAccountSnapshot("user-a", storage).data["chromatica.waterDrops"], "17");

  storage.setItem("chromatica.waterDrops", "31");
  storage.setItem("chromatica.currentPlant", JSON.stringify({ id: "plant-a" }));
  saveActiveAccountSnapshot(storage);
  clearSignedOutWorkspace(storage);
  assert.equal(storage.getItem("chromatica.waterDrops"), null);
  assert.equal(storage.getItem(ACTIVE_ACCOUNT_KEY), null);
  assert.equal(storage.getItem("chromatica.settings.sound"), JSON.stringify({ click: false }));

  const accountB = switchAccountWorkspace("user-b", storage);
  assert.equal(accountB.mode, "new");
  assert.equal(storage.getItem("chromatica.waterDrops"), null);
  storage.setItem("chromatica.waterDrops", "4");
  storage.setItem("chromatica.currentPlant", JSON.stringify({ id: "plant-b" }));
  saveActiveAccountSnapshot(storage);
  clearSignedOutWorkspace(storage);

  assert.equal(switchAccountWorkspace("user-a", storage).mode, "restored");
  assert.equal(storage.getItem("chromatica.waterDrops"), "31");
  assert.equal(JSON.parse(storage.getItem("chromatica.currentPlant")).id, "plant-a");
  clearSignedOutWorkspace(storage);

  assert.equal(switchAccountWorkspace("user-b", storage).mode, "restored");
  assert.equal(storage.getItem("chromatica.waterDrops"), "4");
  assert.equal(JSON.parse(storage.getItem("chromatica.currentPlant")).id, "plant-b");
  assert.ok(storage.getItem(getAccountSnapshotKey("user-a")));
  assert.ok(storage.getItem(getAccountSnapshotKey("user-b")));
  assert.equal(storage.getItem("chromatica.settings.display"), JSON.stringify({ motion: true }));
});

test("a corrupt snapshot is rejected without being overwritten", () => {
  const storage = new MemoryStorage();
  const corrupt = "{not-json";
  storage.setItem(getAccountSnapshotKey("user-a"), corrupt);
  assert.throws(() => switchAccountWorkspace("user-a", storage), /valid JSON/);
  assert.equal(storage.getItem(getAccountSnapshotKey("user-a")), corrupt);
});

test("a contradictory one-time migration marker fails without clearing legacy data", () => {
  const storage = new MemoryStorage();
  storage.setItem("chromatica.waterDrops", "19");
  storage.setItem(ACCOUNT_MIGRATION_KEY, JSON.stringify({
    schemaVersion: 1,
    migratedToUserId: "user-a",
    migratedAt: "2026-07-16T00:00:00.000Z",
  }));
  assert.throws(() => switchAccountWorkspace("user-a", storage), /conflicts/);
  assert.equal(storage.getItem("chromatica.waterDrops"), "19");
  assert.equal(storage.getItem(getAccountSnapshotKey("user-a")), null);
});

test("reset clears only the active account snapshot and scoped workspace", () => {
  const storage = new MemoryStorage();
  storage.setItem(ACTIVE_ACCOUNT_KEY, "user-a");
  storage.setItem("chromatica.waterDrops", "12");
  storage.setItem("chromatica.settings.sound", JSON.stringify({ click: false }));
  saveActiveAccountSnapshot(storage);
  storage.setItem(getAccountSnapshotKey("user-b"), JSON.stringify({
    schemaVersion: 1,
    userId: "user-b",
    updatedAt: "2026-07-16T00:00:00.000Z",
    data: { "chromatica.waterDrops": "9" },
  }));

  resetAccountWorkspace("user-a", storage);

  assert.equal(storage.getItem(ACTIVE_ACCOUNT_KEY), "user-a");
  assert.equal(storage.getItem("chromatica.waterDrops"), null);
  assert.equal(storage.getItem(getAccountSnapshotKey("user-a")), null);
  assert.ok(storage.getItem(getAccountSnapshotKey("user-b")));
  assert.equal(storage.getItem("chromatica.settings.sound"), JSON.stringify({ click: false }));
});
