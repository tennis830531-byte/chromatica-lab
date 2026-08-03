(function initializeChromaticaOpeningVideo(global) {
  "use strict";

  const VIDEO_ASSET = "./public/assets/video/chromatica-opening-0801.mp4";
  const SKIP_REVEAL_DELAY_MS = 5_000;
  const CAPTION_FONT_SPEC = '400 20px "Chromatica Opening Cubic 11"';
  const NARROW_CAPTION_MAX_WIDTH = 380;
  const OPENING_CAPTIONS = Object.freeze([
    Object.freeze({ start: 0, end: 5, text: "音符的芽？！", secondsPerCharacter: 0.14 }),
    Object.freeze({ start: 5, end: 10, text: "旋律芽芽誕生了！", secondsPerCharacter: 0.11 }),
    Object.freeze({ start: 10, end: 15, text: "走走，對齊節拍器～", secondsPerCharacter: 0.10 }),
    Object.freeze({ start: 15, end: 20, text: "努力吹準……", secondsPerCharacter: 0.14 }),
    Object.freeze({ start: 20, end: 25, text: "認真吹長音～", secondsPerCharacter: 0.13 }),
    Object.freeze({ start: 25, end: 30, text: "蒐集努力的水滴……", secondsPerCharacter: 0.10 }),
    Object.freeze({ start: 30, end: 35, text: "和同伴們一起討論口琴！", secondsPerCharacter: 0.08, narrowBreakAfter: 6 }),
    Object.freeze({ start: 35, end: 40, text: "爭取排行榜第一！！", secondsPerCharacter: 0.10 }),
    Object.freeze({ start: 40, end: 45, text: "變身了嗎？！", secondsPerCharacter: 0.13 }),
    Object.freeze({ start: 45, end: 50, text: "黑色暗影來襲……？！", secondsPerCharacter: 0.10 }),
    Object.freeze({ start: 50, end: 55, text: "討伐世界 BOSS！", secondsPerCharacter: 0.085 }),
    Object.freeze({ start: 55, end: 60, text: "歡迎來到 CH 練習室＾＾", secondsPerCharacter: 0.08 }),
  ]);
  const statusListeners = new Set();
  let preloadStatus = "pending";
  let preloadProgress = 0;
  let preloadPromise = null;
  let objectUrl = "";
  let playedThisRuntime = false;
  let bypassedForDeepLink = false;
  let activePlayback = null;
  let resumeAfterForeground = false;
  let skipRevealTimer = null;
  let captionAnimationFrame = null;
  let captionCleanup = null;
  let lastCaptionRenderKey = "";

  const byId = (id) => global.document?.getElementById(id) || null;

  function publishStatus(status, progress = preloadProgress) {
    preloadStatus = status;
    preloadProgress = Math.max(0, Math.min(100, Number(progress) || 0));
    statusListeners.forEach((listener) => listener({ status: preloadStatus, progress: preloadProgress }));
  }

  function loadCompleteVideoBlob() {
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open("GET", VIDEO_ASSET, true);
      request.responseType = "blob";
      request.addEventListener("progress", (event) => {
        if (!event.lengthComputable || !event.total) return;
        publishStatus("loading", Math.floor((event.loaded / event.total) * 100));
      });
      request.addEventListener("load", () => {
        if (request.status && (request.status < 200 || request.status >= 300)) {
          reject(new Error(`opening-video-http-${request.status}`));
          return;
        }
        const blob = request.response;
        if (!(blob instanceof Blob) || !blob.size) {
          reject(new Error("opening-video-empty"));
          return;
        }
        resolve(blob);
      });
      request.addEventListener("error", () => reject(new Error("opening-video-read-failed")));
      request.addEventListener("abort", () => reject(new Error("opening-video-read-aborted")));
      request.send();
    });
  }

  function startPreload() {
    if (preloadPromise) return preloadPromise;
    publishStatus("loading", 0);
    preloadPromise = loadCompleteVideoBlob()
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        const video = byId("openingVideo");
        if (!video) throw new Error("opening-video-element-missing");
        video.src = objectUrl;
        video.load();
        return new Promise((resolve, reject) => {
          const ready = () => {
            cleanup();
            resolve(true);
          };
          const failed = () => {
            cleanup();
            reject(new Error("opening-video-decode-failed"));
          };
          const cleanup = () => {
            video.removeEventListener("canplaythrough", ready);
            video.removeEventListener("error", failed);
          };
          if (video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) ready();
          else {
            video.addEventListener("canplaythrough", ready, { once: true });
            video.addEventListener("error", failed, { once: true });
          }
        });
      })
      .then(() => {
        publishStatus("ready", 100);
        return true;
      })
      .catch(() => {
        publishStatus("error", 100);
        return false;
      });
    return preloadPromise;
  }

  function clearSkipTimer() {
    if (skipRevealTimer !== null) {
      global.clearTimeout(skipRevealTimer);
      skipRevealTimer = null;
    }
  }

  function getCaptionStateAtTime(currentTime, duration = 60) {
    const time = Math.max(0, Number(currentTime) || 0);
    const actualDuration = Math.max(0, Number(duration) || 0);
    const captionIndex = OPENING_CAPTIONS.findIndex((caption, index) => {
      const effectiveEnd = index === OPENING_CAPTIONS.length - 1
        ? Math.max(caption.end, actualDuration)
        : caption.end;
      return time >= caption.start && (index === OPENING_CAPTIONS.length - 1 ? time <= effectiveEnd : time < effectiveEnd);
    });
    if (captionIndex < 0) return null;
    const caption = OPENING_CAPTIONS[captionIndex];
    const characters = Array.from(caption.text);
    const elapsed = Math.max(0, time - caption.start);
    const visibleCharacters = elapsed <= 0
      ? 0
      : Math.min(characters.length, Math.floor(elapsed / caption.secondsPerCharacter) + 1);
    return {
      captionIndex,
      caption,
      visibleCharacters,
      visibleText: characters.slice(0, visibleCharacters).join(""),
    };
  }

  function formatCaptionText(caption, text, narrow) {
    if (!caption?.narrowBreakAfter || !narrow) return text;
    const characters = Array.from(text);
    if (characters.length <= caption.narrowBreakAfter) return text;
    return `${characters.slice(0, caption.narrowBreakAfter).join("")}\n${characters.slice(caption.narrowBreakAfter).join("")}`;
  }

  function updateCaptionLayout(video) {
    const wrapper = byId("openingVideoWrapper");
    if (!wrapper || !video?.videoWidth || !video?.videoHeight) return;
    const bounds = wrapper.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const renderedHeight = Math.min(bounds.height, bounds.width * (video.videoHeight / video.videoWidth));
    const captionAreaHeight = Math.max(0, bounds.height - renderedHeight);
    wrapper.style.setProperty("--opening-caption-top", `${Math.round(renderedHeight)}px`);
    wrapper.style.setProperty("--opening-caption-area-height", `${Math.round(captionAreaHeight)}px`);
  }

  function renderOpeningCaption(video) {
    const layer = byId("openingCaptionLayer");
    const widthReference = byId("openingCaptionWidthReference");
    const visibleText = byId("openingCaptionText");
    if (!layer || !widthReference || !visibleText || !video) return;
    const state = getCaptionStateAtTime(video.currentTime, video.duration);
    if (!state) {
      if (lastCaptionRenderKey !== "empty") {
        widthReference.textContent = "";
        visibleText.textContent = "";
        lastCaptionRenderKey = "empty";
      }
      return;
    }
    const narrow = layer.getBoundingClientRect().width <= NARROW_CAPTION_MAX_WIDTH;
    const renderKey = `${state.captionIndex}:${state.visibleCharacters}:${narrow ? 1 : 0}`;
    if (renderKey === lastCaptionRenderKey) return;
    widthReference.textContent = formatCaptionText(state.caption, state.caption.text, narrow);
    visibleText.textContent = formatCaptionText(state.caption, state.visibleText, narrow);
    lastCaptionRenderKey = renderKey;
  }

  function cancelCaptionAnimationFrame() {
    if (captionAnimationFrame === null) return;
    global.cancelAnimationFrame?.(captionAnimationFrame);
    captionAnimationFrame = null;
  }

  function clearOpeningCaption() {
    const widthReference = byId("openingCaptionWidthReference");
    const visibleText = byId("openingCaptionText");
    if (widthReference) widthReference.textContent = "";
    if (visibleText) visibleText.textContent = "";
    lastCaptionRenderKey = "";
  }

  function stopOpeningCaptionSync() {
    cancelCaptionAnimationFrame();
    captionCleanup?.();
    captionCleanup = null;
    clearOpeningCaption();
  }

  function startOpeningCaptionSync(video) {
    stopOpeningCaptionSync();
    const update = () => renderOpeningCaption(video);
    const tick = () => {
      captionAnimationFrame = null;
      update();
      if (activePlayback && !activePlayback.finished && !video.paused && !video.ended) {
        captionAnimationFrame = global.requestAnimationFrame?.(tick) ?? null;
      }
    };
    const startAnimation = () => {
      cancelCaptionAnimationFrame();
      update();
      if (!video.paused && !video.ended) captionAnimationFrame = global.requestAnimationFrame?.(tick) ?? null;
    };
    const stopAnimation = () => {
      cancelCaptionAnimationFrame();
      update();
    };
    const updateLayout = () => {
      updateCaptionLayout(video);
      lastCaptionRenderKey = "";
      update();
    };
    const videoEvents = [
      ["timeupdate", update],
      ["play", startAnimation],
      ["pause", stopAnimation],
      ["seeked", update],
      ["ended", stopAnimation],
      ["loadedmetadata", updateLayout],
    ];
    videoEvents.forEach(([eventName, listener]) => video.addEventListener(eventName, listener));
    global.addEventListener?.("resize", updateLayout);
    captionCleanup = () => {
      videoEvents.forEach(([eventName, listener]) => video.removeEventListener(eventName, listener));
      global.removeEventListener?.("resize", updateLayout);
    };
    updateLayout();
  }

  async function ensureOpeningCaptionFont() {
    try {
      if (!global.document?.fonts?.load) return true;
      await global.document.fonts.load(CAPTION_FONT_SPEC);
      return global.document.fonts.check?.(CAPTION_FONT_SPEC) !== false;
    } catch {
      return false;
    }
  }

  function releaseObjectUrl() {
    if (!objectUrl) return;
    URL.revokeObjectURL(objectUrl);
    objectUrl = "";
  }

  function enterOpeningVideoImmersiveMode() {
    try {
      global.ChromaticaOpeningVideoNative?.enterOpeningVideoImmersiveMode?.();
    } catch {
      // The browser build has no Android system UI bridge.
    }
  }

  function exitOpeningVideoImmersiveMode() {
    try {
      global.ChromaticaOpeningVideoNative?.exitOpeningVideoImmersiveMode?.();
    } catch {
      // The browser build has no Android system UI bridge.
    }
  }

  function finishPlayback(reason) {
    exitOpeningVideoImmersiveMode();
    stopOpeningCaptionSync();
    if (!activePlayback || activePlayback.finished) return false;
    activePlayback.finished = true;
    clearSkipTimer();
    const video = byId("openingVideo");
    const overlay = byId("openingVideoOverlay");
    const skip = byId("openingVideoSkip");
    video?.pause();
    if (skip) skip.classList.add("hidden");
    overlay?.classList.add("hidden");
    overlay?.setAttribute("aria-hidden", "true");
    global.document?.body?.classList.remove("opening-video-active");
    releaseObjectUrl();
    if (video) {
      video.removeAttribute("src");
      video.load();
    }
    const resolve = activePlayback.resolve;
    activePlayback = null;
    resolve?.(reason);
    return true;
  }

  async function playForOrdinaryStartup() {
    if (playedThisRuntime || bypassedForDeepLink) {
      exitOpeningVideoImmersiveMode();
      return "bypassed";
    }
    playedThisRuntime = true;
    const loaded = await startPreload();
    if (!loaded || bypassedForDeepLink) {
      exitOpeningVideoImmersiveMode();
      return "unavailable";
    }
    const video = byId("openingVideo");
    const overlay = byId("openingVideoOverlay");
    const skip = byId("openingVideoSkip");
    if (!video || !overlay || !skip) {
      exitOpeningVideoImmersiveMode();
      return "unavailable";
    }

    const completion = new Promise((resolve) => {
      activePlayback = { resolve, finished: false };
    });
    try {
      await ensureOpeningCaptionFont();
      enterOpeningVideoImmersiveMode();
      overlay.classList.remove("hidden");
      overlay.setAttribute("aria-hidden", "false");
      skip.classList.add("hidden");
      global.document.body.classList.add("opening-video-active");
      video.currentTime = 0;
      startOpeningCaptionSync(video);
      video.muted = false;
      video.volume = 1;
      await video.play();
      skipRevealTimer = global.setTimeout(() => {
        if (activePlayback && !activePlayback.finished) skip.classList.remove("hidden");
      }, SKIP_REVEAL_DELAY_MS);
    } catch {
      finishPlayback("play-error");
    }
    return completion;
  }

  function bypassForDeepLink() {
    bypassedForDeepLink = true;
    if (!finishPlayback("deep-link")) exitOpeningVideoImmersiveMode();
  }

  function bind() {
    const video = byId("openingVideo");
    const skip = byId("openingVideoSkip");
    video?.addEventListener("ended", () => finishPlayback("ended"));
    video?.addEventListener("error", () => {
      if (preloadStatus === "ready") finishPlayback("playback-error");
    });
    skip?.addEventListener("click", () => finishPlayback("skipped"));
    global.document?.addEventListener("visibilitychange", () => {
      if (!activePlayback || activePlayback.finished || !video) return;
      if (global.document.visibilityState === "hidden") {
        resumeAfterForeground = !video.paused;
        video.pause();
      } else {
        enterOpeningVideoImmersiveMode();
        if (resumeAfterForeground) {
          resumeAfterForeground = false;
          void video.play().catch(() => finishPlayback("resume-error"));
        }
      }
    });
    global.addEventListener?.("pagehide", () => finishPlayback("page-hidden"));
    global.addEventListener?.("beforeunload", exitOpeningVideoImmersiveMode);
    startPreload();
  }

  const openingVideoApi = {
    startPreload,
    playForOrdinaryStartup,
    bypassForDeepLink,
    enterOpeningVideoImmersiveMode,
    exitOpeningVideoImmersiveMode,
    getPreloadStatus: () => preloadStatus,
    getPreloadProgress: () => preloadProgress,
    onPreloadStatus(listener) {
      if (typeof listener !== "function") return () => {};
      statusListeners.add(listener);
      listener({ status: preloadStatus, progress: preloadProgress });
      return () => statusListeners.delete(listener);
    },
  };
  if (global.__CHROMATICA_OPENING_VIDEO_TEST__) {
    openingVideoApi.__testing = Object.freeze({
      captions: OPENING_CAPTIONS,
      getCaptionStateAtTime,
      formatCaptionText,
    });
  }
  global.ChromaticaOpeningVideo = Object.freeze(openingVideoApi);

  if (global.document?.readyState === "loading") global.document.addEventListener("DOMContentLoaded", bind, { once: true });
  else bind();
})(typeof window !== "undefined" ? window : globalThis);
