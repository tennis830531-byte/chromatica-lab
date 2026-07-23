(function initAnnouncements(global) {
  "use strict";

  const CACHE_KEY = "chromatica.announcements.cache.v1";
  const CACHE_TTL_MS = 5 * 60 * 1000;
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
  const MODAL_SELECTORS = Object.freeze([
    "#announcementPreviewModal",
    "#announcementFullModal",
    "#announcementListModal",
    "#announcementAdminModal",
  ]);
  let initialized = false;
  let runtimePreviewShown = false;
  let runtimePreviewRequest = null;
  let activeAnnouncement = null;
  let adminEditingId = null;
  let visibleModalSelector = "";
  let previewReturnSelector = "";
  let detailReturnSelector = "";
  let detailAnnouncementKey = "";
  let detailTransitioning = false;

  const $ = (selector) => document.querySelector(selector);
  const auth = () => global.chromaticaAuth;

  function truncateGraphemes(value, limit = 10) {
    const text = String(value || "");
    const segments = typeof Intl?.Segmenter === "function"
      ? [...new Intl.Segmenter("zh-Hant", { granularity: "grapheme" }).segment(text)].map((item) => item.segment)
      : Array.from(text);
    return segments.length > limit ? `${segments.slice(0, limit).join("")}…` : segments.join("");
  }

  function formatPublishedAt(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("zh-TW", {
      timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    }).format(date);
  }

  function createUi() {
    if ($("#announcementPreviewModal")) return;
    const root = document.createElement("div");
    root.id = "announcementUiRoot";
    root.innerHTML = `
      <div id="announcementPreviewModal" class="announcement-backdrop hidden" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="announcementPreviewTitle"><article class="announcement-modal paper-card"><button class="announcement-close" data-announcement-close type="button" aria-label="關閉公告">×</button><p id="announcementPreviewTopic" class="eyebrow"></p><h2 id="announcementPreviewTitle" tabindex="-1"></h2><time id="announcementPreviewTime"></time><img id="announcementPreviewImage" class="announcement-preview-image hidden" alt="" /><p id="announcementPreviewBody"></p><div class="announcement-actions"><button data-announcement-close type="button">稍後再看</button><button id="announcementReadMore" class="primary-btn" type="button">查看完整公告</button></div></article></div>
      <div id="announcementFullModal" class="announcement-backdrop hidden" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="announcementFullTitle"><article class="announcement-modal announcement-full paper-card"><button class="announcement-close" data-announcement-full-close type="button" aria-label="關閉完整公告">×</button><p id="announcementFullTopic" class="eyebrow"></p><h2 id="announcementFullTitle" tabindex="-1"></h2><time id="announcementFullTime"></time><img id="announcementFullImage" class="announcement-full-image hidden" alt="" /><p id="announcementFullBody"></p></article></div>
      <div id="announcementListModal" class="announcement-backdrop hidden" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="announcementListTitle"><section class="announcement-modal paper-card"><button class="announcement-close" data-announcement-list-close type="button" aria-label="關閉公告列表">×</button><h2 id="announcementListTitle" tabindex="-1">公告</h2><p id="announcementListStatus" role="status"></p><div id="announcementList" class="announcement-list"></div></section></div>
      <div id="announcementAdminModal" class="announcement-backdrop hidden" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="announcementAdminTitle"><section class="announcement-modal announcement-admin paper-card"><button class="announcement-close" data-announcement-admin-close type="button" aria-label="關閉公告管理">×</button><h2 id="announcementAdminTitle" tabindex="-1">公告管理</h2><div id="announcementAdminList" class="announcement-list"></div><form id="announcementAdminForm"><label>大主題<input id="announcementAdminTopic" maxlength="30" required /></label><label>標題<input id="announcementAdminHeadline" maxlength="80" required /></label><label>內容<textarea id="announcementAdminBody" maxlength="5000" required></textarea></label><label>發布日期時間<input id="announcementAdminPublishedAt" type="datetime-local" required /></label><label>公告圖片<input id="announcementAdminImage" type="file" accept="image/jpeg,image/png,image/webp" /></label><p id="announcementAdminStatus" role="status"></p><div class="announcement-actions"><button id="announcementAdminNew" type="button">新增</button><button name="intent" value="draft" type="submit">儲存草稿</button><button class="primary-btn" name="intent" value="publish" type="submit">發布</button><button id="announcementAdminUnpublish" type="button">取消發布</button><button id="announcementAdminPreview" type="button">預覽</button></div></form></section></div>`;
    document.body.append(root);
  }

  function readCache() {
    try {
      const cache = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null");
      return cache && Date.now() - Number(cache.savedAt) < CACHE_TTL_MS && Array.isArray(cache.rows) ? cache.rows : null;
    } catch { return null; }
  }

  async function fetchPublished({ force = false } = {}) {
    const cached = !force && readCache();
    if (cached) return cached;
    const { data, error } = await auth()?.leaderboardRpc?.("get_published_announcements") || {};
    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), rows }));
    return rows;
  }

  function assignImage(image, announcement, preview = false) {
    const source = auth()?.getAnnouncementImageUrl?.(announcement?.image_path, announcement?.image_version) || "";
    image.classList.toggle("hidden", !source);
    if (!source) { image.removeAttribute("src"); return; }
    image.onerror = () => { image.onerror = null; image.classList.add("hidden"); image.removeAttribute("src"); };
    image.alt = preview ? "公告縮圖" : "公告圖片";
    image.src = source;
  }

  function focusVisibleModal(selector) {
    const focusTarget = $(`${selector} h2`) || $(`${selector} .announcement-close`);
    const focus = () => focusTarget?.focus?.({ preventScroll: true });
    if (typeof global.requestAnimationFrame === "function") global.requestAnimationFrame(focus);
    else focus();
  }

  function setVisibleAnnouncementModal(selector = "", { focus = true } = {}) {
    const targetExists = selector && Boolean($(selector));
    visibleModalSelector = targetExists ? selector : "";
    MODAL_SELECTORS.forEach((modalSelector) => {
      const modal = $(modalSelector);
      if (!modal) return;
      const visible = modalSelector === visibleModalSelector;
      modal.classList.toggle("hidden", !visible);
      modal.setAttribute("aria-hidden", visible ? "false" : "true");
      if (visible) modal.removeAttribute("inert");
      else modal.setAttribute("inert", "");
    });
    document.body.classList.toggle("modal-open", Boolean(visibleModalSelector));
    if (visibleModalSelector && focus) focusVisibleModal(visibleModalSelector);
    return Boolean(visibleModalSelector);
  }

  function showPreview(announcement, { returnTo = "" } = {}) {
    if (!announcement) return;
    activeAnnouncement = announcement;
    previewReturnSelector = returnTo;
    $("#announcementPreviewTopic").textContent = announcement.large_topic || "公告";
    $("#announcementPreviewTitle").textContent = announcement.title || "";
    $("#announcementPreviewTime").textContent = formatPublishedAt(announcement.published_at);
    $("#announcementPreviewBody").textContent = truncateGraphemes(announcement.body, 10);
    assignImage($("#announcementPreviewImage"), announcement, true);
    setVisibleAnnouncementModal("#announcementPreviewModal");
  }

  function showFull(announcement = activeAnnouncement, { returnTo = "" } = {}) {
    const nextAnnouncement = announcement && typeof announcement === "object" ? announcement : null;
    const nextKey = String(nextAnnouncement?.id || `${nextAnnouncement?.published_at || ""}:${nextAnnouncement?.title || ""}`);
    if (detailTransitioning) return false;
    if (visibleModalSelector === "#announcementFullModal" && nextKey && nextKey === detailAnnouncementKey) {
      focusVisibleModal("#announcementFullModal");
      return false;
    }
    detailTransitioning = true;
    try {
      detailReturnSelector = returnTo;
      detailAnnouncementKey = nextKey;
      if (nextAnnouncement) {
        activeAnnouncement = nextAnnouncement;
        $("#announcementFullTopic").textContent = nextAnnouncement.large_topic || "公告";
        $("#announcementFullTitle").textContent = nextAnnouncement.title || "公告";
        $("#announcementFullTime").textContent = formatPublishedAt(nextAnnouncement.published_at);
        $("#announcementFullBody").textContent = nextAnnouncement.body || "";
        assignImage($("#announcementFullImage"), nextAnnouncement);
      } else {
        $("#announcementFullTopic").textContent = "公告";
        $("#announcementFullTitle").textContent = "無法開啟公告";
        $("#announcementFullTime").textContent = "";
        $("#announcementFullBody").textContent = "公告內容暫時無法載入，請返回公告列表後再試。";
        assignImage($("#announcementFullImage"), null);
      }
      setVisibleAnnouncementModal("#announcementFullModal");
      return true;
    } finally {
      detailTransitioning = false;
    }
  }

  async function showList() {
    setVisibleAnnouncementModal("#announcementListModal");
    const list = $("#announcementList");
    const status = $("#announcementListStatus");
    list.replaceChildren();
    status.textContent = "正在載入公告…";
    try {
      const rows = await fetchPublished({ force: true });
      status.textContent = rows.length ? "" : "目前沒有公告。";
      rows.forEach((announcement) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "announcement-list-item";
        const image = document.createElement("img");
        assignImage(image, announcement, true);
        const copy = document.createElement("span");
        const topic = document.createElement("small"); topic.textContent = announcement.large_topic || "公告";
        const title = document.createElement("strong"); title.textContent = announcement.title || "";
        const time = document.createElement("time"); time.textContent = formatPublishedAt(announcement.published_at);
        copy.append(topic, title, time); button.append(image, copy);
        button.addEventListener("click", () => showFull(announcement, { returnTo: "#announcementListModal" }));
        list.append(button);
      });
    } catch {
      status.textContent = "目前離線，暫時無法取得公告。";
    }
  }

  function canAutoShowLatestOnHome() {
    const workspaceReady = global.chromaticaStartupState?.workspaceStatus === "ready";
    const authenticated = document.body.classList.contains("auth-authenticated");
    const homeActive = Boolean($("#intro.view.active"));
    const micGate = $("#micGate");
    const micGateFinished = !micGate || micGate.classList.contains("hidden");
    const nativeAndroid = Boolean(global.Capacitor?.isNativePlatform?.() && global.Capacitor?.getPlatform?.() === "android");
    const startupSplashFinished = !nativeAndroid || global.chromaticaStartupSplashFinished === true;
    const presentationBlocked = document.body.classList.contains("modal-open")
      || document.body.classList.contains("practice-settlement-open");
    return authenticated
      && workspaceReady
      && homeActive
      && micGateFinished
      && startupSplashFinished
      && !presentationBlocked;
  }

  async function maybeShowLatestAnnouncementOnHome() {
    if (runtimePreviewShown) return false;
    if (runtimePreviewRequest) return runtimePreviewRequest;
    if (!canAutoShowLatestOnHome()) return false;

    runtimePreviewRequest = (async () => {
      try {
        const rows = await fetchPublished();
        const latest = rows[0];
        if (!latest || !canAutoShowLatestOnHome() || runtimePreviewShown) return false;
        showPreview(latest);
        runtimePreviewShown = true;
        return true;
      } catch {
        // Offline startup is non-blocking and may be retried by a later home activation.
        return false;
      } finally {
        runtimePreviewRequest = null;
      }
    })();
    return runtimePreviewRequest;
  }

  function resetAdminForm(announcement = null) {
    adminEditingId = announcement?.id || null;
    $("#announcementAdminTopic").value = announcement?.large_topic || "";
    $("#announcementAdminHeadline").value = announcement?.title || "";
    $("#announcementAdminBody").value = announcement?.body || "";
    const date = announcement?.published_at ? new Date(announcement.published_at) : new Date(Date.now() + 60_000);
    $("#announcementAdminPublishedAt").value = new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    $("#announcementAdminImage").value = "";
    $("#announcementAdminStatus").textContent = "";
  }

  async function loadAdminList() {
    const { data, error } = await auth()?.leaderboardRpc?.("get_admin_announcements") || {};
    if (error) throw error;
    const list = $("#announcementAdminList"); list.replaceChildren();
    (Array.isArray(data) ? data : []).forEach((announcement) => {
      const button = document.createElement("button"); button.type = "button"; button.className = "announcement-list-item";
      const copy = document.createElement("span"); const title = document.createElement("strong"); title.textContent = announcement.title;
      const state = document.createElement("small"); state.textContent = announcement.is_published ? "已發布" : "草稿";
      copy.append(title, state); button.append(copy); button.addEventListener("click", () => resetAdminForm(announcement)); list.append(button);
    });
  }

  async function openAdmin() {
    const { data, error } = await auth()?.leaderboardRpc?.("get_announcement_admin_status") || {};
    const allowed = Array.isArray(data) ? data[0]?.is_admin === true : data?.is_admin === true || data === true;
    if (error || !allowed) {
      global.chromaticaApp?.showNonBlockingToast?.("此帳號沒有公告管理權限。");
      return;
    }
    resetAdminForm(); setVisibleAnnouncementModal("#announcementAdminModal");
    try { await loadAdminList(); } catch { $("#announcementAdminStatus").textContent = "公告後台暫時無法載入。"; }
  }

  async function saveAdmin(event) {
    event.preventDefault();
    const intent = event.submitter?.value || "draft";
    const payload = {
      p_id: adminEditingId,
      p_large_topic: $("#announcementAdminTopic").value,
      p_title: $("#announcementAdminHeadline").value,
      p_body: $("#announcementAdminBody").value,
      p_published_at: new Date($("#announcementAdminPublishedAt").value).toISOString(),
      p_publish: intent === "publish",
    };
    const { data, error } = await auth().leaderboardRpc("save_announcement", payload);
    if (error) { $("#announcementAdminStatus").textContent = "儲存失敗，原公告未變更。"; return; }
    const saved = Array.isArray(data) ? data[0] : data;
    adminEditingId = saved?.id || adminEditingId;
    const image = $("#announcementAdminImage").files?.[0];
    if (image) {
      if (image.size <= 0 || image.size > MAX_IMAGE_BYTES || !["image/jpeg", "image/png", "image/webp"].includes(image.type)) {
        $("#announcementAdminStatus").textContent = "公告已儲存，但圖片必須是 5 MB 以下的 JPEG、PNG 或 WebP。";
        return;
      }
      const form = new FormData(); form.append("announcement_id", adminEditingId); form.append("file", image, image.name || "announcement");
      const upload = await auth().invokeFunction("upload-announcement-image", form);
      if (upload.error) { $("#announcementAdminStatus").textContent = "公告已儲存，但新圖片上傳失敗，舊圖片仍保留。"; return; }
    }
    sessionStorage.removeItem(CACHE_KEY);
    $("#announcementAdminStatus").textContent = intent === "publish" ? "公告已發布。" : "草稿已儲存。";
    await loadAdminList();
  }

  async function unpublishAdmin() {
    if (!adminEditingId) return;
    const { error } = await auth().leaderboardRpc("set_announcement_published", { p_id: adminEditingId, p_publish: false });
    $("#announcementAdminStatus").textContent = error ? "取消發布失敗。" : "已取消發布。";
    if (!error) { sessionStorage.removeItem(CACHE_KEY); await loadAdminList(); }
  }

  function previewAdminDraft() {
    showPreview({
      large_topic: $("#announcementAdminTopic").value,
      title: $("#announcementAdminHeadline").value,
      body: $("#announcementAdminBody").value,
      published_at: new Date($("#announcementAdminPublishedAt").value).toISOString(),
      image_path: "",
    }, { returnTo: "#announcementAdminModal" });
  }

  function closePreview() {
    const returnTo = previewReturnSelector;
    previewReturnSelector = "";
    return setVisibleAnnouncementModal(returnTo);
  }

  function closeFull() {
    const returnTo = detailReturnSelector;
    detailReturnSelector = "";
    detailAnnouncementKey = "";
    return setVisibleAnnouncementModal(returnTo);
  }

  function closeTopModal() {
    if (!visibleModalSelector) return false;
    if (visibleModalSelector === "#announcementPreviewModal") closePreview();
    else if (visibleModalSelector === "#announcementFullModal") closeFull();
    else setVisibleAnnouncementModal("");
    return true;
  }

  function bind() {
    document.querySelectorAll("[data-announcement-close]").forEach((button) => button.addEventListener("click", closePreview));
    document.querySelectorAll("[data-announcement-full-close]").forEach((button) => button.addEventListener("click", closeFull));
    document.querySelectorAll("[data-announcement-list-close], [data-announcement-admin-close]").forEach((button) => button.addEventListener("click", () => setVisibleAnnouncementModal("")));
    $("#announcementReadMore").addEventListener("click", () => showFull(activeAnnouncement, { returnTo: previewReturnSelector }));
    $("#announcementsOpen")?.addEventListener("click", () => void showList());
    $("#announcementAdminOpen")?.addEventListener("click", () => void openAdmin());
    $("#announcementAdminForm")?.addEventListener("submit", (event) => void saveAdmin(event));
    $("#announcementAdminNew")?.addEventListener("click", () => resetAdminForm());
    $("#announcementAdminUnpublish")?.addEventListener("click", () => void unpublishAdmin());
    $("#announcementAdminPreview")?.addEventListener("click", previewAdminDraft);
    document.addEventListener?.("keydown", (event) => {
      if (event.key !== "Escape" || !closeTopModal()) return;
      event.preventDefault();
    });
  }

  function init() {
    if (initialized) return;
    initialized = true;
    createUi();
    bind();
    if (global.Capacitor?.isNativePlatform?.()
      && global.Capacitor?.getPlatform?.() === "android"
      && global.chromaticaStartupSplashFinished !== true) {
      global.addEventListener("chromatica:startup-splash-finished", () => {
        void maybeShowLatestAnnouncementOnHome();
      }, { once: true });
    }
    void maybeShowLatestAnnouncementOnHome();
  }

  global.ChromaticaAnnouncements = Object.freeze({
    init,
    truncateGraphemes,
    showList,
    showFull,
    closeTopModal,
    maybeShowLatestOnHome: maybeShowLatestAnnouncementOnHome,
  });
})(typeof window !== "undefined" ? window : globalThis);
