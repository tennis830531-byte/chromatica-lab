import {
  ACCOUNT_SNAPSHOT_SCHEMA_VERSION,
  clearActiveAccountWorkspace,
  createCleanAccountSnapshot,
  getAccountSnapshotKey,
  loadAccountSnapshot,
  readAccountSnapshot,
  saveActiveAccountSnapshot,
  storeAccountSnapshot,
  validateAccountSnapshot,
} from "./account-workspace.js";

export const CLOUD_SYNC_META_PREFIX = "chromatica.cloudSyncMeta.";
export const CLOUD_CONFLICT_PREFIX = "chromatica.cloudConflict.";
export const CLOUD_BACKUP_PREFIX = "chromatica.cloudBackup.";
const CLOUD_STAGING_PREFIX = "chromatica.cloudStaging.";
const CLOUD_SAVE_MAX_BYTES = 2 * 1024 * 1024;
const CLOUD_SAVE_TIMEOUT_MS = 4_000;
const CLOUD_SAVE_DEBOUNCE_MS = 2_500;
const MAX_CLOUD_BACKUPS = 3;
const CLOUD_SYNC_STATUSES = new Set(["pending", "syncing", "synced", "offline", "conflict", "error"]);

const DEFAULT_META = Object.freeze({
  schemaVersion: ACCOUNT_SNAPSHOT_SCHEMA_VERSION,
  baseRevision: null,
  lastSyncedHash: "",
  lastSyncedAt: "",
  remoteUpdatedAt: "",
  dirty: false,
  status: "pending",
  conflict: false,
  remoteRevision: null,
  lastErrorCode: "",
});

function nowIso() {
  return new Date().toISOString();
}

function getStorage(storage) {
  if (storage) return storage;
  if (typeof window !== "undefined") return window.localStorage;
  throw new Error("Cloud save storage is unavailable.");
}

function normalizeUserId(userId) {
  if (typeof userId !== "string" || !userId.trim()) throw new Error("Cloud save requires a user id.");
  return userId.trim();
}

function normalizeRevision(value, { allowZero = false } = {}) {
  const candidate = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  const minimum = allowZero ? 0 : 1;
  return Number.isSafeInteger(candidate) && candidate >= minimum ? candidate : null;
}

function cloudMetaKey(userId) {
  return `${CLOUD_SYNC_META_PREFIX}${normalizeUserId(userId)}`;
}

function cloudConflictKey(userId) {
  return `${CLOUD_CONFLICT_PREFIX}${normalizeUserId(userId)}`;
}

function cloudStagingKey(userId) {
  return `${CLOUD_STAGING_PREFIX}${normalizeUserId(userId)}`;
}

function storageKeys(storage) {
  const keys = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key) keys.push(key);
  }
  return keys;
}

function withCloudTimeout(promise, timeoutMs = CLOUD_SAVE_TIMEOUT_MS) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error("cloud-timeout");
      error.code = "cloud-timeout";
      reject(error);
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

function isOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function classifyCloudError(error) {
  if (isOffline()) return "offline";
  if (error?.code === "cloud-timeout") return "timeout";
  if ([401, 403].includes(Number(error?.status)) || /jwt|auth|permission|row-level/i.test(String(error?.message || ""))) {
    return "auth";
  }
  if (/network|fetch|load failed|offline/i.test(String(error?.message || ""))) return "network";
  return "remote-error";
}

function classifyLocalCloudError(error) {
  if (error?.code === "snapshot-too-large") return "snapshot-too-large";
  if (error?.code === "crypto-unavailable") return "crypto-unavailable";
  return "invalid-local-data";
}

function snapshotByteLength(snapshot) {
  return new TextEncoder().encode(JSON.stringify(snapshot)).byteLength;
}

function assertSnapshotSize(snapshot) {
  if (snapshotByteLength(snapshot) > CLOUD_SAVE_MAX_BYTES) {
    const error = new Error("Cloud snapshot exceeds 2 MB.");
    error.code = "snapshot-too-large";
    throw error;
  }
}

