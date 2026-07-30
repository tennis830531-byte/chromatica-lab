(function initDiscussionCore(global) {
  "use strict";

  const LIMITS = Object.freeze({
    pageSize: 20,
    titleMin: 2,
    titleMax: 80,
    bodyMax: 10000,
    commentMax: 3000,
    postCooldownSeconds: 180,
    commentCooldownSeconds: 60,
    attachmentCount: 10,
    imageBytes: 10 * 1024 * 1024,
    videoBytes: 100 * 1024 * 1024,
    attachmentTotalBytes: 200 * 1024 * 1024,
    linkPreviewCount: 5,
  });
  const MEDIA_TYPES = Object.freeze({
    "image/jpeg": Object.freeze({ kind: "image", extension: "jpg" }),
    "image/png": Object.freeze({ kind: "image", extension: "png" }),
    "image/webp": Object.freeze({ kind: "image", extension: "webp" }),
    "image/gif": Object.freeze({ kind: "image", extension: "gif" }),
    "video/mp4": Object.freeze({ kind: "video", extension: "mp4" }),
    "video/webm": Object.freeze({ kind: "video", extension: "webm" }),
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

  function formatRetryAfter(seconds, action = "create_post") {
    const safe = Math.max(0, Math.ceil(Number(seconds) || 0));
    const minutes = Math.floor(safe / 60);
    const remainder = safe % 60;
    const verb = action === "create_comment" ? "留言" : "發表";
    if (!minutes) return `請等待 ${remainder} 秒後再${verb}`;
    return `請等待 ${minutes} 分 ${String(remainder).padStart(2, "0")} 秒後再${verb}`;
  }

  function excerpt(value, max = 110) {
    const text = trim(value);
    return text.length <= max ? text : `${text.slice(0, max)}…`;
  }

  function validateAttachments(files = []) {
    const items = Array.from(files);
    if (items.length > LIMITS.attachmentCount) {
      return { ok: false, code: "attachment-count", message: `最多只能上傳 ${LIMITS.attachmentCount} 張圖片或影片。` };
    }
    let totalBytes = 0;
    for (const file of items) {
      const definition = MEDIA_TYPES[String(file?.type || "").toLowerCase()];
      if (!definition) return { ok: false, code: "attachment-mime", message: "不支援這個檔案格式。" };
      const bytes = Number(file?.size || 0);
      const maximum = definition.kind === "image" ? LIMITS.imageBytes : LIMITS.videoBytes;
      if (!Number.isFinite(bytes) || bytes < 0 || bytes > maximum) {
        return { ok: false, code: "attachment-size", message: definition.kind === "image" ? "圖片單檔最多 10 MB。" : "影片單檔最多 100 MB。" };
      }
      totalBytes += bytes;
    }
    if (totalBytes > LIMITS.attachmentTotalBytes) {
      return { ok: false, code: "attachment-total", message: "單次發表的附件總量最多 200 MB。" };
    }
    return { ok: true, value: { files: items, totalBytes } };
  }

  function parseYouTubeUrl(value) {
    let url;
    try { url = new URL(trim(value)); } catch { return null; }
    if (!["http:", "https:"].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    let id = "";
    if (host === "youtu.be") id = url.pathname.split("/").filter(Boolean)[0] || "";
    if (host === "youtube.com" || host === "m.youtube.com") {
      if (url.pathname === "/watch") id = url.searchParams.get("v") || "";
      else {
        const parts = url.pathname.split("/").filter(Boolean);
        if (["shorts", "embed"].includes(parts[0])) id = parts[1] || "";
      }
    }
    if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
    return {
      provider: "youtube",
      videoId: id,
      normalizedUrl: `https://www.youtube.com/watch?v=${id}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
    };
  }

  function extractPreviewUrls(value) {
    const matches = trim(value).match(/https?:\/\/[^\s<>"']+/gi) || [];
    const unique = [];
    for (const raw of matches) {
      const candidate = raw.replace(/[),.;!?，。；！？]+$/u, "");
      let url;
      try { url = new URL(candidate); } catch { continue; }
      if (!["http:", "https:"].includes(url.protocol)) continue;
      url.hash = "";
      const normalized = url.toString();
      if (!unique.includes(normalized)) unique.push(normalized);
      if (unique.length >= LIMITS.linkPreviewCount) break;
    }
    return unique;
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
    MEDIA_TYPES,
    validateAttachments,
    parseYouTubeUrl,
    extractPreviewUrls,
  });
})(typeof window !== "undefined" ? window : globalThis);
