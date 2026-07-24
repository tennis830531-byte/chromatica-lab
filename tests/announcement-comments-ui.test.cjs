const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const announcements = read("announcements.js");
const auth = read("auth-entry.js");
const html = read("index.html");
const css = read("styles.css");
const app = read("app.js");
const leaderboard = read("leaderboard.js");
const migration = read("supabase/migrations/202607240001_expand_announcements_and_comments.sql");
const imageFunction = read("supabase/functions/upload-announcement-image/index.ts");

test("Cubic 11 v1.500 is local, licensed, hashed, and scoped to home and garden plant names", () => {
  const fontPath = path.join(root, "public/assets/fonts/cubic-11/Cubic_11.woff2");
  const licensePath = path.join(root, "public/assets/fonts/cubic-11/OFL.txt");
  const source = read("public/assets/fonts/cubic-11/SOURCE.md");
  assert.equal(crypto.createHash("sha256").update(fs.readFileSync(fontPath)).digest("hex"), "d28e92846e00c3696b30d950d4eddf445dd90b2a970e67cdb629796c1997ef67");
  assert.equal(crypto.createHash("sha256").update(fs.readFileSync(licensePath)).digest("hex"), "bdd640c94530f5845de621089875aefcaec17585dbd4dab191c97118539bf92f");
  assert.match(source, /Version: 1\.500/);
  assert.match(source, /SIL Open Font License 1\.1/);
  assert.match(css, /@font-face \{[^}]*font-family: "Cubic 11";[^}]*Cubic_11\.woff2/s);
  assert.match(css, /#intro \.hero-plant-name-card b \{[^}]*font-family: "Cubic 11", var\(--font-sans\);/s);
  assert.match(css, /#gardenPlantName,\s*#gardenQaPlantName\s*\{[^}]*font-family: "Cubic 11", var\(--font-sans\);/s);
  assert.doesNotMatch(css, /(?:announcement|leaderboard|garden-collection)[^{]*\{[^}]*font-family: "Cubic 11"/s);
});

test("settings exposes one first-row announcement label", () => {
  assert.match(html, /id="announcementsOpen"[\s\S]*?<strong>查看最新公告 〉<\/strong>/);
  assert.doesNotMatch(html.match(/id="announcementsOpen"[\s\S]*?<\/button>/)?.[0] || "", /<span>公告<\/span>|查看公告/);
});

test("latest preview uses the large topic and places the text before its cover image", () => {
  assert.match(announcements, /id="announcementPreviewTopic"[^>]*><\/h2>/);
  assert.match(announcements, /\$\("#announcementPreviewTopic"\)\.textContent = announcement\.large_topic \|\| "公告"/);
  assert.match(announcements, /id="announcementPreviewTitle"/);
  const previewMarkup = announcements.match(/id="announcementPreviewModal"[\s\S]*?<\/article><\/div>/)?.[0] || "";
  assert.ok(previewMarkup.indexOf('id="announcementPreviewBody"') < previewMarkup.indexOf('id="announcementPreviewImage"'));
  assert.ok(previewMarkup.indexOf('class="announcement-actions"') < previewMarkup.indexOf('id="announcementPreviewDismissLabel"'));
  assert.match(announcements, /truncateGraphemes\(announcement\.body, 15\)/);
  assert.match(announcements, /`\$\{segments\.slice\(0, limit\)\.join\(""\)\}\.\.\.\.`/);
  assert.doesNotMatch(announcements, /\.\.\.\.查看更多/);
  assert.match(announcements, /announcementPlainText[\s\S]*replace\(\/\\\[\(\[\^\\\]\\n\]\+\)\\\]\\\(\(https\?/);
  assert.match(css, /\.announcement-modal time \{[^}]*display: block;/s);
  assert.doesNotMatch(css.match(/\.announcement-preview h3 \{[^}]*\}/s)?.[0] || "", /text-overflow|white-space:\s*nowrap/);
});

test("multi-image preview uses the first image and detail renders every ordered image", () => {
  assert.match(announcements, /announcementImages\(announcement\)\[0\]/);
  assert.match(announcements, /function renderAnnouncementImages/);
  assert.match(announcements, /announcementImages\(announcement\)\.forEach/);
  const detailMarkup = announcements.match(/id="announcementFullModal"[\s\S]*?<\/article><\/div>/)?.[0] || "";
  assert.ok(detailMarkup.indexOf('id="announcementFullBody"') < detailMarkup.indexOf('id="announcementFullImages"'));
  assert.match(announcements, /multiple/);
  assert.match(announcements, /image_order/);
  assert.match(migration, /create table public\.announcement_images/);
  assert.match(migration, /insert into public\.announcement_images[\s\S]*a\.image_path/s);
  assert.match(migration, /get_published_announcements_v2/);
});

test("announcement links are restricted to http and https and rendered without HTML injection", () => {
  assert.match(announcements, /\["http:", "https:"\]\.includes\(url\.protocol\)/);
  assert.match(announcements, /document\.createTextNode/);
  assert.match(announcements, /link\.textContent = match\[1\]/);
  assert.match(announcements, /link\.target = "_blank"/);
  assert.match(announcements, /link\.rel = "noopener noreferrer"/);
  assert.doesNotMatch(announcements, /innerHTML\s*=\s*(?:announcement|nextAnnouncement)\.body/);
});

test("admin link errors stay below the link tool and publish success is an explicit modal", () => {
  assert.match(announcements, /id="announcementAdminInsertLink"[\s\S]*id="announcementAdminLinkStatus" class="announcement-link-status" role="status"/);
  assert.match(announcements, /\$\("#announcementAdminLinkStatus"\)\.textContent = "請輸入連結文字及有效的 http／https 網址。"/);
  assert.match(css, /\.announcement-link-status \{[^}]*grid-column: 1 \/ -1;[^}]*color: #b3261e;/s);
  assert.match(announcements, /id="announcementPublishSuccessModal"[\s\S]*>公告已發布<\/h2>/);
  assert.match(announcements, /if \(intent === "publish"\) setVisibleAnnouncementModal\("#announcementPublishSuccessModal"\)/);
  assert.match(announcements, /announcementPublishSuccessConfirm/);
});

test("admin draft list shows the complete large topic without truncation", () => {
  assert.match(announcements, /topic\.className = "announcement-admin-list-topic"; topic\.textContent = announcement\.large_topic \|\| "公告"/);
  assert.match(announcements, /copy\.append\(topic, title, state\)/);
  assert.match(css, /\.announcement-admin-list-topic \{[^}]*white-space: normal;[^}]*overflow-wrap: anywhere;/s);
  assert.match(css, /\.announcement-admin-list-item strong \{[^}]*white-space: normal;[^}]*text-overflow: clip;/s);
});

test("auto preview can be dismissed per announcement and account without hiding manual access", () => {
  assert.match(announcements, /DISMISSED_AUTO_PREVIEW_PREFIX = "chromatica\.announcements\.dismissed-auto\.v1"/);
  assert.match(announcements, /getLeaderboardAccount\?\.\(\)\?\.id/);
  assert.match(announcements, /id="announcementPreviewDismiss" type="checkbox" \/>不再查看此則通知/);
  assert.match(announcements, /if \(isAutoPreviewDismissed\(latest\)\) \{[\s\S]*runtimePreviewShown = true;[\s\S]*return false;/);
  assert.match(announcements, /showPreview\(latest, \{ auto: true \}\)/);
  assert.match(announcements, /setAutoPreviewDismissed\(activeAnnouncement, event\.target\.checked === true\)/);
  assert.match(announcements, /function showPreview\(announcement, \{ returnTo = "", auto = false \} = \{\}\)/);
  assert.match(css, /\.announcement-preview-dismiss\.hidden \{ display: none; \}/);
});

test("admin can reorder and remove images while legacy image fields remain synchronized", () => {
  assert.match(announcements, /\["上移", -1\], \["下移", 1\]/);
  assert.match(announcements, /textContent = "移除"/);
  assert.match(imageFunction, /replace_announcement_images_service/);
  assert.match(migration, /set image_path = case when v_count = 0 then null else p_image_paths\[1\] end/);
  assert.match(migration, /image_version = case when v_count = 0 then 0 else p_image_versions\[1\] end/);
});

test("draft and published announcement deletion is admin-only and removes storage before cascaded data", () => {
  assert.match(announcements, /id="announcementAdminDelete"[\s\S]*>刪除公告<\/button>/);
  assert.match(announcements, /global\.confirm\?\.[\s\S]*global\.confirm\?\./);
  assert.match(imageFunction, /request\.method === "DELETE"/);
  assert.ok(imageFunction.indexOf("storage.from(BUCKET).remove(paths)") < imageFunction.indexOf('admin.rpc("delete_announcement_service"'));
  assert.match(migration, /announcement_id uuid not null references public\.announcements\(id\) on delete cascade/);
  assert.match(migration, /delete_announcement_service/);
  assert.match(migration, /service role required/);
});

test("comments use server-owned leaderboard identity and enforce author/admin deletion", () => {
  assert.match(migration, /create table public\.announcement_comments/);
  assert.match(migration, /join public\.leaderboard_profiles lp on lp\.user_id = ac\.user_id/);
  assert.match(migration, /lp\.is_active = true[\s\S]*lp\.profile_completed = true[\s\S]*lp\.consented_at is not null/);
  assert.match(migration, /user_id = auth\.uid\(\)/);
  assert.match(migration, /ac\.user_id = v_user_id or public\.is_app_admin\(v_user_id\)/);
  assert.match(migration, /char_length\(v_body\) not between 1 and 300/);
  assert.match(announcements, /請先完成排行榜公開資料後再留言/);
  assert.match(announcements, /commentAvatarUrl/);
});

test("comment request IDs and disabled submission prevent duplicate fast taps", () => {
  assert.match(migration, /unique \(user_id, request_id\)/);
  assert.match(migration, /on conflict \(user_id, request_id\) do update/);
  assert.match(announcements, /if \(commentSubmitting \|\| !activeAnnouncement\?\.id\) return/);
  assert.match(announcements, /commentSubmitting = true/);
  assert.match(announcements, /announcementCommentSubmit"\)\.disabled = true/);
});

test("card front reveal has one-shot gold expansion with reduced-motion fallback", () => {
  assert.match(app, /harvest-card-reveal-glow/);
  assert.match(app, /if \(!revealReady \|\| revealed\) return;\s*revealed = true;/);
  assert.match(css, /@keyframes harvestCardGoldenReveal/);
  assert.match(css, /1\.35s/);
  assert.match(css, /radial-gradient/);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*harvest-card-reveal-glow[\s\S]*animation: none/s);
});

test("membership row stays one line without changing its state element", () => {
  assert.match(html, /class="setting-row leaderboard-account-heading"[\s\S]*id="leaderboardAccountTitle"[\s\S]*id="leaderboardAccountMembership"/);
  assert.match(css, /\.leaderboard-account-heading \{[^}]*display: flex;[^}]*white-space: nowrap;/s);
  assert.match(css, /\.leaderboard-account-heading strong \{[^}]*font-size: 12px;/s);
});

test("profile editor follows visualViewport and removes every keyboard listener on close", () => {
  assert.match(leaderboard, /global\.visualViewport/);
  assert.match(leaderboard, /scrollIntoView\(\{ block: "center", inline: "nearest" \}\)/);
  assert.match(leaderboard, /classList\.add\("is-keyboard-editing"\)/);
  assert.match(leaderboard, /modal\.scrollBy\(\{ top: inputRect\.(?:top|bottom) - visible(?:Top|Bottom), behavior: "auto" \}\)/);
  assert.match(leaderboard, /input\.addEventListener\("focus", handleFocus\)/);
  assert.match(leaderboard, /input\.removeEventListener\("focus", handleFocus\)/);
  assert.match(css, /\.leaderboard-profile-backdrop\.is-keyboard-editing\s*\{\s*place-items:\s*start center;/);
  assert.match(html, /id="leaderboardProfileAvatarChoose"[^>]*type="button"/);
  const avatarPickerHandler = leaderboard.match(/const openAvatarPickerFromGesture = \(\) => \{([\s\S]*?)\n    \};/)?.[1] || "";
  assert.match(avatarPickerHandler, /avatarInput\.showPicker\(\)/);
  assert.match(avatarPickerHandler, /if \(!pickerOpened\) avatarInput\.click\(\)/);
  assert.match(avatarPickerHandler, /\$\("#leaderboardProfileName"\)\?\.blur\(\)/);
  assert.ok(avatarPickerHandler.indexOf("showPicker()") < avatarPickerHandler.indexOf(".blur()"));
  assert.match(leaderboard, /leaderboardProfileAvatarChoose"\)\?\.addEventListener\("pointerdown", \(event\) => \{\s*event\.preventDefault\(\);\s*openAvatarPickerFromGesture\(\);/s);
  assert.match(leaderboard, /leaderboardProfileAvatarChoose"\)\?\.addEventListener\("click", \(event\) => \{\s*if \(event\.detail !== 0\) return;\s*openAvatarPickerFromGesture\(\);/s);
  assert.match(css, /#leaderboardProfileAvatarInput\s*\{[^}]*pointer-events:\s*none;/s);
  assert.match(leaderboard, /modal\.style\.maxHeight/);
  assert.match(leaderboard, /addEventListener\("resize", update\)/);
  assert.match(leaderboard, /addEventListener\("scroll", update\)/);
  assert.match(leaderboard, /removeEventListener\?\.\("resize", update\)/);
  assert.match(leaderboard, /removeEventListener\?\.\("scroll", update\)/);
  assert.match(leaderboard, /profileViewportCleanup\?\.\(\)/);
});

test("auth allowlist exposes only the required new RPCs and function method option", () => {
  for (const name of [
    "get_published_announcements_v2",
    "get_admin_announcement_images",
    "get_announcement_comments",
    "create_announcement_comment",
    "delete_announcement_comment",
  ]) assert.match(auth, new RegExp(`"${name}"`));
  assert.match(auth, /async invokeFunction\(name, body, options = \{\}\)/);
});
