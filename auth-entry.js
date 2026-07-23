import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { createClient } from "@supabase/supabase-js";
import {
  ACTIVE_ACCOUNT_KEY,
  clearSignedOutWorkspace,
  readAccountSnapshot,
  saveActiveAccountSnapshot,
  switchAccountWorkspace,
} from "./account-workspace.js";
import { createCloudSaveService } from "./cloud-save.js";
import { createOAuthDiagnostics, parseOAuthCallbackMetadata } from "./oauth-diagnostics.js";
import { createOAuthAttemptController } from "./oauth-attempt.js";

const WEB_REDIRECT_URL = "https://tennis830531-byte.github.io/chromatica-lab/";
const ANDROID_REDIRECT_URL = "chromaticalab://login-callback";
const GOOGLE_BASIC_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
].join(" ");
const CALLBACK_PARAM_NAMES = ["code", "error", "error_code", "error_description"];
const SNAPSHOT_DEBOUNCE_MS = 700;
const AUTH_CHECK_TIMEOUT_MS = 10_000;
const WORKSPACE_TIMEOUT_MS = 5_000;
const IMAGE_PRELOAD_TIMEOUT_MS = 6_000;
const GATE_STARTUP_IMAGE_SELECTORS = ["#authGate img[src]"];
const COMMON_STARTUP_IMAGE_SELECTORS = [
  ".app-header img[src]",
  ".home-hero img[src]:not(#heroGardenPlant)",
  ".quick-section img[src]",
  ".bottom-nav img[src]",
  "#micGate img[src]",
];
const COMMON_STARTUP_BACKGROUND_IMAGES = [
  "./public/assets/chromatic-refresh/feature/home_hero_paper_stage.png",
  "./public/assets/chromatic-refresh/feature/quick_start_paper.png",
];

let supabaseClient = null;
let currentAuthUser = null;
let cloudSaveService = null;
let authListenerRegistered = false;
let nativeListenersRegistered = false;
let authUiBound = false;
let authBusy = false;
let authToastTimer = null;
let activeCloudNotice = "";
let snapshotTimer = null;
let workspaceTransition = Promise.resolve();
let signOutSnapshotFlushed = false;
const preloadCache = new Map();
let blockingImageGeneration = 0;
let commonPreloadPromise = null;
const backgroundPreloadQueue = new Map();
let backgroundPreloadIdleHandle = null;
let backgroundPreloadRunning = false;
let backgroundPreloadGeneration = 0;
let gardenWarmupTimer = null;
let gardenWarmupSplashListener = null;
let activeSessionPreparation = null;
let activeSessionUserId = "";
let workspaceAttemptGeneration = 0;
const startupState = {
  authStatus: "pending",
  workspaceStatus: "pending",
  imagesStatus: "pending",
  imageProgress: 0,
  totalImages: 0,
  completedImages: 0,
  failedImages: 0,
  destination: "checking",
};

window.chromaticaStartupState = startupState;

const oauthDiagnostics = createOAuthDiagnostics({
  platform: isNativeAndroid() ? "android" : "web",
  storage: window.sessionStorage,
  pkceStorage: window.localStorage,
});
const oauthAttempt = createOAuthAttemptController({
  storage: window.sessionStorage,
  onEvent(event, fields) {
    oauthDiagnostics.record(event, fields);
  },
  onCancellation() {
    void showUnauthenticatedGate("登入已取消。");
  },
  onSettled() {
    setAuthBusy(false);
  },
});

const byId = (id) => document.getElementById(id);

function isOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function isNativeAndroid() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

function isGardenQaSessionActive() {
  return Boolean(window.ChromaticaGardenQA?.isGardenQaSessionActive?.());
}

function getPreloadableImageUrl(source) {
  if (!source) return "";
  try {
    const url = new URL(source, document.baseURI);
    if (!["http:", "https:", "file:", "capacitor:"].includes(url.protocol)) return "";
    if (["http:", "https:"].includes(url.protocol) && url.origin !== window.location.origin) return "";
    return url.href;
  } catch {
    return "";
  }
}

function collectImageUrls(selectors = [], additionalSources = []) {
  const urls = new Set();
  if (selectors.length) {
    document.querySelectorAll(selectors.join(",")).forEach((image) => {
      const url = getPreloadableImageUrl(image.currentSrc || image.getAttribute("src"));
      if (url) urls.add(url);
    });
  }
  additionalSources.forEach((source) => {
    const url = getPreloadableImageUrl(source);
    if (url) urls.add(url);
  });
  return [...urls];
}

function preloadImageOnce(url) {
  if (preloadCache.has(url)) return preloadCache.get(url);
  const request = new Promise((resolve) => {
    const image = new Image();
    let settled = false;
    const finish = (loaded) => {
      if (settled) return;
      settled = true;
      resolve(loaded);
    };
    image.addEventListener("load", () => {
      if (typeof image.decode !== "function") {
        finish(true);
        return;
      }
      image.decode().then(() => finish(true)).catch(() => finish(true));
    }, { once: true });
    image.addEventListener("error", () => finish(false), { once: true });
    image.src = url;
  });
  preloadCache.set(url, request);
  return request;
}

function createTimeoutError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function withTimeout(promise, timeoutMs, code) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(createTimeoutError(code)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId));
}

async function preloadBlockingImages(sources) {
  const generation = ++blockingImageGeneration;
  const urls = [...new Set(sources.filter(Boolean))];
  startupState.imagesStatus = "pending";
  startupState.totalImages = urls.length;
  startupState.completedImages = 0;
  startupState.failedImages = 0;
  startupState.imageProgress = 0;
  if (!urls.length) {
    startupState.imageProgress = 100;
    startupState.imagesStatus = "ready";
    return "ready";
  }
  const requests = Promise.all(urls.map(async (url) => {
    const loaded = await preloadImageOnce(url);
    if (generation !== blockingImageGeneration) return;
    startupState.completedImages += 1;
    if (!loaded) startupState.failedImages += 1;
    startupState.imageProgress = Math.round((startupState.completedImages / urls.length) * 100);
  }));
  try {
    await withTimeout(requests, IMAGE_PRELOAD_TIMEOUT_MS, "image-timeout");
    if (generation === blockingImageGeneration) {
      startupState.imagesStatus = "ready";
      startupState.imageProgress = 100;
    }
    return "ready";
  } catch (error) {
    if (error?.code !== "image-timeout") throw error;
    if (generation === blockingImageGeneration) startupState.imagesStatus = "timeout";
    return "timeout";
  }
}

function getGateImageUrls() {
  return collectImageUrls(GATE_STARTUP_IMAGE_SELECTORS);
}

function getCommonImageUrls() {
  return collectImageUrls(COMMON_STARTUP_IMAGE_SELECTORS, COMMON_STARTUP_BACKGROUND_IMAGES);
}

