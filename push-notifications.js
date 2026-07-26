(function initLeaderboardPushNotifications(global) {
  "use strict";

  const PREFERENCES = Object.freeze({
    weekly: Object.freeze({ key: "chromatica.settings.leaderboardWeeklyResults", toggle: "#leaderboardWeeklyResultToggle" }),
    movement: Object.freeze({ key: "chromatica.settings.leaderboardTopTenChanges", toggle: "#leaderboardMovementToggle" }),
  });
  const MOVEMENT_TYPES = new Set(["entered_top_ten", "rank_improved", "dropped_out_of_top_ten"]);
  const seenForegroundNotifications = new Set();
  let initialized = false;
  let joined = false;
  let registrationFlight = null;
  let tokenRegistrationFlight = null;
  let activeAccountId = "";
  let registeredTokenKey = "";

  const $ = (selector) => document.querySelector(selector);
  const auth = () => global.chromaticaAuth;
  const readPreference = (preference) => localStorage.getItem(preference.key) !== "false";
  const writePreference = (preference, enabled) => localStorage.setItem(preference.key, enabled ? "true" : "false");
  const weeklyEnabled = () => readPreference(PREFERENCES.weekly);
  const movementEnabled = () => readPreference(PREFERENCES.movement);
  const anyEnabled = () => weeklyEnabled() || movementEnabled();
  const nativePushConfigured = () => global.ChromaticaNativePushConfig?.firebaseReady === true;

  function reportUnavailablePushSetup() {
    setStatus("推播服務尚未完成設定；排行榜仍可正常使用。", "error");
    return false;
  }

  async function prepareAndroidChannel() {
    await auth().pushNotifications.createChannel({
      id: "leaderboard-rankings",
      name: "乖乖練習王",
      description: "每週結果與前十名名次變動通知",
      importance: 4,
      visibility: 1,
      vibration: true,
    });
  }

  function setStatus(message = "", kind = "") {
    const status = $("#leaderboardPushStatus");
    if (!status) return;
    status.textContent = message;
    status.dataset.kind = kind;
  }

  function render() {
    const weeklyToggle = $(PREFERENCES.weekly.toggle);
    const movementToggle = $(PREFERENCES.movement.toggle);
    if (weeklyToggle) weeklyToggle.checked = weeklyEnabled();
    if (movementToggle) movementToggle.checked = movementEnabled();
    if (auth()?.isNativeAndroid?.() !== true) setStatus("Web 版不支援系統推播；偏好仍會隨帳號保存。", "");
    else if (!joined) setStatus("加入乖乖練習王後，才會登記此裝置的排名通知。", "");
    else if (!anyEnabled()) setStatus("排行榜通知已全部關閉。", "");
  }

  async function syncServerPreferences() {
    if (!joined) return false;
    try {
      const { error } = await auth()?.leaderboardRpc?.("set_leaderboard_push_preferences", {
        p_weekly_results: weeklyEnabled(),
        p_top_ten_changes: movementEnabled(),
      }) || {};
      return !error;
    } catch {
      return false;
    }
  }

  async function loadServerPreferences() {
    if (!joined) return;
    let response;
    try { response = await auth()?.leaderboardRpc?.("get_leaderboard_push_preferences") || {}; }
    catch { return; }
    const { data, error } = response;
    if (error) return;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return;
    writePreference(PREFERENCES.weekly, row.weekly_results !== false);
    writePreference(PREFERENCES.movement, row.top_ten_changes !== false);
    render();
  }

  async function registerToken(token) {
    const value = String(token?.value || "").trim();
    const accountId = String(auth()?.getLeaderboardAccount?.()?.id || "");
    const registrationKey = accountId && value ? `${accountId}\u0000${value}` : "";
    if (!registrationKey || !anyEnabled() || accountId !== activeAccountId) return false;
    if (registeredTokenKey === registrationKey) return true;
    if (tokenRegistrationFlight) return tokenRegistrationFlight;
    tokenRegistrationFlight = (async () => {
      if (joined) await syncServerPreferences();
      let response;
      try {
        response = await auth()?.leaderboardRpc?.("register_leaderboard_push_token", {
          p_token: value,
          p_platform: "android",
          p_enabled: true,
        }, { expectedUserId: accountId }) || {};
      } catch {
        response = { error: new Error("push-register-failed") };
      }
      if (accountId !== activeAccountId) return false;
      const { error } = response;
      if (error) {
        setStatus("推播裝置登記失敗，稍後會再嘗試；排行榜仍可正常使用。", "error");
        return false;
      }
      registeredTokenKey = registrationKey;
      setStatus(joined ? "排行榜通知已依你的兩項偏好開啟。" : "此裝置已完成通知登記。", "success");
      return true;
    })().finally(() => { tokenRegistrationFlight = null; });
    return tokenRegistrationFlight;
  }

  async function requestPermissionFromUserGesture() {
    if (!joined || auth()?.isNativeAndroid?.() !== true || !anyEnabled()) return false;
    // Without external Firebase configuration register() throws on Capacitor's
    // native plugin thread and terminates the process before JS can catch it.
    if (!nativePushConfigured()) return reportUnavailablePushSetup();
    setStatus("準備開啟排行榜通知…", "");
    const permission = await auth().pushNotifications.requestPermissions();
    if (permission?.receive !== "granted") {
      setStatus("你沒有允許系統通知；兩項偏好會保留，App 與排行榜仍可正常使用。", "");
      return false;
    }
    try {
      await prepareAndroidChannel();
      await auth().pushNotifications.register();
      return true;
    } catch {
      setStatus("推播服務尚未完成設定；排行榜仍可正常使用。", "error");
      return false;
    }
  }

  async function disableCurrentToken({ preservePreferences = false } = {}) {
    if (!preservePreferences) {
      writePreference(PREFERENCES.weekly, false);
      writePreference(PREFERENCES.movement, false);
      global.chromaticaAccountWorkspace?.scheduleSave?.();
    }
    render();
    let response;
    try { response = await auth()?.leaderboardRpc?.("disable_leaderboard_push_token") || {}; }
    catch { response = { error: new Error("push-disable-failed") }; }
    const { error } = response;
    if (error) setStatus("關閉通知的同步尚未完成，稍後會再嘗試。", "error");
    else registeredTokenKey = "";
    return !error;
  }

  async function unregisterForSignOut() {
    const disabled = await disableCurrentToken({ preservePreferences: true });
    activeAccountId = "";
    registeredTokenKey = "";
    return disabled;
  }

  function showMovementToast(type, data = {}) {
    const notificationId = String(data.notification_id || data.transition_id || "");
    if (notificationId && seenForegroundNotifications.has(notificationId)) return;
    if (notificationId) seenForegroundNotifications.add(notificationId);
    const rank = Math.max(1, Math.floor(Number(data.rank) || 1));
    const message = type === "dropped_out_of_top_ten"
      ? `你目前掉到本週第${Math.max(11, rank)}名，前十名被搶走了！`
      : type === "entered_top_ten"
        ? `恭喜進入本週前十名，目前第${rank}名！`
        : `本週名次上升到第${rank}名！`;
    global.chromaticaApp?.showNonBlockingToast?.(message);
  }

  function handleNotificationData(data = {}, { opened = false } = {}) {
    const type = String(data.notification_type || "");
    if (!opened && MOVEMENT_TYPES.has(type)) showMovementToast(type, data);
    if (opened) global.chromaticaApp?.openHomeFromPushNotification?.();
  }

  async function bindNativeListeners() {
    if (auth()?.isNativeAndroid?.() !== true) return;
    try {
      await auth().pushNotifications.addListener("registration", (token) => void registerToken(token));
      await auth().pushNotifications.addListener("registrationError", () => setStatus("無法取得推播裝置識別；排行榜仍可正常使用。", "error"));
      await auth().pushNotifications.addListener("pushNotificationReceived", (notification) => handleNotificationData(notification?.data || {}));
      await auth().pushNotifications.addListener("pushNotificationActionPerformed", (action) => handleNotificationData(action?.notification?.data || {}, { opened: true }));
    } catch {
      setStatus("推播服務目前無法使用；排行榜仍可正常使用。", "error");
    }
  }

  async function initializeRegistrationIfAllowed() {
    if (!anyEnabled() || auth()?.isNativeAndroid?.() !== true) return;
    if (!nativePushConfigured()) return reportUnavailablePushSetup();
    if (!activeAccountId) return;
    if (registeredTokenKey.startsWith(`${activeAccountId}\u0000`)) return true;
    if (registrationFlight) return registrationFlight;
    registrationFlight = (async () => {
      const permission = await auth().pushNotifications.checkPermissions();
      if (permission?.receive !== "granted") return;
      try {
        await prepareAndroidChannel();
        await auth().pushNotifications.register();
      } catch {
        setStatus("推播服務尚未完成設定；排行榜仍可正常使用。", "error");
      }
    })().finally(() => { registrationFlight = null; });
    return registrationFlight;
  }

  function setAuthenticatedAccount(userId) {
    const nextAccountId = String(userId || "");
    if (activeAccountId !== nextAccountId) registeredTokenKey = "";
    activeAccountId = nextAccountId;
    if (activeAccountId) void initializeRegistrationIfAllowed();
  }

  async function notificationPermissionGranted() {
    return initializeRegistrationIfAllowed();
  }

  async function preferenceChanged(preference, enabled) {
    writePreference(preference, enabled);
    global.chromaticaAccountWorkspace?.scheduleSave?.();
    render();
    await syncServerPreferences();
    if (!anyEnabled()) await disableCurrentToken({ preservePreferences: true });
    else if (enabled) await requestPermissionFromUserGesture();
  }

  function setMembership(value) {
    const nextJoined = value === true;
    if (joined === nextJoined) { render(); return; }
    joined = nextJoined;
    render();
    if (joined) void loadServerPreferences().then(initializeRegistrationIfAllowed).catch(() => reportUnavailablePushSetup());
  }

  function init() {
    if (initialized) return;
    initialized = true;
    Object.values(PREFERENCES).forEach((preference) => {
      $(preference.toggle)?.addEventListener("change", (event) => {
        void preferenceChanged(preference, event.target.checked).catch(() => reportUnavailablePushSetup());
      });
    });
    void bindNativeListeners();
    global.addEventListener?.("chromatica:native-push-config-ready", () => {
      void initializeRegistrationIfAllowed();
    });
    render();
  }

  global.ChromaticaPushNotifications = Object.freeze({
    init,
    setMembership,
    setAuthenticatedAccount,
    notificationPermissionGranted,
    disableCurrentToken,
    unregisterForSignOut,
    nativePushConfigured,
  });
})(typeof window !== "undefined" ? window : globalThis);