export function readCloudSyncMeta(userId, storage) {
  const targetStorage = getStorage(storage);
  const raw = targetStorage.getItem(cloudMetaKey(userId));
  if (!raw) return { ...DEFAULT_META };
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid");
    return {
      ...DEFAULT_META,
      schemaVersion: ACCOUNT_SNAPSHOT_SCHEMA_VERSION,
      baseRevision: normalizeRevision(value.baseRevision, { allowZero: true }),
      lastSyncedHash: typeof value.lastSyncedHash === "string" ? value.lastSyncedHash : "",
      lastSyncedAt: typeof value.lastSyncedAt === "string" ? value.lastSyncedAt : "",
      remoteUpdatedAt: typeof value.remoteUpdatedAt === "string" ? value.remoteUpdatedAt : "",
      dirty: value.dirty === true,
      status: CLOUD_SYNC_STATUSES.has(value.status) ? value.status : "pending",
      conflict: value.conflict === true,
      remoteRevision: normalizeRevision(value.remoteRevision),
      lastErrorCode: typeof value.lastErrorCode === "string" ? value.lastErrorCode : "",
    };
  } catch {
    targetStorage.removeItem(cloudMetaKey(userId));
    return { ...DEFAULT_META, lastErrorCode: "invalid-local-meta" };
  }
}

export function writeCloudSyncMeta(userId, meta, storage) {
  const targetStorage = getStorage(storage);
  const normalized = { ...DEFAULT_META, ...meta, schemaVersion: ACCOUNT_SNAPSHOT_SCHEMA_VERSION };
  if (!CLOUD_SYNC_STATUSES.has(normalized.status)) normalized.status = "pending";
  normalized.baseRevision = normalizeRevision(normalized.baseRevision, { allowZero: true });
  normalized.remoteRevision = normalizeRevision(normalized.remoteRevision);
  targetStorage.setItem(cloudMetaKey(userId), JSON.stringify(normalized));
  return normalized;
}

export async function hashAccountSnapshot(snapshot) {
  const validated = validateAccountSnapshot(snapshot, snapshot?.userId);
  if (!globalThis.crypto?.subtle) {
    const error = new Error("Web Crypto is unavailable.");
    error.code = "crypto-unavailable";
    throw error;
  }
  const orderedData = Object.fromEntries(
    Object.keys(validated.data).sort().map((key) => [key, validated.data[key]]),
  );
  const canonical = JSON.stringify({
    schemaVersion: validated.schemaVersion,
    userId: validated.userId,
    data: orderedData,
  });
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizeRemoteRow(row, userId) {
  if (!row || typeof row !== "object") throw new Error("Cloud save row is invalid.");
  const revision = normalizeRevision(row.revision);
  if (row.user_id !== userId || revision === null) {
    throw new Error("Cloud save row validation failed.");
  }
  if (row.schema_version !== ACCOUNT_SNAPSHOT_SCHEMA_VERSION) {
    const error = new Error("Unsupported cloud save schema.");
    error.code = "unsupported-schema";
    throw error;
  }
  const snapshot = validateAccountSnapshot(row.snapshot, userId);
  assertSnapshotSize(snapshot);
  return {
    userId,
    schemaVersion: row.schema_version,
    revision,
    snapshot,
    clientUpdatedAt: typeof row.client_updated_at === "string" ? row.client_updated_at : "",
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : "",
  };
}

export async function fetchCloudGameSave(client, userId) {
  const normalizedUserId = normalizeUserId(userId);
  try {
    const request = client
      .from("game_saves")
      .select("user_id,schema_version,revision,snapshot,client_updated_at,updated_at,created_at")
      .eq("user_id", normalizedUserId)
      .maybeSingle();
    const { data, error } = await withCloudTimeout(request);
    if (error) return { kind: "error", code: classifyCloudError(error), error };
    if (!data) return { kind: "missing" };
    return { kind: "found", row: normalizeRemoteRow(data, normalizedUserId) };
  } catch (error) {
    const code = error?.code === "unsupported-schema"
      ? "unsupported-schema"
      : /snapshot|validation|invalid/i.test(String(error?.message || ""))
        ? "invalid-data"
        : classifyCloudError(error);
    return { kind: "error", code, error };
  }
}

function normalizeRpcResult(data, userId) {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  const status = row.status || row.result || row.save_status;
  if (!new Set(["created", "updated", "conflict", "missing"]).has(status)) return null;
  const revisionCandidate = row.revision ?? row.remote_revision ?? row.current_revision;
  const remoteSnapshotCandidate = row.remote_snapshot ?? row.current_snapshot ?? null;
  let remoteSnapshot = null;
  if (remoteSnapshotCandidate) {
    try {
      remoteSnapshot = validateAccountSnapshot(remoteSnapshotCandidate, userId);
      assertSnapshotSize(remoteSnapshot);
    } catch {
      remoteSnapshot = null;
    }
  }
  return {
    status,
    revision: normalizeRevision(revisionCandidate),
    updatedAt: row.updated_at || row.remote_updated_at || "",
    remoteSnapshot,
  };
}

export async function saveSnapshotToCloud(client, snapshot, expectedRevision) {
  try {
    const validated = validateAccountSnapshot(snapshot, snapshot?.userId);
    assertSnapshotSize(validated);
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
      const error = new Error("Expected cloud revision is invalid.");
      error.code = "invalid-local-data";
      throw error;
    }
    const { data, error } = await withCloudTimeout(client.rpc("save_game_state", {
      p_expected_revision: expectedRevision,
      p_schema_version: validated.schemaVersion,
      p_snapshot: validated,
      p_client_updated_at: validated.updatedAt || nowIso(),
    }));
    if (error) return { kind: "error", code: classifyCloudError(error), error };
    const result = normalizeRpcResult(data, validated.userId);
    if (!result) return { kind: "error", code: "invalid-rpc-result" };
    return { kind: "result", ...result };
  } catch (error) {
    const code = ["snapshot-too-large", "crypto-unavailable"].includes(error?.code)
      ? error.code
      : /snapshot|validation|invalid/i.test(String(error?.message || ""))
        ? "invalid-local-data"
        : classifyCloudError(error);
    return { kind: "error", code, error };
  }
}