function startCommonBackgroundPreload() {
  if (!commonPreloadPromise) {
    commonPreloadPromise = Promise.all(getCommonImageUrls().map(preloadImageOnce));
  }
  return commonPreloadPromise;
}

function runBackgroundPreloadQueue() {
  backgroundPreloadIdleHandle = null;
  if (backgroundPreloadRunning || !backgroundPreloadQueue.size) return;
  const activeGeneration = backgroundPreloadGeneration;
  const sources = [];
  backgroundPreloadQueue.forEach((generation, url) => {
    backgroundPreloadQueue.delete(url);
    if (generation === null || generation === activeGeneration) sources.push(url);
  });
  if (!sources.length) return;
  backgroundPreloadRunning = true;
  Promise.all(sources.map(preloadImageOnce)).finally(() => {
    backgroundPreloadRunning = false;
    if (backgroundPreloadQueue.size) scheduleBackgroundPreloadQueue();
  });
}

function scheduleBackgroundPreloadQueue() {
  if (backgroundPreloadRunning || backgroundPreloadIdleHandle !== null || !backgroundPreloadQueue.size) return;
  if (typeof window.requestIdleCallback === "function") {
    backgroundPreloadIdleHandle = window.requestIdleCallback(runBackgroundPreloadQueue, { timeout: 1500 });
  } else {
    backgroundPreloadIdleHandle = window.setTimeout(runBackgroundPreloadQueue, 0);
  }
}

function enqueueBackgroundPreload(sources, generation = null) {
  sources.filter(Boolean).forEach((source) => {
    const url = getPreloadableImageUrl(source);
    if (!url || preloadCache.has(url)) return;
    const existingGeneration = backgroundPreloadQueue.get(url);
    if (existingGeneration === null || generation === null) {
      backgroundPreloadQueue.set(url, null);
    } else {
      backgroundPreloadQueue.set(url, generation);
    }
  });
  scheduleBackgroundPreloadQueue();
}

function scheduleCommonBackgroundPreload() {
  enqueueBackgroundPreload(getCommonImageUrls());
}

function ensureCommonBackgroundPreload() {
  return startCommonBackgroundPreload();
}

function cancelGardenWarmupSchedule() {
  if (gardenWarmupTimer !== null) {
    window.clearTimeout(gardenWarmupTimer);
    gardenWarmupTimer = null;
  }
  if (gardenWarmupSplashListener) {
    window.removeEventListener("chromatica:startup-splash-finished", gardenWarmupSplashListener);
    gardenWarmupSplashListener = null;
  }
}

function invalidateAsyncStartupFlow() {
  workspaceAttemptGeneration += 1;
  backgroundPreloadGeneration += 1;
  cancelGardenWarmupSchedule();
}

function schedulePostStartupGardenWarmup(includeAccountPlant) {
  cancelGardenWarmupSchedule();
  const generation = backgroundPreloadGeneration;
  const beginDelay = () => {
    if (generation !== backgroundPreloadGeneration) return;
    gardenWarmupTimer = window.setTimeout(() => {
      gardenWarmupTimer = null;
      if (generation !== backgroundPreloadGeneration) return;
      const warmup = window.chromaticaApp?.getGardenWarmupResources?.(includeAccountPlant) || {};
      enqueueBackgroundPreload(warmup.commonImages || []);
      if (includeAccountPlant) {
        enqueueBackgroundPreload(warmup.accountImages || [], generation);
      }
      window.chromaticaApp?.prepareGardenBgmMetadata?.();
    }, 500);
  };
  if (isNativeAndroid() && !window.chromaticaStartupSplashFinished) {
    gardenWarmupSplashListener = () => {
      gardenWarmupSplashListener = null;
      beginDelay();
    };
    window.addEventListener("chromatica:startup-splash-finished", gardenWarmupSplashListener, { once: true });
    return;
  }
  beginDelay();
}

function setStartupAuthStatus(status) {
  startupState.authStatus = status;
}

function setStartupWorkspaceStatus(status) {
  startupState.workspaceStatus = status;
}

function resetStartupCheck() {
  invalidateAsyncStartupFlow();
  setStartupAuthStatus("pending");
  setStartupWorkspaceStatus("pending");
  startupState.imagesStatus = "pending";
  startupState.imageProgress = 0;
  startupState.destination = "checking";
}

function getAuthElements() {
  return {
    signedOut: byId("googleAuthSignedOut"),
    signedIn: byId("googleAuthSignedIn"),
    signInButton: byId("googleLoginBtn"),
    signOutButton: byId("googleLogoutBtn"),
    status: byId("googleLoginStatus"),
    avatar: byId("googleAccountAvatar"),
    avatarFallback: byId("googleAccountAvatarFallback"),
    name: byId("googleAccountName"),
    email: byId("googleAccountEmail"),
    toast: byId("authToast"),
    gateChecking: byId("authGateChecking"),
    gateCheckingMessage: byId("authGateCheckingMessage"),
    gateSignedOut: byId("authGateSignedOut"),
    gateSignInButton: byId("authGateGoogleLoginBtn"),
    gateRetryButton: byId("authGateRetryBtn"),
    gateStatus: byId("authGateStatus"),
    logoutModal: byId("logoutConfirmModal"),
    logoutMessage: byId("logoutConfirmMessage"),
    logoutCancel: byId("logoutCancelBtn"),
    logoutConfirm: byId("logoutConfirmBtn"),
    resetAccountButton: byId("resetAccountDataBtn"),
    resetAccountModal: byId("resetAccountModal"),
    resetAccountCancel: byId("resetAccountCancelBtn"),
    resetAccountConfirm: byId("resetAccountConfirmBtn"),
  };
}

function setGateState(state, message = "", showRetry = false) {
  document.body.classList.remove("auth-checking", "auth-unauthenticated", "auth-authenticated");
  const bodyState = state === "authenticated"
    ? "authenticated"
    : state === "checking"
      ? "checking"
      : "unauthenticated";
  document.body.classList.add(`auth-${bodyState}`);
  const elements = getAuthElements();
  elements.gateChecking?.classList.toggle("hidden", state !== "checking");
  elements.gateSignedOut?.classList.toggle("hidden", !["unauthenticated", "preparing", "error"].includes(state));
  if (elements.gateCheckingMessage) {
    elements.gateCheckingMessage.textContent = message || "正在確認登入狀態…";
  }
  if (elements.gateStatus) {
    elements.gateStatus.textContent = state === "checking" ? "" : message;
    elements.gateStatus.dataset.kind = message && showRetry ? "error" : "";
  }
  elements.gateRetryButton?.classList.toggle("hidden", !showRetry);
  const preparing = state === "preparing";
  if (elements.gateSignInButton) {
    elements.gateSignInButton.disabled = preparing || authBusy;
    elements.gateSignInButton.setAttribute("aria-busy", String(preparing || authBusy));
    elements.gateSignInButton.innerHTML = preparing
      ? "正在準備練習室…"
      : '<span aria-hidden="true">G</span>使用 Google 登入';
  }
}

