const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const root = new URL("../", `file://${__filename}`).pathname;
const coreSource = fs.readFileSync(`${root}/discussion-core.js`, "utf8");
const runtime = fs.readFileSync(`${root}/discussion.js`, "utf8");
const styles = fs.readFileSync(`${root}/styles.css`, "utf8");
const migration = fs.readFileSync(`${root}/supabase/migrations/202607290001_add_discussion_media_and_link_previews.sql`, "utf8");
const mediaFunction = fs.readFileSync(`${root}/supabase/functions/discussion-media-actions/index.ts`, "utf8");
const linkFunction = fs.readFileSync(`${root}/supabase/functions/discussion-link-preview/index.ts`, "utf8");
const sandbox = { URL, globalThis: {} };
vm.runInNewContext(coreSource, sandbox);
const Core = sandbox.globalThis.ChromaticaDiscussionCore;

test("central attachment limits and MIME allowlist match Phase 2", () => {
  assert.equal(Core.LIMITS.attachmentCount, 10);
  assert.equal(Core.LIMITS.imageBytes, 10 * 1024 * 1024);
  assert.equal(Core.LIMITS.videoBytes, 100 * 1024 * 1024);
  assert.equal(Core.LIMITS.attachmentTotalBytes, 200 * 1024 * 1024);
  assert.deepEqual(Object.keys(Core.MEDIA_TYPES), [
    "image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm",
  ]);
});

test("attachment validation rejects the eleventh file, bad MIME, per-file and aggregate excess", () => {
  const image = (size = 10) => ({ type: "image/png", size });
  const tooMany = Core.validateAttachments(Array.from({ length: 11 }, () => image()));
  assert.equal(tooMany.code, "attachment-count");
  assert.equal(tooMany.message, "最多只能上傳 10 張圖片或影片。");
  assert.equal(Core.validateAttachments([{ type: "image/svg+xml", size: 10 }]).code, "attachment-mime");
  assert.equal(Core.validateAttachments([image(Core.LIMITS.imageBytes + 1)]).code, "attachment-size");
  assert.equal(Core.validateAttachments([
    { type: "video/mp4", size: 100 * 1024 * 1024 },
    { type: "video/webm", size: 100 * 1024 * 1024 },
    image(1),
  ]).code, "attachment-total");
});

test("the eleventh attachment error is shown beside the picker", () => {
  assert.match(runtime, /attachmentError:\s*""/);
  assert.match(runtime, /discussion-attachment-error[^>]*role="alert"/);
  assert.match(runtime, /state\.attachmentError = validation\.message/);
  assert.match(styles, /\.discussion-attachment-error/);
});

