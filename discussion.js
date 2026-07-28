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
    nextAllowedAt: 0, captcha: { status: "missing", token: "", action: "" },
    postDraft: { category: "", title: "", body: "" }, commentDraft: "",
    qa: false, qaScenario: "populated", initialized: false,
  };
  let cooldownTimer = 0;
  let turnstileWidgetId = null;
  let turnstileScriptPromise = null;

  function isGardenQa() {
    return Boolean(global.ChromaticaGardenQA?.isActive?.());
  }
  function profile() {
    return global.chromaticaAuth?.getPublicUserProfile?.() || null;
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
  function mockPosts() {
    const me = profile() || { id: "qa-user", displayName: "QA 練習者", avatarUrl: "" };
    const now = Date.now();
    return [
      { id: "qa-post-1", author_id: me.id, author_display_name: me.displayName, author_avatar_url: me.avatarUrl, category: "harmonica_technique", title: "如何讓長音更穩定？", body: "最近練習長音時，想請教大家如何控制氣息，讓每個音更穩定。", status: "published", comment_count: 3, created_at: new Date(now - 3600000).toISOString(), last_activity_at: new Date(now - 600000).toISOString() },
      { id: "qa-post-2", author_id: "qa-friend", author_display_name: "口琴旅人", author_avatar_url: "", category: "harmonica_hardware", title: "十六孔口琴清潔心得", body: "整理了日常保養與清潔時會注意的幾個步驟。", status: "published", comment_count: 8, created_at: new Date(now - 86400000).toISOString(), last_activity_at: new Date(now - 120000).toISOString() },
      { id: "qa-post-3", author_id: "qa-music", author_display_name: "森林演奏家", author_avatar_url: "", category: "music_sharing", title: "分享一段週末練習曲", body: "<script>globalThis.__discussionXss = true</script> 這段文字必須安全顯示。", status: "published", comment_count: 1, created_at: new Date(now - 7200000).toISOString(), last_activity_at: new Date(now - 7000000).toISOString() },
    ];
  }
  function mockComments(postId) {
    return [
      { id: `${postId}-comment-1`, post_id: postId, author_id: "qa-friend", author_display_name: "口琴旅人", body: "先把速度放慢，專注讓每次吸吐氣維持一致。", status: "published", created_at: new Date(Date.now() - 300000).toISOString() },
      { id: `${postId}-comment-2`, post_id: postId, author_id: profile()?.id || "qa-user", author_display_name: profile()?.displayName || "QA 練習者", body: "謝謝分享，我會試試看！", status: "published", created_at: new Date(Date.now() - 120000).toISOString() },
    ];
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
          <button class="discussion-back icon-btn" type="button" aria-label="返回首頁">←</button>
          <div><p class="eyebrow">Chromatica Lab</p><h2>討論吧</h2><p>一起分享口琴、音樂與練習心得。</p></div>
          <button class="discussion-new primary-btn" type="button">新增文章</button>
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
    $(".discussion-tabs", root).innerHTML = Core.TABS.map((tab) =>
      `<button class="${state.tab === tab.id ? "active" : ""}" data-discussion-tab="${escape(tab.id)}" type="button">${escape(tab.label)}</button>`).join("");
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
      narrow: "窄螢幕",
    };
    panel.innerHTML = `
      <strong class="discussion-qa-title">討論吧 QA</strong>
      <label>情境<select data-discussion-qa-scenario>
        ${Object.entries(scenarioLabels).map(([value, label]) => `<option value="${value}" ${state.qaScenario === value ? "selected" : ""}>${label}</option>`).join("")}
      </select></label>
      <div class="discussion-qa-actions">
        <button data-discussion-qa-captcha="success" type="button">CAPTCHA 成功</button>
        <button data-discussion-qa-captcha="missing" type="button">CAPTCHA 未完成</button>
        <button data-discussion-qa-reset type="button">重置 QA</button>
      </div>`;
  }
  function renderStatus(root) {
    const status = $(".discussion-status", root);
    const seconds = Math.max(0, Math.ceil((state.nextAllowedAt - Date.now()) / 1000));
    status.dataset.kind = state.error ? "error" : "";
    status.textContent = state.error || (seconds ? Core.formatRetryAfter(seconds) : "");
  }
  function renderList(root) {
    const source = state.qa ? (state.qaScenario === "empty" ? [] : mockPosts()) : state.posts;
    const sorted = Core.sortPosts(source, state.tab);
    const visible = sorted.slice(0, state.page * Core.LIMITS.pageSize);
    if (state.loading) return `<div class="discussion-state paper-card">討論內容載入中…</div>`;
    if (state.qa && state.qaScenario === "load-error") return `<div class="discussion-state paper-card"><strong>目前無法載入討論吧</strong><p>請確認網路後再試。</p><button data-discussion-retry type="button">重新載入</button></div>`;
    if (state.error) return `<div class="discussion-state paper-card"><strong>目前無法載入討論吧</strong><p>請確認網路後再試。</p><button data-discussion-retry type="button">重新載入</button></div>`;
    if (!visible.length) return `<div class="discussion-state paper-card"><strong>目前還沒有文章</strong><p>成為第一個分享練習心得的人吧！</p></div>`;
    return `<div class="discussion-list">${visible.map((post) => `
      <article class="discussion-post-card paper-card" data-discussion-post="${escape(post.id)}" tabindex="0">
        <span class="discussion-category">${escape(Core.CATEGORY_LABELS[post.category] || "")}</span>
        <h3>${escape(post.title)}</h3>
        <p>${escape(Core.excerpt(post.body || "（無內文）"))}</p>
        <footer>${avatarMarkup(post)}<span><strong>${escape(post.author_display_name || "練習者")}</strong><small>${escape(formatTime(post.created_at))}</small></span><b>${Number(post.comment_count || 0)} 則留言</b></footer>
      </article>`).join("")}</div>
      ${visible.length < sorted.length ? `<button class="discussion-load-more secondary-btn" type="button">載入更多</button>` : ""}`;
  }
  function captchaMarkup(action) {
    const ready = state.captcha.status === "success" && state.captcha.action === action;
    const useWidget = state.qa || Boolean(global.CHROMATICA_TURNSTILE_SITE_KEY);
    return `<section class="discussion-captcha ${ready ? "is-ready" : ""}">
      <strong>Cloudflare Turnstile 驗證${state.qa ? "（官方測試模式）" : ""}</strong>
      <p>${ready ? "驗證完成，本次送出後即失效。" : "每次發表都需要完成新的驗證。"}</p>
      ${useWidget ? `<div class="discussion-turnstile-slot" data-turnstile-action="${escape(action)}"><span>驗證元件準備中</span></div>` : `<p class="discussion-captcha-unavailable">驗證服務尚未設定。</p>`}
    </section>`;
  }
  function renderComposer() {
    return `<form class="discussion-composer paper-card">
      <h3>新增文章</h3>
      <label>分類<select name="category" required><option value="">請選擇</option>${Object.entries(Core.CATEGORY_LABELS).map(([id, label]) => `<option value="${id}" ${state.postDraft.category === id ? "selected" : ""}>${escape(label)}</option>`).join("")}</select></label>
      <label>標題<input name="title" value="${escape(state.postDraft.title)}" minlength="${Core.LIMITS.titleMin}" maxlength="${Core.LIMITS.titleMax}" required /></label>
      <label>純文字內文<textarea name="body" maxlength="${Core.LIMITS.bodyMax}" rows="8">${escape(state.postDraft.body)}</textarea></label>
      <p class="discussion-phase2-note">圖片、影片與網址預覽將於後續版本開放。</p>
      ${captchaMarkup("create_post")}
      <div class="discussion-form-error" role="alert"></div>
      <div class="discussion-actions"><button class="secondary-btn" data-discussion-cancel type="button">取消</button><button class="secondary-btn" data-discussion-preview type="button">預覽</button><button class="primary-btn" type="submit" ${state.submitting ? "disabled" : ""}>${state.submitting ? "發表中…" : "發表"}</button></div>
    </form>`;
  }
  function renderPreview(root, values) {
    const result = Core.validatePost(values);
    if (!result.ok) { $(".discussion-form-error", root).textContent = result.message; return; }
    const existing = $(".discussion-preview", root);
    existing?.remove();
    const preview = document.createElement("section");
    preview.className = "discussion-preview paper-card";
    preview.innerHTML = `<span class="discussion-category">${escape(Core.CATEGORY_LABELS[result.value.category])}</span><h3>${escape(result.value.title)}</h3><p>${escape(result.value.body || "（無內文）")}</p><small>這是預覽，不會寫入資料庫。</small>`;
    $(".discussion-composer", root).append(preview);
  }
  function renderDetail() {
    const post = state.currentPost;
    if (!post || post.status !== "published") return `<div class="discussion-state paper-card"><strong>文章不存在或已刪除</strong><button data-discussion-list type="button">返回文章列表</button></div>`;
    const me = profile();
    return `<article class="discussion-detail paper-card">
      <button data-discussion-list class="discussion-inline-back" type="button">← 返回文章列表</button>
      <span class="discussion-category">${escape(Core.CATEGORY_LABELS[post.category])}</span>
      <h3>${escape(post.title)}</h3><p class="discussion-body">${escape(post.body || "（無內文）")}</p>
      <footer>${avatarMarkup(post)}<span><strong>${escape(post.author_display_name || "練習者")}</strong><small>${escape(formatTime(post.created_at))}</small></span></footer>
      ${me?.id === post.author_id ? `<button class="discussion-delete" data-discussion-delete-post type="button">刪除自己的文章</button>` : ""}
    </article>
    <section class="discussion-comments">
      <h3>${Number(post.comment_count || state.comments.length)} 則留言</h3>
      ${state.comments.filter((item) => item.status === "published").map((item) => `<article class="discussion-comment paper-card">${avatarMarkup(item)}<div><header><strong>${escape(item.author_display_name || "練習者")}</strong><small>${escape(formatTime(item.created_at))}</small></header><p>${escape(item.body)}</p>${me?.id === item.author_id ? `<button data-discussion-delete-comment="${escape(item.id)}" type="button">刪除</button>` : ""}</div></article>`).join("") || `<p class="discussion-state paper-card">還沒有留言。</p>`}
    </section>
    <form class="discussion-comment-form paper-card"><label>新增留言<textarea name="body" maxlength="${Core.LIMITS.commentMax}" rows="4">${escape(state.commentDraft)}</textarea></label>${captchaMarkup("create_comment")}<div class="discussion-form-error" role="alert"></div><button class="primary-btn" type="submit" ${state.submitting ? "disabled" : ""}>${state.submitting ? "留言送出中…" : "送出留言"}</button></form>`;
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
    $(".discussion-content", root).innerHTML = state.screen === "compose" ? renderComposer() : state.screen === "detail" ? renderDetail() : renderList(root);
    mountTurnstile();
  }
  function clearCaptcha() {
    if (turnstileWidgetId !== null) {
      try { global.turnstile?.remove?.(turnstileWidgetId); } catch {}
      turnstileWidgetId = null;
    }
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
      turnstileWidgetId = global.turnstile.render(slot, {
        sitekey,
        action,
        callback(token) {
          captureVisibleDraft();
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
      state.error = "CAPTCHA 目前無法載入。";
      renderStatus($("#discussion"));
    }
  }
  async function api(action, payload = {}) {
    const result = await global.chromaticaAuth?.invokeFunction?.("discussion-actions", { action, ...payload });
    if (!result || result.error) throw result?.error || new Error("discussion-unavailable");
    return result.data;
  }
  async function loadPosts() {
    state.error = ""; state.loading = true; render();
    if (state.qa) {
      if (state.qaScenario === "load-error") state.error = "目前無法載入討論吧，請確認網路後再試。";
      state.loading = false; render(); return;
    }
    try {
      const data = await api("list_posts", { tab: state.tab, limit: Core.LIMITS.pageSize * state.page });
      state.posts = Array.isArray(data?.posts) ? data.posts : [];
    } catch { state.error = profile() ? "目前無法載入討論吧，請確認網路後再試。" : "請先登入才能使用討論吧。"; }
    state.loading = false; render();
  }
  async function openPost(id) {
    state.error = "";
    if (state.qa) {
      state.currentPost = mockPosts().find((item) => item.id === id) || null;
      state.comments = state.currentPost ? mockComments(id) : [];
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
      state.currentPost = data?.post || null; state.comments = data?.comments || []; state.commentDraft = ""; state.screen = "detail";
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
    state.submitting = true; render();
    try {
      let post;
      if (state.qa) {
        requireQaCaptcha("create_post");
        if (state.qaScenario === "post-failed") throw new Error("QA 模擬發文失敗。");
        post = { id: `qa-post-${Date.now()}`, author_id: profile()?.id || "qa-user", author_display_name: profile()?.displayName || "QA 練習者", status: "published", comment_count: 0, created_at: new Date().toISOString(), last_activity_at: new Date().toISOString(), ...validation.value };
        state.nextAllowedAt = Date.now() + Core.LIMITS.cooldownSeconds * 1000;
      } else {
        const data = await api("create_post", { ...validation.value, turnstile_token: state.captcha.token });
        post = data.post; state.nextAllowedAt = new Date(data.next_allowed_at).getTime();
      }
      state.posts.unshift(post); state.screen = "detail"; state.currentPost = post; state.comments = []; state.postDraft = { category: "", title: "", body: "" }; clearCaptcha();
    } catch (error) { state.error = error?.message || "發文失敗，請稍後再試。"; clearCaptcha(); }
    state.submitting = false; render();
  }
  async function submitComment(form) {
    captureDraft(form);
    const validation = Core.validateComment(state.commentDraft);
    if (!validation.ok) { $(".discussion-form-error", form).textContent = validation.message; return; }
    state.submitting = true; render();
    try {
      let comment;
      if (state.qa) {
        requireQaCaptcha("create_comment");
        if (state.qaScenario === "comment-failed") throw new Error("QA 模擬留言失敗。");
        comment = { id: `qa-comment-${Date.now()}`, post_id: state.currentPost.id, author_id: profile()?.id || "qa-user", author_display_name: profile()?.displayName || "QA 練習者", body: validation.value.body, status: "published", created_at: new Date().toISOString() };
        state.nextAllowedAt = Date.now() + Core.LIMITS.cooldownSeconds * 1000;
      } else {
        const data = await api("create_comment", { post_id: state.currentPost.id, body: validation.value.body, turnstile_token: state.captcha.token });
        comment = data.comment; state.nextAllowedAt = new Date(data.next_allowed_at).getTime();
      }
      state.comments.push(comment); state.currentPost.comment_count = Number(state.currentPost.comment_count || 0) + 1; state.commentDraft = ""; clearCaptcha();
    } catch (error) { state.error = error?.message || "留言失敗，請稍後再試。"; clearCaptcha(); }
    state.submitting = false; render();
  }
  async function softDelete(type, id) {
    if (!confirm("確定刪除這項內容嗎？")) return;
    if (state.qa) {
      if (type === "post") state.currentPost.status = "deleted";
      else {
        const wasPublished = state.comments.some((item) => item.id === id && item.status === "published");
        state.comments = state.comments.map((item) => item.id === id ? { ...item, status: "deleted" } : item);
        if (wasPublished) state.currentPost.comment_count = Math.max(0, Number(state.currentPost.comment_count || 0) - 1);
      }
    } else {
      await api(type === "post" ? "delete_post" : "delete_comment", type === "post" ? { post_id: id } : { comment_id: id });
      if (type === "post") state.currentPost.status = "deleted";
      else state.comments = state.comments.filter((item) => item.id !== id);
    }
    render();
  }
  function bind(root) {
    root.addEventListener("click", (event) => {
      const tab = event.target.closest("[data-discussion-tab]");
      if (tab) { state.tab = tab.dataset.discussionTab; state.page = 1; state.screen = "list"; void loadPosts(); return; }
      if (event.target.closest(".discussion-back")) { document.querySelector('[data-view="intro"]')?.click(); return; }
      if (event.target.closest(".discussion-new")) { state.error = ""; state.postDraft = { category: "", title: "", body: "" }; state.screen = "compose"; clearCaptcha(); render(); return; }
      if (event.target.closest("[data-discussion-cancel],[data-discussion-list]")) { state.screen = "list"; state.error = ""; clearCaptcha(); render(); return; }
      if (event.target.closest(".discussion-load-more")) { state.page += 1; void loadPosts(); return; }
      if (event.target.closest("[data-discussion-retry]")) { void loadPosts(); return; }
      const card = event.target.closest("[data-discussion-post]"); if (card) { void openPost(card.dataset.discussionPost); return; }
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
      if (event.target.closest("[data-discussion-qa-reset]")) { sessionStorage.removeItem(qaKey); Object.assign(state, { qaScenario: "populated", nextAllowedAt: 0, posts: [], currentPost: null, comments: [], postDraft: { category: "", title: "", body: "" }, commentDraft: "", screen: "list", error: "" }); clearCaptcha(); void loadPosts(); }
    });
    root.addEventListener("input", (event) => {
      const form = event.target.closest(".discussion-composer, .discussion-comment-form");
      if (form) captureDraft(form);
    });
    root.addEventListener("change", (event) => {
      const form = event.target.closest(".discussion-composer, .discussion-comment-form");
      if (form) captureDraft(form);
      if (event.target.matches("[data-discussion-qa-scenario]")) {
        state.qaScenario = event.target.value; sessionStorage.setItem(qaKey, state.qaScenario);
        state.nextAllowedAt = state.qaScenario === "cooldown" ? Date.now() + 154000 : 0;
        state.error = ""; state.screen = "list"; render();
      }
    });
    root.addEventListener("submit", (event) => {
      event.preventDefault();
      if (event.target.matches(".discussion-composer")) void submitPost(event.target);
      if (event.target.matches(".discussion-comment-form")) void submitComment(event.target);
    });
  }
  function open() {
    ensureView();
    state.qaScenario = sessionStorage.getItem(qaKey) || "populated";
    state.screen = "list"; state.page = 1; state.tab = "hot"; state.qa = isGardenQa();
    if (cooldownTimer) window.clearInterval(cooldownTimer);
    cooldownTimer = window.setInterval(() => {
      if ($("#discussion")?.classList.contains("active")) renderStatus($("#discussion"));
    }, 1000);
    void loadPosts();
  }
  function onViewChanged(view) {
    if (view === "discussion") open();
    else {
      clearCaptcha();
      if (cooldownTimer) window.clearInterval(cooldownTimer);
      cooldownTimer = 0;
    }
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      captureVisibleDraft();
      clearCaptcha();
      return;
    }
    if ($("#discussion")?.classList.contains("active")) render();
  });
  ensureView();
  global.ChromaticaDiscussion = Object.freeze({ open, onViewChanged, state });
})(typeof window !== "undefined" ? window : globalThis);