function setAuthStatus(message = "", kind = "") {
  const { status } = getAuthElements();
  if (!status) return;
  status.textContent = message;
  status.dataset.kind = kind;
}

function showAuthToast(message) {
  const { toast } = getAuthElements();
  if (!toast) return;
  if (authToastTimer) window.clearTimeout(authToastTimer);
  toast.textContent = message;
  toast.classList.remove("hidden", "is-visible");
  void toast.offsetWidth;
  toast.classList.add("is-visible");
  authToastTimer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
    window.setTimeout(() => toast.classList.add("hidden"), 180);
  }, 2600);
}

function setAuthBusy(isBusy, message = "") {
  authBusy = isBusy;
  const elements = getAuthElements();
  [
    elements.signInButton,
    elements.signOutButton,
    elements.gateSignInButton,
    elements.logoutConfirm,
    elements.resetAccountButton,
    elements.resetAccountConfirm,
  ]
    .filter(Boolean)
    .forEach((button) => {
      button.disabled = isBusy;
      button.setAttribute("aria-busy", String(isBusy));
    });
  if (message) {
    setAuthStatus(message);
    if (document.body.classList.contains("auth-unauthenticated")) {
      elements.gateStatus.textContent = message;
      elements.gateStatus.dataset.kind = "";
    }
  }
}

function getDisplayName(user) {
  const metadata = user?.user_metadata || {};
  return metadata.full_name || metadata.name || metadata.given_name || "練習者";
}

function getAvatarUrl(user) {
  const metadata = user?.user_metadata || {};
  return metadata.avatar_url || metadata.picture || "";
}

function renderAuthSession(session) {
  const elements = getAuthElements();
  const user = session?.user || null;
  currentAuthUser = user;
  elements.signedOut?.classList.toggle("hidden", Boolean(user));
  elements.signedIn?.classList.toggle("hidden", !user);
  if (!user) {
    if (elements.avatar) {
      elements.avatar.removeAttribute("src");
      elements.avatar.classList.add("hidden");
    }
    elements.avatarFallback?.classList.remove("hidden");
    if (elements.name) elements.name.textContent = "";
    if (elements.email) elements.email.textContent = "";
    return;
  }
  if (elements.name) elements.name.textContent = getDisplayName(user);
  if (elements.email) elements.email.textContent = user.email || "未提供 Email";
  const avatarUrl = getAvatarUrl(user);
  if (elements.avatar) {
    if (avatarUrl) {
      elements.avatar.src = avatarUrl;
      elements.avatar.classList.remove("hidden");
      elements.avatarFallback?.classList.add("hidden");
    } else {
      elements.avatar.removeAttribute("src");
      elements.avatar.classList.add("hidden");
      elements.avatarFallback?.classList.remove("hidden");
    }
  }
  if (cloudSaveService?.getActiveUserId() === user.id) {
    renderCloudSyncState(user.id, cloudSaveService.getState());
  }
}

function renderCloudSyncState(userId, meta) {
  if (!userId || localStorage.getItem(ACTIVE_ACCOUNT_KEY) !== userId) return;
  let notice = "";
  if (meta?.status === "offline") {
    notice = "目前離線，進度將在連線後同步。";
  } else if (meta?.status === "error") {
    notice = meta?.lastErrorCode === "unsupported-schema"
      ? "雲端資料版本不相容，請先更新 App。"
      : meta?.lastErrorCode === "snapshot-too-large"
        ? "雲端存檔資料過大，暫時無法同步。"
        : "雲端同步失敗，將稍後重試。";
  }
  if (notice) {
    activeCloudNotice = notice;
    setAuthStatus(notice, "error");
  } else if (activeCloudNotice) {
    const { status } = getAuthElements();
    if (status?.textContent === activeCloudNotice) setAuthStatus("");
    activeCloudNotice = "";
  }
}

function flushAccountSnapshot({ notifyCloud = true } = {}) {
  if (isGardenQaSessionActive()) return true;
  if (snapshotTimer) {
    window.clearTimeout(snapshotTimer);
    snapshotTimer = null;
  }
  if (!localStorage.getItem(ACTIVE_ACCOUNT_KEY)) return true;
  const snapshot = saveActiveAccountSnapshot(localStorage);
  if (snapshot && notifyCloud) void cloudSaveService?.noteLocalSnapshot(snapshot);
  return true;
}

function scheduleAccountSnapshot() {
  if (isGardenQaSessionActive()) return;
  if (!localStorage.getItem(ACTIVE_ACCOUNT_KEY)) return;
  if (snapshotTimer) window.clearTimeout(snapshotTimer);
  snapshotTimer = window.setTimeout(() => {
    snapshotTimer = null;
    if (isGardenQaSessionActive()) return;
    try {
      const snapshot = saveActiveAccountSnapshot(localStorage);
      if (snapshot) void cloudSaveService?.noteLocalSnapshot(snapshot);
    } catch {
      setAuthStatus("無法保存此帳號的本機資料，請確認裝置儲存空間。", "error");
    }
  }, SNAPSHOT_DEBOUNCE_MS);
}

window.chromaticaAccountWorkspace = {
  scheduleSave: scheduleAccountSnapshot,
  flushSave: flushAccountSnapshot,
  syncBestEffort() {
    if (isGardenQaSessionActive()) return Promise.resolve(null);
    const snapshot = saveActiveAccountSnapshot(localStorage);
    return snapshot
      ? cloudSaveService?.noteLocalSnapshot?.(snapshot, { immediate: true }) || Promise.resolve(null)
      : Promise.resolve(null);
  },
};

function cleanWebCallbackUrl(url) {
  if (!window.history?.replaceState) return;
  CALLBACK_PARAM_NAMES.forEach((param) => url.searchParams.delete(param));
  const cleanUrl = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, document.title, cleanUrl || "/chromatica-lab/");
}

function getCallbackErrorMessage(url) {
  const errorCode = url.searchParams.get("error") || url.searchParams.get("error_code") || "";
  if (!errorCode) return "";
  return errorCode === "access_denied" ? "登入已取消。" : "Google 登入失敗，請確認網路後重試。";
}

async function closeNativeBrowser() {
  if (!isNativeAndroid()) return;
  oauthAttempt.markBrowserClosedByApp();
  oauthDiagnostics.record("browserCloseRequested");
  try {
    await Browser.close();
    oauthDiagnostics.record("browserCloseResolved");
  } catch (error) {
    oauthDiagnostics.record("browserCloseFailed", {
      exchangeFailedErrorName: error?.name || "Error",
      exchangeFailedErrorMessage: error?.message || "Custom Tab may already be closed",
    });
  }
}