function readCloudConflict(userId, storage) {
  const raw = storage.getItem(cloudConflictKey(userId));
  if (!raw) return null;
  try {
    const payload = JSON.parse(raw);
    validateAccountSnapshot(payload.remoteSnapshot, userId);
    payload.remoteRevision = normalizeRevision(payload.remoteRevision);
    if (payload.remoteRevision === null) throw new Error("invalid");
    return payload;
  } catch {
    storage.removeItem(cloudConflictKey(userId));
    return null;
  }
}

function createCloudBackup(userId, snapshot, storage) {
  if (!snapshot) return;
  const key = `${CLOUD_BACKUP_PREFIX}${userId}.${Date.now()}`;
  storage.setItem(key, JSON.stringify(snapshot));
  console.info("Cloud backup created.");
  const matching = storageKeys(storage)
    .filter((item) => item.startsWith(`${CLOUD_BACKUP_PREFIX}${userId}.`))
    .sort()
    .reverse();
  matching.slice(MAX_CLOUD_BACKUPS).forEach((item) => storage.removeItem(item));
  if (matching.length > MAX_CLOUD_BACKUPS) console.info("Older cloud backup pruned.");
}

export function createCloudSaveService({
  client,
  storage,
  onStateChange = () => {},
  onRemoteApplied = () => {},
} = {}) {
  if (!client) throw new Error("Cloud save requires the existing Supabase client.");
  const targetStorage = getStorage(storage);
  let activeUserId = "";
  let generation = 0;
  let syncTimer = null;
  let syncFlight = null;
  let syncFlightUserId = "";
  let syncFlightGeneration = 0;
  let pendingDirty = false;
  let applyingRemote = false;
  let resetInProgress = false;

  function isCurrent(userId, expectedGeneration = generation) {
    return activeUserId === userId && generation === expectedGeneration;
  }

  function emit(userId, meta) {
    if (isCurrent(userId)) onStateChange(userId, meta);
  }

  function updateMeta(userId, patch) {
    const meta = writeCloudSyncMeta(userId, { ...readCloudSyncMeta(userId, targetStorage), ...patch }, targetStorage);
    emit(userId, meta);
    return meta;
  }

  function clearSyncTimer() {
    if (syncTimer !== null) {
      clearTimeout(syncTimer);
      syncTimer = null;
    }
  }

  function replaceLocalSnapshot(userId, snapshot, previousSnapshot = readAccountSnapshot(userId, targetStorage)) {
    const stagingKey = cloudStagingKey(userId);
    const validatedSnapshot = validateAccountSnapshot(snapshot, userId);
    assertSnapshotSize(validatedSnapshot);
    targetStorage.setItem(stagingKey, JSON.stringify(validatedSnapshot));
    applyingRemote = true;
    try {
      const staged = JSON.parse(targetStorage.getItem(stagingKey));
      validateAccountSnapshot(staged, userId);
      storeAccountSnapshot(userId, staged, targetStorage);
      if (!loadAccountSnapshot(userId, targetStorage)) throw new Error("Account snapshot could not be loaded.");
      readAccountSnapshot(userId, targetStorage);
    } catch (error) {
      if (previousSnapshot) {
        storeAccountSnapshot(userId, previousSnapshot, targetStorage);
        loadAccountSnapshot(userId, targetStorage);
      } else {
        targetStorage.removeItem(getAccountSnapshotKey(userId));
        clearActiveAccountWorkspace(targetStorage);
      }
      throw error;
    } finally {
      applyingRemote = false;
      targetStorage.removeItem(stagingKey);
    }
    return validatedSnapshot;
  }

  async function applyRemoteSnapshot(userId, remoteRow) {
    const previous = readAccountSnapshot(userId, targetStorage);
    const remoteSnapshot = validateAccountSnapshot(remoteRow.snapshot, userId);
    assertSnapshotSize(remoteSnapshot);
    createCloudBackup(userId, previous, targetStorage);
    replaceLocalSnapshot(userId, remoteSnapshot, previous);
    const remoteHash = await hashAccountSnapshot(remoteSnapshot);
    targetStorage.removeItem(cloudConflictKey(userId));
    return updateMeta(userId, {
      baseRevision: remoteRow.revision,
      lastSyncedHash: remoteHash,
      lastSyncedAt: nowIso(),
      remoteUpdatedAt: remoteRow.updatedAt || "",
      dirty: false,
      status: "synced",
      conflict: false,
      remoteRevision: remoteRow.revision,
      lastErrorCode: "",
    });
  }

  async function acceptRemoteAsAuthority(userId, remoteRow, expectedGeneration) {
    await applyRemoteSnapshot(userId, remoteRow);
    if (!isCurrent(userId, expectedGeneration)) return readCloudSyncMeta(userId, targetStorage);
    await onRemoteApplied(userId);
    return readCloudSyncMeta(userId, targetStorage);
  }

  async function acceptSuccessfulSave(userId, snapshot, result, expectedGeneration) {
    if (!isCurrent(userId, expectedGeneration)) return readCloudSyncMeta(userId, targetStorage);
    const revision = result.revision;
    if (normalizeRevision(revision) === null) {
      return updateMeta(userId, { dirty: true, status: "error", lastErrorCode: "invalid-rpc-result" });
    }
    const hash = await hashAccountSnapshot(snapshot);
    if (!isCurrent(userId, expectedGeneration)) return readCloudSyncMeta(userId, targetStorage);
    targetStorage.removeItem(cloudConflictKey(userId));
    return updateMeta(userId, {
      baseRevision: revision,
      lastSyncedHash: hash,
      lastSyncedAt: nowIso(),
      remoteUpdatedAt: result.updatedAt || nowIso(),
      dirty: false,
      status: "synced",
      conflict: false,
      remoteRevision: revision,
      lastErrorCode: "",
    });
  }

  async function uploadSnapshot(userId, snapshot, expectedRevision, expectedGeneration) {
    if (!isCurrent(userId, expectedGeneration)) return readCloudSyncMeta(userId, targetStorage);
    updateMeta(userId, { status: "syncing", lastErrorCode: "" });
    const result = await saveSnapshotToCloud(client, snapshot, expectedRevision);
    if (!isCurrent(userId, expectedGeneration)) return readCloudSyncMeta(userId, targetStorage);
    if (result.kind === "error") {
      return updateMeta(userId, {
        dirty: true,
        status: ["offline", "network", "timeout"].includes(result.code) ? "offline" : "error",
        lastErrorCode: result.code,
      });
    }
    if (["created", "updated"].includes(result.status)) {
      return acceptSuccessfulSave(userId, snapshot, result, expectedGeneration);
    }
    if (result.status === "missing") {
      const refreshed = await fetchCloudGameSave(client, userId);
      if (!isCurrent(userId, expectedGeneration)) return readCloudSyncMeta(userId, targetStorage);
      if (refreshed.kind === "found") {
        return acceptRemoteAsAuthority(userId, refreshed.row, expectedGeneration);
      }
      return updateMeta(userId, {
        dirty: true,
        status: refreshed.kind === "error" && ["offline", "network", "timeout"].includes(refreshed.code)
          ? "offline"
          : "error",
        lastErrorCode: refreshed.kind === "error" ? refreshed.code : "remote-missing",
      });
    }
    if (result.remoteSnapshot && normalizeRevision(result.revision) !== null) {
      return acceptRemoteAsAuthority(userId, {
        revision: result.revision,
        updatedAt: result.updatedAt,
        snapshot: result.remoteSnapshot,
      }, expectedGeneration);
    }
    const remote = await fetchCloudGameSave(client, userId);
    if (!isCurrent(userId, expectedGeneration)) return readCloudSyncMeta(userId, targetStorage);
    if (remote.kind === "found") {
      return acceptRemoteAsAuthority(userId, remote.row, expectedGeneration);
    }
    return updateMeta(userId, {
      dirty: true,
      status: remote.kind === "error" && ["offline", "network", "timeout"].includes(remote.code) ? "offline" : "error",
      lastErrorCode: remote.kind === "error" ? remote.code : "conflict-fetch-failed",
    });
  }

  async function performSync(userId, expectedGeneration) {
    if (!isCurrent(userId, expectedGeneration)) return readCloudSyncMeta(userId, targetStorage);
    const localSnapshot = readAccountSnapshot(userId, targetStorage);
    if (!localSnapshot) return updateMeta(userId, { dirty: false, status: "pending", lastErrorCode: "no-local-snapshot" });
    let meta = readCloudSyncMeta(userId, targetStorage);
    if (meta.conflict || readCloudConflict(userId, targetStorage)) {
      const remote = await fetchCloudGameSave(client, userId);
      if (!isCurrent(userId, expectedGeneration)) return readCloudSyncMeta(userId, targetStorage);
      if (remote.kind === "found") {
        return acceptRemoteAsAuthority(userId, remote.row, expectedGeneration);
      }
      if (remote.kind === "error") {
        return updateMeta(userId, {
          dirty: true,
          status: ["offline", "network", "timeout"].includes(remote.code) ? "offline" : "error",
          conflict: true,
          lastErrorCode: remote.code,
        });
      }
      targetStorage.removeItem(cloudConflictKey(userId));
      meta = updateMeta(userId, {
        baseRevision: 0,
        dirty: true,
        status: "pending",
        conflict: false,
        remoteRevision: null,
        lastErrorCode: "",
      });
    }
    if (isOffline()) return updateMeta(userId, { dirty: true, status: "offline", lastErrorCode: "offline" });
    const localHash = await hashAccountSnapshot(localSnapshot);
    if (!isCurrent(userId, expectedGeneration)) return readCloudSyncMeta(userId, targetStorage);
    if (meta.lastSyncedHash && localHash === meta.lastSyncedHash && !meta.dirty) {
      return updateMeta(userId, { status: "synced", lastErrorCode: "" });
    }
    if (meta.baseRevision === null) {
      const remote = await fetchCloudGameSave(client, userId);
      if (!isCurrent(userId, expectedGeneration)) return readCloudSyncMeta(userId, targetStorage);
      if (remote.kind === "found") {
        const remoteHash = await hashAccountSnapshot(remote.row.snapshot);
        if (remoteHash === localHash) {
          return updateMeta(userId, {
            baseRevision: remote.row.revision,
            lastSyncedHash: localHash,
            lastSyncedAt: nowIso(),
            remoteUpdatedAt: remote.row.updatedAt,
            dirty: false,
            status: "synced",
            remoteRevision: remote.row.revision,
            lastErrorCode: "",
          });
        }
        return acceptRemoteAsAuthority(userId, remote.row, expectedGeneration);
      }
      if (remote.kind === "error") {
        return updateMeta(userId, {
          dirty: true,
          status: ["offline", "network", "timeout"].includes(remote.code) ? "offline" : "error",
          lastErrorCode: remote.code,
        });
      }
      meta = updateMeta(userId, { baseRevision: 0, dirty: true });
    }
    return uploadSnapshot(userId, localSnapshot, meta.baseRevision, expectedGeneration);
  }

  function runSingleFlight(reason = "manual") {
    if (!activeUserId) return Promise.resolve(null);
    if (resetInProgress) return Promise.resolve(readCloudSyncMeta(activeUserId, targetStorage));
    if (
      syncFlight
      && syncFlightUserId === activeUserId
      && syncFlightGeneration === generation
    ) {
      pendingDirty = true;
      return syncFlight;
    }
    const userId = activeUserId;
    const expectedGeneration = generation;
    const flight = (async () => {
      let result;
      try {
        do {
          pendingDirty = false;
          result = await performSync(userId, expectedGeneration, reason);
        } while (pendingDirty && isCurrent(userId, expectedGeneration));
      } catch (error) {
        result = updateMeta(userId, {
          dirty: true,
          status: "error",
          lastErrorCode: classifyLocalCloudError(error),
        });
      }
      return result;
    })().finally(() => {
      if (syncFlight === flight) {
        syncFlight = null;
        syncFlightUserId = "";
        syncFlightGeneration = 0;
      }
    });
    syncFlight = flight;
    syncFlightUserId = userId;
    syncFlightGeneration = expectedGeneration;
    return syncFlight;
  }

  function scheduleCloudSync() {
    if (resetInProgress) return;
    clearSyncTimer();
    syncTimer = setTimeout(() => {
      syncTimer = null;
      void runSingleFlight("debounced-local-change");
    }, CLOUD_SAVE_DEBOUNCE_MS);
  }

  async function noteLocalSnapshot(snapshot, { immediate = false } = {}) {
    if (!activeUserId || applyingRemote || resetInProgress || snapshot?.userId !== activeUserId) return null;
    const userId = activeUserId;
    const expectedGeneration = generation;
    let hash;
    try {
      assertSnapshotSize(snapshot);
      hash = await hashAccountSnapshot(snapshot);
    } catch (error) {
      return updateMeta(userId, {
        dirty: true,
        status: "error",
        lastErrorCode: classifyLocalCloudError(error),
      });
    }
    if (!isCurrent(userId, expectedGeneration)) return null;
    const meta = readCloudSyncMeta(userId, targetStorage);
    const dirty = hash !== meta.lastSyncedHash;
    updateMeta(userId, {
      dirty,
      status: meta.conflict ? "conflict" : dirty ? (isOffline() ? "offline" : "pending") : "synced",
      lastErrorCode: dirty && isOffline() ? "offline" : meta.conflict ? meta.lastErrorCode : "",
    });
    if (dirty && !meta.conflict) {
      pendingDirty = Boolean(syncFlight);
      if (immediate) return runSingleFlight("immediate-local-change");
      scheduleCloudSync();
    }
    return readCloudSyncMeta(userId, targetStorage);
  }

  async function reconcileStartup(userId, localSnapshot) {
    const normalizedUserId = normalizeUserId(userId);
    activeUserId = normalizedUserId;
    generation += 1;
    const expectedGeneration = generation;
    clearSyncTimer();
    pendingDirty = false;
    emit(normalizedUserId, readCloudSyncMeta(normalizedUserId, targetStorage));
    const remote = await fetchCloudGameSave(client, normalizedUserId);
    if (!isCurrent(normalizedUserId, expectedGeneration)) return { kind: "stale" };
    if (remote.kind === "error") {
      const meta = updateMeta(normalizedUserId, {
        dirty: Boolean(localSnapshot),
        status: ["offline", "network", "timeout"].includes(remote.code) ? "offline" : "error",
        lastErrorCode: remote.code,
      });
      if (remote.code === "unsupported-schema") return { kind: "fatal", code: remote.code, meta };
      return localSnapshot
        ? { kind: "local-ready", meta, cloudUnavailable: true }
        : { kind: "fatal", code: remote.code, meta };
    }
    if (remote.kind === "missing") {
      updateMeta(normalizedUserId, {
        baseRevision: 0,
        dirty: Boolean(localSnapshot),
        status: "pending",
        conflict: false,
        remoteRevision: null,
        lastErrorCode: "",
      });
      if (localSnapshot) void noteLocalSnapshot(localSnapshot, { immediate: true });
      return { kind: localSnapshot ? "local-ready" : "new-workspace" };
    }
    if (!localSnapshot) {
      await applyRemoteSnapshot(normalizedUserId, remote.row);
      if (!isCurrent(normalizedUserId, expectedGeneration)) return { kind: "stale" };
      return { kind: "remote-applied", remote: remote.row };
    }
    const [localHash, remoteHash] = await Promise.all([
      hashAccountSnapshot(localSnapshot),
      hashAccountSnapshot(remote.row.snapshot),
    ]);
    if (!isCurrent(normalizedUserId, expectedGeneration)) return { kind: "stale" };
    const meta = readCloudSyncMeta(normalizedUserId, targetStorage);
    if (localHash === remoteHash) {
      updateMeta(normalizedUserId, {
        baseRevision: remote.row.revision,
        lastSyncedHash: localHash,
        lastSyncedAt: nowIso(),
        remoteUpdatedAt: remote.row.updatedAt,
        dirty: false,
        status: "synced",
        conflict: false,
        remoteRevision: remote.row.revision,
        lastErrorCode: "",
      });
      return { kind: "local-ready" };
    }
    if (!meta.lastSyncedHash || meta.baseRevision === null) {
      await applyRemoteSnapshot(normalizedUserId, remote.row);
      if (!isCurrent(normalizedUserId, expectedGeneration)) return { kind: "stale" };
      return { kind: "remote-applied", remote: remote.row };
    }
    const localChanged = meta.dirty || localHash !== meta.lastSyncedHash;
    const remoteChanged = remoteHash !== meta.lastSyncedHash || remote.row.revision !== meta.baseRevision;
    if (!localChanged && remoteChanged) {
      await applyRemoteSnapshot(normalizedUserId, remote.row);
      if (!isCurrent(normalizedUserId, expectedGeneration)) return { kind: "stale" };
      return { kind: "remote-applied", remote: remote.row };
    }
    if (localChanged && !remoteChanged) {
      updateMeta(normalizedUserId, { baseRevision: remote.row.revision, dirty: true });
      void noteLocalSnapshot(localSnapshot, { immediate: true });
      return { kind: "local-ready" };
    }
    await applyRemoteSnapshot(normalizedUserId, remote.row);
    if (!isCurrent(normalizedUserId, expectedGeneration)) return { kind: "stale" };
    return { kind: "remote-applied", remote: remote.row };
  }

  async function initializeNewWorkspace() {
    if (!activeUserId) return null;
    const snapshot = saveActiveAccountSnapshot(targetStorage);
    if (!snapshot) return null;
    return noteLocalSnapshot(snapshot, { immediate: true });
  }

  async function syncNow(reason = "manual") {
    if (!activeUserId) return null;
    clearSyncTimer();
    const snapshot = saveActiveAccountSnapshot(targetStorage);
    if (snapshot) await noteLocalSnapshot(snapshot);
    return runSingleFlight(reason);
  }

  async function resetCurrentWorkspace({ userId: requestedUserId = "" } = {}) {
    if (!activeUserId) return { ok: false, code: "no-active-account" };
    const normalizedRequestedUserId = requestedUserId ? normalizeUserId(requestedUserId) : "";
    if (normalizedRequestedUserId && normalizedRequestedUserId !== activeUserId) {
      return { ok: false, code: "reset-session-invalid" };
    }
    if (resetInProgress) return { ok: false, code: "reset-in-progress" };
    resetInProgress = true;
    let originalAccountSnapshotRaw;
    let originalAccountSnapshotKey = "";
    let accountSnapshotCaptured = false;
    let resetCommitted = false;
    clearSyncTimer();
    try {
      if (
        syncFlight
        && syncFlightUserId === activeUserId
        && syncFlightGeneration === generation
      ) {
        await syncFlight;
      }
      const userId = activeUserId;
      if (!userId || (normalizedRequestedUserId && normalizedRequestedUserId !== userId)) {
        return { ok: false, code: "reset-session-invalid" };
      }

      originalAccountSnapshotKey = getAccountSnapshotKey(userId);
      originalAccountSnapshotRaw = targetStorage.getItem(originalAccountSnapshotKey);
      accountSnapshotCaptured = true;
      const previousSnapshot = saveActiveAccountSnapshot(targetStorage);
      if (!previousSnapshot) return { ok: false, code: "invalid-local-data" };
      const cleanSnapshot = createCleanAccountSnapshot(userId);
      assertSnapshotSize(cleanSnapshot);
      const cleanHash = await hashAccountSnapshot(cleanSnapshot);
      createCloudBackup(userId, previousSnapshot, targetStorage);

      generation += 1;
      const expectedGeneration = generation;
      pendingDirty = false;
      if (isOffline()) return { ok: false, code: "cloud-fetch-offline" };

      let remote = await fetchCloudGameSave(client, userId);
      if (!isCurrent(userId, expectedGeneration)) return { ok: false, code: "stale" };
      if (remote.kind === "error") return { ok: false, code: `cloud-fetch-${remote.code}` };
      let expectedRevision = remote.kind === "found" ? remote.row.revision : 0;
      let saveResult = await saveSnapshotToCloud(client, cleanSnapshot, expectedRevision);
      if (!isCurrent(userId, expectedGeneration)) return { ok: false, code: "stale" };
      if (saveResult.kind === "error") return { ok: false, code: saveResult.code };

      if (saveResult.status === "conflict") {
        remote = await fetchCloudGameSave(client, userId);
        if (!isCurrent(userId, expectedGeneration)) return { ok: false, code: "stale" };
        if (remote.kind === "error") return { ok: false, code: `cloud-fetch-${remote.code}` };
        expectedRevision = remote.kind === "found" ? remote.row.revision : 0;
        saveResult = await saveSnapshotToCloud(client, cleanSnapshot, expectedRevision);
        if (!isCurrent(userId, expectedGeneration)) return { ok: false, code: "stale" };
        if (saveResult.kind === "error") return { ok: false, code: saveResult.code };
      }

      if (!["created", "updated"].includes(saveResult.status) || normalizeRevision(saveResult.revision) === null) {
        return { ok: false, code: "reset-conflict" };
      }

      replaceLocalSnapshot(userId, cleanSnapshot, previousSnapshot);
      targetStorage.removeItem(cloudConflictKey(userId));
      targetStorage.removeItem(cloudStagingKey(userId));
      updateMeta(userId, {
        baseRevision: saveResult.revision,
        lastSyncedHash: cleanHash,
        lastSyncedAt: nowIso(),
        remoteUpdatedAt: saveResult.updatedAt || nowIso(),
        dirty: false,
        status: "synced",
        conflict: false,
        remoteRevision: null,
        lastErrorCode: "",
      });
      resetCommitted = true;
      return { ok: true, userId, snapshot: cleanSnapshot, revision: saveResult.revision };
    } catch (error) {
      return { ok: false, code: error?.code || classifyLocalCloudError(error), error };
    } finally {
      if (accountSnapshotCaptured && !resetCommitted) {
        if (originalAccountSnapshotRaw === null) targetStorage.removeItem(originalAccountSnapshotKey);
        else targetStorage.setItem(originalAccountSnapshotKey, originalAccountSnapshotRaw);
      }
      resetInProgress = false;
    }
  }

  async function prepareForSignOut() {
    if (!activeUserId) return { ...DEFAULT_META };
    clearSyncTimer();
    const snapshot = saveActiveAccountSnapshot(targetStorage);
    if (snapshot) await noteLocalSnapshot(snapshot);
    const meta = readCloudSyncMeta(activeUserId, targetStorage);
    if (meta.dirty && !meta.conflict && !isOffline()) await runSingleFlight("sign-out");
    return readCloudSyncMeta(activeUserId, targetStorage);
  }

  async function reconcileCurrent(reason = "online") {
    if (!activeUserId || resetInProgress) return null;
    clearSyncTimer();
    if (
      syncFlight
      && syncFlightUserId === activeUserId
      && syncFlightGeneration === generation
    ) {
      await syncFlight;
    }
    const userId = activeUserId;
    const localSnapshot = readAccountSnapshot(userId, targetStorage);
    const result = await reconcileStartup(userId, localSnapshot);
    if (result.kind === "remote-applied" && activeUserId === userId) await onRemoteApplied(userId);
    if (result.kind === "new-workspace") await initializeNewWorkspace();
    return { reason, result, meta: readCloudSyncMeta(userId, targetStorage) };
  }

  function deactivate() {
    generation += 1;
    activeUserId = "";
    pendingDirty = false;
    clearSyncTimer();
  }

  return {
    reconcileStartup,
    initializeNewWorkspace,
    noteLocalSnapshot,
    syncNow,
    resetCurrentWorkspace,
    prepareForSignOut,
    deactivate,
    handleForeground: () => reconcileCurrent("foreground"),
    handleOnline: () => reconcileCurrent("online"),
    getState: () => activeUserId ? readCloudSyncMeta(activeUserId, targetStorage) : { ...DEFAULT_META },
    getActiveUserId: () => activeUserId,
    isApplyingRemote: () => applyingRemote,
  };
}
