export const ACCOUNT_SNAPSHOT_SCHEMA_VERSION = 1;
export const ACCOUNT_SNAPSHOT_PREFIX = "chromatica.accountSnapshot.";
export const ACTIVE_ACCOUNT_KEY = "chromatica.activeAccountId";
export const ACCOUNT_MIGRATION_KEY = "chromatica.accountMigrationV1";
export const DAILY_GOAL_KEY_PREFIX = "chromatica-daily-goal-";

export const ACCOUNT_SCOPED_KEYS = Object.freeze([
  "chromatica.settings.practice",
  "chromatica.settings.tuningA4",
  "chromatica.settings.leaderboardWeeklyResults",
  "chromatica.settings.leaderboardTopTenChanges",
  "chromatica.intervalPracticeHistory",
  "chromatica.homeSpiritTapReward",
  "chromatica.waterDrops",
  "chromatica.currentPlant",
  "chromatica.spiritCollection",
  "chromatica.featuredSpiritId",
  "chromatica.featuredSpiritStage",
  "chromatica.starterPlantSelected",
  "chromatica.rainEventState",
  "chromatica.dailyWaterReward",
  "chromatica.dailyWaterState",
  "chromatica.dailyLoginBonus",
  "chromatica.dailyTaskBonus",
  "chromatica.streakMilestoneRewards",
  "practiceHistory",
  "chromatica.freezeCount",
  "freezeCount",
  "longestStreak",
  "chromatica.lastRewardedStreak",
]);

function requireUserId(userId) {
  if (typeof userId !== "string" || !userId.trim()) {
    throw new Error("A valid authenticated user id is required.");
  }
  return userId.trim();
}

function storageKeys(storage) {
  const keys = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key) keys.push(key);
  }
  return keys;
}

export function getAccountScopedKeys(storage = window.localStorage) {
  const dynamicKeys = storageKeys(storage).filter((key) => key.startsWith(DAILY_GOAL_KEY_PREFIX));
  return [...new Set([...ACCOUNT_SCOPED_KEYS, ...dynamicKeys])].sort();
}

export function getAccountSnapshotKey(userId) {
  return `${ACCOUNT_SNAPSHOT_PREFIX}${requireUserId(userId)}`;
}

export function hasLegacyWorkspaceData(storage = window.localStorage) {
  return getAccountScopedKeys(storage).some((key) => storage.getItem(key) !== null);
}

export function readAccountMigration(storage = window.localStorage) {
  const raw = storage.getItem(ACCOUNT_MIGRATION_KEY);
  if (raw === null) return null;
  let migration;
  try {
    migration = JSON.parse(raw);
  } catch {
    throw new Error("Account migration marker is not valid JSON.");
  }
  if (
    migration?.schemaVersion !== ACCOUNT_SNAPSHOT_SCHEMA_VERSION
    || typeof migration?.migratedToUserId !== "string"
    || !migration.migratedToUserId.trim()
    || typeof migration?.migratedAt !== "string"
    || !migration.migratedAt
  ) {
    throw new Error("Account migration marker validation failed.");
  }
  return migration;
}

export function readAccountSnapshot(userId, storage = window.localStorage) {
  const normalizedUserId = requireUserId(userId);
  const raw = storage.getItem(getAccountSnapshotKey(normalizedUserId));
  if (raw === null) return null;
  let snapshot;
  try {
    snapshot = JSON.parse(raw);
  } catch {
    throw new Error("Account snapshot is not valid JSON.");
  }
  return validateAccountSnapshot(snapshot, normalizedUserId);
}

export function validateAccountSnapshot(snapshot, userId) {
  const normalizedUserId = requireUserId(userId);
  if (
    snapshot?.schemaVersion !== ACCOUNT_SNAPSHOT_SCHEMA_VERSION
    || snapshot?.userId !== normalizedUserId
    || !snapshot.data
    || typeof snapshot.data !== "object"
    || Array.isArray(snapshot.data)
  ) {
    throw new Error("Account snapshot validation failed.");
  }
  for (const [key, value] of Object.entries(snapshot.data)) {
    if (!ACCOUNT_SCOPED_KEYS.includes(key) && !key.startsWith(DAILY_GOAL_KEY_PREFIX)) {
      throw new Error("Account snapshot contains an unexpected key.");
    }
    if (value !== null && typeof value !== "string") {
      throw new Error("Account snapshot contains an invalid value.");
    }
  }
  return snapshot;
}

export function storeAccountSnapshot(userId, snapshot, storage = window.localStorage) {
  const normalizedUserId = requireUserId(userId);
  const validatedSnapshot = validateAccountSnapshot(snapshot, normalizedUserId);
  storage.setItem(getAccountSnapshotKey(normalizedUserId), JSON.stringify(validatedSnapshot));
  return validatedSnapshot;
}