function queueWorkspaceTransition(callback) {
  const nextTransition = workspaceTransition.catch(() => {}).then(callback);
  workspaceTransition = nextTransition.catch(() => {});
  return nextTransition;
}

function getWorkspaceErrorMessage(error) {
  const message = String(error?.message || "");
  if (error?.code === "unsupported-schema") {
    return "此帳號的雲端資料來自較新的 App 版本，請先更新 App。";
  }
  if (error?.code === "cloud-unavailable-no-local" || /cloud-unavailable-no-local/i.test(message)) {
    return "無法取得此帳號的雲端資料，請確認網路後重新嘗試。";
  }
  if (/snapshot|migration/i.test(message)) {
    return "無法載入此帳號的本機資料，請重新嘗試。";
  }
  return "無法載入此帳號的本機資料，請重新嘗試。";
}

async function settleGateImages() {
  try {
    await preloadBlockingImages(getGateImageUrls());
  } catch {
    startupState.imagesStatus = "error";
  }
  scheduleCommonBackgroundPreload();
  schedulePostStartupGardenWarmup(false);
}

async function showAuthErrorGate(message = "無法確認登入狀態，請重新嘗試。") {
  setStartupAuthStatus("error");
  setStartupWorkspaceStatus("not-required");
  startupState.destination = "error";
  renderAuthSession(null);
  setGateState("error", message, true);
  await settleGateImages();
}

async function showUnauthenticatedGate(message = "", showRetry = false) {
  setStartupAuthStatus("unauthenticated");
  setStartupWorkspaceStatus("not-required");
  startupState.destination = "gate";
  renderAuthSession(null);
  setGateState("unauthenticated", message, showRetry);
  await settleGateImages();
}

async function showWorkspaceErrorGate(error) {
  setStartupAuthStatus("authenticated");
  setStartupWorkspaceStatus("error");
  startupState.destination = "error";
  renderAuthSession(null);
  setGateState("error", getWorkspaceErrorMessage(error), true);
  await settleGateImages();
}

async function prepareAuthenticatedSession(session, { forceFormalInitialization = false } = {}) {
  const userId = session?.user?.id;
  if (!userId) return false;
  const qaResumeRequested = isGardenQaSessionActive();
  if (
    !forceFormalInitialization
    && localStorage.getItem(ACTIVE_ACCOUNT_KEY) === userId
    && startupState.authStatus === "authenticated"
    && startupState.workspaceStatus === "ready"
    && startupState.destination === "app"
  ) {
    renderAuthSession(session);
    if (qaResumeRequested) {
      window.chromaticaApp?.initializeForAuthenticatedAccount?.({
        allowDailyLoginBonus: false,
        initializationReason: "qa-resume",
      });
    }
    return true;
  }
  setStartupAuthStatus("authenticated");
  setStartupWorkspaceStatus("pending");
  startupState.imagesStatus = "pending";
  startupState.destination = "preparing";
  setGateState("preparing", "正在準備練習室…");
  const workspaceAttempt = ++workspaceAttemptGeneration;
  try {
    await withTimeout(queueWorkspaceTransition(async () => {
      if (workspaceAttempt !== workspaceAttemptGeneration) {
        throw createTimeoutError("workspace-stale");
      }
      const alreadyActive = localStorage.getItem(ACTIVE_ACCOUNT_KEY) === userId
        && document.body.classList.contains("auth-authenticated");
      if (qaResumeRequested && !forceFormalInitialization) {
        window.chromaticaApp?.initializeForAuthenticatedAccount?.({
          allowDailyLoginBonus: false,
          initializationReason: "qa-resume",
        });
      } else if (!alreadyActive || forceFormalInitialization) {
        const previousUserId = localStorage.getItem(ACTIVE_ACCOUNT_KEY) || "";
        if (previousUserId && previousUserId !== userId) {
          await window.chromaticaApp?.cancelPracticeRemindersForAccount?.(previousUserId);
        }
        if (!alreadyActive) switchAccountWorkspace(userId, localStorage);
        const localSnapshot = readAccountSnapshot(userId, localStorage);
        const cloudResult = await cloudSaveService.reconcileStartup(userId, localSnapshot);
        if (cloudResult.kind === "stale") throw createTimeoutError("workspace-stale");
        if (cloudResult.kind === "fatal") {
          const cloudError = new Error("cloud-unavailable-no-local");
          cloudError.code = cloudResult.code === "unsupported-schema"
            ? "unsupported-schema"
            : "cloud-unavailable-no-local";
          throw cloudError;
        }
        window.chromaticaApp?.initializeForAuthenticatedAccount?.({
          allowDailyLoginBonus: !forceFormalInitialization,
          initializationReason: forceFormalInitialization ? "qa-exit" : "authenticated-ready",
        });
        if (cloudResult.kind === "new-workspace") {
          void cloudSaveService.initializeNewWorkspace();
        }
      }
      if (workspaceAttempt !== workspaceAttemptGeneration) {
        throw createTimeoutError("workspace-stale");
      }
      renderAuthSession(session);
      setAuthStatus("");
    }), WORKSPACE_TIMEOUT_MS, "workspace-timeout");
  } catch (error) {
    if (workspaceAttempt === workspaceAttemptGeneration) {
      workspaceAttemptGeneration += 1;
    }
    cloudSaveService?.deactivate();
    await showWorkspaceErrorGate(error);
    return false;
  }

  if (workspaceAttempt !== workspaceAttemptGeneration) return false;

  setStartupWorkspaceStatus("ready");
  const accountImageUrls = window.chromaticaApp?.getAuthenticatedStartupImageUrls?.() || [];
  try {
    void ensureCommonBackgroundPreload();
    await preloadBlockingImages([...getCommonImageUrls(), ...accountImageUrls]);
  } catch {
    startupState.imagesStatus = "error";
  }
  if (workspaceAttempt !== workspaceAttemptGeneration) return false;
  startupState.destination = "app";
  setGateState("authenticated");
  if (qaResumeRequested && !forceFormalInitialization) {
    schedulePostStartupGardenWarmup(false);
  } else {
    renderCloudSyncState(userId, cloudSaveService?.getState() || {});
    schedulePostStartupGardenWarmup(true);
    scheduleAccountSnapshot();
  }
  return true;
}

function activateSession(session) {
  const userId = session?.user?.id || "";
  if (activeSessionPreparation && activeSessionUserId === userId) {
    return activeSessionPreparation;
  }
  activeSessionUserId = userId;
  const preparation = prepareAuthenticatedSession(session);
  const trackedPreparation = preparation.finally(() => {
    if (activeSessionPreparation === trackedPreparation) {
      activeSessionPreparation = null;
      activeSessionUserId = "";
    }
  });
  activeSessionPreparation = trackedPreparation;
  return trackedPreparation;
}

