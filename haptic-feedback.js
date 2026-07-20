(function initHapticFeedback(global) {
  "use strict";

  const FALLBACK_DURATIONS = Object.freeze({ tap: 20, close: 40, success: [24, 45, 32], long: 450 });
  let bound = false;

  function plugin() {
    return global.Capacitor?.Plugins?.Haptics || null;
  }

  function fallback(pattern) {
    try {
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") return Boolean(navigator.vibrate(pattern));
    } catch {}
    return false;
  }

  async function invoke(nativeCall, fallbackPattern) {
    const haptics = plugin();
    if (haptics && typeof nativeCall === "function") {
      try {
        await nativeCall(haptics);
        return true;
      } catch {}
    }
    return fallback(fallbackPattern);
  }

  function tap() {
    return invoke((haptics) => haptics.impact({ style: "LIGHT" }), FALLBACK_DURATIONS.tap);
  }

  function close() {
    return invoke((haptics) => haptics.impact({ style: "MEDIUM" }), FALLBACK_DURATIONS.close);
  }

  function success() {
    return invoke((haptics) => haptics.notification({ type: "SUCCESS" }), FALLBACK_DURATIONS.success);
  }

  function long() {
    return invoke((haptics) => haptics.vibrate({ duration: FALLBACK_DURATIONS.long }), FALLBACK_DURATIONS.long);
  }

  function isSupported() {
    return Boolean(plugin() || (typeof navigator !== "undefined" && typeof navigator.vibrate === "function"));
  }

  function resolveFeedback(target) {
    const control = target?.closest?.("button, select, input[type='checkbox'], summary, [data-haptic]");
    if (!control || control.disabled || control.getAttribute("aria-disabled") === "true") return "none";
    const explicit = control.dataset.haptic;
    if (explicit === "none" || explicit === "manual") return explicit;
    const closeLike = /close|cancel|back/i.test(control.id || "")
      || control.hasAttribute("data-practice-back")
      || /關閉|返回|取消|結束/.test(control.getAttribute("aria-label") || "")
      || /^(關閉|返回|取消|稍後再練|退出)/.test(control.textContent?.trim() || "");
    return closeLike ? "close" : "tap";
  }

  function bindGlobalFeedback() {
    if (bound) return;
    bound = true;
    document.addEventListener("click", (event) => {
      if (!event.isTrusted) return;
      const feedback = resolveFeedback(event.target);
      if (feedback === "tap") void tap();
      if (feedback === "close") void close();
    }, true);
  }

  global.ChromaticaHaptics = Object.freeze({ tap, close, success, long, isSupported, bindGlobalFeedback, resolveFeedback });
})(typeof window !== "undefined" ? window : globalThis);