export function saveAccountSnapshot(userId, storage = window.localStorage) {
  const normalizedUserId = requireUserId(userId);
  const data = {};
  getAccountScopedKeys(storage).forEach((key) => {
    data[key] = storage.getItem(key);
  });
  const snapshot = {
    schemaVersion: ACCOUNT_SNAPSHOT_SCHEMA_VERSION,
    userId: normalizedUserId,
    updatedAt: new Date().toISOString(),
    data,
  };
  storage.setItem(getAccountSnapshotKey(normalizedUserId), JSON.stringify(snapshot));
  return snapshot;
}

export function saveActiveAccountSnapshot(storage = window.localStorage) {
  const activeUserId = storage.getItem(ACTIVE_ACCOUNT_KEY);
  return activeUserId ? saveAccountSnapshot(activeUserId, storage) : null;
}

export function createCleanAccountSnapshot(userId, updatedAt = new Date().toISOString()) {
  const normalizedUserId = requireUserId(userId);
  const snapshot = {
    schemaVersion: ACCOUNT_SNAPSHOT_SCHEMA_VERSION,
    userId: normalizedUserId,
    updatedAt,
    data: Object.fromEntries(ACCOUNT_SCOPED_KEYS.map((key) => [key, null])),
  };
  return validateAccountSnapshot(snapshot, normalizedUserId);
}

export function clearActiveAccountWorkspace(storage = window.localStorage) {
  getAccountScopedKeys(storage).forEach((key) => storage.removeItem(key));
}

export function resetAccountWorkspace(userId, storage = window.localStorage) {
  const normalizedUserId = requireUserId(userId);
  if (storage.getItem(ACTIVE_ACCOUNT_KEY) !== normalizedUserId) {
    throw new Error("Only the active account workspace can be reset.");
  }
  clearActiveAccountWorkspace(storage);
  storage.removeItem(getAccountSnapshotKey(normalizedUserId));
  return { userId: normalizedUserId, reset: true };
}

export function loadAccountSnapshot(userId, storage = window.localStorage) {
  const snapshot = readAccountSnapshot(userId, storage);
  if (!snapshot) return false;
  clearActiveAccountWorkspace(storage);
  Object.entries(snapshot.data).forEach(([key, value]) => {
    if (typeof value === "string") storage.setItem(key, value);
  });
  return true;
}

export function switchAccountWorkspace(userId, storage = window.localStorage) {
  const normalizedUserId = requireUserId(userId);
  const activeUserId = storage.getItem(ACTIVE_ACCOUNT_KEY);
  const migration = readAccountMigration(storage);

  if (activeUserId === normalizedUserId) {
    return { userId: normalizedUserId, mode: "active", isNewWorkspace: false };
  }

  if (activeUserId) {
    saveAccountSnapshot(activeUserId, storage);
    storage.removeItem(ACTIVE_ACCOUNT_KEY);
  }

  const existingSnapshot = readAccountSnapshot(normalizedUserId, storage);
  if (existingSnapshot) {
    loadAccountSnapshot(normalizedUserId, storage);
    storage.setItem(ACTIVE_ACCOUNT_KEY, normalizedUserId);
    return { userId: normalizedUserId, mode: "restored", isNewWorkspace: false };
  }

  const mayClaimLegacyWorkspace = !activeUserId && !migration && hasLegacyWorkspaceData(storage);
  if (mayClaimLegacyWorkspace) {
    saveAccountSnapshot(normalizedUserId, storage);
    storage.setItem(ACCOUNT_MIGRATION_KEY, JSON.stringify({
      schemaVersion: ACCOUNT_SNAPSHOT_SCHEMA_VERSION,
      migratedToUserId: normalizedUserId,
      migratedAt: new Date().toISOString(),
    }));
    storage.setItem(ACTIVE_ACCOUNT_KEY, normalizedUserId);
    return { userId: normalizedUserId, mode: "migrated", isNewWorkspace: false };
  }

  if (!activeUserId && migration && hasLegacyWorkspaceData(storage)) {
    throw new Error("Account migration state conflicts with an unowned canonical workspace.");
  }

  clearActiveAccountWorkspace(storage);
  storage.setItem(ACTIVE_ACCOUNT_KEY, normalizedUserId);
  return { userId: normalizedUserId, mode: "new", isNewWorkspace: true };
}

export function clearSignedOutWorkspace(storage = window.localStorage) {
  storage.removeItem(ACTIVE_ACCOUNT_KEY);
  clearActiveAccountWorkspace(storage);
}