async function deactivateSession({ preserveLegacy = true, snapshotAlreadySaved = false } = {}) {
  invalidateAsyncStartupFlow();
  cloudSaveService?.deactivate();
  await queueWorkspaceTransition(async () => {
    const activeUserId = localStorage.getItem(ACTIVE_ACCOUNT_KEY);
    if (activeUserId) {
      if (!snapshotAlreadySaved && !signOutSnapshotFlushed) flushAccountSnapshot();
      window.chromaticaApp?.prepareForSignedOutAccount?.();
      clearSignedOutWorkspace(localStorage);
    } else if (!preserveLegacy) {
      clearSignedOutWorkspace(localStorage);
    }
    renderAuthSession(null);
  });
  setStartupAuthStatus("unauthenticated");
  setStartupWorkspaceStatus("not-required");
  startupState.destination = "gate";
  setGateState("unauthenticated");
  await settleGateImages();
}

async function exchangeCallbackCode(code) {
  if (!oauthAttempt.claimAuthorizationCode(code)) return false;
  oauthAttempt.markExchangeStarted(oauthDiagnostics.ensureAttempt());
  oauthDiagnostics.recordPkceStorage("exchangeStarted", { exchangeStarted: true });
  resetStartupCheck();
  setGateState("checking", "正在完成 Google 登入…");
  setAuthBusy(true, "正在完成 Google 登入…");
  const { data, error } = await withTimeout(
    supabaseClient.auth.exchangeCodeForSession(code),
    AUTH_CHECK_TIMEOUT_MS,
    "auth-timeout",
  );
  if (error) {
    oauthAttempt.markFailed(oauthDiagnostics.ensureAttempt());
    oauthDiagnostics.recordExchangeFailure(error);
    throw error;
  }
  oauthAttempt.markExchangeSucceeded();
  oauthDiagnostics.recordPkceStorage("exchangeSucceeded", {
    exchangeSucceeded: true,
    sessionDetected: Boolean(data.session),
  });
  const activated = await activateSession(data.session);
  if (activated) showAuthToast("Google 登入成功");
  return activated;
}

async function handleWebOAuthCallback() {
  if (isNativeAndroid()) return false;
  const url = new URL(window.location.href);
  const callbackError = getCallbackErrorMessage(url);
  const code = url.searchParams.get("code");
  if (!callbackError && !code) return false;
  try {
    if (callbackError) {
      await showUnauthenticatedGate(callbackError);
      return true;
    }
    await exchangeCallbackCode(code);
    return true;
  } catch (error) {
    if (startupState.workspaceStatus !== "error") {
      await showAuthErrorGate(
        error?.code === "auth-timeout"
          ? "無法確認登入狀態，請重新嘗試。"
          : "Google 登入失敗，請確認網路後重試。",
      );
    }
    return true;
  } finally {
    setAuthBusy(false);
    cleanWebCallbackUrl(url);
  }
}

function isAndroidLoginCallback(url) {
  const parsed = parseOAuthCallbackMetadata(url);
  return parsed.callbackScheme === "chromaticalab" && parsed.callbackHost === "login-callback";
}

function getAndroidCallbackParams(callbackUrl) {
  const query = String(callbackUrl || "").split("?", 2)[1]?.split("#", 1)[0] || "";
  return new URLSearchParams(query);
}

async function handleAndroidOAuthCallback(callbackUrl) {
  if (!isAndroidLoginCallback(callbackUrl)) return false;
  const loginAttemptId = oauthDiagnostics.ensureAttempt();
  oauthAttempt.markCallbackReceived(loginAttemptId);
  oauthDiagnostics.recordCallback("callbackAccepted", callbackUrl);
  const callback = { searchParams: getAndroidCallbackParams(callbackUrl) };
  const callbackError = getCallbackErrorMessage(callback);
  try {
    if (callbackError) {
      const errorCode = callback.searchParams.get("error") || callback.searchParams.get("error_code") || "";
      if (errorCode === "access_denied") oauthAttempt.markAccessDenied(loginAttemptId);
      else oauthAttempt.markFailed(loginAttemptId);
      await showUnauthenticatedGate(callbackError);
      return true;
    }
    const code = callback.searchParams.get("code");
    if (!code) throw new Error("Missing callback code");
    await exchangeCallbackCode(code);
    return true;
  } catch (error) {
    oauthAttempt.markFailed(loginAttemptId);
    oauthDiagnostics.recordExchangeFailure(error);
    if (startupState.workspaceStatus !== "error") {
      await showAuthErrorGate(
        error?.code === "auth-timeout"
          ? "無法確認登入狀態，請重新嘗試。"
          : "Google 登入失敗，請確認網路後重試。",
      );
    }
    return true;
  } finally {
    setAuthBusy(false);
    await closeNativeBrowser();
  }
}

async function registerNativeAuthListeners() {
  if (!isNativeAndroid() || nativeListenersRegistered) return;
  nativeListenersRegistered = true;
  await App.addListener("appUrlOpen", ({ url }) => {
    oauthDiagnostics.recordCallback("appUrlOpenReceived", url, { appUrlOpenReceived: true });
    void handleAndroidOAuthCallback(url);
  });
  await App.addListener("appStateChange", ({ isActive }) => {
    oauthDiagnostics.record(isActive ? "appBecameActive" : "appBecameInactive", {
      appBecameActive: isActive,
      appBecameInactive: !isActive,
    });
    if (isGardenQaSessionActive()) return;
    if (!isActive) {
      try { flushAccountSnapshot(); } catch { /* Keep the active UI; retry on the next write. */ }
      void cloudSaveService?.syncNow("background");
    } else {
      void cloudSaveService?.handleForeground();
    }
  });
  await Browser.addListener("browserFinished", () => {
    oauthDiagnostics.record("browserFinishedReceived", { browserFinishedReceived: true });
    oauthAttempt.handleBrowserFinished();
  });
  const launch = await App.getLaunchUrl();
  if (launch?.url) {
    oauthDiagnostics.recordCallback("launchUrlReceived", launch.url, { launchUrlReceived: true });
    await handleAndroidOAuthCallback(launch.url);
  }
}

