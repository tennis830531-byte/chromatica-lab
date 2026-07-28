(function initDiscussionCore(global) {
  "use strict";

  const LIMITS = Object.freeze({
    pageSize: 20,
    titleMin: 2,
    titleMax: 80,
    bodyMax: 10000,
    commentMax: 3000,
    cooldownSeconds: 180,
  });
  const CATEGORY_LABELS = Object.freeze({
    harmonica_hardware: "口琴硬體",
    harmonica_technique: "口琴技術",
    music_sharing: "音樂分享",
    app_feedback: "使用回饋",
  });
  const TABS = Object.freeze([
    { id: "hot", label: "熱門", mode: "hot" },
    { id: "latest", label: "最新", mode: "latest" },
    ...Object.entries(CATEGORY_LABELS).map(([id, label]) => ({ id, label, mode: "category" })),
  ]);

  function trim(value) {
    return String(value ?? "").trim();
  }

  function validatePost(input = {}) {
    const category = trim(input.category);
    const title = trim(input.title);
    const body = trim(input.body);
    if (!Object.hasOwn(CATEGORY_LABELS, category)) return { ok: false, code: "category-required", message: "請選擇文章分類。" };
    if (title.length < LIMITS.titleMin) return { ok: false, code: "title-too-short", message: `標題至少需要 ${LIMITS.titleMin} 個字元。` };
    if (title.length > LIMITS.titleMax) return { ok: false, code: "title-too-long", message: `標題最多 ${LIMITS.titleMax} 個字元。` };
    if (body.length > LIMITS.bodyMax) return { ok: false, code: "body-too-long", message: `內文最多 ${LIMITS.bodyMax} 個字元。` };
    return { ok: true, value: { category, title, body } };
  }

  function validateComment(value) {
    const body = trim(value);
    if (!body) return { ok: false, code: "comment-empty", message: "留言不可為空白。" };
    if (body.length > LIMITS.commentMax) return { ok: false, code: "comment-too-long", message: `留言最多 ${LIMITS.commentMax} 個字元。` };
    return { ok: true, value: { body } };
  }

  function sortPosts(posts, tabId, now = Date.now()) {
    const items = posts.filter((post) => post.status === "published");
    const tab = TABS.find((item) => item.id === tabId) || TABS[0];
    const visible = tab.mode === "category" ? items.filter((post) => post.category === tab.id) : items;
    if (tab.mode === "hot") {
      const cutoff = now - 7 * 24 * 60 * 60 * 1000;
      return visible
        .filter((post) => new Date(post.last_activity_at || post.created_at).getTime() >= cutoff)
        .toSorted((a, b) =>
          Number(b.comment_count || 0) - Number(a.comment_count || 0)
          || new Date(b.last_activity_at || b.created_at).getTime() - new Date(a.last_activity_at || a.created_at).getTime()
          || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return visible.toSorted((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      || String(b.id).localeCompare(String(a.id)));
  }

  function formatRetryAfter(seconds) {
    const safe = Math.max(0, Math.ceil(Number(seconds) || 0));
    const minutes = Math.floor(safe / 60);
    const remainder = safe % 60;
    if (!minutes) return `請等待 ${remainder} 秒後再發表`;
    return `請等待 ${minutes} 分 ${String(remainder).padStart(2, "0")} 秒後再發表`;
  }

  function excerpt(value, max = 110) {
    const text = trim(value);
    return text.length <= max ? text : `${text.slice(0, max)}…`;
  }

  global.ChromaticaDiscussionCore = Object.freeze({
    LIMITS,
    CATEGORY_LABELS,
    TABS,
    validatePost,
    validateComment,
    sortPosts,
    formatRetryAfter,
    excerpt,
  });
})(typeof window !== "undefined" ? window : globalThis);
