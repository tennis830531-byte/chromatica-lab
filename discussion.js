(function initDiscussion(global) {
  "use strict";
  const Core = global.ChromaticaDiscussionCore;
  if (!Core) return;
  const $ = (selector, root = document) => root.querySelector(selector);
  const qaKey = "chromatica.discussion.qa.v1";
  const qaTurnstileSiteKey = "1x00000000000000000000AA";
  const turnstileScriptUrl = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  const state = {
    tab: "hot", page: 1, posts: [], currentPost: null, comments: [],
    screen: "list", loading: false, error: "", submitting: false,
    nextPostAllowedAt: 0, nextCommentAllowedAt: 0,
    captcha: { status: "missing", token: "", action: "" },
    postDraft: { category: "", title: "", body: "" }, commentDraft: "",
    postAttachments: [], commentAttachments: [],
    postDraftId: "", commentDraftId: "",
    attachmentError: "",
    qaCommentsByPost: {},
    qa: false, qaScenario: "populated", qaAdminPreview: false,
    isAdmin: false, initialized: false,
  };
  let cooldownTimer = 0;
  let turnstileWidgetId = null;
  let turnstileWidgetSlot = null;
  let turnstileScriptPromise = null;
  let filePickerActive = false;
  let discussionWasOpen = false;
  const unreadSeenKeyPrefix = "chromatica.discussion.last-seen.v1";

  function isGardenQa() {
    return Boolean(global.ChromaticaGardenQA?.isActive?.());
  }
  function showAdminControls() {
    return state.isAdmin || (state.qa && state.qaAdminPreview);
  }
  function profile() {
    return global.chromaticaAuth?.getPublicUserProfile?.() || null;
  }
  function unreadSeenKey() {
    const userId = String(profile()?.id || "");
    return userId ? `${unreadSeenKeyPrefix}:${userId}` : "";
  }
  function setUnreadBadge(count) {
    const badge = document.querySelector("[data-discussion-unread]");
    if (!badge) return;
    const safeCount = Math.max(0, Number(count) || 0);
    badge.hidden = safeCount <= 0;
    badge.textContent = safeCount > 99 ? "99+" : String(safeCount);
    badge.setAttribute("aria-label", safeCount > 0 ? `${safeCount} 篇新文章` : "沒有新文章");
  }
  function markDiscussionSeen() {
    const key = unreadSeenKey();
    if (key) {
      try { localStorage.setItem(key, new Date().toISOString()); } catch {}
    }
    setUnreadBadge(0);
  }
  async function refreshUnreadBadge() {
    const key = unreadSeenKey();
    if (!key || isGardenQa()) { setUnreadBadge(0); return; }
    let seenAt = 0;
    try { seenAt = new Date(localStorage.getItem(key) || 0).getTime() || 0; } catch {}
    try {
      const data = await api("list_posts", { tab: "latest", limit: 100 });
      const unreadCount = (Array.isArray(data?.posts) ? data.posts : [])
        .filter((post) => post.status === "published" && new Date(post.created_at).getTime() > seenAt)
        .length;
      setUnreadBadge(unreadCount);
    } catch {
      // Keep the last visible count when the network is temporarily unavailable.
    }
  }
  function escape(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }
  function formatTime(value) {
    try { return new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
    catch { return ""; }
  }
  function avatarMarkup(item) {
    const path = String(item.author_avatar_path || "");
    const url = String(
      item.author_avatar_url
      || item.avatarUrl
      || (path ? global.chromaticaAuth?.getLeaderboardAvatarUrl?.(path, item.author_avatar_version || 0) : "")
      || "",
    );
    return url
      ? `<img class="discussion-avatar" src="${escape(url)}" alt="" />`
      : `<span class="discussion-avatar discussion-avatar-fallback" aria-hidden="true">♪</span>`;
  }
  function draftAttachments() {
    return state.screen === "compose" ? state.postAttachments : state.commentAttachments;
  }
  function formatBytes(value) {
    const bytes = Number(value || 0);
    if (bytes < 1024 * 1024) return `${Math.max(0, bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
  function safeHttpUrl(value) {
    try {
      const url = new URL(String(value || ""), global.location?.href || "https://localhost/");
      return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
    } catch { return ""; }
  }
  function stopMedia(root = document) {
    root.querySelectorAll("video").forEach((video) => { video.pause(); video.removeAttribute("src"); video.load(); });
    root.querySelectorAll('iframe[src*="youtube-nocookie.com"]').forEach((frame) => { frame.src = "about:blank"; });
  }
  function releaseAttachments(items) {
    items.forEach((item) => {
      if (item.objectUrl) URL.revokeObjectURL(item.objectUrl);
      item.abort?.abort?.();
    });
    items.length = 0;
  }
  function previewLinks(body) {
    return Core.extractPreviewUrls(body).map((originalUrl) => {
      const youtube = Core.parseYouTubeUrl(originalUrl);
      return youtube ? {
        original_url: originalUrl, normalized_url: youtube.normalizedUrl, provider: "youtube",
        site_name: "YouTube", title: "YouTube 影片", description: "",
        thumbnail_url: `https://i.ytimg.com/vi/${youtube.videoId}/hqdefault.jpg`,
        embed_url: youtube.embedUrl, status: "ready",
      } : { original_url: originalUrl, normalized_url: originalUrl, provider: "", status: "pending" };
    });
  }
  function renderLinkPreviews(items = [], detail = false) {
    const unique = [...new Map(items.filter((item) => item?.normalized_url).map((item) => [item.normalized_url, item])).values()].slice(0, Core.LIMITS.linkPreviewCount);
    if (!unique.length) return "";
    return `<div class="discussion-link-previews">${unique.map((item) => {
      const href = safeHttpUrl(item.normalized_url || item.original_url);
      if (!href) return "";
      const thumbnail = safeHttpUrl(item.thumbnail_url);
      const embed = item.provider === "youtube" && /^https:\/\/www\.youtube-nocookie\.com\/embed\/[A-Za-z0-9_-]{11}$/.test(String(item.embed_url || "")) ? item.embed_url : "";
      if (detail && embed) return `<div class="discussion-youtube"><iframe src="${escape(embed)}" title="${escape(item.title || "YouTube 影片")}" loading="lazy" allow="accelerometer; encrypted-media; picture-in-picture" sandbox="allow-scripts allow-same-origin allow-presentation" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>`;
      return `<a class="discussion-link-card" href="${escape(href)}" target="_blank" rel="noopener noreferrer">${thumbnail ? `<img src="${escape(thumbnail)}" alt="" referrerpolicy="no-referrer" />` : ""}<span><small>${escape(item.site_name || new URL(href).hostname)}</small><strong>${escape(item.title || (item.status === "failed" ? "無法取得預覽" : href))}</strong>${item.description ? `<em>${escape(Core.excerpt(item.description, 120))}</em>` : ""}</span></a>`;
    }).join("")}</div>`;
  }
  function renderBoundAttachments(items = [], detail = false, allowDraftUrls = false) {
    if (!items.length) return "";
    const visible = detail ? items : items.slice(0, 4);
    return `<div class="discussion-bound-media ${detail ? "is-detail" : ""}">${visible.map((item) => {
      const localDraftUrl = allowDraftUrls && /^blob:(?:https?:|null\/)/.test(String(item.objectUrl || "")) ? item.objectUrl : "";
      const src = localDraftUrl || safeHttpUrl(item.signed_url || item.url || "");
      if (!src) return `<span class="discussion-media-placeholder">${escape(item.original_filename || item.media_type)}</span>`;
      if (item.media_type === "video") return detail
        ? `<video src="${escape(src)}" controls muted playsinline preload="metadata"></video>`
        : `<span class="discussion-video-thumb"><span aria-hidden="true">▶</span></span>`;
      return `<button type="button" data-discussion-lightbox="${escape(src)}"><img src="${escape(src)}" alt="" /></button>`;
    }).join("")}${!detail && items.length > 4 ? `<b>+${items.length - 4}</b>` : ""}</div>`;
  }
  function attachmentEditorMarkup(items) {
    const total = items.reduce((sum, item) => sum + Number(item.size || 0), 0);
    return `<section class="discussion-attachment-editor">
      <div class="discussion-attachment-heading"><strong>圖片與影片</strong><span>${items.length} / ${Core.LIMITS.attachmentCount}・${formatBytes(total)}</span></div>
      <label class="secondary-btn discussion-file-picker">新增圖片或影片<input data-discussion-files type="file" accept="image/*,video/*" multiple /></label>
      <small class="discussion-file-picker-hint">可一次選取多張，圖片與影片合計最多 ${Core.LIMITS.attachmentCount} 個。</small>
      ${state.attachmentError ? `<p class="discussion-attachment-error" role="alert">${escape(state.attachmentError)}</p>` : ""}
      <div class="discussion-attachment-list">${items.map((item, index) => `<article class="discussion-attachment-item" data-attachment-index="${index}">
        ${item.kind === "video" ? `<video src="${escape(item.objectUrl || "")}" muted playsinline controls preload="metadata"></video>` : `<button type="button" data-discussion-lightbox="${escape(item.objectUrl || "")}" aria-label="放大查看圖片"><img src="${escape(item.objectUrl || "")}" alt="" /></button>`}
        <div class="discussion-attachment-meta">${item.kind === "video" ? `<strong>${escape(item.name)}</strong>` : ""}<small>${item.kind === "image" ? "圖片" : escape(item.type)}・${formatBytes(item.size)}</small><progress max="100" value="${Number(item.progress || 0)}"></progress><span>${escape(item.statusLabel || "等待上傳")}</span></div>
        <div class="discussion-attachment-controls">${item.status === "failed" ? `<button type="button" data-attachment-retry>重試</button>` : ""}<button type="button" data-attachment-remove>刪除</button></div>
      </article>`).join("")}</div>
      ${items.length ? `<p>已上傳 ${items.filter((item) => item.status === "uploaded").length} / ${items.length}</p>` : ""}
    </section>`;
  }
  function mockPosts() {
    const me = profile() || { id: "qa-user", displayName: "QA 練習者", avatarUrl: "" };
    const now = Date.now();
    return [
      { id: "qa-post-1", author_id: me.id, author_display_name: me.displayName, author_avatar_url: me.avatarUrl, category: "harmonica_technique", title: "如何讓長音更穩定？", body: "最近練習長音時，想請教大家如何控制氣息，讓每個音更穩定。https://youtu.be/dQw4w9WgXcQ", status: "published", comment_count: 3, created_at: new Date(now - 3600000).toISOString(), last_activity_at: new Date(now - 600000).toISOString(),
        is_pinned: true, pinned_at: new Date(now - 300000).toISOString(),
        attachments: [{ id: "qa-media-1", media_type: "image", original_filename: "練習照片.png", url: "assets/chromatic-refresh/feature/discussion-forum-icon.png" }],
        link_previews: previewLinks("https://youtu.be/dQw4w9WgXcQ") },
      { id: "qa-post-2", author_id: "qa-friend", author_display_name: "口琴旅人", author_avatar_url: "", category: "harmonica_hardware", title: "十六孔口琴清潔心得", body: "整理了日常保養與清潔時會注意的幾個步驟。", status: "published", comment_count: 8, created_at: new Date(now - 86400000).toISOString(), last_activity_at: new Date(now - 120000).toISOString() },
      { id: "qa-post-3", author_id: "qa-music", author_display_name: "森林演奏家", author_avatar_url: "", category: "music_sharing", title: "分享一段週末練習曲", body: "<script>globalThis.__discussionXss = true</script> 這段文字必須安全顯示。", status: "published", comment_count: 1, created_at: new Date(now - 7200000).toISOString(), last_activity_at: new Date(now - 7000000).toISOString() },
    ];
  }
  function mockComments(postId) {
    return [
      { id: `${postId}-comment-1`, post_id: postId, author_id: "qa-friend", author_display_name: "口琴旅人", body: "先把速度放慢，專注讓每次吸吐氣維持一致。", status: "published", created_at: new Date(Date.now() - 300000).toISOString(), attachments: [], link_previews: [] },
      { id: `${postId}-comment-2`, post_id: postId, author_id: profile()?.id || "qa-user", author_display_name: profile()?.displayName || "QA 練習者", body: "謝謝分享，我會試試看！", status: "published", created_at: new Date(Date.now() - 120000).toISOString() },
    ];
  }
  function applyQaMediaScenario(value) {
    if (!state.qa) return;
    releaseAttachments(state.postAttachments);
    const counts = { "one-image": 1, "four-images": 4, "ten-attachments": 10, "mixed-media": 2, uploading: 1, "upload-failed": 1 };
    const count = counts[value] || 0;
    if (!count) return;
    state.screen = "compose";
    state.postDraft = { category: "music_sharing", title: "QA 附件預覽", body: "https://youtu.be/dQw4w9WgXcQ" };
    for (let index = 0; index < count; index += 1) {
      const video = value === "mixed-media" && index === 1;
      const type = video ? "video/mp4" : "image/png";
      const file = new File([new Uint8Array(128 + index)], `qa-${index + 1}.${video ? "mp4" : "png"}`, { type });
      state.postAttachments.push({
        id: `qa-media-${index}`, file, name: file.name, type, size: file.size,
        kind: video ? "video" : "image", objectUrl: URL.createObjectURL(file),
        status: value === "uploading" ? "uploading" : value === "upload-failed" ? "failed" : "uploaded",
        statusLabel: value === "uploading" ? "上傳中" : value === "upload-failed" ? "失敗" : "已完成",
        progress: value === "uploading" ? 48 : value === "upload-failed" ? 35 : 100,
      });
    }
  }

  function ensureView() {
    if ($("#discussion")) return;
    const main = $("#appMain") || $("main");
    if (!main) return;
    const section = document.createElement("section");
    section.id = "discussion";
    section.className = "view discussion-view";
    section.innerHTML = `
      <div class="discussion-shell">
        <header class="discussion-header">
          <span class="discussion-header-icon" aria-hidden="true"><img src="./public/assets/chromatic-refresh/feature/discussion-forum-icon.png" alt="" /></span>
          <div><p class="eyebrow">Chromatic Harmonica Club</p><h2>討論吧</h2><p>一起分享口琴、音樂與練習心得。</p></div>
          <button class="discussion-new primary-btn" type="button" aria-label="新增文章" title="新增文章">+</button>
        </header>
        <nav class="discussion-tabs" aria-label="討論吧分類"></nav>
        <div class="discussion-qa-panel hidden" aria-label="討論吧 QA 控制"></div>
        <div class="discussion-status" role="status" aria-live="polite"></div>
        <div class="discussion-content"></div>
      </div>`;
    main.append(section);
    bind(section);
  }

  function renderTabs(root) {
    const tabButton = (tab) =>
      `<button class="${state.tab === tab.id ? "active" : ""}" data-discussion-tab="${escape(tab.id)}" type="button">${escape(tab.label)}</button>`;
    $(".discussion-tabs", root).innerHTML = `
      <div class="discussion-tab-row discussion-tab-modes">${Core.TABS.slice(0, 2).map(tabButton).join("")}</div>
      <div class="discussion-tab-row discussion-tab-categories">${Core.TABS.slice(2).map(tabButton).join("")}</div>`;
  }
  function renderQa(root) {
    const panel = $(".discussion-qa-panel", root);
    state.qa = isGardenQa();
    panel.classList.toggle("hidden", !state.qa);
    if (!state.qa) return;
    const scenarioLabels = {
      populated: "有文章列表",
      empty: "無文章列表",
      "load-error": "載入失敗",
      "captcha-failed": "CAPTCHA 失敗",
      "captcha-expired": "CAPTCHA 過期",
      "captcha-replay": "Token 重放",
      cooldown: "冷卻剩餘 2 分 34 秒",
      "post-failed": "發文失敗",
      "comment-failed": "留言失敗",
      "deleted-post": "已刪除文章",
      "deleted-comment": "已刪除留言",
      "one-image": "1 張圖片",
      "four-images": "4 張圖片",
      "ten-attachments": "10 個附件",
      "mixed-media": "圖片與影片混合",
      "uploading": "附件上傳中",
      "upload-failed": "附件上傳失敗",
      "metadata-failed": "網址預覽失敗",
      "ssrf-rejected": "SSRF 網址拒絕",
      narrow: "窄螢幕",
    };
    panel.innerHTML = `
      <strong class="discussion-qa-title">討論吧管理模式</strong>
      <label>情境<select data-discussion-qa-scenario>
        ${Object.entries(scenarioLabels).map(([value, label]) => `<option value="${value}" ${state.qaScenario === value ? "selected" : ""}>${label}</option>`).join("")}
      </select></label>
      <div class="discussion-qa-actions">
        <button data-discussion-qa-admin-preview type="button" aria-pressed="${state.qaAdminPreview}">${state.qaAdminPreview ? "關閉管理介面預覽" : "顯示管理介面預覽"}</button>
        <button data-discussion-qa-captcha="success" type="button">CAPTCHA 成功</button>
        <button data-discussion-qa-captcha="missing" type="button">CAPTCHA 未完成</button>
        <button data-discussion-qa-reset type="button">重置 QA</button>
      </div>`;
  }
  function renderStatus(root) {
    const status = $(".discussion-status", root);
    status.dataset.kind = state.error ? "error" : "";
    status.textContent = state.error || "";
  }
  function renderList(root) {
    const source = state.qa ? (state.qaScenario === "empty" ? [] : state.posts) : state.posts;
    const sorted = Core.sortPosts(source, state.tab);
    const visible = sorted.slice(0, state.page * Core.LIMITS.pageSize);
    if (state.loading) return `<div class="discussion-state paper-card">討論內容載入中…</div>`;
    if (state.qa && state.qaScenario === "load-error") return `<div class="discussion-state paper-card"><strong>目前無法載入討論吧</strong><p>請確認網路後再試。</p><button data-discussion-retry type="button">重新載入</button></div>`;
    if (state.error) return `<div class="discussion-state paper-card"><strong>目前無法載入討論吧</strong><p>請確認網路後再試。</p><button data-discussion-retry type="button">重新載入</button></div>`;
    if (!visible.length) return `<div class="discussion-state paper-card"><strong>目前還沒有文章</strong><p>成為第一個分享練習心得的人吧！</p></div>`;
    return `<div class="discussion-list">${visible.map((post) => `
      <article class="discussion-post-card paper-card" data-discussion-post="${escape(post.id)}" tabindex="0">
        <div class="discussion-card-labels"><span class="discussion-category">${escape(Core.CATEGORY_LABELS[post.category] || "")}</span>${post.is_pinned ? `<span class="discussion-pinned-badge">置頂</span>` : ""}</div>
        <h3>${escape(post.title)}</h3>
        <p>${escape(Core.excerpt(post.body || "（無內文）"))}</p>
        ${renderBoundAttachments(post.attachments || [], false, state.qa)}
        ${renderLinkPreviews(post.link_previews || [], false)}
        <footer>${avatarMarkup(post)}<span><strong>${escape(post.author_display_name || "練習者")}</strong><small>${escape(formatTime(post.created_at))}</small></span><b>${Number(post.comment_count || 0)} 則留言</b></footer>
        ${showAdminControls() ? `<div class="discussion-admin-actions"><button data-discussion-pin-post="${escape(post.id)}" data-pinned="${post.is_pinned ? "true" : "false"}" type="button">${post.is_pinned ? "取消置頂" : "置頂"}</button><button data-discussion-admin-delete-post="${escape(post.id)}" type="button">管理刪除</button></div>` : ""}
      </article>`).join("")}</div>
      ${visible.length < sorted.length ? `<button class="discussion-load-more secondary-btn" type="button">載入更多</button>` : ""}`;
  }
  function captchaMarkup(action) {
    const ready = state.captcha.status === "success" && state.captcha.action === action;
    const useWidget = state.qa || Boolean(global.CHROMATICA_TURNSTILE_SITE_KEY);
    return `<section class="discussion-captcha ${ready ? "is-ready" : ""}">
      <strong>Cloudflare Turnstile 驗證${state.qa ? "（官方測試模式）" : ""}</strong>
      <p>${ready ? "驗證完成，本次送出後即失效。" : "每次發表都需要完成新的驗證。"}</p>
      ${ready
        ? `<div class="discussion-captcha-complete" role="status">驗證完成</div>`
        : useWidget
          ? `<div class="discussion-turnstile-slot" data-turnstile-action="${escape(action)}"><span>驗證元件準備中</span></div>`
          : `<p class="discussion-captcha-unavailable">驗證服務尚未設定。</p>`}
    </section>`;
  }
  function captchaReady(action) {
    return state.captcha.status === "success"
      && state.captcha.action === action
      && Boolean(state.captcha.token);
  }
  function cooldownSeconds(action) {
    const nextAllowedAt = action === "create_post"
      ? state.nextPostAllowedAt
      : state.nextCommentAllowedAt;
    return Math.max(0, Math.ceil((nextAllowedAt - Date.now()) / 1000));
  }
  function cooldownMarkup(action) {
    const seconds = cooldownSeconds(action);
    return `<p class="discussion-cooldown-message" data-discussion-cooldown="${escape(action)}" ${seconds ? "" : "hidden"}>${seconds ? escape(Core.formatRetryAfter(seconds, action)) : ""}</p>`;
  }
  function renderComposer() {
    const captchaIsReady = captchaReady("create_post");
    const postCooldown = cooldownSeconds("create_post");
    const postIsBusy = state.submitting || postCooldown > 0 || state.postAttachments.some((item) => item.status === "uploading");
    return `<form class="discussion-composer paper-card">
      <h3>新增文章</h3>
      <label>分類<select name="category" required><option value="">請選擇</option>${Object.entries(Core.CATEGORY_LABELS).map(([id, label]) => `<option value="${id}" ${state.postDraft.category === id ? "selected" : ""}>${escape(label)}</option>`).join("")}</select></label>
      <label>標題<input name="title" value="${escape(state.postDraft.title)}" minlength="${Core.LIMITS.titleMin}" maxlength="${Core.LIMITS.titleMax}" required /></label>
      <label>內文<textarea name="body" maxlength="${Core.LIMITS.bodyMax}" rows="8">${escape(state.postDraft.body)}</textarea></label>
      ${attachmentEditorMarkup(state.postAttachments)}
      ${renderLinkPreviews(previewLinks(state.postDraft.body), true)}
      ${captchaMarkup("create_post")}
      <div class="discussion-form-error" role="alert"></div>
      <div class="discussion-actions"><button class="secondary-btn" data-discussion-cancel type="button">取消</button><button class="secondary-btn" data-discussion-preview type="button">預覽</button><button class="primary-btn" type="submit" ${postIsBusy || !captchaIsReady ? "disabled" : ""}>${state.submitting ? "發表中…" : postCooldown ? "冷卻中" : captchaIsReady ? "發表" : "等待驗證"}</button></div>
      ${cooldownMarkup("create_post")}
    </form>`;
  }
  function renderPreview(root, values) {
    const result = Core.validatePost(values);
    if (!result.ok) { $(".discussion-form-error", root).textContent = result.message; return; }
    let modal = $("#discussionPostPreview");
    if (!modal) {
      modal = document.createElement("dialog");
      modal.id = "discussionPostPreview";
      modal.className = "discussion-preview-modal";
      modal.innerHTML = `<div class="discussion-preview paper-card"></div>`;
      modal.addEventListener("click", (event) => {
        if (event.target === modal || event.target.closest("[data-discussion-close-preview]")) modal.close();
      });
      document.body.append(modal);
    }
    $(".discussion-preview", modal).innerHTML = `<button class="discussion-preview-close" data-discussion-close-preview type="button" aria-label="關閉預覽">×</button><span class="discussion-category">${escape(Core.CATEGORY_LABELS[result.value.category])}</span><h3>${escape(result.value.title)}</h3><p>${escape(result.value.body || "（無內文）")}</p>${renderBoundAttachments(draftAttachments().map((item) => ({ ...item, media_type: item.kind })), true, true)}${renderLinkPreviews(previewLinks(result.value.body), true)}<small>這是預覽，不會寫入資料庫。</small>`;
    if (!modal.open) modal.showModal();
  }
  function renderDetail() {
    const post = state.currentPost;
    if (!post || post.status !== "published") return `<div class="discussion-state paper-card"><strong>文章不存在或已刪除</strong><button data-discussion-list type="button">返回文章列表</button></div>`;
    const me = profile();
    const captchaIsReady = captchaReady("create_comment");
    const commentCooldown = cooldownSeconds("create_comment");
    const commentIsBusy = state.submitting || commentCooldown > 0 || state.commentAttachments.some((item) => item.status === "uploading");
    return `<article class="discussion-detail paper-card">
      <button data-discussion-list class="discussion-inline-back" type="button">← 返回文章列表</button>
      <div class="discussion-card-labels"><span class="discussion-category">${escape(Core.CATEGORY_LABELS[post.category])}</span>${post.is_pinned ? `<span class="discussion-pinned-badge">置頂</span>` : ""}</div>
      <h3>${escape(post.title)}</h3><p class="discussion-body">${escape(post.body || "（無內文）")}</p>
      ${renderBoundAttachments(post.attachments || [], true, true)}
      ${renderLinkPreviews(post.link_previews || [], true)}
      <footer>${avatarMarkup(post)}<span><strong>${escape(post.author_display_name || "練習者")}</strong><small>${escape(formatTime(post.created_at))}</small></span></footer>
      ${me?.id === post.author_id ? `<button class="discussion-delete" data-discussion-delete-post type="button">刪除自己的文章</button>` : ""}
      ${showAdminControls() ? `<div class="discussion-admin-actions"><button data-discussion-pin-post="${escape(post.id)}" data-pinned="${post.is_pinned ? "true" : "false"}" type="button">${post.is_pinned ? "取消置頂" : "置頂"}</button><button data-discussion-admin-delete-post="${escape(post.id)}" type="button">管理刪除文章</button></div>` : ""}
    </article>
    <section class="discussion-comments">
      <h3>${Number(post.comment_count || state.comments.length)} 則留言</h3>
      ${state.comments.filter((item) => item.status === "published").map((item) => `<article class="discussion-comment paper-card">${avatarMarkup(item)}<div><header><strong>${escape(item.author_display_name || "練習者")}</strong><small>${escape(formatTime(item.created_at))}</small></header><p>${escape(item.body)}</p>${renderBoundAttachments(item.attachments || [], true, true)}${renderLinkPreviews(item.link_previews || [], true)}${me?.id === item.author_id ? `<button data-discussion-delete-comment="${escape(item.id)}" type="button">刪除</button>` : ""}${showAdminControls() ? `<button class="discussion-admin-delete" data-discussion-admin-delete-comment="${escape(item.id)}" type="button">管理刪除</button>` : ""}</div></article>`).join("") || `<p class="discussion-state paper-card">還沒有留言。</p>`}
    </section>
    <form class="discussion-comment-form paper-card"><label>新增留言<textarea name="body" maxlength="${Core.LIMITS.commentMax}" rows="4">${escape(state.commentDraft)}</textarea></label>${attachmentEditorMarkup(state.commentAttachments)}${renderLinkPreviews(previewLinks(state.commentDraft), true)}${captchaMarkup("create_comment")}<div class="discussion-form-error" role="alert"></div><button class="primary-btn" type="submit" ${commentIsBusy || !captchaIsReady ? "disabled" : ""}>${state.submitting ? "留言送出中…" : commentCooldown ? "冷卻中" : captchaIsReady ? "送出留言" : "等待驗證"}</button>${cooldownMarkup("create_comment")}</form>`;
  }
  function captureDraft(form) {
    if (!form) return;
    const values = Object.fromEntries(new FormData(form));
    if (form.matches(".discussion-composer")) {
      state.postDraft = {
        category: String(values.category || ""),
        title: String(values.title || ""),
        body: String(values.body || ""),
      };
    } else if (form.matches(".discussion-comment-form")) {
      state.commentDraft = String(values.body || "");
    }
  }
  function captureVisibleDraft() {
    captureDraft($("#discussion .discussion-composer, #discussion .discussion-comment-form"));
  }
  function render() {
    ensureView();
    const root = $("#discussion");
    if (!root) return;
    renderTabs(root); renderQa(root); renderStatus(root);
    releaseTurnstileWidget();
    $(".discussion-content", root).innerHTML = state.screen === "compose" ? renderComposer() : state.screen === "detail" ? renderDetail() : renderList(root);
    mountTurnstile();
  }
  function releaseTurnstileWidget() {
    if (turnstileWidgetId !== null) {
      try { global.turnstile?.remove?.(turnstileWidgetId); } catch {}
      turnstileWidgetId = null;
    }
    turnstileWidgetSlot = null;
  }
  function clearCaptcha() {
    releaseTurnstileWidget();
    state.captcha = { status: "missing", token: "", action: "" };
  }
  function loadTurnstileScript() {
    if (typeof global.turnstile?.render === "function") return Promise.resolve();
    if (turnstileScriptPromise) return turnstileScriptPromise;
    turnstileScriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${turnstileScriptUrl}"]`);
      const script = existing || document.createElement("script");
      const onLoad = () => resolve();
      const onError = () => {
        turnstileScriptPromise = null;
        reject(new Error("turnstile-script-failed"));
      };
      script.addEventListener("load", onLoad, { once: true });
      script.addEventListener("error", onError, { once: true });
      if (!existing) {
        script.src = turnstileScriptUrl;
        script.async = true;
        script.defer = true;
        script.referrerPolicy = "no-referrer";
        document.head.append(script);
      }
    });
    return turnstileScriptPromise;
  }
  function mountTurnstile() {
    if (state.captcha.status === "success" || turnstileWidgetId !== null) return;
    const slot = $(".discussion-turnstile-slot", $("#discussion"));
    const sitekey = state.qa ? qaTurnstileSiteKey : String(global.CHROMATICA_TURNSTILE_SITE_KEY || "");
    if (!slot || !sitekey) return;
    if (typeof global.turnstile?.render !== "function") {
      void loadTurnstileScript()
        .then(() => {
          if ($("#discussion")?.classList.contains("active")) mountTurnstile();
        })
        .catch(() => {
          state.error = "CAPTCHA 目前無法載入，請確認網路後再試。";
          renderStatus($("#discussion"));
        });
      return;
    }
    const action = slot.dataset.turnstileAction;
    try {
      turnstileWidgetSlot = slot;
      turnstileWidgetId = global.turnstile.render(slot, {
        sitekey,
        action,
        callback(token) {
          captureVisibleDraft();
          const completedWidgetId = turnstileWidgetId;
          turnstileWidgetId = null;
          turnstileWidgetSlot = null;
          if (completedWidgetId !== null) {
            try { global.turnstile?.remove?.(completedWidgetId); } catch {}
          }
          state.captcha = { status: "success", token: String(token || ""), action };
          render();
        },
        "expired-callback"() {
          captureVisibleDraft();
          clearCaptcha();
          state.error = "CAPTCHA 已過期，請重新驗證。";
          render();
        },
        "error-callback"() {
          captureVisibleDraft();
          clearCaptcha();
          state.error = "CAPTCHA 驗證失敗，請重新嘗試。";
          render();
        },
      });
    } catch {
      turnstileWidgetSlot = null;
      state.error = "CAPTCHA 目前無法載入。";
      renderStatus($("#discussion"));
    }
  }
  function updateCooldownMessages(root = $("#discussion")) {
    if (!root) return;
    root.querySelectorAll("[data-discussion-cooldown]").forEach((message) => {
      const action = message.dataset.discussionCooldown;
      const seconds = cooldownSeconds(action);
      message.hidden = seconds <= 0;
      message.textContent = seconds ? Core.formatRetryAfter(seconds, action) : "";
      const form = message.closest("form");
      const submit = form?.querySelector('button[type="submit"]');
      if (!submit || state.submitting) return;
      const attachments = action === "create_post" ? state.postAttachments : state.commentAttachments;
      const uploading = attachments.some((item) => item.status === "uploading");
      const ready = captchaReady(action);
      submit.disabled = seconds > 0 || uploading || !ready;
      submit.textContent = seconds > 0 ? "冷卻中" : ready ? (action === "create_post" ? "發表" : "送出留言") : "等待驗證";
    });
  }
  function showSuccessModal(message) {
    let modal = $("#discussionSuccessModal");
    if (!modal) {
      modal = document.createElement("dialog");
      modal.id = "discussionSuccessModal";
      modal.className = "discussion-success-modal";
      modal.innerHTML = `<div class="paper-card"><strong data-discussion-success-message></strong><button class="primary-btn" data-discussion-close-success type="button">確定</button></div>`;
      modal.addEventListener("click", (event) => {
        if (event.target === modal || event.target.closest("[data-discussion-close-success]")) modal.close();
      });
      document.body.append(modal);
    }
    $("[data-discussion-success-message]", modal).textContent = message;
    if (!modal.open) modal.showModal();
  }
  function preferredScrollBehavior() {
    return global.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : "smooth";
  }
  function scrollDiscussionToTop() {
    global.requestAnimationFrame?.(() => {
      $("#discussion")?.scrollIntoView?.({ block: "start", behavior: preferredScrollBehavior() });
    });
  }
  function scrollLatestCommentIntoView() {
    global.requestAnimationFrame?.(() => {
      const comments = Array.from($("#discussion")?.querySelectorAll?.(".discussion-comment") || []);
      comments.at(-1)?.scrollIntoView?.({ block: "center", behavior: preferredScrollBehavior() });
    });
  }
  async function api(action, payload = {}) {
    const result = await global.chromaticaAuth?.invokeFunction?.("discussion-actions", { action, ...payload });
    if (!result) throw new Error("discussion-unavailable");
    if (result.error) {
      let details = null;
      try {
        const response = result.error.context;
        if (response && typeof response.clone === "function") {
          details = await response.clone().json();
        }
      } catch {}
      const retryAfter = Math.max(0, Number(details?.retry_after_seconds || 0));
      if (retryAfter > 0) {
        const nextAllowedAt = Date.now() + retryAfter * 1000;
        if (action === "create_post") state.nextPostAllowedAt = nextAllowedAt;
        if (action === "create_comment") state.nextCommentAllowedAt = nextAllowedAt;
        throw new Error(Core.formatRetryAfter(retryAfter, action));
      }
      throw new Error(String(details?.error || result.error.message || "discussion-unavailable"));
    }
    return result.data;
  }
  async function functionApi(functionName, action, payload = {}) {
    const result = await global.chromaticaAuth?.invokeFunction?.(functionName, { action, ...payload });
    if (!result || result.error) throw result?.error || new Error(`${functionName}-unavailable`);
    return result.data;
  }
  function uploadSigned(item, signedUrl) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      item.abort = { abort: () => xhr.abort() };
      xhr.open("PUT", signedUrl);
      xhr.setRequestHeader("Content-Type", item.type);
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) item.progress = Math.round(event.loaded / event.total * 100);
        render();
      });
      xhr.addEventListener("load", () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("upload-failed")));
      xhr.addEventListener("abort", () => reject(new Error("upload-cancelled")));
      xhr.addEventListener("error", () => reject(new Error("upload-failed")));
      xhr.send(item.file);
    });
  }
  async function uploadAttachment(item, ownerType, draftId, index) {
    if (state.qa) {
      item.status = state.qaScenario === "upload-failed" ? "failed" : "uploaded";
      item.statusLabel = item.status === "uploaded" ? "已完成" : "失敗";
      item.progress = item.status === "uploaded" ? 100 : 35;
      item.id = item.id || `qa-media-${crypto.randomUUID()}`;
      render();
      return;
    }
    item.status = "uploading"; item.statusLabel = "上傳中"; render();
    try {
      const session = await functionApi("discussion-media-actions", "create_upload_session", {
        draft_id: draftId, owner_type: ownerType, original_filename: item.name,
        mime_type: item.type, size_bytes: item.size, sort_order: index,
      });
      item.id = session.attachment.id;
      await uploadSigned(item, session.signed_upload_url);
      await functionApi("discussion-media-actions", "confirm_upload", { attachment_id: item.id });
      item.status = "uploaded"; item.statusLabel = "已完成"; item.progress = 100;
    } catch (error) {
      item.status = String(error?.message || "").includes("cancel") ? "cancelled" : "failed";
      item.statusLabel = item.status === "cancelled" ? "已取消" : "失敗";
    }
    render();
  }
  async function addFiles(fileList) {
    const target = draftAttachments();
    const files = Array.from(fileList || []);
    const validation = Core.validateAttachments([...target.map((item) => item.file), ...files]);
    if (!validation.ok) { state.attachmentError = validation.message; render(); return; }
    const ownerType = state.screen === "compose" ? "post" : "comment";
    const draftKey = state.screen === "compose" ? "postDraftId" : "commentDraftId";
    state[draftKey] ||= crypto.randomUUID();
    const added = files.map((file) => ({
      file, name: file.name, type: file.type, size: file.size,
      kind: Core.MEDIA_TYPES[file.type].kind, objectUrl: URL.createObjectURL(file),
      status: "waiting", statusLabel: "等待上傳", progress: 0,
    }));
    target.push(...added);
    state.error = ""; state.attachmentError = ""; render();
    for (const item of added) {
      await uploadAttachment(item, ownerType, state[draftKey], target.indexOf(item));
    }
  }
  function removeAttachment(index) {
    const items = draftAttachments();
    const [item] = items.splice(index, 1);
    item?.abort?.abort?.();
    if (item?.objectUrl) URL.revokeObjectURL(item.objectUrl);
    render();
  }
  function showLightbox(src) {
    const safe = safeHttpUrl(src);
    if (!safe) return;
    let modal = $("#discussionMediaLightbox");
    if (!modal) {
      modal = document.createElement("dialog");
      modal.id = "discussionMediaLightbox";
      modal.className = "discussion-media-lightbox";
      modal.innerHTML = `<button type="button" aria-label="關閉">×</button><img alt="附件大圖" />`;
      modal.addEventListener("click", (event) => {
        if (event.target === modal || event.target.closest("button")) modal.close();
      });
      document.body.append(modal);
    }
    $("img", modal).src = safe;
    modal.showModal();
  }
  async function discardCurrentDraft() {
    const draftId = state.screen === "compose" ? state.postDraftId : state.commentDraftId;
    if (draftId && !state.qa) {
      try { await functionApi("discussion-media-actions", "discard_draft", { draft_id: draftId }); } catch {}
    }
    if (state.screen === "compose") { releaseAttachments(state.postAttachments); state.postDraftId = ""; }
    else { releaseAttachments(state.commentAttachments); state.commentDraftId = ""; }
  }
  async function resolvedLinkPreviews(body) {
    const basic = previewLinks(body);
    if (state.qa) return basic.map((item) => item.provider === "youtube" ? item : {
      ...item, provider: "example.com", site_name: "範例網站", title: "QA 一般網址預覽",
      description: "這是隔離的 QA metadata，不會呼叫外部網站。", status: state.qaScenario === "metadata-failed" ? "failed" : "ready",
    });
    if (!basic.length) return [];
    try {
      const result = await functionApi("discussion-link-preview", "fetch", {
        urls: basic.map((item) => item.original_url),
      });
      return (result.previews || []).filter((item) => item.status === "ready")
        .slice(0, Core.LIMITS.linkPreviewCount);
    } catch {
      return [];
    }
  }
  async function hydrateSignedMedia(records) {
    if (state.qa) return records;
    const all = records.flatMap((record) => record?.attachments || []);
    const ids = all.map((item) => item.id).filter(Boolean);
    if (!ids.length) return records;
    try {
      const result = await functionApi("discussion-media-actions", "get_signed_media_urls", { attachment_ids: ids });
      const urls = new Map((result.media || []).map((item) => [item.id, item.signed_url]));
      records.forEach((record) => (record.attachments || []).forEach((item) => { item.signed_url = urls.get(item.id) || ""; }));
    } catch {}
    return records;
  }
  async function hydrateCreatedRecord(record, draftItems, linkPreviews) {
    const attachments = draftItems.map((item) => ({
      id: item.id,
      media_type: item.kind,
      original_filename: item.name,
      objectUrl: item.objectUrl,
    }));
    const [hydrated] = await hydrateSignedMedia([{
      ...record,
      attachments,
      link_previews: linkPreviews,
    }]);
    return hydrated;
  }
  async function loadPosts() {
    state.error = ""; state.loading = true; render();
    if (state.qa) {
      if (state.qaScenario === "load-error") state.error = "目前無法載入討論吧，請確認網路後再試。";
      if (!state.posts.length) state.posts = mockPosts();
      state.loading = false; render(); return;
    }
    try {
      const data = await api("list_posts", { tab: state.tab, limit: Core.LIMITS.pageSize * state.page });
      state.posts = await hydrateSignedMedia(Array.isArray(data?.posts) ? data.posts : []);
    } catch { state.error = profile() ? "目前無法載入討論吧，請確認網路後再試。" : "請先登入才能使用討論吧。"; }
    state.loading = false; render();
  }
  async function refreshAdminStatus() {
    state.isAdmin = false;
    if (state.qa || !profile()) { render(); return; }
    try {
      const data = await api("get_admin_status");
      state.isAdmin = data?.is_admin === true;
    } catch {
      state.isAdmin = false;
    }
    render();
  }
  async function openPost(id) {
    state.error = "";
    if (state.qa) {
      state.currentPost = state.posts.find((item) => item.id === id) || null;
      const isSeedPost = ["qa-post-1", "qa-post-2", "qa-post-3"].includes(id);
      state.comments = state.currentPost
        ? (state.qaCommentsByPost[id] || (isSeedPost ? mockComments(id) : []))
        : [];
      state.qaCommentsByPost[id] = state.comments;
      if (state.qaScenario === "deleted-post" && state.currentPost) state.currentPost = { ...state.currentPost, status: "deleted" };
      if (state.qaScenario === "deleted-comment" && state.currentPost && state.comments.length) {
        state.comments = state.comments.map((item, index) => index === 0 ? { ...item, status: "deleted" } : item);
        state.currentPost = { ...state.currentPost, comment_count: Math.max(0, Number(state.currentPost.comment_count || 0) - 1) };
      }
      state.commentDraft = ""; state.screen = "detail"; render(); return;
    }
    state.loading = true; render();
    try {
      const data = await api("get_post", { post_id: id });
      const records = await hydrateSignedMedia([data?.post, ...(data?.comments || [])].filter(Boolean));
      state.currentPost = records[0] || null; state.comments = records.slice(1); state.commentDraft = ""; state.screen = "detail";
    } catch { state.currentPost = null; state.comments = []; state.screen = "detail"; }
    state.loading = false; render();
  }
  function requireQaCaptcha(action) {
    if (state.captcha.status !== "success" || state.captcha.action !== action) throw Object.assign(new Error("請先完成本次 CAPTCHA 驗證。"), { code: "captcha-required" });
    if (state.qaScenario === "captcha-failed") throw new Error("CAPTCHA 驗證失敗。");
    if (state.qaScenario === "captcha-expired") throw new Error("CAPTCHA 已過期，請重新驗證。");
    if (state.qaScenario === "captcha-replay") throw new Error("此 CAPTCHA Token 已使用，請重新驗證。");
  }
  async function submitPost(form) {
    const values = Object.fromEntries(new FormData(form));
    captureDraft(form);
    const validation = Core.validatePost(values);
    if (!validation.ok) { $(".discussion-form-error", form).textContent = validation.message; return; }
    if (state.postAttachments.some((item) => item.status !== "uploaded")) { $(".discussion-form-error", form).textContent = "請等待所有附件上傳完成，或移除失敗的附件。"; return; }
    state.error = "";
    state.submitting = true; render();
    let succeeded = false;
    try {
      let post;
      const links = await resolvedLinkPreviews(validation.value.body);
      if (state.qa) {
        requireQaCaptcha("create_post");
        if (state.qaScenario === "post-failed") throw new Error("QA 模擬發文失敗。");
        post = { id: `qa-post-${Date.now()}`, author_id: profile()?.id || "qa-user", author_display_name: profile()?.displayName || "QA 練習者", status: "published", comment_count: 0, created_at: new Date().toISOString(), last_activity_at: new Date().toISOString(), attachments: state.postAttachments.map((item) => ({ id: item.id, media_type: item.kind, original_filename: item.name, objectUrl: item.objectUrl })), link_previews: links, ...validation.value };
        state.qaCommentsByPost[post.id] = [];
        state.nextPostAllowedAt = Date.now() + Core.LIMITS.postCooldownSeconds * 1000;
      } else {
        const data = await api("create_post", { ...validation.value, turnstile_token: state.captcha.token, draft_id: state.postDraftId || null, attachment_ids: state.postAttachments.map((item) => item.id), link_previews: links });
        post = await hydrateCreatedRecord(data.post, state.postAttachments, links);
        state.nextPostAllowedAt = new Date(data.next_allowed_at).getTime();
      }
      state.posts.unshift(post); state.screen = "detail"; state.currentPost = post; state.comments = []; state.postDraft = { category: "", title: "", body: "" }; state.postAttachments = []; state.postDraftId = ""; clearCaptcha();
      markDiscussionSeen();
      succeeded = true;
    } catch (error) {
      state.error = state.nextPostAllowedAt > Date.now() ? "" : error?.message || "發文失敗，請稍後再試。";
      clearCaptcha();
    }
    state.submitting = false; render();
    if (succeeded) {
      scrollDiscussionToTop();
      showSuccessModal("文章已發佈");
    }
  }
  async function submitComment(form) {
    captureDraft(form);
    const validation = Core.validateComment(state.commentDraft);
    if (!validation.ok) { $(".discussion-form-error", form).textContent = validation.message; return; }
    if (state.commentAttachments.some((item) => item.status !== "uploaded")) { $(".discussion-form-error", form).textContent = "請等待所有附件上傳完成，或移除失敗的附件。"; return; }
    state.error = "";
    state.submitting = true; render();
    let succeeded = false;
    try {
      let comment;
      const links = await resolvedLinkPreviews(validation.value.body);
      if (state.qa) {
        requireQaCaptcha("create_comment");
        if (state.qaScenario === "comment-failed") throw new Error("QA 模擬留言失敗。");
        comment = { id: `qa-comment-${Date.now()}`, post_id: state.currentPost.id, author_id: profile()?.id || "qa-user", author_display_name: profile()?.displayName || "QA 練習者", body: validation.value.body, status: "published", created_at: new Date().toISOString(), attachments: state.commentAttachments.map((item) => ({ id: item.id, media_type: item.kind, original_filename: item.name, objectUrl: item.objectUrl })), link_previews: links };
        state.nextCommentAllowedAt = Date.now() + Core.LIMITS.commentCooldownSeconds * 1000;
      } else {
        const data = await api("create_comment", { post_id: state.currentPost.id, body: validation.value.body, turnstile_token: state.captcha.token, draft_id: state.commentDraftId || null, attachment_ids: state.commentAttachments.map((item) => item.id), link_previews: links });
        comment = await hydrateCreatedRecord(data.comment, state.commentAttachments, links);
        state.nextCommentAllowedAt = new Date(data.next_allowed_at).getTime();
      }
      state.comments.push(comment);
      if (state.qa) state.qaCommentsByPost[state.currentPost.id] = state.comments;
      state.currentPost.comment_count = Number(state.currentPost.comment_count || 0) + 1; state.commentDraft = ""; state.commentAttachments = []; state.commentDraftId = ""; clearCaptcha();
      succeeded = true;
    } catch (error) {
      state.error = state.nextCommentAllowedAt > Date.now() ? "" : error?.message || "留言失敗，請稍後再試。";
      clearCaptcha();
    }
    state.submitting = false; render();
    if (succeeded) {
      scrollLatestCommentIntoView();
      showSuccessModal("留言成功");
    }
  }
  async function softDelete(type, id) {
    if (!confirm("確定刪除這項內容嗎？")) return;
    if (state.qa) {
      if (type === "post") state.currentPost.status = "deleted";
      else {
        const wasPublished = state.comments.some((item) => item.id === id && item.status === "published");
        state.comments = state.comments.map((item) => item.id === id ? { ...item, status: "deleted" } : item);
        state.qaCommentsByPost[state.currentPost.id] = state.comments;
        if (wasPublished) state.currentPost.comment_count = Math.max(0, Number(state.currentPost.comment_count || 0) - 1);
      }
    } else {
      await api(type === "post" ? "delete_post" : "delete_comment", type === "post" ? { post_id: id } : { comment_id: id });
      if (type === "post") state.currentPost.status = "deleted";
      else state.comments = state.comments.filter((item) => item.id !== id);
    }
    render();
  }
  async function togglePinned(postId, currentlyPinned) {
    if (state.qa) {
      showSuccessModal("QA 僅預覽管理介面，正式操作仍需 app_admins 權限。");
      return;
    }
    try {
      await api(currentlyPinned ? "unpin_post" : "pin_post", { post_id: postId });
      const post = state.posts.find((item) => item.id === postId);
      if (post) {
        post.is_pinned = !currentlyPinned;
        post.pinned_at = currentlyPinned ? null : new Date().toISOString();
      }
      if (state.currentPost?.id === postId) {
        state.currentPost.is_pinned = !currentlyPinned;
        state.currentPost.pinned_at = currentlyPinned ? null : new Date().toISOString();
      }
      render();
    } catch (error) {
      state.error = error?.message || "置頂狀態更新失敗。";
      render();
    }
  }
  function openModerationReason(type, id) {
    if (state.qa) {
      showSuccessModal("QA 僅預覽管理介面，正式操作仍需 app_admins 權限。");
      return;
    }
    let modal = $("#discussionModerationModal");
    if (!modal) {
      modal = document.createElement("dialog");
      modal.id = "discussionModerationModal";
      modal.className = "discussion-moderation-modal";
      modal.innerHTML = `<form method="dialog" class="paper-card">
        <h3>管理刪除</h3>
        <p>請填寫管理原因。內容只會 soft delete，不會硬刪除資料。</p>
        <label>原因<textarea name="reason" maxlength="500" rows="4" required></textarea></label>
        <p class="discussion-form-error" role="alert"></p>
        <div class="discussion-actions"><button value="cancel" type="button" data-discussion-moderation-cancel>取消</button><button class="primary-btn" type="submit">確認刪除</button></div>
      </form>`;
      modal.addEventListener("click", (event) => {
        if (event.target === modal || event.target.closest("[data-discussion-moderation-cancel]")) modal.close();
      });
      modal.addEventListener("submit", async (event) => {
        event.preventDefault();
        const reason = String(new FormData(event.target).get("reason") || "").trim();
        if (!reason) {
          $(".discussion-form-error", modal).textContent = "請填寫管理原因。";
          return;
        }
        const targetType = modal.dataset.targetType;
        const targetId = modal.dataset.targetId;
        const submit = $('button[type="submit"]', modal);
        submit.disabled = true;
        try {
          await api(targetType === "post" ? "admin_delete_post" : "admin_delete_comment",
            targetType === "post" ? { post_id: targetId, reason } : { comment_id: targetId, reason });
          modal.close();
          if (targetType === "post") {
            state.posts = state.posts.filter((item) => item.id !== targetId);
            if (state.currentPost?.id === targetId) state.currentPost.status = "deleted";
          } else {
            state.comments = state.comments.filter((item) => item.id !== targetId);
            if (state.currentPost) state.currentPost.comment_count = Math.max(0, Number(state.currentPost.comment_count || 0) - 1);
          }
          render();
        } catch (error) {
          $(".discussion-form-error", modal).textContent = error?.message || "管理刪除失敗。";
        } finally {
          submit.disabled = false;
        }
      });
      document.body.append(modal);
    }
    modal.dataset.targetType = type;
    modal.dataset.targetId = id;
    modal.querySelector("form").reset();
    $(".discussion-form-error", modal).textContent = "";
    modal.showModal();
  }
  function bind(root) {
    root.addEventListener("click", (event) => {
      if (event.target.closest(".discussion-file-picker")) {
        filePickerActive = true;
        return;
      }
      const tab = event.target.closest("[data-discussion-tab]");
      if (tab) { state.tab = tab.dataset.discussionTab; state.page = 1; state.screen = "list"; void loadPosts(); return; }
      if (event.target.closest("[data-discussion-qa-admin-preview]")) {
        state.qaAdminPreview = !state.qaAdminPreview;
        render();
        return;
      }
      const pinPost = event.target.closest("[data-discussion-pin-post]");
      if (pinPost) {
        void togglePinned(pinPost.dataset.discussionPinPost, pinPost.dataset.pinned === "true");
        return;
      }
      const adminDeletePost = event.target.closest("[data-discussion-admin-delete-post]");
      if (adminDeletePost) {
        openModerationReason("post", adminDeletePost.dataset.discussionAdminDeletePost);
        return;
      }
      const adminDeleteComment = event.target.closest("[data-discussion-admin-delete-comment]");
      if (adminDeleteComment) {
        openModerationReason("comment", adminDeleteComment.dataset.discussionAdminDeleteComment);
        return;
      }
      if (event.target.closest(".discussion-new")) { state.error = ""; state.postDraft = { category: "", title: "", body: "" }; state.screen = "compose"; clearCaptcha(); render(); return; }
      if (event.target.closest("[data-discussion-cancel],[data-discussion-list]")) { stopMedia($("#discussion")); void discardCurrentDraft(); state.screen = "list"; state.error = ""; clearCaptcha(); render(); return; }
      if (event.target.closest(".discussion-load-more")) { state.page += 1; void loadPosts(); return; }
      if (event.target.closest("[data-discussion-retry]")) { void loadPosts(); return; }
      const card = event.target.closest("[data-discussion-post]"); if (card) { void openPost(card.dataset.discussionPost); return; }
      const lightbox = event.target.closest("[data-discussion-lightbox]"); if (lightbox) { showLightbox(lightbox.dataset.discussionLightbox); return; }
      const attachment = event.target.closest("[data-attachment-index]");
      if (attachment) {
        const index = Number(attachment.dataset.attachmentIndex);
        if (event.target.closest("[data-attachment-remove]")) { removeAttachment(index); return; }
        if (event.target.closest("[data-attachment-retry]")) {
          const item = draftAttachments()[index];
          const ownerType = state.screen === "compose" ? "post" : "comment";
          const draftId = state.screen === "compose" ? state.postDraftId : state.commentDraftId;
          void uploadAttachment(item, ownerType, draftId, index); return;
        }
      }
      if (event.target.closest("[data-discussion-preview]")) { const form = event.target.closest("form"); renderPreview(root, Object.fromEntries(new FormData(form))); return; }
      if (event.target.closest("[data-discussion-delete-post]")) { void softDelete("post", state.currentPost.id); return; }
      const deleteComment = event.target.closest("[data-discussion-delete-comment]"); if (deleteComment) { void softDelete("comment", deleteComment.dataset.discussionDeleteComment); return; }
      const qaCaptcha = event.target.closest("[data-discussion-qa-captcha]");
      if (qaCaptcha) {
        captureVisibleDraft();
        const status = qaCaptcha.dataset.discussionQaCaptcha;
        if (status === "success") {
          const action = state.screen === "compose" ? "create_post" : state.screen === "detail" ? "create_comment" : "";
          state.captcha = { status, token: action ? `qa:${crypto.randomUUID()}` : "", action };
        } else {
          clearCaptcha();
        }
        render();
        return;
      }
      if (event.target.closest("[data-discussion-qa-reset]")) { sessionStorage.removeItem(qaKey); Object.assign(state, { qaScenario: "populated", nextPostAllowedAt: 0, nextCommentAllowedAt: 0, posts: [], currentPost: null, comments: [], qaCommentsByPost: {}, postDraft: { category: "", title: "", body: "" }, commentDraft: "", screen: "list", error: "" }); clearCaptcha(); void loadPosts(); }
    });
    root.addEventListener("input", (event) => {
      const form = event.target.closest(".discussion-composer, .discussion-comment-form");
      if (form) captureDraft(form);
    });
    root.addEventListener("change", (event) => {
      const form = event.target.closest(".discussion-composer, .discussion-comment-form");
      if (form) captureDraft(form);
      if (event.target.matches("[data-discussion-files]")) {
        filePickerActive = false;
        void addFiles(event.target.files);
        event.target.value = "";
        return;
      }
      if (event.target.matches("[data-discussion-qa-scenario]")) {
        state.qaScenario = event.target.value; sessionStorage.setItem(qaKey, state.qaScenario);
        state.nextPostAllowedAt = state.qaScenario === "cooldown" ? Date.now() + 154000 : 0;
        state.nextCommentAllowedAt = state.qaScenario === "cooldown" ? Date.now() + 54000 : 0;
        state.error = ""; state.screen = "list"; applyQaMediaScenario(state.qaScenario); render();
      }
    });
    root.addEventListener("cancel", (event) => {
      if (!event.target.matches("[data-discussion-files]")) return;
      filePickerActive = false;
      if ($("#discussion")?.classList.contains("active")) render();
    }, true);
    root.addEventListener("submit", (event) => {
      event.preventDefault();
      if (event.target.matches(".discussion-composer")) void submitPost(event.target);
      if (event.target.matches(".discussion-comment-form")) void submitComment(event.target);
    });
  }
  function open() {
    ensureView();
    markDiscussionSeen();
    discussionWasOpen = true;
    state.qaScenario = sessionStorage.getItem(qaKey) || "populated";
    state.screen = "list"; state.page = 1; state.tab = "hot"; state.qa = isGardenQa();
    if (cooldownTimer) window.clearInterval(cooldownTimer);
    cooldownTimer = window.setInterval(() => {
      if ($("#discussion")?.classList.contains("active")) {
        renderStatus($("#discussion"));
        updateCooldownMessages($("#discussion"));
      }
    }, 1000);
    void refreshAdminStatus();
    void loadPosts();
  }
  function onViewChanged(view) {
    if (view === "discussion") open();
    else {
      filePickerActive = false;
      state.attachmentError = "";
      stopMedia($("#discussion") || document);
      void discardCurrentDraft();
      clearCaptcha();
      if (cooldownTimer) window.clearInterval(cooldownTimer);
      cooldownTimer = 0;
      if (discussionWasOpen) {
        discussionWasOpen = false;
        markDiscussionSeen();
      }
      if (view === "intro") void refreshUnreadBadge();
    }
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      captureVisibleDraft();
      clearCaptcha();
      return;
    }
    if (filePickerActive) return;
    if ($("#discussion")?.classList.contains("active")) render();
    else void refreshUnreadBadge();
  });
  ensureView();
  global.setTimeout(() => void refreshUnreadBadge(), 1500);
  global.ChromaticaDiscussion = Object.freeze({ open, onViewChanged, refreshUnreadBadge, state });
})(typeof window !== "undefined" ? window : globalThis);