async function startGoogleSignIn() {
  if (!supabaseClient || authBusy) return;
  if (isOffline()) {
    void showUnauthenticatedGate("目前無法連線至 Google 登入，請確認網路後再試。", true);
    return;
  }
  const currentAttempt = oauthAttempt.getState();
  if (currentAttempt && !currentAttempt.completed && !currentAttempt.cancelled) return;
  const loginAttemptId = oauthDiagnostics.beginAttempt();
  const attempt = oauthAttempt.beginAttempt(loginAttemptId);
  if (!attempt.created) return;
  setAuthBusy(true, "正在開啟 Google 登入…");
  try {
    const nativeAndroid = isNativeAndroid();
    oauthDiagnostics.record("oauthRequestStarted");
    const { data, error } = await supabaseClient.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: nativeAndroid ? ANDROID_REDIRECT_URL : WEB_REDIRECT_URL,
        skipBrowserRedirect: nativeAndroid,
        scopes: GOOGLE_BASIC_SCOPES,
      },
    });
    if (error) throw error;
    oauthDiagnostics.recordPkceStorage("oauthRequestResolved");
    if (nativeAndroid) {
      if (!data?.url) throw new Error("Missing OAuth URL");
      oauthDiagnostics.record("browserOpenRequested", { browserOpenRequested: true });
      await Browser.open({ url: data.url });
      oauthDiagnostics.record("browserOpenResolved", { browserOpenResolved: true });
    }
  } catch (error) {
    oauthAttempt.markFailed(loginAttemptId);
    oauthDiagnostics.record("browserOpenFailed", {
      exchangeFailedErrorName: error?.name || "Error",
      exchangeFailedErrorMessage: error?.message || "Unable to open OAuth browser",
    });
    setAuthBusy(false);
    await showUnauthenticatedGate("無法開啟 Google 登入，請稍後再試。", true);
  }
}

function openLogoutConfirmation() {
  if (authBusy) return;
  const elements = getAuthElements();
  const cloudState = cloudSaveService?.getState();
  const hasUnsyncedProgress = cloudState?.conflict || cloudState?.dirty;
  if (elements.logoutMessage) {
    elements.logoutMessage.textContent = hasUnsyncedProgress
      ? "尚有進度未同步到雲端。此裝置會保留目前資料，但其他裝置暫時無法取得最新進度。"
        : "登出後需要重新使用 Google 帳號登入，才能繼續使用 App。此帳號的本機與雲端進度會保留。";
  }
  if (elements.logoutConfirm) {
    elements.logoutConfirm.textContent = hasUnsyncedProgress ? "仍要登出" : "確定登出";
  }
  elements.logoutModal?.classList.remove("hidden");
}

function closeLogoutConfirmation() {
  getAuthElements().logoutModal?.classList.add("hidden");
}

async function confirmSignOut() {
  if (!supabaseClient || authBusy) return;
  setAuthBusy(true, "正在保存並登出…");
  try {
    flushAccountSnapshot();
    await cloudSaveService?.prepareForSignOut();
    await window.chromaticaApp?.cancelPracticeRemindersForAccount?.(localStorage.getItem(ACTIVE_ACCOUNT_KEY) || "");
    await window.ChromaticaPushNotifications?.unregisterForSignOut?.();
    signOutSnapshotFlushed = true;
  } catch {
    setAuthBusy(false);
    closeLogoutConfirmation();
    setAuthStatus("本機資料保存失敗，已取消登出。", "error");
    return;
  }
  const { error } = await supabaseClient.auth.signOut();
  if (error) {
    signOutSnapshotFlushed = false;
    setAuthBusy(false);
    closeLogoutConfirmation();
    setAuthStatus("登出失敗，請稍後再試。", "error");
    return;
  }
  await deactivateSession({ preserveLegacy: false, snapshotAlreadySaved: true });
  signOutSnapshotFlushed = false;
  setAuthBusy(false);
  closeLogoutConfirmation();
  setGateState("unauthenticated", "已登出");
}

function openResetAccountConfirmation() {
  if (authBusy || !cloudSaveService?.getActiveUserId()) return;
  getAuthElements().resetAccountModal?.classList.remove("hidden");
}

function closeResetAccountConfirmation() {
  getAuthElements().resetAccountModal?.classList.add("hidden");
}

async function confirmResetAccountData() {
  if (authBusy || !cloudSaveService?.getActiveUserId()) return;
  setAuthBusy(true, "正在清除所有紀錄…");
  try {
    const activeUserId = cloudSaveService.getActiveUserId();
    const { data, error } = await withTimeout(
      supabaseClient.auth.getSession(),
      AUTH_CHECK_TIMEOUT_MS,
      "auth-timeout",
    );
    if (error || !data.session?.user?.id || data.session.user.id !== activeUserId) {
      const sessionError = new Error("reset-session-invalid");
      sessionError.code = "reset-session-invalid";
      throw sessionError;
    }
    const result = await cloudSaveService.resetCurrentWorkspace({ userId: data.session.user.id });
    if (!result?.ok) {
      const resetError = new Error(result?.code || "account-reset-failed");
      resetError.code = result?.code || "account-reset-failed";
      throw resetError;
    }
    const { error: leaderboardResetError } = await supabaseClient.rpc("reset_my_leaderboard_data");
    if (leaderboardResetError) {
      const resetError = new Error("leaderboard-reset-failed");
      resetError.code = "leaderboard-reset-failed";
      throw resetError;
    }
    window.ChromaticaLeaderboard?.resetAfterAccountDataClear?.();
    window.chromaticaApp?.initializeForAuthenticatedAccount?.({
      allowDailyLoginBonus: false,
      initializationReason: "account-reset-rerender",
    });
    closeResetAccountConfirmation();
    setAuthStatus("");
    showAuthToast("所有紀錄已清除");
  } catch (error) {
    closeResetAccountConfirmation();
    const code = error?.code || "";
    if (code === "reset-conflict") {
      setAuthStatus("雲端資料剛剛有更新，請重新執行一次清除。原有資料未受影響。", "error");
    } else if (code === "reset-session-invalid" || code === "auth") {
      setAuthStatus("登入狀態已失效，請重新登入。原有資料未受影響。", "error");
    } else if (code.startsWith("cloud-fetch-")) {
      setAuthStatus("無法取得雲端紀錄，請確認網路後再試。原有資料未受影響。", "error");
    } else if (code === "leaderboard-reset-failed") {
      setAuthStatus("遊戲紀錄已清除，但排行榜資料未能清除；請勿重複操作並稍後再試。", "error");
    } else {
      setAuthStatus("無法清除雲端紀錄，請確認網路後再試。原有資料未受影響。", "error");
    }
  } finally {
    setAuthBusy(false);
  }
}

async function retryAuthCheck() {
  if (!supabaseClient || authBusy) return;
  resetStartupCheck();
  setGateState("checking", "正在確認登入狀態…");
  try {
    const { data, error } = await withTimeout(
      supabaseClient.auth.getSession(),
      AUTH_CHECK_TIMEOUT_MS,
      "auth-timeout",
    );
    if (error) throw error;
    if (data.session) await activateSession(data.session);
    else {
      await deactivateSession();
      if (isOffline()) {
        setGateState("unauthenticated", "目前無法連線至 Google 登入，請確認網路後再試。", true);
      }
    }
  } catch (error) {
    if (startupState.workspaceStatus !== "error") {
      await showAuthErrorGate("無法確認登入狀態，請重新嘗試。");
    }
  }
}

