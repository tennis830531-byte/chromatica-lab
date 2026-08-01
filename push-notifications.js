(function initLeaderboardPushNotifications(global) {
  "use strict";

  const PREFERENCES = Object.freeze({
    weekly: Object.freeze({ key: "chromatica.settings.leaderboardWeeklyResults", toggle: "#leaderboardWeeklyResultToggle" }),
    movement: Object.freeze({ key: "chromatica.settings.leaderboardTopTenChanges", toggle: "#leaderboardMovementToggle" }),
    worldBoss: Object.freeze({ key: "chromatica.settings.worldBossNotifications", toggle: "#worldBossNotificationToggle" }),
  });
  const MOVEMENT_TYPES = new Set(["entered_top_ten", "rank_improved", "dropped_out_of_top_ten"]);
  const WORLD_BOSS_TYPES = new Set(["boss_appeared", "below_10", "boss_defeated", "first_hit", "final_hit"]);
  const seenForegroundNotifications = new Set();
  let initialized = false;
  let joined = false;
  let registrationFlight = null;
  let tokenRegistrationFlight = null;
  let activeAccountId = "";
  let registeredTokenKey = "";
  let lastResumeRegistrationAt = 0;

  const $ = (selector) => document.querySelector(selector);
  const auth = () => global.chromaticaAuth;
  const readPreference = (preference) => localStorage.getItem(preference.key) !== "false";
  const writePreference = (preference, enabled) => localStorage.setItem(preference.key, enabled ? "true" : "false");
  const weeklyEnabled = () => readPreference(PREFERENCES.weekly);
  const movementEnabled = () => readPreference(PREFERENCES.movement);
  const worldBossEnabled = () => readPreference(PREFERENCES.worldBoss);
  const anyEnabled = () => weeklyEnabled() || movementEnabled() || worldBossEnabled();
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
    await auth().pushNotifications.createChannel({
      id: "world-boss",
      name: "世界 Boss",
      description: "世界 Boss 現身與討伐進度通知",
      importance: 4,
      visibility: 1,
      vibration: true,
    });
  }

  function worldBossNotificationCopy(type) {
    if (type === "boss_appeared") return { title: "世界 Boss 出現！", body: "世界 Boss 已現身，快帶精靈一起參加討伐！" };
    if (type === "below_10") return { title: "世界 Boss 即將被擊倒", body: "世界 Boss 的 HP 已低於 10%，快來完成最後攻勢！" };
    if (type === "boss_defeated") return { title: "世界 Boss 討伐成功", body: "世界 Boss 已被擊倒，回到 App 查看本週結算。" };
    if (type === "first_hit") return { title: "世界 Boss 第一擊", body: "本週討伐的第一擊已經出現！" };
    return { title: "世界 Boss 最後一擊", body: "最後一擊完成，本週討伐成功！" };
  }

  function foregroundNotificationId(value) {
    let hash = 2166136261;
    for (const character of String(value || "world-boss")) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return 200000000 + (Math.abs(hash) % 100000000);
  }

  async function showForegroundWorldBossNotification(type, data, notification = {}) {
    if (!worldBossEnabled()) return false;
    const notificationId = String(data.notification_id || `${type}:${data.event_id || ""}`);
    if (seenForegroundNotifications.has(notificationId)) return false;
    seenForegroundNotifications.add(notificationId);
    const plugin = global.Capacitor?.Plugins?.LocalNotifications;
    if (!plugin?.schedule) return false;
    const fallback = worldBossNotificationCopy(type);
    await plugin.createChannel?.({
      id: "world-boss",
      name: "世界 Boss",
      description: "世界 Boss 現身與討伐進度通知",
      importance: 4,
      visibility: 1,
      vibration: true,
    });
    if (!worldBossEnabled()) return false;
    await plugin.schedule({ notifications: [{
      id: foregroundNotificationId(notificationId),
      title: String(notification.title || fallback.title),
      body: String(notification.body || fallback.body),
      channelId: "world-boss",
      smallIcon: "ic_stat_chromatica_notification",
      iconColor: "#8A5A32",
      extra: { ...data, foregroundBridge: true },
      ...(data.qa_background_delay_ms ? { schedule: { at: new Date(Date.now() + Number(data.qa_background_delay_ms)) } } : {}),
    }] });
    return true;
  }

  async function showQaWorldBossNotification(type, notification = {}) {
    if (!new Set(["boss_appeared", "boss_defeated"]).has(type)) return false;
    if (!worldBossEnabled()) return false;
    return showForegroundWorldBossNotification(type, {
      notification_id: `qa:${type}:${Date.now()}:${Math.random().toString(16).slice(2)}`,
      notification_type: type,
      qa: true,
      qa_background_delay_ms: 10000,
    }, notification);
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
    const worldBossToggle = $(PREFERENCES.worldBoss.toggle);
    if (worldBossToggle) worldBossToggle.checked = worldBossEnabled();
    if (auth()?.isNativeAndroid?.() !== true) setStatus("Web 版不支援系統推播；偏好仍會隨帳號保存。", "");
    else if (!anyEnabled()) setStatus("通知已全部關閉。", "");
    else setStatus("", "");
  }

  async function syncServerPreferences() {
    if (!joined) return false;
    try {
      const { error } = await auth()?.leaderboardRpc?.("set_leaderboard_push_preferences", {
        p_weekly_results: weeklyEnabled(),
        p_top_ten_changes: movementEnabled(),
      }) || {};
      if (error) return false;
      const bossResult = await auth()?.leaderboardRpc?.("set_world_boss_push_preference", {
        p_enabled: worldBossEnabled(),
      }) || {};
      return !bossResult.error;
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
    try {
      const bossResponse = await auth()?.leaderboardRpc?.("get_world_boss_push_preference") || {};
      const bossRow = Array.isArray(bossResponse.data) ? bossResponse.data[0] : bossResponse.data;
      if (!bossResponse.error && bossRow) writePreference(PREFERENCES.worldBoss, bossRow.enabled !== false);
    } catch {}
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
      setStatus(joined ? "通知已依你的設定開啟。" : "此裝置已完成通知登記。", "success");
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
      setStatus("你沒有允許系統通知；通知偏好會保留，App 仍可正常使用。", "");
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
      writePreference(PREFERENCES.worldBoss, false);
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

  function handleNotificationData(data = {}, { opened = false, notification = null } = {}) {
    const type = String(data.notification_type || "");
    if (!opened && MOVEMENT_TYPES.has(type)) showMovementToast(type, data);
    if (!opened && WORLD_BOSS_TYPES.has(type)) {
      void showForegroundWorldBossNotification(type, data, notification || {}).catch(() => {});
    }
    if (opened) global.chromaticaApp?.openHomeFromPushNotification?.();
  }

  async function bindNativeListeners() {
    if (auth()?.isNativeAndroid?.() !== true) return;
    try {
      await auth().pushNotifications.addListener("registration", (token) => void registerToken(token));
      await auth().pushNotifications.addListener("registrationError", () => setStatus("無法取得推播裝置識別；排行榜仍可正常使用。", "error"));
      await auth().pushNotifications.addListener("pushNotificationReceived", (notification) => handleNotificationData(
        notification?.data || {},
        { notification },
      ));
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

  function refreshRegistrationOnResume() {
    if (Date.now() - lastResumeRegistrationAt < 30000) return;
    lastResumeRegistrationAt = Date.now();
    registeredTokenKey = "";
    void initializeRegistrationIfAllowed();
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
    if (preference === PREFERENCES.worldBoss && !worldBossEnabled()) {
      $("#worldBossTopNotice")?.classList.add("hidden");
    }
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
    global.addEventListener?.("focus", refreshRegistrationOnResume);
    global.document?.addEventListener?.("visibilitychange", () => {
      if (global.document.visibilityState === "visible") refreshRegistrationOnResume();
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
    worldBossEnabled,
    showQaWorldBossNotification,
  });
})(typeof window !== "undefined" ? window : globalThis);
