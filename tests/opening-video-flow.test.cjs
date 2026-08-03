const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const opening = read("opening-video.js");
const html = read("index.html");
const css = read("styles.css");
const app = read("app.js");
const auth = read("auth-entry.js");
const activity = read("android/app/src/main/java/com/yrpeng/chromaticalab/MainActivity.java");
const androidColors = read("android/app/src/main/res/values/colors.xml");

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
    assert.match(overlayRule, /overflow: hidden/);
    assert.match(videoRule, /width: 100%/);
    assert.match(videoRule, /height: 100%/);
    assert.match(videoRule, /object-fit: contain/);
  }],
  ["Android WebView permits autoplay with sound", () => {
    assert.match(activity, /setMediaPlaybackRequiresUserGesture\(false\)/);
    assert.match(opening, /video\.muted = false/);
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