function bindAuthUi() {
  if (authUiBound) return;
  authUiBound = true;
  const elements = getAuthElements();
  elements.signInButton?.addEventListener("click", startGoogleSignIn);
  elements.gateSignInButton?.addEventListener("click", startGoogleSignIn);
  elements.signOutButton?.addEventListener("click", openLogoutConfirmation);
  elements.logoutCancel?.addEventListener("click", closeLogoutConfirmation);
  elements.logoutConfirm?.addEventListener("click", confirmSignOut);
  elements.resetAccountButton?.addEventListener("click", openResetAccountConfirmation);
  elements.resetAccountCancel?.addEventListener("click", closeResetAccountConfirmation);
  elements.resetAccountConfirm?.addEventListener("click", confirmResetAccountData);
  elements.gateRetryButton?.addEventListener("click", retryAuthCheck);
  elements.avatar?.addEventListener("error", () => {
    elements.avatar.classList.add("hidden");
    elements.avatarFallback?.classList.remove("hidden");
  });
  window.addEventListener("beforeunload", () => {
    if (isGardenQaSessionActive()) return;
    try { flushAccountSnapshot({ notifyCloud: false }); } catch { /* Browser is closing; preserve existing snapshot. */ }
  });
  window.addEventListener("online", () => {
    if (isGardenQaSessionActive()) return;
    void cloudSaveService?.handleOnline();
  });
}

function registerAuthStateListener() {
  if (authListenerRegistered) return;
  authListenerRegistered = true;
  supabaseClient.auth.onAuthStateChange((event, session) => {
    const attemptState = oauthAttempt.getState();
    const oauthRelevant = authBusy || event === "SIGNED_IN" || Boolean(attemptState && !attemptState.completed);
    if (oauthRelevant) {
      oauthDiagnostics.record("authStateChanged", {
        sessionDetected: Boolean(session),
        authEvent: event,
      });
    }
    if (session && oauthRelevant) {
      oauthAttempt.markSessionDetected(oauthDiagnostics.ensureAttempt());
      setAuthBusy(false);
    }
    window.setTimeout(() => {
      if (["INITIAL_SESSION", "SIGNED_IN"].includes(event) && session?.user) {
        void activateSession(session).catch((error) => showWorkspaceErrorGate(error));
      } else if (event === "SIGNED_OUT") {
        void deactivateSession({ preserveLegacy: false, snapshotAlreadySaved: signOutSnapshotFlushed }).catch(() => {
          void showWorkspaceErrorGate(new Error("workspace-signout-failed"));
        });
      } else if (event === "TOKEN_REFRESHED") {
        renderAuthSession(session);
      }
    }, 0);
  });
}

async function initializeGoogleAuth() {
  resetStartupCheck();
  setGateState("checking", "正在確認登入狀態…");
  const config = window.CHROMATICA_SUPABASE_CONFIG;
  if (!config?.url || !config?.publishableKey) {
    await showAuthErrorGate("無法確認登入狀態，請重新嘗試。");
    return;
  }
  try {
    supabaseClient = createClient(config.url, config.publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: "pkce",
      },
    });
    cloudSaveService = createCloudSaveService({
      client: supabaseClient,
      storage: localStorage,
      onStateChange: renderCloudSyncState,
      onRemoteApplied: async (userId) => {
        if (isGardenQaSessionActive()) return;
        if (localStorage.getItem(ACTIVE_ACCOUNT_KEY) !== userId) return;
        window.chromaticaApp?.recordDailyLoginEvent?.("onRemoteApplied called", {
          initializationReason: "remote-apply",
          remoteApply: true,
        });
        window.chromaticaApp?.recordDailyLoginEvent?.("cloud remote snapshot applied", {
          initializationReason: "remote-apply",
          remoteApply: true,
        });
        window.chromaticaApp?.initializeForAuthenticatedAccount?.({
          allowDailyLoginBonus: false,
          initializationReason: "remote-apply",
        });
        scheduleAccountSnapshot();
        window.chromaticaApp?.recordDailyLoginEvent?.("account snapshot scheduled", {
          initializationReason: "remote-apply",
          remoteApply: true,
        });
      },
    });
    bindAuthUi();
    await withTimeout(registerNativeAuthListeners(), AUTH_CHECK_TIMEOUT_MS, "auth-timeout");
    if (await handleWebOAuthCallback()) {
      registerAuthStateListener();
      return;
    }
    const { data, error } = await withTimeout(
      supabaseClient.auth.getSession(),
      AUTH_CHECK_TIMEOUT_MS,
      "auth-timeout",
    );
    if (error) throw error;
    if (data.session?.user) await activateSession(data.session);
    else {
      await deactivateSession();
      if (isOffline()) {
        setGateState("unauthenticated", "目前無法連線至 Google 登入，請確認網路後再試。", true);
      }
    }
    registerAuthStateListener();
  } catch (error) {
    setAuthBusy(false);
    if (startupState.workspaceStatus !== "error") {
      await showAuthErrorGate("無法確認登入狀態，請重新嘗試。");
    }
  }
}

const LEADERBOARD_AVATAR_INPUT_LIMIT = 2 * 1024 * 1024;
const LEADERBOARD_AVATAR_OUTPUT_LIMIT = 300 * 1024;
const LEADERBOARD_AVATAR_MAX_EDGE = 512;

async function detectLeaderboardAvatarMime(file) {
  if (!file || file.size > LEADERBOARD_AVATAR_INPUT_LIMIT) return "";
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";
  const ascii = String.fromCharCode(...bytes);
  if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") return "image/webp";
  return "";
}

async function loadLeaderboardAvatarImage(file) {
  if (typeof createImageBitmap === "function") return createImageBitmap(file);
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = objectUrl;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function encodeLeaderboardAvatar(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("avatar-encode-failed"));
    }, "image/webp", quality);
  });
}

