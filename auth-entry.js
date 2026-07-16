import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { createClient } from "@supabase/supabase-js";

const WEB_REDIRECT_URL = "https://tennis830531-byte.github.io/chromatica-lab/";
const ANDROID_REDIRECT_URL = "chromaticalab://login-callback";
const GOOGLE_BASIC_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
].join(" ");
const CALLBACK_PARAM_NAMES = ["code", "error", "error_code", "error_description"];

let supabaseClient = null;
let authListenerRegistered = false;
let nativeLinkListenerRegistered = false;
let browserListenerRegistered = false;
let authBusy = false;
let authToastTimer = null;
const exchangedAuthCodes = new Set();

const byId = (id) => document.getElementById(id);

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
  };
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
  const { signInButton, signOutButton } = getAuthElements();
  if (signInButton) {
    signInButton.disabled = isBusy;
    signInButton.setAttribute("aria-busy", String(isBusy));
  }
  if (signOutButton) {
    signOutButton.disabled = isBusy;
    signOutButton.setAttribute("aria-busy", String(isBusy));
  }
  if (message) setAuthStatus(message);
}

function getDisplayName(user) {
  const metadata = user?.user_metadata || {};
  return (
    metadata.full_name ||
    metadata.name ||
    user?.email?.split("@")[0] ||
    "Google 使用者"
  );
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

function cleanWebCallbackUrl(url) {
  if (!window.history?.replaceState) return;
  for (const param of CALLBACK_PARAM_NAMES) url.searchParams.delete(param);
  const cleanUrl = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, document.title, cleanUrl || "/chromatica-lab/");
}

function getCallbackErrorMessage(url) {
  const errorCode = url.searchParams.get("error") || url.searchParams.get("error_code") || "";
  if (!errorCode) return "";
  return errorCode === "access_denied"
    ? "登入已取消。"
    : "Google 登入失敗，請確認網路後重試。";
}

async function closeNativeBrowser() {
  if (!isNativeAndroid()) return;
  try {
    await Browser.close();
  } catch {
    // The Custom Tab may already be closed after the deep link returns to the app.
  }
}

async function exchangeCallbackCode(code) {
  if (!code || exchangedAuthCodes.has(code)) return false;
  exchangedAuthCodes.add(code);
  setAuthBusy(true, "正在完成 Google 登入…");
  const { data, error } = await supabaseClient.auth.exchangeCodeForSession(code);
  if (error) throw error;
  renderAuthSession(data.session);
  setAuthStatus("");
  showAuthToast("Google 登入成功");
  return true;
}

async function handleWebOAuthCallback() {
  if (isNativeAndroid()) return;
  const url = new URL(window.location.href);
  const callbackError = getCallbackErrorMessage(url);
  const code = url.searchParams.get("code");
  if (!callbackError && !code) return;

  try {
    if (callbackError) {
      setAuthStatus(callbackError, "error");
      showAuthToast(callbackError);
      return;
    }
    await exchangeCallbackCode(code);
  } catch {
    setAuthStatus("Google 登入失敗，請確認網路後重試。", "error");
  } finally {
    setAuthBusy(false);
    cleanWebCallbackUrl(url);
  }
}

function isAndroidLoginCallback(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "chromaticalab:" && parsed.hostname === "login-callback";
  } catch {
    return false;
  }
}

async function handleAndroidOAuthCallback(callbackUrl) {
  if (!isAndroidLoginCallback(callbackUrl)) return;
  const url = new URL(callbackUrl);
  const callbackError = getCallbackErrorMessage(url);
  try {
    if (callbackError) {
      setAuthStatus(callbackError, "error");
      showAuthToast(callbackError);
      return;
    }
    const code = url.searchParams.get("code");
    if (!code) {
      setAuthStatus("Google 登入失敗，請確認網路後重試。", "error");
      return;
    }
    await exchangeCallbackCode(code);
  } catch {
    setAuthStatus("Google 登入失敗，請確認網路後重試。", "error");
  } finally {
    setAuthBusy(false);
    await closeNativeBrowser();
  }
}

async function registerNativeAuthListeners() {
  if (!isNativeAndroid()) return;
  if (!nativeLinkListenerRegistered) {
    nativeLinkListenerRegistered = true;
    await App.addListener("appUrlOpen", ({ url }) => {
      void handleAndroidOAuthCallback(url);
    });
  }
  if (!browserListenerRegistered) {
    browserListenerRegistered = true;
    await Browser.addListener("browserFinished", () => {
      if (!authBusy) return;
      setAuthBusy(false);
      setAuthStatus("登入已取消。", "error");
    });
  }
  const launch = await App.getLaunchUrl();
  if (launch?.url) await handleAndroidOAuthCallback(launch.url);
}

async function startGoogleSignIn() {
  if (!supabaseClient || authBusy) return;
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
      return;
    }
  } catch {
    setAuthBusy(false);
    setAuthStatus("無法開啟 Google 登入，請稍後再試。", "error");
  }
}

async function signOut() {
  if (!supabaseClient || authBusy) return;
  setAuthBusy(true, "正在登出…");
  const { error } = await supabaseClient.auth.signOut();
  setAuthBusy(false);
  if (error) {
    setAuthStatus("登出失敗，請稍後再試。", "error");
    return;
  }
  renderAuthSession(null);
  setAuthStatus("");
  showAuthToast("已登出");
}

function bindAuthUi() {
  const elements = getAuthElements();
  elements.signInButton?.addEventListener("click", startGoogleSignIn);
  elements.signOutButton?.addEventListener("click", signOut);
  elements.avatar?.addEventListener("error", () => {
    elements.avatar.classList.add("hidden");
    elements.avatarFallback?.classList.remove("hidden");
  });
}

async function initializeGoogleAuth() {
  const config = window.CHROMATICA_SUPABASE_CONFIG;
  if (!config?.url || !config?.publishableKey) {
    setAuthStatus("Google 登入目前無法使用。", "error");
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
    if (!authListenerRegistered) {
      authListenerRegistered = true;
      supabaseClient.auth.onAuthStateChange((event, session) => {
        if (["INITIAL_SESSION", "SIGNED_IN", "SIGNED_OUT", "TOKEN_REFRESHED"].includes(event)) {
          renderAuthSession(session);
        }
      });
    }
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    renderAuthSession(data.session);
    await registerNativeAuthListeners();
    await handleWebOAuthCallback();
  } catch {
    setAuthBusy(false);
    setAuthStatus("Google 登入目前無法使用，請稍後再試。", "error");
  }
}

void initializeGoogleAuth();
