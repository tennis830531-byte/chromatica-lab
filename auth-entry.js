import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { createClient } from "@supabase/supabase-js";
import {
  ACTIVE_ACCOUNT_KEY,
  clearSignedOutWorkspace,
  saveActiveAccountSnapshot,
  switchAccountWorkspace,
} from "./account-workspace.js";

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
let authListenerRegistered = false;
let nativeListenersRegistered = false;
let authUiBound = false;
let authBusy = false;
let authToastTimer = null;
let snapshotTimer = null;
let workspaceTransition = Promise.resolve();
let signOutSnapshotFlushed = false;
const exchangedAuthCodes = new Set();
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

const byId = (id) => document.getElementById(id);

function isOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function isNativeAndroid() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
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
    logoutCancel: byId("logoutCancelBtn"),
    logoutConfirm: byId("logoutConfirmBtn"),
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
  [elements.signInButton, elements.signOutButton, elements.gateSignInButton, elements.logoutConfirm]
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
  return metadata.full_name || metadata.name || user?.email?.split("@")[0] || "Google 使用者";
}

function getAvatarUrl(user) {
  const metadata = user?.user_metadata || {};
  return metadata.avatar_url || metadata.picture || "";
}

function renderAuthSession(session) {
  const elements = getAuthElements();
  const user = session?.user || null;
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
}

function flushAccountSnapshot() {
  if (snapshotTimer) {
    window.clearTimeout(snapshotTimer);
    snapshotTimer = null;
  }
  if (!localStorage.getItem(ACTIVE_ACCOUNT_KEY)) return true;
  saveActiveAccountSnapshot(localStorage);
  return true;
}

function scheduleAccountSnapshot() {
  if (!localStorage.getItem(ACTIVE_ACCOUNT_KEY)) return;
  if (snapshotTimer) window.clearTimeout(snapshotTimer);
  snapshotTimer = window.setTimeout(() => {
    snapshotTimer = null;
    try {
      saveActiveAccountSnapshot(localStorage);
    } catch {
      setAuthStatus("無法保存此帳號的本機資料，請確認裝置儲存空間。", "error");
    }
  }, SNAPSHOT_DEBOUNCE_MS);
}

window.chromaticaAccountWorkspace = {
  scheduleSave: scheduleAccountSnapshot,
  flushSave: flushAccountSnapshot,
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
  try { await Browser.close(); } catch { /* Custom Tab may already be closed. */ }
}

function queueWorkspaceTransition(callback) {
  const nextTransition = workspaceTransition.catch(() => {}).then(callback);
  workspaceTransition = nextTransition.catch(() => {});
  return nextTransition;
}

function getWorkspaceErrorMessage(error) {
  const message = String(error?.message || "");
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

async function prepareAuthenticatedSession(session) {
  const userId = session?.user?.id;
  if (!userId) return false;
  if (
    localStorage.getItem(ACTIVE_ACCOUNT_KEY) === userId
    && startupState.authStatus === "authenticated"
    && startupState.workspaceStatus === "ready"
    && startupState.destination === "app"
  ) {
    renderAuthSession(session);
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
      if (!alreadyActive) {
        switchAccountWorkspace(userId, localStorage);
        window.chromaticaApp?.initializeForAuthenticatedAccount?.();
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
  schedulePostStartupGardenWarmup(true);
  scheduleAccountSnapshot();
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
  if (!code || exchangedAuthCodes.has(code)) return false;
  exchangedAuthCodes.add(code);
  resetStartupCheck();
  setGateState("checking", "正在完成 Google 登入…");
  setAuthBusy(true, "正在完成 Google 登入…");
  const { data, error } = await withTimeout(
    supabaseClient.auth.exchangeCodeForSession(code),
    AUTH_CHECK_TIMEOUT_MS,
    "auth-timeout",
  );
  if (error) throw error;
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
  try {
    const parsed = new URL(url);
    return parsed.protocol === "chromaticalab:" && parsed.hostname === "login-callback";
  } catch { return false; }
}

async function handleAndroidOAuthCallback(callbackUrl) {
  if (!isAndroidLoginCallback(callbackUrl)) return false;
  const url = new URL(callbackUrl);
  const callbackError = getCallbackErrorMessage(url);
  try {
    if (callbackError) {
      await showUnauthenticatedGate(callbackError);
      return true;
    }
    const code = url.searchParams.get("code");
    if (!code) throw new Error("Missing callback code");
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
    await closeNativeBrowser();
  }
}

async function registerNativeAuthListeners() {
  if (!isNativeAndroid() || nativeListenersRegistered) return;
  nativeListenersRegistered = true;
  await App.addListener("appUrlOpen", ({ url }) => { void handleAndroidOAuthCallback(url); });
  await App.addListener("appStateChange", ({ isActive }) => {
    if (!isActive) {
      try { flushAccountSnapshot(); } catch { /* Keep the active UI; retry on the next write. */ }
    }
  });
  await Browser.addListener("browserFinished", () => {
    if (!authBusy) return;
    setAuthBusy(false);
    void showUnauthenticatedGate("登入已取消。");
  });
  const launch = await App.getLaunchUrl();
  if (launch?.url) await handleAndroidOAuthCallback(launch.url);
}

async function startGoogleSignIn() {
  if (!supabaseClient || authBusy) return;
  if (isOffline()) {
    void showUnauthenticatedGate("目前無法連線至 Google 登入，請確認網路後再試。", true);
    return;
  }
  setAuthBusy(true, "正在開啟 Google 登入…");
  try {
    const nativeAndroid = isNativeAndroid();
    const { data, error } = await supabaseClient.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: nativeAndroid ? ANDROID_REDIRECT_URL : WEB_REDIRECT_URL,
        skipBrowserRedirect: nativeAndroid,
        scopes: GOOGLE_BASIC_SCOPES,
      },
    });
    if (error) throw error;
    if (nativeAndroid) {
      if (!data?.url) throw new Error("Missing OAuth URL");
      await Browser.open({ url: data.url });
    }
  } catch {
    setAuthBusy(false);
    await showUnauthenticatedGate("無法開啟 Google 登入，請稍後再試。", true);
  }
}

function openLogoutConfirmation() {
  if (authBusy) return;
  getAuthElements().logoutModal?.classList.remove("hidden");
}

function closeLogoutConfirmation() {
  getAuthElements().logoutModal?.classList.add("hidden");
}

async function confirmSignOut() {
  if (!supabaseClient || authBusy) return;
  setAuthBusy(true, "正在保存並登出…");
  try {
    flushAccountSnapshot();
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
  elements.gateRetryButton?.addEventListener("click", retryAuthCheck);
  elements.avatar?.addEventListener("error", () => {
    elements.avatar.classList.add("hidden");
    elements.avatarFallback?.classList.remove("hidden");
  });
  window.addEventListener("beforeunload", () => {
    try { flushAccountSnapshot(); } catch { /* Browser is closing; preserve existing snapshot. */ }
  });
}

function registerAuthStateListener() {
  if (authListenerRegistered) return;
  authListenerRegistered = true;
  supabaseClient.auth.onAuthStateChange((event, session) => {
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

void initializeGoogleAuth();