async function prepareLeaderboardAvatar(file) {
  const actualMime = await detectLeaderboardAvatarMime(file);
  if (!actualMime) throw new Error("avatar-file-invalid");
  const source = await loadLeaderboardAvatarImage(file);
  try {
    const sourceWidth = Number(source.width || source.naturalWidth || 0);
    const sourceHeight = Number(source.height || source.naturalHeight || 0);
    if (!sourceWidth || !sourceHeight) throw new Error("avatar-decode-failed");
    const cropSize = Math.min(sourceWidth, sourceHeight);
    const cropX = Math.floor((sourceWidth - cropSize) / 2);
    const cropY = Math.floor((sourceHeight - cropSize) / 2);
    const candidateSizes = [Math.min(LEADERBOARD_AVATAR_MAX_EDGE, cropSize), 448, 384, 320, 256]
      .filter((size, index, values) => size > 0 && size <= Math.min(LEADERBOARD_AVATAR_MAX_EDGE, cropSize) && values.indexOf(size) === index);
    for (const size of candidateSizes) {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("avatar-canvas-unavailable");
      context.drawImage(source, cropX, cropY, cropSize, cropSize, 0, 0, size, size);
      for (const quality of [0.88, 0.8, 0.72, 0.64, 0.56]) {
        const blob = await encodeLeaderboardAvatar(canvas, quality);
        if (blob.size < LEADERBOARD_AVATAR_OUTPUT_LIMIT) return blob;
      }
    }
    throw new Error("avatar-output-too-large");
  } finally {
    source.close?.();
  }
}

const LEADERBOARD_RPC_ALLOWLIST = new Set([
  "get_leaderboard_avatar_prefix",
  "get_my_leaderboard_membership",
  "join_global_leaderboard",
  "sync_leaderboard_profile",
  "get_global_leaderboard",
  "get_weekly_leaderboard",
  "update_leaderboard_profile",
  "record_leaderboard_practice",
  "record_weekly_leaderboard_practice",
  "register_leaderboard_push_token",
  "disable_leaderboard_push_token",
  "get_leaderboard_push_preferences",
  "set_leaderboard_push_preferences",
  "get_published_announcements",
  "get_announcement_admin_status",
  "get_admin_announcements",
  "save_announcement",
  "set_announcement_published",
]);

window.chromaticaAuth = {
  getDisplayName() {
    if (currentAuthUser) return getDisplayName(currentAuthUser);
    return getAuthElements().name?.textContent?.trim() || "練習者";
  },
  getPublicUserProfile() {
    if (!currentAuthUser) return null;
    return {
      id: currentAuthUser.id,
      displayName: getDisplayName(currentAuthUser),
      avatarUrl: getAvatarUrl(currentAuthUser),
    };
  },
  getLeaderboardAccount() {
    return currentAuthUser ? { id: currentAuthUser.id } : null;
  },
  async leaderboardRpc(name, params = {}) {
    if (!supabaseClient || !LEADERBOARD_RPC_ALLOWLIST.has(name)) {
      return { data: null, error: new Error("leaderboard-rpc-unavailable") };
    }
    const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError || !sessionData.session?.user) {
      return { data: null, error: sessionError || new Error("auth-required") };
    }
    return supabaseClient.rpc(name, params);
  },
  getLeaderboardAvatarUrl(path, version = 0) {
    if (!supabaseClient || !path) return "";
    const publicUrl = supabaseClient.storage.from("leaderboard-avatars").getPublicUrl(path).data?.publicUrl || "";
    return publicUrl ? `${publicUrl}${publicUrl.includes("?") ? "&" : "?"}v=${encodeURIComponent(String(version || 0))}` : "";
  },
  async uploadLeaderboardAvatar(file, options = {}) {
    if (!supabaseClient || !currentAuthUser) throw new Error("auth-required");
    const actualMime = await detectLeaderboardAvatarMime(file);
    if (!actualMime || file.size <= 0 || file.size > LEADERBOARD_AVATAR_INPUT_LIMIT) throw new Error("avatar-file-invalid");
    const form = new FormData();
    form.append("file", file, file.name || "avatar");
    form.append("display_name", String(options.displayName || ""));
    form.append("consent", options.consent === true ? "true" : "false");
    form.append("featured_spirit_species", String(options.featuredSpiritSpecies || ""));
    form.append("featured_spirit_name", String(options.featuredSpiritName || ""));
    form.append("featured_spirit_stage", String(options.featuredSpiritStage || 1));
    const { data, error } = await supabaseClient.functions.invoke("upload-leaderboard-avatar", {
      body: form,
    });
    if (error) throw error;
    const path = String(data?.path || "");
    if (!/^[a-f0-9]{32}\/avatar-[a-f0-9-]+\.webp$/i.test(path)) throw new Error("avatar-upload-invalid-response");
    const publicUrl = supabaseClient.storage.from("leaderboard-avatars").getPublicUrl(path).data?.publicUrl || "";
    return { path, publicUrl, bytes: Number(data?.bytes || 0), mime: String(data?.mime || ""), maxEdge: LEADERBOARD_AVATAR_MAX_EDGE, profile: data?.profile || null };
  },
  async deleteLeaderboardAvatar(path) {
    if (!supabaseClient || !currentAuthUser || !path) return false;
    const { data: prefix, error: prefixError } = await supabaseClient.rpc("get_leaderboard_avatar_prefix");
    if (prefixError || String(path).split("/")[0] !== String(prefix || "")) {
      throw prefixError || new Error("avatar-path-invalid");
    }
    const { error } = await supabaseClient.storage.from("leaderboard-avatars").remove([path]);
    if (error) throw error;
    return true;
  },
  async invokeFunction(name, body) {
    if (!supabaseClient) return { data: null, error: new Error("auth-unavailable") };
    const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError || !sessionData.session?.user) {
      return { data: null, error: sessionError || new Error("auth-required") };
    }
    return supabaseClient.functions.invoke(name, { body });
  },
  isNativeAndroid,
  pushNotifications: {
    async checkPermissions() { return isNativeAndroid() ? PushNotifications.checkPermissions() : { receive: "denied" }; },
    async requestPermissions() { return isNativeAndroid() ? PushNotifications.requestPermissions() : { receive: "denied" }; },
    async createChannel(options) { if (isNativeAndroid()) await PushNotifications.createChannel(options); },
    async register() { if (isNativeAndroid()) await PushNotifications.register(); },
    async addListener(name, callback) { return isNativeAndroid() ? PushNotifications.addListener(name, callback) : { remove() {} }; },
  },
  getAnnouncementImageUrl(path, version = 0) {
    if (!supabaseClient || !path) return "";
    const publicUrl = supabaseClient.storage.from("announcement-images").getPublicUrl(path).data?.publicUrl || "";
    return publicUrl ? `${publicUrl}${publicUrl.includes("?") ? "&" : "?"}v=${encodeURIComponent(String(version || 0))}` : "";
  },
  async resumeFormalWorkspaceAfterQa() {
    if (!supabaseClient || isGardenQaSessionActive()) return false;
    const { data, error } = await supabaseClient.auth.getSession();
    if (error || !data.session?.user) return false;
    return prepareAuthenticatedSession(data.session, { forceFormalInitialization: true });
  },
  enterGardenQaIsolation() {
    if (snapshotTimer) {
      window.clearTimeout(snapshotTimer);
      snapshotTimer = null;
    }
    cancelGardenWarmupSchedule();
    cloudSaveService?.deactivate();
    return true;
  },
};

void initializeGoogleAuth();
