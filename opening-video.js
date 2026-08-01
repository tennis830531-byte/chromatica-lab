(function initializeChromaticaOpeningVideo(global) {
  "use strict";

  const VIDEO_ASSET = "./public/assets/video/chromatica-opening-0801.mp4";
  const SKIP_REVEAL_DELAY_MS = 5_000;
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

  function releaseObjectUrl() {
    if (!objectUrl) return;
    URL.revokeObjectURL(objectUrl);
    objectUrl = "";
  }

  function finishPlayback(reason) {
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
    const resolve = activePlayback.resolve;
    activePlayback = null;
    resolve?.(reason);
    return true;
  }

  async function playForOrdinaryStartup() {
    if (playedThisRuntime || bypassedForDeepLink) return "bypassed";
    playedThisRuntime = true;
    const loaded = await startPreload();
    if (!loaded || bypassedForDeepLink) return "unavailable";
    const video = byId("openingVideo");
    const overlay = byId("openingVideoOverlay");
    const skip = byId("openingVideoSkip");
    if (!video || !overlay || !skip) return "unavailable";

    overlay.classList.remove("hidden");
    overlay.setAttribute("aria-hidden", "false");
    skip.classList.add("hidden");
    global.document.body.classList.add("opening-video-active");
    video.currentTime = 0;
    video.muted = false;
    video.volume = 1;

    const completion = new Promise((resolve) => {
      activePlayback = { resolve, finished: false };
    });
    try {
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
    finishPlayback("deep-link");
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
      } else if (resumeAfterForeground) {
        resumeAfterForeground = false;
        void video.play().catch(() => finishPlayback("resume-error"));
      }
    });
    startPreload();
  }

  global.ChromaticaOpeningVideo = Object.freeze({
    startPreload,
    playForOrdinaryStartup,
    bypassForDeepLink,
    getPreloadStatus: () => preloadStatus,
    getPreloadProgress: () => preloadProgress,
    onPreloadStatus(listener) {
      if (typeof listener !== "function") return () => {};
      statusListeners.add(listener);
      listener({ status: preloadStatus, progress: preloadProgress });
      return () => statusListeners.delete(listener);
    },
  });

  if (global.document?.readyState === "loading") global.document.addEventListener("DOMContentLoaded", bind, { once: true });
  else bind();
})(typeof window !== "undefined" ? window : globalThis);
