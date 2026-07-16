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

const byId = (id) => document.getElementById(id);

function isOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function isNativeAndroid() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
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
  document.body.classList.add(`auth-${state}`);
  const elements = getAuthElements();
  elements.gateChecking?.classList.toggle("hidden", state !== "checking");
  elements.gateSignedOut?.classList.toggle("hidden", state !== "unauthenticated");
  if (elements.gateStatus) {
    elements.gateStatus.textContent = message;
    elements.gateStatus.dataset.kind = message && showRetry ? "error" : "";
  }
  elements.gateRetryButton?.classList.toggle("hidden", !showRetry);
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
    return "無法載入此帳號的本機資料，請稍後再試。";
  }
  return "無法保存目前帳號資料，請稍後再試。";
}

function activateSession(session) {
  return queueWorkspaceTransition(async () => {
    const userId = session?.user?.id;
    if (!userId) return;
    const alreadyActive = localStorage.getItem(ACTIVE_ACCOUNT_KEY) === userId
      && document.body.classList.contains("auth-authenticated");
    if (!alreadyActive) {
      switchAccountWorkspace(userId, localStorage);
      window.chromaticaApp?.initializeForAuthenticatedAccount?.();
    }
    renderAuthSession(session);
    setAuthStatus("");
    setGateState("authenticated");
    scheduleAccountSnapshot();
  });
}

function deactivateSession({ preserveLegacy = true, snapshotAlreadySaved = false } = {}) {
  return queueWorkspaceTransition(async () => {
    const activeUserId = localStorage.getItem(ACTIVE_ACCOUNT_KEY);
    if (activeUserId) {
      if (!snapshotAlreadySaved && !signOutSnapshotFlushed) flushAccountSnapshot();
      window.chromaticaApp?.prepareForSignedOutAccount?.();
      clearSignedOutWorkspace(localStorage);
    } else if (!preserveLegacy) {
      clearSignedOutWorkspace(localStorage);
    }
    renderAuthSession(null);
    setGateState("unauthenticated");
  });
}

async function exchangeCallbackCode(code) {
  if (!code || exchangedAuthCodes.has(code)) return false;
  exchangedAuthCodes.add(code);
  setGateState("checking");
  setAuthBusy(true, "正在完成 Google 登入…");
  const { data, error } = await supabaseClient.auth.exchangeCodeForSession(code);
  if (error) throw error;
  await activateSession(data.session);
  showAuthToast("Google 登入成功");
  return true;
}

async function handleWebOAuthCallback() {
  if (isNativeAndroid()) return false;
  const url = new URL(window.location.href);
  const callbackError = getCallbackErrorMessage(url);
  const code = url.searchParams.get("code");
  if (!callbackError && !code) return false;
  try {
    if (callbackError) {
      await deactivateSession();
      setGateState("unauthenticated", callbackError);
      return true;
    }
    await exchangeCallbackCode(code);
    return true;
  } catch (error) {
    await deactivateSession();
    setGateState(
      "unauthenticated",
      /snapshot|migration/i.test(String(error?.message || ""))
        ? getWorkspaceErrorMessage(error)
        : "Google 登入失敗，請確認網路後重試。",
      true,
    );
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
      setGateState("unauthenticated", callbackError);
      return true;
    }
    const code = url.searchParams.get("code");
    if (!code) throw new Error("Missing callback code");
    await exchangeCallbackCode(code);
    return true;
  } catch (error) {
    setGateState(
      "unauthenticated",
      /snapshot|migration/i.test(String(error?.message || ""))
        ? getWorkspaceErrorMessage(error)
        : "Google 登入失敗，請確認網路後重試。",
      true,
    );
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
    setGateState("unauthenticated", "登入已取消。");
  });
  const launch = await App.getLaunchUrl();
  if (launch?.url) await handleAndroidOAuthCallback(launch.url);
}

async function startGoogleSignIn() {
  if (!supabaseClient || authBusy) return;
  if (isOffline()) {
    setGateState("unauthenticated", "目前無法連線至 Google 登入，請確認網路後再試。", true);
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
    setGateState("unauthenticated", "無法開啟 Google 登入，請稍後再試。", true);
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
  setGateState("checking");
  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    if (data.session) await activateSession(data.session);
    else {
      await deactivateSession();
      if (isOffline()) {
        setGateState("unauthenticated", "目前無法連線至 Google 登入，請確認網路後再試。", true);
      }
    }
  } catch (error) {
    setGateState(
      "unauthenticated",
      /snapshot|migration/i.test(String(error?.message || ""))
        ? getWorkspaceErrorMessage(error)
        : "目前無法連線至 Google 登入，請確認網路後再試。",
      true,
    );
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
        void activateSession(session).catch((error) => {
          setGateState("unauthenticated", getWorkspaceErrorMessage(error), true);
        });
      } else if (event === "SIGNED_OUT") {
        void deactivateSession({ preserveLegacy: false, snapshotAlreadySaved: signOutSnapshotFlushed }).catch(() => {
          setGateState("unauthenticated", "無法保存目前帳號資料，請稍後再試。", true);
        });
      } else if (event === "TOKEN_REFRESHED") {
        renderAuthSession(session);
      }
    }, 0);
  });
}

async function initializeGoogleAuth() {
  setGateState("checking");
  const config = window.CHROMATICA_SUPABASE_CONFIG;
  if (!config?.url || !config?.publishableKey) {
    setGateState("unauthenticated", "Google 登入目前無法使用。", true);
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
    await registerNativeAuthListeners();
    if (await handleWebOAuthCallback()) {
      registerAuthStateListener();
      return;
    }
    const { data, error } = await supabaseClient.auth.getSession();
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
    setGateState(
      "unauthenticated",
      /snapshot|migration/i.test(String(error?.message || ""))
        ? getWorkspaceErrorMessage(error)
        : "目前無法連線至 Google 登入，請確認網路後再試。",
      true,
    );
  }
}

void initializeGoogleAuth();
