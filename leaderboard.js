(function initLeaderboard(global) {
  "use strict";

  const core = global.ChromaticaLeaderboardCore;
  const PLACEHOLDER_AVATAR = "./public/assets/chromatic-refresh/brand/chl_brand_badge.png";
  const CACHE_PREFIX = "chromatica.leaderboard.weekly.cache.v2";
  const QUEUE_PREFIX = "chromatica.leaderboard.weekly.pending.v2";
  const RANK_SHOWN_PREFIX = "chromatica.leaderboard.rankShown.v1";
  const LEGACY_UNSCOPED_CACHE_KEYS = Object.freeze([
    CACHE_PREFIX,
    QUEUE_PREFIX,
    RANK_SHOWN_PREFIX,
    "chromatica.leaderboard.cache.v1",
    "chromatica.leaderboard.pending.v1",
  ]);
  const MEMBERSHIP = Object.freeze({
    IDLE: "idle",
    LOADING: "loading",
    JOINED: "joined",
    NOT_JOINED: "not-joined",
    ERROR: "error",
  });
  const PROFILE_REFRESH_INTERVAL_MS = 10 * 60 * 1000;
  let initialized = false;
  let activeMetric = "weekly";
  let modalOpen = false;
  let profileOpen = false;
  let refreshTimer = null;
  let refreshFlight = null;
  let queueFlight = null;
  let membershipFlight = null;
  let membershipStatus = MEMBERSHIP.IDLE;
  let membershipError = null;
  let activeUserId = "";
  let requestGeneration = 0;
  let weeklySummary = { loaded: false, weeklyCycles: 0, weeklyRank: null, hasWeeklyEntry: false };
  let profileOnboarding = false;
  let profile = null;
  let dependencies = {};
  let pendingAvatarFile = null;
  let resetCustomAvatar = false;
  let previewObjectUrl = "";
  let pendingRankMovement = null;
  const practiceSettlementResults = new Map();
  const practiceSettlementEvents = new Set();

  const $ = (selector) => document.querySelector(selector);

  function authApi() {
    return global.chromaticaAuth;
  }

  function getPublicUser() {
    return authApi()?.getLeaderboardAccount?.() || null;
  }

  function getPublicUserId() {
    return String(getPublicUser()?.id || "");
  }

  function clearLegacyUnscopedCaches() {
    LEGACY_UNSCOPED_CACHE_KEYS.forEach((key) => {
      sessionStorage.removeItem(key);
      localStorage.removeItem(key);
    });
  }

  function requestContext(userId = activeUserId) {
    return { userId: String(userId || ""), generation: requestGeneration };
  }

  function isCurrentRequest(context) {
    return Boolean(
      context?.userId
      && context.userId === activeUserId
      && context.userId === getPublicUserId()
      && context.generation === requestGeneration
    );
  }

  function joinedNow() {
    return membershipStatus === MEMBERSHIP.JOINED;
  }

  function cacheKey(metric, userId) {
    return `${CACHE_PREFIX}.${userId}.${core.normalizeMetric(metric)}`;
  }

  function queueKey(userId) {
    return `${QUEUE_PREFIX}.${userId}`;
  }

  function rankShownKey(userId) {
    return `${RANK_SHOWN_PREFIX}.${userId}`;
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

  function classifyLeaderboardError(error) {
    const code = String(error?.code || error?.status || "").toUpperCase();
    const message = String(error?.message || "").toLowerCase();
    if (code === "PGRST202" || /function .* does not exist|schema cache|could not find the function/.test(message)) {
      return { kind: "service-updating", message: "排行榜服務正在更新中" };
    }
    if (["401", "403", "PGRST301"].includes(code) || /jwt|auth-required|not authenticated|unauthorized/.test(message)) {
      return { kind: "auth", message: "登入狀態已失效，請重新登入" };
    }
    if (/failed to fetch|network|offline|load failed|timeout/.test(message)) {
      return { kind: "offline", message: "目前無法連線，請稍後再試" };
    }
    return { kind: "unknown", message: "排行榜暫時無法載入，請稍後再試" };
  }

  function updateModalOpenClass() {
    document.body?.classList.toggle("modal-open", modalOpen || profileOpen);
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

  function staleAccountError() {
    const error = new Error("leaderboard-account-changed");
    error.code = "leaderboard-account-changed";
    return error;
  }

  async function rpc(name, params = {}, context = requestContext()) {
    if (!isCurrentRequest(context)) throw staleAccountError();
    const result = await authApi()?.leaderboardRpc?.(name, params, { expectedUserId: context.userId });
    if (!result) throw new Error("leaderboard-auth-unavailable");
    if (result.error) throw result.error;
    if (!isCurrentRequest(context)) throw staleAccountError();
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
    const joined = membershipStatus === MEMBERSHIP.JOINED;
    const notJoined = membershipStatus === MEMBERSHIP.NOT_JOINED;
    const pending = membershipStatus === MEMBERSHIP.IDLE || membershipStatus === MEMBERSHIP.LOADING;
    $("#leaderboardLoginPrompt")?.classList.toggle("hidden", signedIn);
    $("#leaderboardOwnProfile")?.classList.toggle("hidden", !joined);
    const membership = $("#leaderboardAccountMembership");
    if (membership) {
      membership.textContent = !signedIn
        ? "請先登入"
        : joined
          ? "已加入"
          : notJoined
            ? "尚未加入"
            : membershipStatus === MEMBERSHIP.ERROR
              ? "暫時無法確認"
              : "確認中";
    }
    const edit = $("#leaderboardProfileEdit");
    if (edit) {
      edit.disabled = !signedIn || pending || membershipStatus === MEMBERSHIP.ERROR;
      edit.textContent = joined ? "編輯公開資料／更換頭像" : "前往排行榜完成首次設定";
    }
    global.ChromaticaPushNotifications?.setMembership?.(joined);
  }

  function updateWeeklySummary(rawRows, context = requestContext()) {
    if (!isCurrentRequest(context) || !joinedNow()) return false;
    const currentRow = core.normalizeLeaderboardRows(rawRows, "weekly").find((row) => row.isCurrentUser) || null;
    weeklySummary = {
      loaded: true,
      weeklyCycles: currentRow ? Math.max(0, Number(currentRow.score) || 0) : 0,
      weeklyRank: currentRow ? Math.max(1, Number(currentRow.position) || 1) : null,
      hasWeeklyEntry: Boolean(currentRow),
    };
    return true;
  }

  function renderOwnProfile() {
    renderMembership();
    if (!joinedNow()) return;
    const spirit = getFeaturedSpirit();
    const displayName = core.normalizeDisplayName(profile?.display_name, "練習者");
    assignSafeImage($("#leaderboardOwnAvatar"), avatarUrlFor(profile));
    if ($("#leaderboardOwnName")) $("#leaderboardOwnName").textContent = displayName;
    if ($("#leaderboardOwnSpirit")) {
      $("#leaderboardOwnSpirit").textContent = profile?.featured_spirit_name || spirit.name || "尚未設定展示精靈";
    }
  }

  async function ensureMembership({ force = false } = {}) {
    const userId = getPublicUserId();
    if (!userId || isQaActive()) {
      activateAccount("");
      return false;
    }
    if (activeUserId !== userId) activateAccount(userId, { loadMembership: false });
    if (!force && membershipStatus === MEMBERSHIP.JOINED) return true;
    if (!force && membershipStatus === MEMBERSHIP.NOT_JOINED) return false;
    if (
      membershipFlight
      && membershipFlight.userId === userId
      && membershipFlight.generation === requestGeneration
    ) {
      return membershipFlight.promise;
    }

    membershipStatus = MEMBERSHIP.LOADING;
    membershipError = null;
    profile = null;
    renderOwnProfile();
    renderLeaderboardRows([], activeMetric);
    setStatus("正在確認排行榜資格…", "");
    const context = requestContext(userId);
    const flight = { ...context, promise: null };
    flight.promise = rpc("get_my_leaderboard_membership", {}, context)
      .then((data) => {
        if (!isCurrentRequest(context)) return false;
        const membership = unwrapSingle(data);
        if (!membership || typeof membership.joined !== "boolean") {
          const error = new Error("leaderboard-membership-malformed");
          error.code = "leaderboard-membership-malformed";
          throw error;
        }
        membershipStatus = membership.joined ? MEMBERSHIP.JOINED : MEMBERSHIP.NOT_JOINED;
        membershipError = null;
        profile = membership.joined ? membership : null;
        renderOwnProfile();
        return membership.joined;
      })
      .catch((error) => {
        if (!isCurrentRequest(context)) return false;
        membershipStatus = MEMBERSHIP.ERROR;
        membershipError = classifyLeaderboardError(error);
        profile = null;
        renderMembership();
        console.warn("Leaderboard membership check failed.", membershipError.kind);
        return false;
      })
      .finally(() => {
        if (membershipFlight === flight) membershipFlight = null;
      });
    membershipFlight = flight;
    return flight.promise;
  }

  async function syncOwnProfile() {
    if (!joinedNow() || !getPublicUser() || isQaActive()) return null;
    const context = requestContext();
    const nextProfile = unwrapSingle(await rpc("sync_leaderboard_profile", publicProfileParams(), context));
    if (!isCurrentRequest(context)) return null;
    profile = nextProfile;
    renderOwnProfile();
    return profile;
  }

  function readCache(metric, userId = activeUserId) {
    if (!userId || userId !== getPublicUserId()) return null;
    return readJson(sessionStorage, cacheKey(metric, userId), null);
  }

  function writeCache(metric, rows, context = requestContext()) {
    if (!isCurrentRequest(context)) return false;
    sessionStorage.setItem(cacheKey(metric, context.userId), JSON.stringify({ savedAt: Date.now(), rows }));
    return true;
  }

  function invalidateCache(context = requestContext()) {
    if (!isCurrentRequest(context)) return false;
    sessionStorage.removeItem(cacheKey("weekly", context.userId));
    return true;
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
      const name = document.createElement("strong");
      name.className = "leaderboard-name";
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
      const score = document.createElement("strong");
      score.className = "leaderboard-score";
      score.textContent = `本週 ${row.score} 次`;
      item.append(rank, avatar, name, spirit, score);
      list.append(item);
    });
    animatePendingRankMovement();
  }

  function animatePendingRankMovement() {
    const movement = pendingRankMovement;
    if (!movement) return;
    const row = $(".leaderboard-row.is-me");
    if (!row) return;
    pendingRankMovement = null;
    const reduced = global.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    row.dataset.rankMovement = `${movement.previousRank || "榜外"}→${movement.nextRank}`;
    if (reduced || typeof row.animate !== "function") {
      row.classList.add("rank-movement-highlight");
      global.setTimeout(() => row.classList.remove("rank-movement-highlight"), 900);
      return;
    }
    const rowHeight = Math.max(64, row.getBoundingClientRect().height + 9);
    const rankDistance = movement.previousRank ? Math.max(1, movement.previousRank - movement.nextRank) : 3;
    const startY = Math.min(rowHeight * rankDistance, rowHeight * 6);
    row.animate([
      { transform: `translateY(${startY}px)`, opacity: movement.enteredTopRows ? .35 : .72 },
      { transform: "translateY(-6px)", opacity: 1, offset: .82 },
      { transform: "translateY(0)", opacity: 1 },
    ], { duration: 850, easing: "cubic-bezier(.2,.85,.3,1)", fill: "both" });
  }

  async function loadLeaderboard(metric = activeMetric, { force = false } = {}) {
    activeMetric = core.normalizeMetric(metric);
    const userId = getPublicUserId();
    if (!userId) {
      renderLeaderboardRows([], activeMetric);
      setStatus("請先登入，即可查看全球排行榜。", "");
      return [];
    }
    if (activeUserId !== userId) activateAccount(userId, { loadMembership: false });
    if (membershipStatus === MEMBERSHIP.IDLE || membershipStatus === MEMBERSHIP.LOADING) {
      renderLeaderboardRows([], activeMetric);
      setStatus("正在確認排行榜資格…", "");
      return [];
    }
    if (membershipStatus === MEMBERSHIP.ERROR) {
      renderLeaderboardRows([], activeMetric);
      setStatus(membershipError?.message || "排行榜暫時無法載入，請稍後再試", "error");
      return [];
    }
    if (membershipStatus === MEMBERSHIP.NOT_JOINED) {
      renderLeaderboardRows([], activeMetric);
      setStatus("請先完成排行榜公開資料設定。", "");
      return [];
    }
    const context = requestContext(userId);
    const cache = readCache(activeMetric, userId);
    const cacheHasCurrentUser = Boolean(
      cache?.rows && core.normalizeLeaderboardRows(cache.rows, activeMetric).some((row) => row.isCurrentUser)
    );
    if (cacheHasCurrentUser) {
      updateWeeklySummary(cache.rows, context);
      renderLeaderboardRows(cache.rows, activeMetric);
    }
    if (!force && cacheHasCurrentUser && core.isCacheFresh(cache)) {
      setStatus("", "");
      return cache.rows;
    }
    if (
      refreshFlight
      && refreshFlight.userId === userId
      && refreshFlight.generation === context.generation
    ) {
      return refreshFlight.promise;
    }
    setStatus("正在更新排行榜…", "");
    const flight = { ...context, promise: null };
    flight.promise = rpc("get_weekly_leaderboard", {}, context)
      .then((rows) => {
        if (!isCurrentRequest(context)) return [];
        const normalized = core.normalizeLeaderboardRows(rows, activeMetric);
        if (!normalized.some((row) => row.isCurrentUser)) {
          renderLeaderboardRows([], activeMetric);
          setStatus("排行榜服務正在更新中", "error");
          return [];
        }
        updateWeeklySummary(rows, context);
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
        })), context);
        renderLeaderboardRows(rows, activeMetric);
        setStatus("", "");
        return rows;
      })
      .catch((error) => {
        if (!isCurrentRequest(context)) return [];
        const classified = classifyLeaderboardError(error);
        const message = cache?.rows && classified.kind === "offline" ? "目前離線，先顯示最近一次排行。" : classified.message;
        setStatus(message, "error");
        console.warn("Leaderboard refresh failed.", classified.kind);
        return cache?.rows || [];
      })
      .finally(() => {
        if (refreshFlight === flight) refreshFlight = null;
      });
    refreshFlight = flight;
    return flight.promise;
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
    if (!getPublicUser() || (!joinedNow() && !onboarding)) return;
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
    profileOpen = true;
    $("#leaderboardProfileModal")?.classList.remove("hidden");
    updateModalOpenClass();
    requestAnimationFrame(() => $("#leaderboardProfileName")?.focus());
  }

  async function saveProfile(event) {
    event.preventDefault();
    const context = requestContext();
    if (!isCurrentRequest(context)) return;
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
    if (!profileOnboarding && !joinedNow()) return;
    const submit = event.submitter;
    if (submit) submit.disabled = true;
    showProfileError();
    let uploaded = null;
    const oldAvatarPath = profile?.custom_avatar_path || "";
    try {
      let customAvatarPath = oldAvatarPath;
      if (pendingAvatarFile) {
        const spirit = publicProfileParams();
        uploaded = await authApi()?.uploadLeaderboardAvatar?.(pendingAvatarFile, {
          expectedUserId: context.userId,
          displayName: name,
          consent: true,
          featuredSpiritSpecies: spirit.p_featured_spirit_species,
          featuredSpiritName: spirit.p_featured_spirit_name,
          featuredSpiritStage: spirit.p_featured_spirit_stage,
        });
        if (!isCurrentRequest(context)) throw staleAccountError();
        if (!uploaded?.path) throw new Error("avatar-upload-failed");
        customAvatarPath = uploaded.path;
      }
      if (uploaded?.profile) {
        profile = uploaded.profile;
        membershipStatus = profile?.joined === true ? MEMBERSHIP.JOINED : MEMBERSHIP.ERROR;
        if (!joinedNow()) throw new Error("leaderboard-profile-incomplete");
      } else if (profileOnboarding) {
        profile = unwrapSingle(await rpc("join_global_leaderboard", {
          p_display_name: name,
          p_custom_avatar_path: customAvatarPath,
          p_consent: true,
          ...publicProfileParams(),
        }, context));
        membershipStatus = profile?.joined === true ? MEMBERSHIP.JOINED : MEMBERSHIP.ERROR;
        if (!joinedNow()) throw new Error("leaderboard-profile-incomplete");
      } else {
        profile = unwrapSingle(await rpc("update_leaderboard_profile", {
          p_display_name: name,
          p_custom_avatar_path: customAvatarPath,
        }, context));
      }
      if (!isCurrentRequest(context)) throw staleAccountError();
      if (!uploaded?.path && resetCustomAvatar && oldAvatarPath) {
        void authApi()?.deleteLeaderboardAvatar?.(oldAvatarPath);
      }
      invalidateCache(context);
      renderOwnProfile();
      const completedOnboarding = profileOnboarding;
      if (completedOnboarding) {
        modalOpen = true;
        $("#leaderboardModal")?.classList.remove("hidden");
      }
      closeProfileEditor();
      await loadLeaderboard(activeMetric, { force: true });
    } catch (error) {
      if (!isCurrentRequest(context)) return;
      showProfileError(profileOnboarding ? "公開資料尚未建立；請確認圖片與網路後再試。" : "公開資料儲存失敗，原本資料已保留；請確認網路後再試。");
      console.warn("Leaderboard profile update failed.", error?.message || error);
    } finally {
      if (submit && isCurrentRequest(context)) submit.disabled = false;
    }
  }

  function readPendingEvents(userId) {
    const events = readJson(localStorage, queueKey(userId), []);
    return (Array.isArray(events) ? events : []).map(core.normalizePracticeEvent).filter((event) => event.eventId);
  }

  function currentCachedRank() {
    const rows = core.normalizeLeaderboardRows(readCache("weekly")?.rows, "weekly");
    return rows.find((row) => row.isCurrentUser)?.position || null;
  }

  function rankMovementAlreadyShown(userId, eventId) {
    if (!eventId) return true;
    const shown = readJson(localStorage, rankShownKey(userId), []);
    return Array.isArray(shown) && shown.includes(eventId);
  }

  function markRankMovementShown(userId, eventId) {
    const shown = readJson(localStorage, rankShownKey(userId), []);
    const next = [...new Set([...(Array.isArray(shown) ? shown : []), eventId])].slice(-100);
    localStorage.setItem(rankShownKey(userId), JSON.stringify(next));
  }

  async function presentRankMovement(movement, context = requestContext()) {
    if (!isCurrentRequest(context) || !movement || rankMovementAlreadyShown(context.userId, movement.eventId)) return;
    markRankMovementShown(context.userId, movement.eventId);
    const show = async () => {
      if (!isCurrentRequest(context)) return;
      pendingRankMovement = movement;
      modalOpen = true;
      $("#leaderboardModal")?.classList.remove("hidden");
      updateModalOpenClass();
      setStatus(`名次從第 ${movement.previousRank || "15 名外"} 前進到第 ${movement.nextRank} 名！`, "success");
      await loadLeaderboard("weekly", { force: true });
    };
    if (global.chromaticaApp?.isPracticeRewardAnimationRunning?.()) {
      global.addEventListener("chromatica:practice-reward-complete", () => void show(), { once: true });
    } else {
      await show();
    }
  }

  function writePendingEvents(userId, events) {
    if (events.length) localStorage.setItem(queueKey(userId), JSON.stringify(events.slice(-100)));
    else localStorage.removeItem(queueKey(userId));
  }

  async function flushPendingEvents() {
    const userId = getPublicUserId();
    if (!userId || isQaActive() || !joinedNow() || userId !== activeUserId) return null;
    const context = requestContext(userId);
    if (
      queueFlight
      && queueFlight.userId === userId
      && queueFlight.generation === context.generation
    ) {
      return queueFlight.promise;
    }
    const flight = { ...context, promise: null };
    flight.promise = (async () => {
      const pending = readPendingEvents(userId);
      while (pending.length && joinedNow() && isCurrentRequest(context)) {
        const event = pending[0];
        try {
          const result = unwrapSingle(await rpc("record_weekly_leaderboard_practice", {
            p_event_id: event.eventId,
            p_completed_cycles: event.completedCycles,
            p_practice_date: event.practiceDate,
            p_protected_dates: event.protectedDates,
          }, context)) || {};
          if (!isCurrentRequest(context)) return pending.length;
          pending.shift();
          writePendingEvents(userId, pending);
          invalidateCache(context);
          practiceSettlementResults.set(event.eventId, {
            status: "ranked",
            accepted: result.accepted === true,
            previousRank: Number(result.previous_rank) || null,
            currentRank: Number(result.current_rank) || null,
            weekStart: typeof result.week_start === "string" ? result.week_start : "",
          });
          const movement = core.createRankMovement(result.previous_rank ?? event.previousRank, result.current_rank, event.eventId);
          if (movement && !practiceSettlementEvents.has(event.eventId)) void presentRankMovement(movement, context);
        } catch (error) {
          if (!isCurrentRequest(context)) return pending.length;
          console.warn("Leaderboard progress remains queued.", error?.message || error);
          break;
        }
      }
      if (isCurrentRequest(context) && !pending.length && modalOpen) {
        await loadLeaderboard(activeMetric, { force: true });
      }
      return pending.length;
    })().finally(() => {
      if (queueFlight === flight) queueFlight = null;
    });
    queueFlight = flight;
    return flight.promise;
  }

  function createEventId() {
    if (global.crypto?.randomUUID) return global.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    global.crypto?.getRandomValues?.(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    return [...bytes].map((value, index) => `${[4, 6, 8, 10].includes(index) ? "-" : ""}${value.toString(16).padStart(2, "0")}`).join("");
  }

  async function enqueuePracticeCompletion(completedCycles, practiceDate, protectedDates) {
    const userId = getPublicUserId();
    if (!userId || isQaActive() || !joinedNow() || userId !== activeUserId) return { status: "not-joined" };
    const context = requestContext(userId);
    const event = core.normalizePracticeEvent({ eventId: createEventId(), completedCycles, practiceDate, protectedDates, previousRank: currentCachedRank() });
    if (!event.practiceDate || !event.protectedDates.length) return { status: "unavailable" };
    if (queueFlight?.promise) await queueFlight.promise;
    if (!isCurrentRequest(context) || !joinedNow()) return { status: "unavailable" };
    const pending = readPendingEvents(userId);
    pending.push(event);
    writePendingEvents(userId, pending);
    practiceSettlementEvents.add(event.eventId);
    try {
      await syncOwnProfile();
      if (!isCurrentRequest(context)) return { status: "unavailable" };
      await flushPendingEvents();
      if (!isCurrentRequest(context)) return { status: "unavailable" };
      const result = practiceSettlementResults.get(event.eventId);
      if (!result) return { status: "queued" };
      const rows = await loadLeaderboard("weekly", { force: true });
      const currentRow = core.normalizeLeaderboardRows(rows, "weekly").find((row) => row.isCurrentUser);
      const movement = core.createRankMovement(result.previousRank ?? event.previousRank, result.currentRank, event.eventId);
      if (movement) markRankMovementShown(userId, event.eventId);
      return {
        ...result,
        previousRank: result.previousRank ?? event.previousRank,
        weeklyCycles: currentRow?.score ?? 0,
        eventId: event.eventId,
      };
    } catch (error) {
      console.warn("Leaderboard queued sync failed.", classifyLeaderboardError(error).kind);
      return { status: "unavailable" };
    } finally {
      practiceSettlementEvents.delete(event.eventId);
      practiceSettlementResults.delete(event.eventId);
    }
  }

  async function recordPracticeCompletion({ completedCycles, practiceDate, protectedDates } = {}) {
    const userId = getPublicUserId();
    if (!userId || isQaActive()) return { status: "not-joined" };
    if (activeUserId !== userId) activateAccount(userId, { loadMembership: false });
    if (membershipStatus === MEMBERSHIP.IDLE || membershipStatus === MEMBERSHIP.LOADING) await ensureMembership();
    if (membershipStatus === MEMBERSHIP.ERROR) return { status: "unavailable" };
    if (membershipStatus !== MEMBERSHIP.JOINED) return { status: "not-joined" };
    return enqueuePracticeCompletion(completedCycles, practiceDate, protectedDates);
  }

  async function openUnsafe() {
    const modal = $("#leaderboardModal");
    if (!modal) return false;
    const userId = getPublicUserId();
    if (!userId) {
      modalOpen = true;
      modal.classList.remove("hidden");
      renderMembership();
      await loadLeaderboard(activeMetric);
      updateModalOpenClass();
      return true;
    }
    if (activeUserId !== userId) activateAccount(userId, { loadMembership: false });
    await ensureMembership({ force: true });
    if (membershipStatus === MEMBERSHIP.ERROR) {
      modalOpen = true;
      profileOpen = false;
      $("#leaderboardProfileModal")?.classList.add("hidden");
      modal.classList.remove("hidden");
      renderMembership();
      renderLeaderboardRows([], activeMetric);
      setStatus(membershipError?.message || "排行榜暫時無法載入，請稍後再試", "error");
      updateModalOpenClass();
      requestAnimationFrame(() => $("#leaderboardModalClose")?.focus());
      return true;
    }
    if (membershipStatus === MEMBERSHIP.NOT_JOINED) {
      modalOpen = false;
      $("#leaderboardModal")?.classList.add("hidden");
      openProfileEditor({ onboarding: true });
      return true;
    }
    if (membershipStatus !== MEMBERSHIP.JOINED) {
      modalOpen = true;
      modal.classList.remove("hidden");
      renderLeaderboardRows([], activeMetric);
      setStatus("正在確認排行榜資格…", "");
      updateModalOpenClass();
      return true;
    }
    modalOpen = true;
    modal.classList.remove("hidden");
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
    return true;
  }

  async function open() {
    try {
      return await openUnsafe();
    } catch (error) {
      const modal = $("#leaderboardModal");
      if (!modal) return false;
      modalOpen = true;
      profileOpen = false;
      $("#leaderboardProfileModal")?.classList.add("hidden");
      modal.classList.remove("hidden");
      renderLeaderboardRows([], activeMetric);
      const classified = classifyLeaderboardError(error);
      setStatus(classified.message, "error");
      updateModalOpenClass();
      console.warn("Leaderboard open failed.", classified.kind);
      requestAnimationFrame(() => $("#leaderboardModalClose")?.focus());
      return false;
    }
  }

  function close() {
    if (profileOpen) { closeProfileEditor(); return true; }
    if (!modalOpen) return false;
    modalOpen = false;
    $("#leaderboardModal")?.classList.add("hidden");
    window.clearInterval(refreshTimer);
    refreshTimer = null;
    updateModalOpenClass();
    return true;
  }

  function resetRuntimeState(nextUserId = "") {
    requestGeneration += 1;
    activeUserId = String(nextUserId || "");
    modalOpen = false;
    profileOpen = false;
    membershipStatus = activeUserId ? MEMBERSHIP.LOADING : MEMBERSHIP.IDLE;
    membershipError = null;
    profile = null;
    weeklySummary = { loaded: false, weeklyCycles: 0, weeklyRank: null, hasWeeklyEntry: false };
    membershipFlight = null;
    refreshFlight = null;
    queueFlight = null;
    pendingRankMovement = null;
    practiceSettlementResults.clear();
    practiceSettlementEvents.clear();
    window.clearInterval(refreshTimer);
    refreshTimer = null;
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = "";
    pendingAvatarFile = null;
    resetCustomAvatar = false;
    profileOnboarding = false;
    $("#leaderboardModal")?.classList.add("hidden");
    $("#leaderboardProfileModal")?.classList.add("hidden");
    renderLeaderboardRows([], activeMetric);
    setStatus(activeUserId ? "正在確認排行榜資格…" : "", "");
    renderOwnProfile();
    updateModalOpenClass();
  }

  function activateAccount(userId = getPublicUserId(), { loadMembership = true } = {}) {
    const normalizedUserId = String(userId || "");
    clearLegacyUnscopedCaches();
    if (normalizedUserId !== activeUserId) resetRuntimeState(normalizedUserId);
    else renderOwnProfile();
    if (
      loadMembership
      && initialized
      && normalizedUserId
      && normalizedUserId === getPublicUserId()
      && membershipStatus === MEMBERSHIP.LOADING
      && !membershipFlight
    ) {
      void ensureMembership().then(async (isJoined) => {
        if (!isJoined || activeUserId !== normalizedUserId) return;
        try {
          await syncOwnProfile();
          await flushPendingEvents();
          if (isCurrentRequest(requestContext(normalizedUserId))) await loadLeaderboard("weekly");
        } catch (error) {
          if (activeUserId === normalizedUserId) {
            console.warn("Leaderboard account initialization failed.", classifyLeaderboardError(error).kind);
          }
        }
      });
    }
    return membershipStatus;
  }

  function resetForSignedOutAccount() {
    activateAccount("", { loadMembership: false });
  }

  function resetAfterAccountDataClear() {
    const userId = getPublicUserId();
    if (userId && userId === activeUserId) {
      writePendingEvents(userId, []);
      sessionStorage.removeItem(cacheKey("weekly", userId));
      localStorage.removeItem(rankShownKey(userId));
    }
    requestGeneration += 1;
    membershipFlight = null;
    refreshFlight = null;
    queueFlight = null;
    membershipStatus = MEMBERSHIP.NOT_JOINED;
    membershipError = null;
    profile = null;
    weeklySummary = { loaded: false, weeklyCycles: 0, weeklyRank: null, hasWeeklyEntry: false };
    pendingRankMovement = null;
    renderOwnProfile();
  }

  function bind() {
    $("#leaderboardModalClose")?.addEventListener("click", close);
    $("#leaderboardModal")?.addEventListener("click", (event) => { if (event.target.id === "leaderboardModal") close(); });
    $("#leaderboardProfileEdit")?.addEventListener("click", () => {
      if (joinedNow()) openProfileEditor();
      else void open();
    });
    $("#leaderboardProfileClose")?.addEventListener("click", closeProfileEditor);
    $("#leaderboardProfileCancel")?.addEventListener("click", closeProfileEditor);
    $("#leaderboardProfileModal")?.addEventListener("click", (event) => { if (event.target.id === "leaderboardProfileModal") closeProfileEditor(); });
    $("#leaderboardProfileForm")?.addEventListener("submit", saveProfile);
    $("#leaderboardProfileName")?.addEventListener("input", () => showProfileError());
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
      if (event.key === "Escape" && (profileOpen || modalOpen)) {
        event.preventDefault();
        close();
      }
    });
    window.addEventListener("online", () => {
      if (joinedNow()) void flushPendingEvents();
      if (modalOpen) void loadLeaderboard(activeMetric, { force: true });
    });
  }

  function init(options = {}) {
    dependencies = { ...dependencies, ...options };
    if (initialized) {
      activateAccount(getPublicUserId());
      return;
    }
    initialized = true;
    bind();
    renderMembership();
    activateAccount(getPublicUserId());
  }

  global.ChromaticaLeaderboard = Object.freeze({
    init,
    open,
    close,
    recordPracticeCompletion,
    flushPendingEvents,
    activateAccount,
    resetForSignedOutAccount,
    resetAfterAccountDataClear,
    openProfileSettings() { if (joinedNow()) openProfileEditor(); else void open(); },
    getMembership() {
      return {
        status: membershipStatus,
        joined: membershipStatus === MEMBERSHIP.JOINED
          ? true
          : membershipStatus === MEMBERSHIP.NOT_JOINED
            ? false
            : null,
        profile: profile ? { ...profile } : null,
        weeklyCycles: weeklySummary.loaded ? weeklySummary.weeklyCycles : null,
        weeklyRank: weeklySummary.loaded ? weeklySummary.weeklyRank : null,
        hasWeeklyEntry: weeklySummary.loaded ? weeklySummary.hasWeeklyEntry : null,
      };
    },
    getDiagnostics() {
      return {
        initialized,
        activeUserId: activeUserId ? "active" : "",
        membershipStatus,
        joined: joinedNow(),
        modalOpen,
        profileOpen,
        activeMetric,
        refreshTimerActive: Boolean(refreshTimer),
        refreshInFlight: Boolean(refreshFlight?.promise),
        queueInFlight: Boolean(queueFlight?.promise),
      };
    },
  });
})(typeof window !== "undefined" ? window : globalThis);