test("YouTube watch, short URLs, and Shorts normalize to youtube-nocookie embeds", () => {
  for (const url of [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3",
    "https://youtu.be/dQw4w9WgXcQ?si=test",
    "https://www.youtube.com/shorts/dQw4w9WgXcQ",
  ]) {
    const parsed = Core.parseYouTubeUrl(url);
    assert.equal(parsed.videoId, "dQw4w9WgXcQ");
    assert.equal(parsed.embedUrl, "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  }
  assert.equal(Core.parseYouTubeUrl("javascript:alert(1)"), null);
  assert.equal(Core.parseYouTubeUrl("https://youtube.com/watch?v=bad"), null);
});

test("link extraction is http(s)-only, deduplicated, and capped at five", () => {
  const links = Core.extractPreviewUrls("https://a.test https://a.test https://b.test https://c.test https://d.test https://e.test https://f.test javascript:alert(1)");
  assert.equal(links.length, 5);
  assert.equal(new Set(links).size, 5);
});

test("runtime supplies accessible attachment ordering, previews, progress, cancellation, and cleanup", () => {
  assert.match(runtime, /data-discussion-files/);
  assert.match(runtime, /data-attachment-move/);
  assert.match(runtime, /URL\.revokeObjectURL/);
  assert.match(runtime, /XMLHttpRequest/);
  assert.match(runtime, /discussion-media-actions/);
  assert.match(runtime, /youtube-nocookie\.com/);
  assert.match(runtime, /video[^>]+controls[^>]+muted[^>]+playsinline/);
});

test("native file picker return keeps the live input until change or cancel", () => {
  assert.match(runtime, /let filePickerActive = false/);
  assert.match(runtime, /closest\("\.discussion-file-picker"\)[\s\S]*filePickerActive = true/);
  assert.match(runtime, /matches\("\[data-discussion-files\]"\)[\s\S]*filePickerActive = false[\s\S]*addFiles/);
  assert.match(runtime, /addEventListener\("cancel"[\s\S]*filePickerActive = false/);
  assert.match(runtime, /if \(filePickerActive\) return;[\s\S]*classList\.contains\("active"\)\) render\(\)/);
});

test("pre-submit preview renders local image blob URLs instead of an image placeholder", () => {
  assert.match(runtime, /function renderBoundAttachments\(items = \[\], detail = false, allowDraftUrls = false\)/);
  assert.ok(runtime.includes("allowDraftUrls && /^blob:"));
  assert.match(runtime, /renderBoundAttachments\(draftAttachments\(\)\.map\([\s\S]*true, true\)/);
});

test("post preview opens as a top-level modal instead of extending the form", () => {
  assert.match(runtime, /modal\.id = "discussionPostPreview"/);
  assert.match(runtime, /modal\.showModal\(\)/);
  assert.match(runtime, /data-discussion-close-preview/);
  assert.doesNotMatch(runtime, /\.discussion-composer", root\)\.append\(preview\)/);
  assert.match(styles, /\.discussion-preview-modal::backdrop/);
});

test("QA publishing keeps the new post and its local media visible", () => {
  assert.match(runtime, /state\.qa\s*\?\s*\(state\.qaScenario\s*===\s*"empty"\s*\?\s*\[\]\s*:\s*state\.posts\)/);
  assert.match(runtime, /if\s*\(!state\.posts\.length\)\s*state\.posts\s*=\s*mockPosts\(\)/);
  assert.match(runtime, /state\.currentPost\s*=\s*state\.posts\.find/);
  assert.match(runtime, /renderBoundAttachments\(post\.attachments\s*\|\|\s*\[\],\s*true,\s*state\.qa\)/);
  assert.match(runtime, /attachments:\s*state\.postAttachments\.map\(\(item\)\s*=>\s*\(\{[^}]*objectUrl:\s*item\.objectUrl/);
  assert.match(runtime, /attachments:\s*state\.commentAttachments\.map\(\(item\)\s*=>\s*\(\{[^}]*objectUrl:\s*item\.objectUrl/);
  assert.doesNotMatch(runtime, /attachments:\s*state\.(?:post|comment)Attachments\.map\(\(item\)\s*=>\s*\(\{[^}]*url:\s*item\.objectUrl/);
});

test("QA comments remain isolated to their own article", () => {
  assert.match(runtime, /qaCommentsByPost:\s*\{\}/);
  assert.match(runtime, /const isSeedPost = \["qa-post-1", "qa-post-2", "qa-post-3"\]\.includes\(id\)/);
  assert.match(runtime, /state\.qaCommentsByPost\[id\]\s*\|\|\s*\(isSeedPost\s*\?\s*mockComments\(id\)\s*:\s*\[\]\)/);
  assert.match(runtime, /state\.qaCommentsByPost\[post\.id\]\s*=\s*\[\]/);
  assert.match(runtime, /state\.qaCommentsByPost\[state\.currentPost\.id\]\s*=\s*state\.comments/);
});

test("attachment picker label uses blue text", () => {
  assert.match(styles, /\.discussion-file-picker\s*\{[^}]*color:\s*#1769aa/s);
});

test("mobile media CSS avoids horizontal overflow and uses a top-level lightbox", () => {
  assert.match(styles, /\.discussion-bound-media/);
  assert.match(styles, /\.discussion-media-lightbox/);
  assert.match(styles, /max-width:\s*100%/);
  assert.match(styles, /aspect-ratio:\s*16\s*\/\s*9/);
});

test("article detail has stable border-box sizing before media metadata resolves", () => {
  assert.match(styles, /\.discussion-shell \{[^}]*width:\s*100%[^}]*max-width:\s*900px[^}]*box-sizing:\s*border-box/);
  assert.match(styles, /\.discussion-content,[^{]+\{[^}]*min-width:\s*0[^}]*max-width:\s*100%/);
  assert.match(styles, /\.discussion-detail,[^{]+\{[^}]*min-width:\s*0[^}]*max-width:\s*100%[^}]*box-sizing:\s*border-box/);
  assert.match(styles, /\.discussion-comment \{[^}]*grid-template-columns:\s*auto minmax\(0,\s*1fr\)/);
  assert.match(styles, /\.discussion-youtube \{[^}]*max-width:\s*100%[^}]*min-width:\s*0/);
});

test("migration creates private bucket, draft states, constraints, cleanup, and atomic bind wrappers", () => {
  assert.match(migration, /'discussion-media'[\s\S]+false/);
  assert.match(migration, /upload_status in \('temporary', 'uploaded', 'bound', 'failed', 'deleted'\)/);
  assert.match(migration, /discussion\/' \|\| p_user_id::text \|\| '\/' \|\| p_draft_id::text/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /create_discussion_post_with_media_service/);
  assert.match(migration, /create_discussion_comment_with_media_service/);
  assert.match(migration, /discussion_media_cleanup_queue/);
  assert.match(migration, /claim_discussion_media_cleanup_service/);
  assert.match(migration, /complete_discussion_media_cleanup_service/);
  assert.match(migration, /discussion_link_metadata_cache/);
  assert.match(migration, /from public\.discussion_link_metadata_cache c[\s\S]*c\.expires_at > statement_timestamp\(\)/);
  assert.doesNotMatch(migration, /grant\s+(insert|update|delete)[\s\S]+discussion_attachments[\s\S]+authenticated/i);
});

test("media Edge Function derives paths server-side and never trusts a client bucket or path", () => {
  assert.match(mediaFunction, /createSignedUploadUrl\(attachment\.storage_path\)/);
  assert.match(mediaFunction, /create_discussion_upload_service/);
  assert.match(mediaFunction, /confirm_discussion_upload_service/);
  assert.match(mediaFunction, /DISCUSSION_MEDIA_CLEANUP_QA_ENABLED/);
  assert.doesNotMatch(mediaFunction, /body\.(bucket|storage_path)/);
});

test("metadata function enforces redirect, timeout, body, HTML, and SSRF checks", () => {
  assert.match(linkFunction, /MAX_REDIRECTS = 3/);
  assert.match(linkFunction, /MAX_BYTES = 1024 \* 1024/);
  assert.match(linkFunction, /TIMEOUT_MS = 5000/);
  assert.match(linkFunction, /redirect: "manual"/);
  assert.match(linkFunction, /assertPublicDestination\(current\)/);
  assert.match(linkFunction, /text\/html/);
  assert.match(linkFunction, /discussion_link_metadata_cache/);
  assert.match(linkFunction, /headers: \{ "User-Agent": "ChromaticaLab-LinkPreview\/1\.0", "Accept": "text\/html,application\/xhtml\+xml" \}/);
});
