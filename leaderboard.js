(function initLeaderboard(global) {
  "use strict";

  const core = global.ChromaticaLeaderboardCore;
  const PLACEHOLDER_AVATAR = "./public/assets/chromatic-refresh/brand/chl_brand_badge.png";
  const CACHE_PREFIX = "chromatica.leaderboard.cache.v1";
  const QUEUE_PREFIX = "chromatica.leaderboard.pending.v1";
  const PROFILE_REFRESH_INTERVAL_MS = 10 * 60 * 1000;
  let initialized = false;
  let activeMetric = "practice";
  let modalOpen = false;
  let profileOpen = false;
  let leaveOpen = false;
  let refreshTimer = null;
  let refreshFlight = null;
  let queueFlight = null;
  let membershipFlight = null;
  let joined = null;
  let membershipUnavailable = false;
  let profileOnboarding = false;
  let profile = null;
  let dependencies = {};
  let pendingAvatarFile = null;
  let resetCustomAvatar = false;
  let previewObjectUrl = "";

  const $ = (selector) => document.querySelector(selector);

  function authApi() {
    return global.chromaticaAuth;
  }

  function getPublicUser() {
    return authApi()?.getLeaderboardAccount?.() || null;
  }

  function cacheKey(metric, userId) {
    return `${CACHE_PREFIX}.${userId}.${core.normalizeMetric(metric)}`;
  }

  function queueKey(userId) {
    return `${QUEUE_PREFIX}.${userId}`;
  }

  function readJson(storage, key, fallback) {
    try {
      return JSON.parse(storage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  }

  function setStatus(message = "", kind = "") {
    const element = $("#leaderboardStatus");
    if (!element) return;
    element.textContent = message;
    element.dataset.kind = kind;
  }

  function updateModalOpenClass() {
    document.body.classList.toggle("modal-open", modalOpen || profileOpen || leaveOpen);
  }

  function getFeaturedSpirit() {
    return dependencies.getFeaturedSpirit?.() || { species: "", name: "", stage: 1, imageUrl: "" };
  }

  function isQaActive() {
    return dependencies.isQaActive?.() === true;
  }

  function publicProfileParams() {
    const spirit = getFeaturedSpirit();
    return {
      p_featured_spirit_species: String(spirit.species || ""),
      p_featured_spirit_name: String(spirit.name || ""),
      p_featured_spirit_stage: Math.max(1, Math.min(3, Math.floor(Number(spirit.stage) || 1))),
    };
  }

  async function rpc(name, params = {}) {
    const result = await authApi()?.leaderboardRpc?.(name, params);
    if (!result) throw new Error("leaderboard-auth-unavailable");
    if (result.error) throw result.error;
    return result.data;
  }

  function unwrapSingle(data) {
    if (Array.isArray(data)) return data[0] || null;
    return data && typeof data === "object" ? data : null;
  }

  function avatarUrlFor(row = profile) {
    if (row?.custom_avatar_path) {
      return authApi()?.getLeaderboardAvatarUrl?.(row.custom_avatar_path, row.avatar_version) || PLACEHOLDER_AVATAR;
    }
    return PLACEHOLDER_AVATAR;
  }

  function assignSafeImage(image, source, fallback = PLACEHOLDER_AVATAR) {
    if (!image) return;
    image.onerror = () => {
      image.onerror = null;
      image.src = fallback;
    };
    image.src = source || fallback;
  }

  function renderMembership() {
    const signedIn = Boolean(getPublicUser());
    $("#leaderboardLoginPrompt")?.classList.toggle("hidden", signedIn);
    $("#leaderboardOwnProfile")?.classList.toggle("hidden", joined !== true);
    $("#leaderboardProfileEdit")?.toggleAttribute("disabled", joined !== true);
  }

  function renderOwnProfile() {
    renderMembership();
    if (joined !== true) return;
    const spirit = getFeaturedSpirit();
    const displayName = core.normalizeDisplayName(profile?.display_name, "練習者");
    assignSafeImage($("#leaderboardOwnAvatar"), avatarUrlFor(profile));
    if ($("#leaderboardOwnName")) $("#leaderboardOwnName").textContent = displayName;
    if ($("#leaderboardOwnSpirit")) {
      $("#leaderboardOwnSpirit").textContent = profile?.featured_spirit_name || spirit.name || "尚未設定展示精靈";
    }
  }

  async function ensureMembership({ force = false } = {}) {
    if (!getPublicUser() || isQaActive()) {
      joined = false;
      membershipUnavailable = false;
      profile = null;
      renderMembership();
      return false;
    }
    if (!force && joined !== null) return joined;
    if (membershipFlight) return membershipFlight;
    membershipUnavailable = false;
    membershipFlight = rpc("get_my_leaderboard_membership")
      .then((data) => {
        const membership = unwrapSingle(data) || {};
        joined = membership.joined === true;
        membershipUnavailable = false;
        profile = joined ? membership : null;
        renderOwnProfile();
        return joined;
      })
      .catch((error) => {
        joined = false;
        membershipUnavailable = true;
        profile = null;
        renderMembership();
        console.warn("Leaderboard membership check failed.", error?.message || error);
        return false;
      })
      .finally(() => { membershipFlight = null; });
    return membershipFlight;
  }

  async function syncOwnProfile() {
    if (joined !== true || !getPublicUser() || isQaActive()) return null;
    profile = unwrapSingle(await rpc("sync_leaderboard_profile", publicProfileParams()));
    renderOwnProfile();
    return profile;
  }

  function readCache(metric) {
    const user = getPublicUser();
    if (!user?.id) return null;
    return readJson(sessionStorage, cacheKey(metric, user.id), null);
  }

  function writeCache(metric, rows) {
    const user = getPublicUser();
    if (!user?.id) return;
    sessionStorage.setItem(cacheKey(metric, user.id), JSON.stringify({ savedAt: Date.now(), rows }));
  }

  function invalidateCache() {
    const user = getPublicUser();
    if (!user?.id) return;
    ["practice", "streak"].forEach((metric) => sessionStorage.removeItem(cacheKey(metric, user.id)));
  }

  function podiumClass(position) {
    return position === 1 ? "is-podium is-gold"
      : position === 2 ? "is-podium is-silver"
        : position === 3 ? "is-podium is-bronze" : "";
  }

  function renderLeaderboardRows(rawRows, metric = activeMetric) {
    const list = $("#leaderboardList");
    if (!list) return;
    const rows = core.normalizeLeaderboardRows(rawRows, metric);
    list.replaceChildren();
    if (!rows.length) {
      const empty = document.createElement("li");
      empty.className = "leaderboard-status";
      empty.textContent = "目前還沒有排行成績。";
      list.append(empty);
      return;
    }
    let separatorInserted = false;
    rows.forEach((row) => {
      if (!separatorInserted && row.isCurrentUser && row.position > core.MAX_TOP_ROWS) {
        const separator = document.createElement("li");
        separator.className = "leaderboard-ellipsis";
        separator.textContent = "…";
        separator.setAttribute("aria-label", "略過中間名次");
        list.append(separator);
        separatorInserted = true;
      }
      const item = document.createElement("li");
      item.className = `leaderboard-row ${podiumClass(row.position)}${row.isCurrentUser ? " is-me" : ""}`.trim();
      if (row.isCurrentUser) item.setAttribute("aria-current", "true");
      const rank = document.createElement("span");
      rank.className = "leaderboard-rank";
      rank.textContent = String(row.position);
      rank.setAttribute("aria-label", `第 ${row.position} 名`);
      const avatar = document.createElement("img");
      avatar.className = "leaderboard-avatar";
      avatar.alt = "";
      assignSafeImage(avatar, avatarUrlFor({
        custom_avatar_path: row.customAvatarPath,
        avatar_version: row.avatarVersion,
      }));
      const player = document.createElement("div");
      player.className = "leaderboard-player";
      const name = document.createElement("strong");
      name.textContent = row.isCurrentUser ? `${row.displayName}（你）` : row.displayName;
      const spirit = document.createElement("span");
      spirit.className = "leaderboard-spirit";
      const spiritImage = document.createElement("img");
      spiritImage.alt = "";
      const resolvedSpiritImage = dependencies.resolveSpiritImage?.(row.featuredSpiritSpecies, row.featuredSpiritStage) || "";
      if (resolvedSpiritImage) assignSafeImage(spiritImage, resolvedSpiritImage, PLACEHOLDER_AVATAR);
      else spiritImage.hidden = true;
      const spiritName = document.createElement("span");
      spiritName.textContent = row.featuredSpiritName || "尚未展示精靈";
      spirit.append(spiritImage, spiritName);
      player.append(name, spirit);
      const score = document.createElement("strong");
      score.className = "leaderboard-score";
      score.textContent = metric === "streak" ? `連續學習 ${row.score} 天` : `練習循環 ${row.score} 次`;
      item.append(rank, avatar, player, score);
      list.append(item);
    });
  }

  async function loadLeaderboard(metric = activeMetric, { force = false } = {}) {
    activeMetric = core.normalizeMetric(metric);
    document.querySelectorAll("[data-leaderboard-metric]").forEach((button) => {
      const active = button.dataset.leaderboardMetric === activeMetric;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    $("#leaderboardPracticePeriod")?.classList.toggle("hidden", activeMetric !== "practice");
    if (!getPublicUser()) {
      renderLeaderboardRows([], activeMetric);
      setStatus("請先登入，即可查看全球排行榜。", "");
      return [];
    }
    if (joined !== true) {
      renderLeaderboardRows([], activeMetric);
      setStatus("請先完成排行榜公開資料設定。", "");
      return [];
    }
    const cache = readCache(activeMetric);
    if (cache?.rows) renderLeaderboardRows(cache.rows, activeMetric);
    if (!force && core.isCacheFresh(cache)) {
      setStatus("已顯示最近更新的排行。", "");
      return cache.rows;
    }
    if (refreshFlight) return refreshFlight;
    setStatus("正在更新排行榜…", "");
    refreshFlight = rpc("get_global_leaderboard", { p_metric: activeMetric })
      .then((rows) => {
        const normalized = core.normalizeLeaderboardRows(rows, activeMetric);
        writeCache(activeMetric, normalized.map((row) => ({
          position: row.position,
          public_key: row.userId,
          display_name: row.displayName,
          custom_avatar_path: row.customAvatarPath,
          avatar_version: row.avatarVersion,
          featured_spirit_species: row.featuredSpiritSpecies,
          featured_spirit_name: row.featuredSpiritName,
          featured_spirit_stage: row.featuredSpiritStage,
          score: row.score,
          is_current_user: row.isCurrentUser,
        })));
        renderLeaderboardRows(rows, activeMetric);
        setStatus(`更新完成，共顯示 ${normalized.length} 筆名次。`, "");
        return rows;
      })
      .catch((error) => {
        setStatus(cache?.rows ? "目前離線，先顯示最近一次排行。" : "排行榜暫時無法載入，請稍後再試。", "error");
        console.warn("Leaderboard refresh failed.", error?.message || error);
        return cache?.rows || [];
      })
      .finally(() => { refreshFlight = null; });
    return refreshFlight;
  }

  function closeProfileEditor() {
    profileOpen = false;
    $("#leaderboardProfileModal")?.classList.add("hidden");
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = "";
    pendingAvatarFile = null;
    resetCustomAvatar = false;
    profileOnboarding = false;
    updateModalOpenClass();
    requestAnimationFrame(() => $("#leaderboardProfileEdit")?.focus());
  }

  function showProfileError(message = "") {
    const error = $("#leaderboardProfileError");
    if (!error) return;
    error.textContent = message;
    error.classList.toggle("hidden", !message);
  }

  function openProfileEditor({ onboarding = false } = {}) {
    if (!getPublicUser() || (joined !== true && !onboarding)) return;
    profileOnboarding = onboarding;
    pendingAvatarFile = null;
    resetCustomAvatar = false;
    showProfileError();
    $("#leaderboardProfileName").value = onboarding ? "" : core.normalizeDisplayName(profile?.display_name, "");
    $("#leaderboardProfileName").placeholder = "例如：口琴小芽";
    assignSafeImage($("#leaderboardProfileAvatarPreview"), onboarding ? PLACEHOLDER_AVATAR : avatarUrlFor(profile));
    $("#leaderboardProfileAvatarInput").value = "";
    $("#leaderboardConsentWrap")?.classList.toggle("hidden", !onboarding);
    if ($("#leaderboardProfileConsent")) $("#leaderboardProfileConsent").checked = false;
    if ($("#leaderboardProfileSubmit")) $("#leaderboardProfileSubmit").textContent = onboarding ? "同意並加入排行榜" : "儲存公開資料";
    if ($("#leaderboardProfileTitle")) $("#leaderboardProfileTitle").textContent = onboarding ? "設定排行榜公開資料" : "編輯名字與頭像";
    $("#leaderboardLeaveButton")?.classList.toggle("hidden", onboarding);
    profileOpen = true;
    $("#leaderboardProfileModal")?.classList.remove("hidden");
    updateModalOpenClass();
    requestAnimationFrame(() => $("#leaderboardProfileName")?.focus());
  }

  async function saveProfile(event) {
    event.preventDefault();
    const name = core.normalizeDisplayName($("#leaderboardProfileName")?.value, "");
    if (!core.isValidDisplayName(name)) {
      showProfileError("排行榜名字需為 2～20 個可見字元，且不能包含控制字元。");
      return;
    }
    if (profileOnboarding && !pendingAvatarFile) {
      showProfileError("請自行選擇一張排行榜頭像。");
      return;
    }
    if (profileOnboarding && $("#leaderboardProfileConsent")?.checked !== true) {
      showProfileError("請先確認公開資料說明。");
      return;
    }
    if (!profileOnboarding && joined !== true) return;
    const submit = event.submitter;
    if (submit) submit.disabled = true;
    showProfileError();
    let uploaded = null;
    const oldAvatarPath = profile?.custom_avatar_path || "";
    try {
      let customAvatarPath = oldAvatarPath;
      if (pendingAvatarFile) {
        uploaded = await authApi()?.uploadLeaderboardAvatar?.(pendingAvatarFile);
        if (!uploaded?.path) throw new Error("avatar-upload-failed");
        customAvatarPath = uploaded.path;
      }
      if (profileOnboarding) {
        profile = unwrapSingle(await rpc("join_global_leaderboard", {
          p_display_name: name,
          p_custom_avatar_path: customAvatarPath,
          p_consent: true,
          ...publicProfileParams(),
        }));
        joined = profile?.joined === true;
        if (!joined) throw new Error("leaderboard-profile-incomplete");
      } else {
        profile = unwrapSingle(await rpc("update_leaderboard_profile", {
          p_display_name: name,
          p_custom_avatar_path: customAvatarPath,
        }));
      }
      if (uploaded?.path && oldAvatarPath && oldAvatarPath !== uploaded.path) {
        void authApi()?.deleteLeaderboardAvatar?.(oldAvatarPath);
      } else if (resetCustomAvatar && oldAvatarPath) {
        void authApi()?.deleteLeaderboardAvatar?.(oldAvatarPath);
      }
      invalidateCache();
      renderOwnProfile();
      closeProfileEditor();
      modalOpen = true;
      $("#leaderboardModal")?.classList.remove("hidden");
      updateModalOpenClass();
      await loadLeaderboard(activeMetric, { force: true });
    } catch (error) {
      if (uploaded?.path) void authApi()?.deleteLeaderboardAvatar?.(uploaded.path);
      showProfileError(profileOnboarding ? "公開資料尚未建立；請確認圖片與網路後再試。" : "公開資料儲存失敗，原本資料已保留；請確認網路後再試。");
      console.warn("Leaderboard profile update failed.", error?.message || error);
    } finally {
      if (submit) submit.disabled = false;
    }
  }

  function readPendingEvents(userId) {
    const events = readJson(localStorage, queueKey(userId), []);
    return (Array.isArray(events) ? events : []).map(core.normalizePracticeEvent).filter((event) => event.eventId);
  }

  function writePendingEvents(userId, events) {
    if (events.length) localStorage.setItem(queueKey(userId), JSON.stringify(events.slice(-100)));
    else localStorage.removeItem(queueKey(userId));
  }

  async function flushPendingEvents() {
    const user = getPublicUser();
    if (!user?.id || isQaActive() || joined !== true) return null;
    if (queueFlight) return queueFlight;
    queueFlight = (async () => {
      const pending = readPendingEvents(user.id);
      while (pending.length && joined === true) {
        const event = pending[0];
        try {
          await rpc("record_leaderboard_practice", {
            p_event_id: event.eventId,
            p_completed_cycles: event.completedCycles,
            p_practice_date: event.practiceDate,
            p_protected_dates: event.protectedDates,
          });
          pending.shift();
          writePendingEvents(user.id, pending);
          invalidateCache();
        } catch (error) {
          console.warn("Leaderboard progress remains queued.", error?.message || error);
          break;
        }
      }
      if (!pending.length && modalOpen) await loadLeaderboard(activeMetric, { force: true });
      return pending.length;
    })().finally(() => { queueFlight = null; });
    return queueFlight;
  }

  function createEventId() {
    if (global.crypto?.randomUUID) return global.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    global.crypto?.getRandomValues?.(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    return [...bytes].map((value, index) => `${[4, 6, 8, 10].includes(index) ? "-" : ""}${value.toString(16).padStart(2, "0")}`).join("");
  }

  function enqueuePracticeCompletion(completedCycles, practiceDate, protectedDates) {
    const user = getPublicUser();
    if (!user?.id || isQaActive() || joined !== true) return false;
    const event = core.normalizePracticeEvent({ eventId: createEventId(), completedCycles, practiceDate, protectedDates });
    if (!event.practiceDate || !event.protectedDates.length) return false;
    const pending = readPendingEvents(user.id);
    pending.push(event);
    writePendingEvents(user.id, pending);
    void syncOwnProfile().then(flushPendingEvents);
    return true;
  }

  function recordPracticeCompletion({ completedCycles, practiceDate, protectedDates } = {}) {
    if (!getPublicUser() || isQaActive()) return false;
    if (joined === true) return enqueuePracticeCompletion(completedCycles, practiceDate, protectedDates);
    if (joined === null) {
      void ensureMembership().then((isJoined) => {
        if (isJoined) enqueuePracticeCompletion(completedCycles, practiceDate, protectedDates);
      });
    }
    return false;
  }

  function openLeaveConfirmation() {
    if (joined !== true) return;
    leaveOpen = true;
    $("#leaderboardLeaveModal")?.classList.remove("hidden");
    updateModalOpenClass();
    requestAnimationFrame(() => $("#leaderboardLeaveCancel")?.focus());
  }

  function closeLeaveConfirmation() {
    leaveOpen = false;
    $("#leaderboardLeaveModal")?.classList.add("hidden");
    updateModalOpenClass();
  }

  async function leaveLeaderboard() {
    const user = getPublicUser();
    if (!user?.id || joined !== true) return;
    const button = $("#leaderboardLeaveConfirm");
    if (button) button.disabled = true;
    const oldAvatarPath = profile?.custom_avatar_path || "";
    try {
      await rpc("leave_global_leaderboard");
      joined = false;
      profile = null;
      writePendingEvents(user.id, []);
      invalidateCache();
      closeLeaveConfirmation();
      closeProfileEditor();
      renderMembership();
      if (oldAvatarPath) void authApi()?.deleteLeaderboardAvatar?.(oldAvatarPath);
      modalOpen = false;
      $("#leaderboardModal")?.classList.add("hidden");
      setStatus("已退出排行榜；公開資料已隱藏，之後不會提交成績。", "");
    } catch (error) {
      setStatus("退出排行榜失敗，請稍後再試。", "error");
      console.warn("Leaderboard leave failed.", error?.message || error);
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function open() {
    if (!getPublicUser()) {
      modalOpen = true;
      $("#leaderboardModal")?.classList.remove("hidden");
      renderMembership();
      await loadLeaderboard(activeMetric);
      updateModalOpenClass();
      return;
    }
    await ensureMembership({ force: true });
    if (membershipUnavailable) {
      modalOpen = true;
      profileOpen = false;
      $("#leaderboardProfileModal")?.classList.add("hidden");
      $("#leaderboardModal")?.classList.remove("hidden");
      renderMembership();
      renderLeaderboardRows([], activeMetric);
      setStatus("排行榜服務正在準備中，請稍後再試。", "error");
      updateModalOpenClass();
      requestAnimationFrame(() => $("#leaderboardModalClose")?.focus());
      return;
    }
    if (!joined) {
      modalOpen = false;
      $("#leaderboardModal")?.classList.add("hidden");
      openProfileEditor({ onboarding: true });
      return;
    }
    modalOpen = true;
    $("#leaderboardModal")?.classList.remove("hidden");
    updateModalOpenClass();
    try {
      await syncOwnProfile();
      await flushPendingEvents();
    } catch (error) {
      console.warn("Leaderboard profile sync failed.", error?.message || error);
    }
    await loadLeaderboard(activeMetric);
    window.clearInterval(refreshTimer);
    refreshTimer = window.setInterval(() => {
      if (modalOpen && !document.hidden) void loadLeaderboard(activeMetric, { force: true });
    }, PROFILE_REFRESH_INTERVAL_MS);
    requestAnimationFrame(() => $("#leaderboardModalClose")?.focus());
  }

  function close() {
    if (leaveOpen) { closeLeaveConfirmation(); return true; }
    if (profileOpen) { closeProfileEditor(); return true; }
    if (!modalOpen) return false;
    modalOpen = false;
    $("#leaderboardModal")?.classList.add("hidden");
    window.clearInterval(refreshTimer);
    refreshTimer = null;
    updateModalOpenClass();
    return true;
  }

  function resetForSignedOutAccount() {
    modalOpen = false;
    profileOpen = false;
    leaveOpen = false;
    joined = null;
    membershipUnavailable = false;
    profile = null;
    window.clearInterval(refreshTimer);
    refreshTimer = null;
    $("#leaderboardModal")?.classList.add("hidden");
    $("#leaderboardProfileModal")?.classList.add("hidden");
    $("#leaderboardLeaveModal")?.classList.add("hidden");
    updateModalOpenClass();
  }

  function bind() {
    $("#leaderboardModalClose")?.addEventListener("click", close);
    $("#leaderboardModal")?.addEventListener("click", (event) => { if (event.target.id === "leaderboardModal") close(); });
    document.querySelectorAll("[data-leaderboard-metric]").forEach((button) => {
      button.addEventListener("click", () => void loadLeaderboard(button.dataset.leaderboardMetric));
    });
    $("#leaderboardProfileEdit")?.addEventListener("click", () => openProfileEditor());
    $("#leaderboardProfileClose")?.addEventListener("click", closeProfileEditor);
    $("#leaderboardProfileCancel")?.addEventListener("click", closeProfileEditor);
    $("#leaderboardProfileModal")?.addEventListener("click", (event) => { if (event.target.id === "leaderboardProfileModal") closeProfileEditor(); });
    $("#leaderboardProfileForm")?.addEventListener("submit", saveProfile);
    $("#leaderboardProfileName")?.addEventListener("input", () => showProfileError());
    $("#leaderboardLeaveButton")?.addEventListener("click", openLeaveConfirmation);
    $("#leaderboardLeaveCancel")?.addEventListener("click", closeLeaveConfirmation);
    $("#leaderboardLeaveConfirm")?.addEventListener("click", () => void leaveLeaderboard());
    $("#leaderboardLeaveModal")?.addEventListener("click", (event) => { if (event.target.id === "leaderboardLeaveModal") closeLeaveConfirmation(); });
    $("#leaderboardProfileAvatarInput")?.addEventListener("change", (event) => {
      const file = event.target.files?.[0] || null;
      if (!file) return;
      if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(file.type) || file.size > 2 * 1024 * 1024) {
        showProfileError("請選擇 2 MB 以下的 JPG、PNG 或 WebP 圖片。");
        event.target.value = "";
        return;
      }
      if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
      previewObjectUrl = URL.createObjectURL(file);
      pendingAvatarFile = file;
      resetCustomAvatar = false;
      assignSafeImage($("#leaderboardProfileAvatarPreview"), previewObjectUrl);
      showProfileError();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && (leaveOpen || profileOpen || modalOpen)) {
        event.preventDefault();
        close();
      }
    });
    window.addEventListener("online", () => {
      if (joined === true) void flushPendingEvents();
      if (modalOpen) void loadLeaderboard(activeMetric, { force: true });
    });
  }

  function init(options = {}) {
    dependencies = { ...dependencies, ...options };
    if (initialized) {
      renderOwnProfile();
      return;
    }
    initialized = true;
    bind();
    renderMembership();
    if (getPublicUser()) void ensureMembership().then((isJoined) => {
      if (isJoined) void syncOwnProfile().then(flushPendingEvents);
    });
  }

  global.ChromaticaLeaderboard = Object.freeze({
    init,
    open,
    close,
    recordPracticeCompletion,
    flushPendingEvents,
    resetForSignedOutAccount,
    getDiagnostics() {
      return {
        initialized,
        joined,
        modalOpen,
        profileOpen,
        leaveOpen,
        activeMetric,
        refreshTimerActive: Boolean(refreshTimer),
        refreshInFlight: Boolean(refreshFlight),
        queueInFlight: Boolean(queueFlight),
      };
    },
  });
})(typeof window !== "undefined" ? window : globalThis);
