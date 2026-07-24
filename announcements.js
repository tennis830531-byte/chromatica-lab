(function initAnnouncements(global) {
  "use strict";

  const CACHE_KEY = "chromatica.announcements.cache.v1";
  const DISMISSED_AUTO_PREVIEW_PREFIX = "chromatica.announcements.dismissed-auto.v1";
  const CACHE_TTL_MS = 5 * 60 * 1000;
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
  const MAX_IMAGES = 10;
  const MODAL_SELECTORS = Object.freeze([
    "#announcementPreviewModal",
    "#announcementFullModal",
    "#announcementListModal",
    "#announcementAdminModal",
    "#announcementPublishSuccessModal",
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
  let adminImageItems = [];
  let adminImagesDirty = false;
  let commentSubmitting = false;

  const $ = (selector) => document.querySelector(selector);
  const auth = () => global.chromaticaAuth;

  function announcementPlainText(value) {
    return String(value || "")
      .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/giu, "$1")
      .replace(/<[^>]*>/gu, "")
      .trim();
  }

  function truncateGraphemes(value, limit = 15) {
    const text = announcementPlainText(value);
    const segments = typeof Intl?.Segmenter === "function"
      ? [...new Intl.Segmenter("zh-Hant", { granularity: "grapheme" }).segment(text)].map((item) => item.segment)
      : Array.from(text);
    return segments.length > limit ? `${segments.slice(0, limit).join("")}....` : segments.join("");
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
      <div id="announcementPreviewModal" class="announcement-backdrop hidden" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="announcementPreviewTopic"><article class="announcement-modal announcement-preview paper-card"><button class="announcement-close" data-announcement-close type="button" aria-label="關閉公告">×</button><h2 id="announcementPreviewTopic" tabindex="-1"></h2><h3 id="announcementPreviewTitle"></h3><time id="announcementPreviewTime"></time><button id="announcementPreviewBody" class="announcement-preview-body" type="button"></button><img id="announcementPreviewImage" class="announcement-preview-image hidden" alt="" /><div class="announcement-actions"><button data-announcement-close type="button">稍後再看</button><button id="announcementReadMore" class="primary-btn" type="button">查看完整公告</button></div><label id="announcementPreviewDismissLabel" class="announcement-preview-dismiss hidden"><input id="announcementPreviewDismiss" type="checkbox" />不再查看此則通知</label></article></div>
      <div id="announcementFullModal" class="announcement-backdrop hidden" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="announcementFullTitle"><article class="announcement-modal announcement-full paper-card"><button class="announcement-close" data-announcement-full-close type="button" aria-label="關閉完整公告">×</button><p id="announcementFullTopic" class="eyebrow"></p><h2 id="announcementFullTitle" tabindex="-1"></h2><time id="announcementFullTime"></time><div id="announcementFullBody" class="announcement-full-body"></div><div id="announcementFullImages" class="announcement-full-images"></div><section class="announcement-comments" aria-labelledby="announcementCommentsTitle"><h3 id="announcementCommentsTitle">留言板</h3><p id="announcementCommentsStatus" role="status"></p><div id="announcementCommentsList" class="announcement-comments-list"></div><form id="announcementCommentForm"><label for="announcementCommentBody">留言內容</label><textarea id="announcementCommentBody" maxlength="300" rows="3" required></textarea><div class="announcement-comment-actions"><span id="announcementCommentHint"></span><button id="announcementCommentSubmit" class="primary-btn" type="submit">送出留言</button></div></form></section></article></div>
      <div id="announcementListModal" class="announcement-backdrop hidden" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="announcementListTitle"><section class="announcement-modal paper-card"><button class="announcement-close" data-announcement-list-close type="button" aria-label="關閉公告列表">×</button><h2 id="announcementListTitle" tabindex="-1">公告</h2><p id="announcementListStatus" role="status"></p><div id="announcementList" class="announcement-list"></div></section></div>
      <div id="announcementAdminModal" class="announcement-backdrop hidden" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="announcementAdminTitle"><section class="announcement-modal announcement-admin paper-card"><button class="announcement-close" data-announcement-admin-close type="button" aria-label="關閉公告管理">×</button><h2 id="announcementAdminTitle" tabindex="-1">公告管理</h2><div id="announcementAdminList" class="announcement-list"></div><form id="announcementAdminForm"><label>大主題<input id="announcementAdminTopic" maxlength="30" required /></label><label>標題<input id="announcementAdminHeadline" maxlength="80" required /></label><label>內容<textarea id="announcementAdminBody" maxlength="5000" required></textarea></label><fieldset class="announcement-link-tool"><legend>插入連結</legend><label>顯示文字<input id="announcementAdminLinkText" maxlength="120" /></label><label>網址<input id="announcementAdminLinkUrl" type="url" inputmode="url" placeholder="https://example.com" /></label><button id="announcementAdminInsertLink" type="button">插入連結</button><p id="announcementAdminLinkStatus" class="announcement-link-status" role="status"></p></fieldset><label>發布日期時間<input id="announcementAdminPublishedAt" type="datetime-local" required /></label><label>公告圖片（最多 10 張）<input id="announcementAdminImage" type="file" accept="image/jpeg,image/png,image/webp" multiple /></label><div id="announcementAdminImageList" class="announcement-admin-image-list"></div><p id="announcementAdminStatus" role="status"></p><div class="announcement-actions"><button id="announcementAdminNew" type="button">新增</button><button name="intent" value="draft" type="submit">儲存草稿</button><button class="primary-btn" name="intent" value="publish" type="submit">發布</button><button id="announcementAdminDelete" class="danger-btn" type="button">刪除公告</button><button id="announcementAdminPreview" type="button">預覽</button></div></form></section></div>
      <div id="announcementPublishSuccessModal" class="announcement-backdrop hidden" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="announcementPublishSuccessTitle"><section class="announcement-modal announcement-publish-success paper-card"><h2 id="announcementPublishSuccessTitle" tabindex="-1">公告已發布</h2><p>最新公告已成功發布。</p><div class="announcement-actions"><button id="announcementPublishSuccessConfirm" class="primary-btn" type="button">確定</button></div></section></div>`;
    document.body.append(root);
  }

  function readCache() {
    try {
      const cache = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null");
      return cache && Date.now() - Number(cache.savedAt) < CACHE_TTL_MS && Array.isArray(cache.rows) ? cache.rows : null;
    } catch { return null; }
  }

  function activeAnnouncementUserId() {
    return String(auth()?.getLeaderboardAccount?.()?.id || "");
  }

  function dismissedAutoPreviewKey(userId = activeAnnouncementUserId()) {
    return userId ? `${DISMISSED_AUTO_PREVIEW_PREFIX}.${userId}` : "";
  }

  function announcementIdentity(announcement) {
    return String(announcement?.id || "");
  }

  function readDismissedAutoPreviews(userId = activeAnnouncementUserId()) {
    const key = dismissedAutoPreviewKey(userId);
    if (!key) return [];
    try {
      const value = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(value) ? value.filter((item) => typeof item === "string").slice(-100) : [];
    } catch {
      return [];
    }
  }

  function isAutoPreviewDismissed(announcement, userId = activeAnnouncementUserId()) {
    const identity = announcementIdentity(announcement);
    return Boolean(identity && readDismissedAutoPreviews(userId).includes(identity));
  }

  function setAutoPreviewDismissed(announcement, dismissed, userId = activeAnnouncementUserId()) {
    const key = dismissedAutoPreviewKey(userId);
    const identity = announcementIdentity(announcement);
    if (!key || !identity) return false;
    const current = readDismissedAutoPreviews(userId);
    const next = dismissed
      ? [...new Set([...current, identity])].slice(-100)
      : current.filter((item) => item !== identity);
    try {
      if (next.length) localStorage.setItem(key, JSON.stringify(next));
      else localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  }

  async function fetchPublished({ force = false } = {}) {
    const cached = !force && readCache();
    if (cached) return cached;
    const { data, error } = await auth()?.leaderboardRpc?.("get_published_announcements_v2") || {};
    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), rows }));
    return rows;
  }

  function announcementImages(announcement) {
    const paths = Array.isArray(announcement?.image_paths) ? announcement.image_paths : [];
    const versions = Array.isArray(announcement?.image_versions) ? announcement.image_versions : [];
    if (paths.length) return paths.map((path, index) => ({ path, version: Number(versions[index] || 1) }));
    return announcement?.image_path ? [{ path: announcement.image_path, version: Number(announcement.image_version || 1) }] : [];
  }

  function assignImage(image, announcement, preview = false) {
    const first = announcementImages(announcement)[0];
    const source = auth()?.getAnnouncementImageUrl?.(first?.path, first?.version) || "";
    image.classList.toggle("hidden", !source);
    if (!source) { image.removeAttribute("src"); return; }
    image.onerror = () => { image.onerror = null; image.classList.add("hidden"); image.removeAttribute("src"); };
    image.alt = preview ? "公告縮圖" : "公告圖片";
    image.src = source;
  }

  function renderAnnouncementImages(container, announcement) {
    container.replaceChildren();
    announcementImages(announcement).forEach((item, index) => {
      const image = document.createElement("img");
      image.className = "announcement-full-image";
      image.alt = `公告圖片 ${index + 1}`;
      image.loading = index ? "lazy" : "eager";
      image.onerror = () => image.remove();
      image.src = auth()?.getAnnouncementImageUrl?.(item.path, item.version) || "";
      if (image.src) container.append(image);
    });
    container.classList.toggle("hidden", !container.children.length);
  }

  function safeHttpUrl(value) {
    try {
      const url = new URL(String(value || ""));
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch { return ""; }
  }

  function renderSafeAnnouncementBody(container, value) {
    container.replaceChildren();
    const text = String(value || "");
    const linkPattern = /\[([^\]\n]+)\]\(([^)\s]+)\)/gu;
    let cursor = 0; let match;
    while ((match = linkPattern.exec(text))) {
      if (match.index > cursor) container.append(document.createTextNode(text.slice(cursor, match.index)));
      const href = safeHttpUrl(match[2]);
      if (href) {
        const link = document.createElement("a");
        link.textContent = match[1];
        link.href = href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        container.append(link);
      } else {
        container.append(document.createTextNode(match[1]));
      }
      cursor = match.index + match[0].length;
    }
    if (cursor < text.length) container.append(document.createTextNode(text.slice(cursor)));
  }

  function commentAvatarUrl(comment) {
    return auth()?.getLeaderboardAvatarUrl?.(comment?.custom_avatar_path, comment?.avatar_version)
      || "./public/assets/chromatic-refresh/brand/chl_brand_badge.png";
  }

  function renderComments(rows) {
    const list = $("#announcementCommentsList");
    list.replaceChildren();
    (Array.isArray(rows) ? rows : []).forEach((comment) => {
      const article = document.createElement("article");
      article.className = "announcement-comment";
      const image = document.createElement("img");
      image.src = commentAvatarUrl(comment);
      image.alt = "";
      image.onerror = () => { image.src = "./public/assets/chromatic-refresh/brand/chl_brand_badge.png"; };
      const content = document.createElement("div");
      const head = document.createElement("header");
      const name = document.createElement("strong"); name.textContent = String(comment.display_name || "排行榜使用者");
      const time = document.createElement("time"); time.textContent = formatPublishedAt(comment.created_at);
      head.append(name, time);
      const body = document.createElement("p"); body.textContent = String(comment.body || "");
      content.append(head, body);
      article.append(image, content);
      if (comment.can_delete === true) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "刪除";
        button.setAttribute("aria-label", `刪除 ${name.textContent} 的留言`);
        button.addEventListener("click", () => void deleteComment(comment.id));
        article.append(button);
      }
      list.append(article);
    });
  }

  async function loadComments(announcement = activeAnnouncement) {
    const status = $("#announcementCommentsStatus");
    const form = $("#announcementCommentForm");
    const id = String(announcement?.id || "");
    if (!id) {
      renderComments([]);
      form?.classList.add("hidden");
      status.textContent = "";
      return;
    }
    status.textContent = "正在載入留言…";
    try {
      const [commentResult, membershipResult] = await Promise.all([
        auth()?.leaderboardRpc?.("get_announcement_comments", { p_announcement_id: id }) || {},
        auth()?.leaderboardRpc?.("get_my_leaderboard_membership") || {},
      ]);
      const { data, error } = commentResult;
      if (error) throw error;
      renderComments(data);
      status.textContent = Array.isArray(data) && data.length ? "" : "目前還沒有留言。";
      const membership = Array.isArray(membershipResult.data) ? membershipResult.data[0] : membershipResult.data;
      const canComment = !membershipResult.error && membership?.joined === true;
      form?.classList.toggle("hidden", !canComment);
      $("#announcementCommentHint").textContent = canComment ? "" : "請先完成排行榜公開資料後再留言";
      if (!canComment) status.textContent = `${status.textContent}${status.textContent ? " " : ""}請先完成排行榜公開資料後再留言`;
    } catch (error) {
      renderComments([]);
      form?.classList.add("hidden");
      status.textContent = /public profile required/i.test(String(error?.message || ""))
        ? "請先完成排行榜公開資料後再留言"
        : "留言暫時無法載入。";
    }
  }

  async function submitComment(event) {
    event.preventDefault();
    if (commentSubmitting || !activeAnnouncement?.id) return;
    const input = $("#announcementCommentBody");
    const body = String(input?.value || "").trim();
    if (!body || body.length > 300) {
      $("#announcementCommentHint").textContent = "留言需為 1～300 字。";
      return;
    }
    commentSubmitting = true;
    $("#announcementCommentSubmit").disabled = true;
    const requestId = global.crypto?.randomUUID?.() || `${Date.now()}-0000-4000-8000-000000000000`;
    try {
      const { error } = await auth().leaderboardRpc("create_announcement_comment", {
        p_announcement_id: activeAnnouncement.id,
        p_body: body,
        p_request_id: requestId,
      });
      if (error) throw error;
      input.value = "";
      $("#announcementCommentHint").textContent = "";
      await loadComments(activeAnnouncement);
    } catch (error) {
      $("#announcementCommentHint").textContent = /public profile required/i.test(String(error?.message || ""))
        ? "請先完成排行榜公開資料後再留言"
        : "留言送出失敗，請稍後再試。";
    } finally {
      commentSubmitting = false;
      $("#announcementCommentSubmit").disabled = false;
    }
  }

  async function deleteComment(commentId) {
    if (!commentId || !global.confirm?.("確定要刪除這則留言嗎？")) return;
    const { data, error } = await auth().leaderboardRpc("delete_announcement_comment", { p_comment_id: commentId });
    if (error || data !== true) {
      $("#announcementCommentsStatus").textContent = "留言刪除失敗。";
      return;
    }
    await loadComments(activeAnnouncement);
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

  function showPreview(announcement, { returnTo = "", auto = false } = {}) {
    if (!announcement) return;
    activeAnnouncement = announcement;
    previewReturnSelector = returnTo;
    $("#announcementPreviewTopic").textContent = announcement.large_topic || "公告";
    $("#announcementPreviewTitle").textContent = announcement.title || "";
    $("#announcementPreviewTime").textContent = formatPublishedAt(announcement.published_at);
    $("#announcementPreviewBody").textContent = truncateGraphemes(announcement.body, 15);
    $("#announcementPreviewBody").classList.toggle("is-more", announcementPlainText(announcement.body) !== truncateGraphemes(announcement.body, 15));
    assignImage($("#announcementPreviewImage"), announcement, true);
    $("#announcementPreviewDismissLabel")?.classList.toggle("hidden", !auto);
    const dismissInput = $("#announcementPreviewDismiss");
    if (dismissInput) dismissInput.checked = auto && isAutoPreviewDismissed(announcement);
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
        renderSafeAnnouncementBody($("#announcementFullBody"), nextAnnouncement.body || "");
        renderAnnouncementImages($("#announcementFullImages"), nextAnnouncement);
      } else {
        $("#announcementFullTopic").textContent = "公告";
        $("#announcementFullTitle").textContent = "無法開啟公告";
        $("#announcementFullTime").textContent = "";
        renderSafeAnnouncementBody($("#announcementFullBody"), "公告內容暫時無法載入，請返回公告列表後再試。");
        renderAnnouncementImages($("#announcementFullImages"), null);
      }
      setVisibleAnnouncementModal("#announcementFullModal");
      void loadComments(nextAnnouncement);
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
        if (isAutoPreviewDismissed(latest)) {
          runtimePreviewShown = true;
          return false;
        }
        showPreview(latest, { auto: true });
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

  function revokeAdminImagePreviews() {
    adminImageItems.forEach((item) => {
      if (item.kind === "new" && item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });
  }

  function renderAdminImages() {
    const list = $("#announcementAdminImageList");
    list.replaceChildren();
    adminImageItems.forEach((item, index) => {
      const row = document.createElement("div");
      row.className = "announcement-admin-image-item";
      const image = document.createElement("img");
      image.alt = `公告圖片 ${index + 1}`;
      image.src = item.kind === "existing"
        ? auth()?.getAnnouncementImageUrl?.(item.path, item.version) || ""
        : item.previewUrl;
      const label = document.createElement("span");
      label.textContent = index === 0 ? "封面圖片" : `第 ${index + 1} 張`;
      const controls = document.createElement("div");
      [["上移", -1], ["下移", 1]].forEach(([text, offset]) => {
        const button = document.createElement("button");
        button.type = "button"; button.textContent = text;
        button.disabled = index + offset < 0 || index + offset >= adminImageItems.length;
        button.addEventListener("click", () => {
          const target = index + offset;
          [adminImageItems[index], adminImageItems[target]] = [adminImageItems[target], adminImageItems[index]];
          adminImagesDirty = true;
          renderAdminImages();
        });
        controls.append(button);
      });
      const remove = document.createElement("button");
      remove.type = "button"; remove.textContent = "移除";
      remove.addEventListener("click", () => {
        const [removed] = adminImageItems.splice(index, 1);
        if (removed?.kind === "new" && removed.previewUrl) URL.revokeObjectURL(removed.previewUrl);
        adminImagesDirty = true;
        renderAdminImages();
      });
      controls.append(remove);
      row.append(image, label, controls);
      list.append(row);
    });
  }

  async function resetAdminForm(announcement = null) {
    revokeAdminImagePreviews();
    adminImageItems = [];
    adminImagesDirty = false;
    adminEditingId = announcement?.id || null;
    $("#announcementAdminTopic").value = announcement?.large_topic || "";
    $("#announcementAdminHeadline").value = announcement?.title || "";
    $("#announcementAdminBody").value = announcement?.body || "";
    const date = announcement?.published_at ? new Date(announcement.published_at) : new Date(Date.now() + 60_000);
    $("#announcementAdminPublishedAt").value = new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    $("#announcementAdminImage").value = "";
    $("#announcementAdminLinkText").value = "";
    $("#announcementAdminLinkUrl").value = "";
    $("#announcementAdminLinkStatus").textContent = "";
    $("#announcementAdminStatus").textContent = "";
    renderAdminImages();
    if (!adminEditingId) return;
    const { data, error } = await auth()?.leaderboardRpc?.("get_admin_announcement_images", { p_announcement_id: adminEditingId }) || {};
    if (error) {
      $("#announcementAdminStatus").textContent = "公告圖片暫時無法載入。";
      return;
    }
    adminImageItems = (Array.isArray(data) ? data : []).map((item) => ({
      kind: "existing",
      path: item.image_path,
      version: Number(item.image_version || 1),
    }));
    if (!adminImageItems.length && announcement?.image_path) {
      adminImageItems = [{ kind: "existing", path: announcement.image_path, version: Number(announcement.image_version || 1) }];
    }
    renderAdminImages();
  }

  async function loadAdminList() {
    const { data, error } = await auth()?.leaderboardRpc?.("get_admin_announcements") || {};
    if (error) throw error;
    const list = $("#announcementAdminList"); list.replaceChildren();
    (Array.isArray(data) ? data : []).forEach((announcement) => {
      const button = document.createElement("button"); button.type = "button"; button.className = "announcement-list-item announcement-admin-list-item";
      const copy = document.createElement("span");
      const topic = document.createElement("span"); topic.className = "announcement-admin-list-topic"; topic.textContent = announcement.large_topic || "公告";
      const title = document.createElement("strong"); title.textContent = announcement.title;
      const state = document.createElement("small"); state.textContent = announcement.is_published ? "已發布" : "草稿";
      copy.append(topic, title, state); button.append(copy); button.addEventListener("click", () => void resetAdminForm(announcement)); list.append(button);
    });
  }

  async function openAdmin() {
    const { data, error } = await auth()?.leaderboardRpc?.("get_announcement_admin_status") || {};
    const allowed = Array.isArray(data) ? data[0]?.is_admin === true : data?.is_admin === true || data === true;
    if (error || !allowed) {
      global.chromaticaApp?.showNonBlockingToast?.("此帳號沒有公告管理權限。");
      return;
    }
    void resetAdminForm(); setVisibleAnnouncementModal("#announcementAdminModal");
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
    if (adminImagesDirty) {
      const newItems = adminImageItems.filter((item) => item.kind === "new");
      const newIndex = new Map(newItems.map((item, index) => [item, index]));
      const form = new FormData();
      form.append("announcement_id", adminEditingId);
      newItems.forEach((item) => form.append("files", item.file, item.file.name || "announcement"));
      form.append("image_order", JSON.stringify(adminImageItems.map((item) => item.kind === "existing"
        ? { kind: "existing", path: item.path }
        : { kind: "new", index: newIndex.get(item) })));
      const upload = await auth().invokeFunction("upload-announcement-image", form);
      if (upload.error) { $("#announcementAdminStatus").textContent = "公告已儲存，但圖片更新失敗，原圖片仍保留。"; return; }
    }
    sessionStorage.removeItem(CACHE_KEY);
    await loadAdminList();
    const current = (await auth().leaderboardRpc("get_admin_announcements")).data;
    const refreshed = (Array.isArray(current) ? current : []).find((item) => item.id === adminEditingId);
    if (refreshed) await resetAdminForm(refreshed);
    if (intent === "publish") setVisibleAnnouncementModal("#announcementPublishSuccessModal");
    else $("#announcementAdminStatus").textContent = "草稿已儲存。";
  }

  async function deleteAdmin() {
    if (!adminEditingId) return;
    if (!global.confirm?.("確定要刪除這則公告嗎？公告圖片與留言也會一併刪除。")) return;
    if (!global.confirm?.("再次確認：刪除後無法復原，確定繼續嗎？")) return;
    const { error } = await auth().invokeFunction("upload-announcement-image", { announcement_id: adminEditingId }, { method: "DELETE" });
    $("#announcementAdminStatus").textContent = error ? "公告刪除失敗，資料未變更。" : "公告已刪除。";
    if (!error) {
      sessionStorage.removeItem(CACHE_KEY);
      await loadAdminList();
      await resetAdminForm();
    }
  }

  function appendAdminImages(files) {
    const accepted = Array.from(files || []).filter((file) => (
      file.size > 0
      && file.size <= MAX_IMAGE_BYTES
      && ["image/jpeg", "image/png", "image/webp"].includes(file.type)
    ));
    if (accepted.length !== Array.from(files || []).length) {
      $("#announcementAdminStatus").textContent = "圖片必須是 5 MB 以下的 JPEG、PNG 或 WebP。";
    }
    const room = Math.max(0, MAX_IMAGES - adminImageItems.length);
    accepted.slice(0, room).forEach((file) => {
      adminImageItems.push({ kind: "new", file, previewUrl: URL.createObjectURL(file) });
    });
    if (accepted.length > room) $("#announcementAdminStatus").textContent = "每則公告最多 10 張圖片。";
    if (accepted.length && room) adminImagesDirty = true;
    $("#announcementAdminImage").value = "";
    renderAdminImages();
  }

  function insertAdminLink() {
    const label = String($("#announcementAdminLinkText").value || "").trim();
    const href = safeHttpUrl($("#announcementAdminLinkUrl").value);
    if (!label || !href) {
      $("#announcementAdminLinkStatus").textContent = "請輸入連結文字及有效的 http／https 網址。";
      return;
    }
    const textarea = $("#announcementAdminBody");
    const start = Number(textarea.selectionStart ?? textarea.value.length);
    const end = Number(textarea.selectionEnd ?? start);
    const markdown = `[${label.replace(/[\[\]\n]/gu, "")}](${href})`;
    textarea.setRangeText(markdown, start, end, "end");
    textarea.focus();
    $("#announcementAdminLinkStatus").textContent = "";
  }

  function previewAdminDraft() {
    showPreview({
      large_topic: $("#announcementAdminTopic").value,
      title: $("#announcementAdminHeadline").value,
      body: $("#announcementAdminBody").value,
      published_at: new Date($("#announcementAdminPublishedAt").value).toISOString(),
      image_path: "",
      image_paths: adminImageItems.map((item) => item.kind === "existing" ? item.path : ""),
      image_versions: adminImageItems.map((item) => item.kind === "existing" ? item.version : 1),
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
    else if (visibleModalSelector === "#announcementPublishSuccessModal") setVisibleAnnouncementModal("#announcementAdminModal");
    else setVisibleAnnouncementModal("");
    return true;
  }

  function bind() {
    document.querySelectorAll("[data-announcement-close]").forEach((button) => button.addEventListener("click", closePreview));
    document.querySelectorAll("[data-announcement-full-close]").forEach((button) => button.addEventListener("click", closeFull));
    document.querySelectorAll("[data-announcement-list-close], [data-announcement-admin-close]").forEach((button) => button.addEventListener("click", () => setVisibleAnnouncementModal("")));
    $("#announcementReadMore").addEventListener("click", () => showFull(activeAnnouncement, { returnTo: previewReturnSelector }));
    $("#announcementPreviewBody").addEventListener("click", () => showFull(activeAnnouncement, { returnTo: previewReturnSelector }));
    $("#announcementPreviewDismiss")?.addEventListener("change", (event) => {
      setAutoPreviewDismissed(activeAnnouncement, event.target.checked === true);
    });
    $("#announcementsOpen")?.addEventListener("click", () => void showList());
    $("#announcementAdminOpen")?.addEventListener("click", () => void openAdmin());
    $("#announcementAdminForm")?.addEventListener("submit", (event) => void saveAdmin(event));
    $("#announcementAdminNew")?.addEventListener("click", () => void resetAdminForm());
    $("#announcementAdminDelete")?.addEventListener("click", () => void deleteAdmin());
    $("#announcementAdminInsertLink")?.addEventListener("click", insertAdminLink);
    $("#announcementPublishSuccessConfirm")?.addEventListener("click", () => setVisibleAnnouncementModal("#announcementAdminModal"));
    $("#announcementAdminImage")?.addEventListener("change", (event) => appendAdminImages(event.target.files));
    $("#announcementAdminPreview")?.addEventListener("click", previewAdminDraft);
    $("#announcementCommentForm")?.addEventListener("submit", (event) => void submitComment(event));
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
    announcementPlainText,
    safeHttpUrl,
    showList,
    showFull,
    closeTopModal,
    maybeShowLatestOnHome: maybeShowLatestAnnouncementOnHome,
  });
})(typeof window !== "undefined" ? window : globalThis);
