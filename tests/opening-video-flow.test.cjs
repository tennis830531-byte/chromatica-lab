const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const opening = read("opening-video.js");
const html = read("index.html");
const css = read("styles.css");
const app = read("app.js");
const auth = read("auth-entry.js");
const activity = read("android/app/src/main/java/com/yrpeng/chromaticalab/MainActivity.java");
const androidColors = read("android/app/src/main/res/values/colors.xml");

const openingSandbox = {
  __CHROMATICA_OPENING_VIDEO_TEST__: true,
  document: {
    readyState: "loading",
    addEventListener() {},
  },
};
openingSandbox.window = openingSandbox;
vm.createContext(openingSandbox);
vm.runInContext(opening, openingSandbox);
const captionTesting = openingSandbox.ChromaticaOpeningVideo.__testing;

const tests = [
  ["local MP4 is preloaded as a complete Blob before playback", () => {
    assert.match(opening, /request\.responseType = "blob"/);
    assert.match(opening, /event\.loaded \/ event\.total/);
    assert.match(opening, /resolve\(blob\)/);
    assert.match(opening, /publishStatus\("ready", 100\)/);
    assert.doesNotMatch(opening, /preload-timeout|Promise\.race/);
  }],
  ["native splash waits for video readiness", () => {
    assert.match(auth, /videoStatus:/);
    assert.match(activity, /webVideoReady/);
    assert.match(activity, /!webImagesReady \|\| !webVideoReady/);
  }],
  ["ordinary startup plays once per runtime without watched persistence", () => {
    assert.match(opening, /playedThisRuntime/);
    assert.doesNotMatch(opening, /playAfterSplash|chromatica:startup-splash-finished/);
    assert.match(app, /startOrdinaryOpeningVideoAfterSplash\(\)[\s\S]*chromatica:startup-splash-finished/);
    assert.match(app, /ordinaryOpeningVideoPromise/);
    assert.doesNotMatch(opening, /localStorage|sessionStorage|indexedDB/);
  }],
  ["completion skip and errors release the existing startup gates exactly once", () => {
    assert.match(app, /ordinaryStartupContinuationRequested/);
    assert.match(app, /if \(ordinaryStartupContinuationRequested\) return/);
    assert.match(app, /startOrdinaryOpeningVideoAfterSplash\(\)\.then\(continueOrdinaryStartupAfterOpeningVideo\)/);
    assert.match(app, /function continueOrdinaryStartupAfterOpeningVideo\(\)[\s\S]*ensureInitialProfileBeforeAnnouncements\(\)/);
    assert.match(app, /Promise\.resolve\(window\.ChromaticaOpeningVideo\?\.playForOrdinaryStartup/);
  }],
  ["skip appears after five seconds and completion is guarded", () => {
    assert.match(opening, /SKIP_REVEAL_DELAY_MS = 5_000/);
    assert.match(opening, /activePlayback\.finished/);
    assert.match(opening, /addEventListener\("ended"/);
  }],
  ["video pauses in background and resumes in foreground", () => {
    assert.match(opening, /visibilitychange/);
    assert.match(opening, /video\.pause\(\)/);
    assert.match(opening, /resumeAfterForeground/);
    assert.match(opening, /else \{[\s\S]*enterOpeningVideoImmersiveMode\(\)[\s\S]*if \(resumeAfterForeground\)[\s\S]*video\.play\(\)/);
  }],
  ["notification navigation bypasses the opening presentation", () => {
    assert.match(app, /openHomeFromPushNotification\(\)[\s\S]*bypassForDeepLink/);
  }],
  ["fullscreen overlay preserves aspect ratio and places the compact skip control at bottom-center", () => {
    assert.match(html, /id="openingVideoOverlay"/);
    assert.match(html, /playsinline/);
    assert.doesNotMatch(html, /id="openingVideo"[^>]*controls/);
    assert.match(css, /\.opening-video[\s\S]*object-fit: contain/);
    assert.match(css, /\.opening-video[\s\S]*max-width: 100vw/);
    assert.match(css, /\.opening-video[\s\S]*max-height: 100dvh/);
    assert.match(css, /\.opening-video-skip[\s\S]*bottom: calc\(14px \+ env\(safe-area-inset-bottom/);
    assert.match(css, /\.opening-video-skip[\s\S]*left: 50%/);
    assert.match(css, /\.opening-video-skip[\s\S]*transform: translateX\(-50%\)/);
    assert.match(css, /\.opening-video-skip[\s\S]*font-size: 13px/);
  }],
  ["opening letterbox reuses the exact native splash color in every appearance mode", () => {
    const nativeSplashColor = androidColors.match(/chromatica_splash_background">#([0-9A-Fa-f]{6})</)?.[1]?.toLowerCase();
    const webSplashColor = css.match(/--splash-background:\s*#([0-9A-Fa-f]{6})/)?.[1]?.toLowerCase();
    const overlayRule = css.match(/\.opening-video-overlay\s*\{[\s\S]*?\}/)?.[0] || "";
    const videoRule = css.match(/\.opening-video\s*\{[\s\S]*?\}/)?.[0] || "";
    assert.equal(webSplashColor, nativeSplashColor);
    assert.match(overlayRule, /background: var\(--splash-background\)/);
    assert.match(videoRule, /background: var\(--splash-background\)/);
    assert.doesNotMatch(overlayRule + videoRule, /#000|#17120f|rgb\(0\s*,\s*0\s*,\s*0\)|black/);
    assert.equal((css.match(/--splash-background\s*:/g) || []).length, 1);
  }],
  ["skip remains bottom-safe and tappable with black text on a transparent surface", () => {
    const skipRule = css.match(/\.opening-video-skip\s*\{[\s\S]*?\}/)?.[0] || "";
    assert.match(skipRule, /bottom: calc\(14px \+ env\(safe-area-inset-bottom, 0px\)\)/);
    assert.match(skipRule, /min-width: 52px/);
    assert.match(skipRule, /min-height: 34px/);
    assert.match(skipRule, /color: #000/);
    assert.match(skipRule, /background: transparent/);
    assert.match(skipRule, /border: 0/);
    assert.match(skipRule, /box-shadow: none/);
    assert.doesNotMatch(skipRule, /rgba\(24, 17, 13|#fffaf0|backdrop-filter/);
  }],
  ["fixed overlay and contained video stay bounded on 360px and non-matching aspect ratios", () => {
    const overlayRule = css.match(/\.opening-video-overlay\s*\{[\s\S]*?\}/)?.[0] || "";
    const videoRule = css.match(/\.opening-video\s*\{[\s\S]*?\}/)?.[0] || "";
    assert.match(overlayRule, /position: fixed/);
    assert.match(overlayRule, /inset: 0/);
    assert.match(overlayRule, /width: 100vw/);
    assert.match(overlayRule, /height: 100dvh/);
    assert.match(overlayRule, /z-index: 2147483647/);
    assert.match(overlayRule, /overflow: hidden/);
    assert.match(videoRule, /width: 100vw/);
    assert.match(videoRule, /height: 100dvh/);
    assert.match(videoRule, /object-fit: contain/);
    assert.match(videoRule, /object-position: center top/);
  }],
  ["opening playback controls real Android immersive sticky system UI", () => {
    assert.match(activity, /addJavascriptInterface\([\s\S]*OpeningVideoSystemUiBridge[\s\S]*"ChromaticaOpeningVideoNative"/);
    assert.match(activity, /private void enterOpeningVideoImmersiveMode\(\)[\s\S]*openingVideoImmersiveActive = true[\s\S]*applySystemBarMode\(\)/);
    assert.match(activity, /fullArtworkSplashActive \|\| openingVideoImmersiveActive[\s\S]*hide\(WindowInsetsCompat\.Type\.systemBars\(\)\)/);
    assert.match(activity, /BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE/);
    assert.match(activity, /openingVideoImmersiveActive\s*\? webViewInitialTopMargin\s*:\s*webViewInitialTopMargin \+ topInsets\.top/);
    assert.match(opening, /activePlayback = \{ resolve, finished: false \}[\s\S]*enterOpeningVideoImmersiveMode\(\)[\s\S]*overlay\.classList\.remove\("hidden"\)/);
    assert.match(activity, /public final class OpeningVideoSystemUiBridge/);
  }],
  ["every opening completion path restores the original system bar mode", () => {
    assert.match(opening, /function finishPlayback\(reason\) \{[\s\S]*exitOpeningVideoImmersiveMode\(\)/);
    assert.match(activity, /private void exitOpeningVideoImmersiveMode\(\)[\s\S]*openingVideoImmersiveActive = false[\s\S]*applySystemBarMode\(\)/);
    assert.match(opening, /addEventListener\("ended", \(\) => finishPlayback\("ended"\)\)/);
    assert.match(opening, /addEventListener\("click", \(\) => finishPlayback\("skipped"\)\)/);
    assert.match(opening, /finishPlayback\("playback-error"\)/);
    assert.match(opening, /bypassForDeepLink\(\)[\s\S]*finishPlayback\("deep-link"\)/);
    assert.match(opening, /pagehide[\s\S]*finishPlayback\("page-hidden"\)/);
  }],
  ["Android WebView permits autoplay with sound", () => {
    assert.match(activity, /setMediaPlaybackRequiresUserGesture\(false\)/);
    assert.match(opening, /video\.muted = false/);
  }],
  ["opening caption DOM shares the video wrapper without intercepting controls", () => {
    assert.match(html, /id="openingVideoWrapper"[\s\S]*id="openingVideo"[\s\S]*id="openingCaptionLayer"/);
    assert.match(html, /id="openingCaptionLayer"[^>]*aria-live="off"[^>]*aria-hidden="true"/);
    const layerRule = css.match(/\.opening-caption-layer\s*\{[\s\S]*?\}/)?.[0] || "";
    assert.match(layerRule, /position: absolute/);
    assert.match(layerRule, /left: 5%/);
    assert.match(layerRule, /right: 5%/);
    assert.match(layerRule, /pointer-events: none/);
    assert.match(layerRule, /overflow: hidden/);
  }],
  ["Cubic 11 caption face is local blocking white outlined and panel-free", () => {
    assert.match(css, /font-family: "Chromatica Opening Cubic 11";[\s\S]*Cubic_11\.woff2[\s\S]*font-display: block/);
    const frameRule = css.match(/\.opening-caption-frame\s*\{[\s\S]*?\}/)?.[0] || "";
    assert.match(frameRule, /font-family: "Chromatica Opening Cubic 11", sans-serif/);
    assert.match(frameRule, /font-size: 20px/);
    assert.match(frameRule, /color: #fff/);
    assert.match(frameRule, /text-shadow:[\s\S]*-2px -2px 0 #000[\s\S]*2px 2px 0 #000/);
    assert.doesNotMatch(frameRule, /-webkit-text-stroke/);
    assert.doesNotMatch(frameRule, /background/);
  }],
  ["twelve caption scenes retain the approved five-second timeline", () => {
    assert.equal(captionTesting.captions.length, 12);
    assert.deepEqual(
      JSON.parse(JSON.stringify(captionTesting.captions.map(({ start, end, text }) => ({ start, end, text })))),
      [
        { start: 0, end: 5, text: "音符的芽？！" },
        { start: 5, end: 10, text: "旋律芽芽誕生了！" },
        { start: 10, end: 15, text: "走走，對齊節拍器～" },
        { start: 15, end: 20, text: "努力吹準……" },
        { start: 20, end: 25, text: "認真吹長音～" },
        { start: 25, end: 30, text: "蒐集努力的水滴……" },
        { start: 30, end: 35, text: "和同伴們一起討論口琴！" },
        { start: 35, end: 40, text: "爭取排行榜第一！！" },
        { start: 40, end: 45, text: "變身了嗎？！" },
        { start: 45, end: 50, text: "黑色暗影來襲……？！" },
        { start: 50, end: 55, text: "討伐世界 BOSS！" },
        { start: 55, end: 60, text: "歡迎來到 CH 練習室＾＾" },
      ],
    );
  }],
  ["caption typing is derived only from currentTime and seeks deterministically", () => {
    assert.equal(captionTesting.getCaptionStateAtTime(0, 60.441).visibleText, "");
    assert.equal(captionTesting.getCaptionStateAtTime(0.15, 60.441).visibleText, "音符");
    assert.equal(captionTesting.getCaptionStateAtTime(4.99, 60.441).visibleText, "音符的芽？！");
    assert.equal(captionTesting.getCaptionStateAtTime(5, 60.441).captionIndex, 1);
    assert.equal(captionTesting.getCaptionStateAtTime(5, 60.441).visibleText, "");
    assert.equal(captionTesting.getCaptionStateAtTime(32, 60.441).captionIndex, 6);
    assert.equal(captionTesting.getCaptionStateAtTime(32, 60.441).visibleText, "和同伴們一起討論口琴！");
    assert.equal(captionTesting.getCaptionStateAtTime(3, 60.441).captionIndex, 0);
    assert.equal(captionTesting.getCaptionStateAtTime(60.441, 60.441).visibleText, "歡迎來到 CH 練習室＾＾");
    assert.match(opening, /renderOpeningCaption\(video\)[\s\S]*video\.currentTime/);
    assert.doesNotMatch(opening, /caption[\s\S]{0,80}setTimeout/i);
  }],
  ["pause seek replay and completion own one cancellable caption loop", () => {
    assert.match(opening, /\["timeupdate", update\]/);
    assert.match(opening, /\["play", startAnimation\]/);
    assert.match(opening, /\["pause", stopAnimation\]/);
    assert.match(opening, /\["seeked", update\]/);
    assert.match(opening, /\["ended", stopAnimation\]/);
    assert.match(opening, /\["loadedmetadata", updateLayout\]/);
    assert.match(opening, /cancelAnimationFrame/);
    assert.match(opening, /finishPlayback\(reason\)[\s\S]*stopOpeningCaptionSync\(\)/);
    assert.match(opening, /captionCleanup[\s\S]*removeEventListener/);
  }],
  ["stable reference width prevents typewriter recentering and narrow scene seven wraps", () => {
    assert.match(html, /id="openingCaptionWidthReference"[\s\S]*id="openingCaptionText"/);
    assert.match(css, /\.opening-caption-width-reference[\s\S]*visibility: hidden/);
    assert.match(css, /\.opening-caption-text[\s\S]*position: absolute[\s\S]*left: 0/);
    const seventh = captionTesting.captions[6];
    assert.equal(captionTesting.formatCaptionText(seventh, seventh.text, false), seventh.text);
    assert.equal(captionTesting.formatCaptionText(seventh, seventh.text, true), "和同伴們一起\n討論口琴！");
  }],
  ["caption layout uses the contained video height and remains inside the lower safe area", () => {
    assert.match(opening, /bounds\.width \* \(video\.videoHeight \/ video\.videoWidth\)/);
    assert.match(opening, /captionAreaHeight = Math\.max\(0, bounds\.height - renderedHeight\)/);
    assert.match(css, /height: var\(--opening-caption-area-height, 22%\)/);
    assert.match(css, /padding-bottom: env\(safe-area-inset-bottom, 0px\)/);
    assert.match(css, /max-width: 100%/);
    assert.match(css, /word-break: keep-all/);
  }],
  ["skip clears captions and leaves no listener or text on the home screen", () => {
    assert.match(opening, /skip\?\.addEventListener\("click", \(\) => finishPlayback\("skipped"\)\)/);
    assert.match(opening, /stopOpeningCaptionSync\(\)[\s\S]*clearOpeningCaption\(\)/);
    assert.match(opening, /widthReference\.textContent = ""/);
    assert.match(opening, /visibleText\.textContent = ""/);
  }],
  ["the refresh-178 source video bytes remain unchanged and no subtitle video is added", () => {
    const videoPath = path.join(root, "public/assets/video/chromatica-opening-0801.mp4");
    const digest = crypto.createHash("sha256").update(fs.readFileSync(videoPath)).digest("hex");
    assert.equal(digest, "d55339f098fc34e1c7027c323402ac8509bf3b8142122a941a7847fa5f630563");
    const projectVideos = fs.readdirSync(path.dirname(videoPath)).filter((name) => name.endsWith(".mp4"));
    assert.deepEqual(projectVideos, ["chromatica-opening-0801.mp4"]);
  }],
];

let failed = 0;
for (const [name, test] of tests) {
  try {
    test();
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}`);
    console.error(error.message);
  }
}
console.log(`${tests.length - failed}/${tests.length} opening video tests passed`);
if (failed) process.exitCode = 1;
