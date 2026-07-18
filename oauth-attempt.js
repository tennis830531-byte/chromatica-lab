export const OAUTH_CANCELLATION_GRACE_MS = 2_500;
const ATTEMPT_STORAGE_KEY = "chromatica.oauth.attempt-state";

function createState(loginAttemptId, startedAt) {
  return {
    loginAttemptId,
    startedAt,
    callbackReceived: false,
    exchangeStarted: false,
    exchangeSucceeded: false,
    sessionDetected: false,
    browserClosedByApp: false,
    browserFinishedReceived: false,
    cancellationTimer: null,
    cancellationDeadlineAt: null,
    completed: false,
    cancelled: false,
    settledNotified: false,
  };
}

export function createOAuthAttemptController({
  storage = null,
  now = () => Date.now(),
  setTimer = (callback, delay) => setTimeout(callback, delay),
  clearTimer = (timer) => clearTimeout(timer),
  graceMs = OAUTH_CANCELLATION_GRACE_MS,
  onEvent = () => {},
  onCancellation = () => {},
  onSettled = () => {},
} = {}) {
  let state = restoreState();
  const exchangedCodes = new Set();

  function restoreState() {
    if (!storage) return null;
    try {
      const saved = JSON.parse(storage.getItem(ATTEMPT_STORAGE_KEY) || "null");
      if (!saved?.loginAttemptId || !Number.isFinite(saved.startedAt)) return null;
      return { ...createState(saved.loginAttemptId, saved.startedAt), ...saved, cancellationTimer: null };
    } catch {
      return null;
    }
  }

  function persist() {
    if (!storage || !state) return;
    const { cancellationTimer: _timer, ...saved } = state;
    try { storage.setItem(ATTEMPT_STORAGE_KEY, JSON.stringify(saved)); } catch { /* Best effort only. */ }
  }

  function snapshot() {
    if (!state) return null;
    return { ...state, cancellationTimer: Boolean(state.cancellationTimer) };
  }

  function emit(event, fields = {}) {
    onEvent(event, { loginAttemptId: state?.loginAttemptId || "none", ...fields });
  }

  function clearCancellationTimer() {
    if (state?.cancellationTimer !== null && state?.cancellationTimer !== undefined) {
      clearTimer(state.cancellationTimer);
    }
    if (state) {
      state.cancellationTimer = null;
      state.cancellationDeadlineAt = null;
      persist();
    }
  }

  function notifySettled(reason) {
    if (!state || state.settledNotified) return;
    state.settledNotified = true;
    persist();
    onSettled(reason, snapshot());
  }

  function ensureAttempt(loginAttemptId) {
    if (!state) {
      state = createState(loginAttemptId, now());
      persist();
    }
    return state;
  }

  function beginAttempt(loginAttemptId) {
    if (state && !state.completed && !state.cancelled) {
      return { created: false, state: snapshot() };
    }
    clearCancellationTimer();
    state = createState(loginAttemptId, now());
    persist();
    emit("attemptStateCreated");
    return { created: true, state: snapshot() };
  }

  function markCallbackReceived(loginAttemptId) {
    ensureAttempt(loginAttemptId);
    state.callbackReceived = true;
    clearCancellationTimer();
    persist();
    emit("callbackReceived", { callbackReceived: true });
  }

  function markExchangeStarted(loginAttemptId) {
    ensureAttempt(loginAttemptId);
    state.exchangeStarted = true;
    clearCancellationTimer();
    persist();
    emit("exchangeStateStarted", { exchangeStarted: true });
  }

  function markExchangeSucceeded() {
    if (!state) return;
    state.exchangeSucceeded = true;
    state.completed = true;
    clearCancellationTimer();
    persist();
    emit("exchangeStateSucceeded", { exchangeSucceeded: true });
    notifySettled("exchangeSucceeded");
  }

  function markSessionDetected(loginAttemptId) {
    ensureAttempt(loginAttemptId);
    state.sessionDetected = true;
    state.completed = true;
    clearCancellationTimer();
    persist();
    emit("sessionStateDetected", { sessionDetected: true });
    notifySettled("sessionDetected");
  }

  function markBrowserClosedByApp() {
    if (!state) return;
    state.browserClosedByApp = true;
    clearCancellationTimer();
    persist();
    emit("browserClosedByApp", { browserClosedByApp: true });
  }

  function markAccessDenied(loginAttemptId) {
    ensureAttempt(loginAttemptId);
    state.callbackReceived = true;
    state.cancelled = true;
    state.completed = true;
    clearCancellationTimer();
    persist();
    emit("accessDenied", {
      callbackReceived: true,
      cancellationDisplayed: true,
      cancellationReason: "access_denied callback",
    });
    notifySettled("accessDenied");
  }

  function markFailed(loginAttemptId) {
    ensureAttempt(loginAttemptId);
    state.completed = true;
    clearCancellationTimer();
    persist();
    emit("attemptFailed");
    notifySettled("failed");
  }

  function shouldSuppressCancellation() {
    return !state
      || state.browserClosedByApp
      || state.callbackReceived
      || state.exchangeStarted
      || state.exchangeSucceeded
      || state.sessionDetected
      || state.completed;
  }

  function finishCancellation() {
    if (!state) return;
    state.cancellationTimer = null;
    state.cancellationDeadlineAt = null;
    if (shouldSuppressCancellation()) {
      persist();
      emit("cancellationIgnored", { cancellationReason: "attempt progressed during grace period" });
      return;
    }
    state.cancelled = true;
    state.completed = true;
    persist();
    emit("cancellationDisplayed", {
      cancellationDisplayed: true,
      cancellationReason: "browserFinished grace period elapsed",
    });
    notifySettled("cancelled");
    onCancellation(snapshot());
  }

  function scheduleCancellation(delay = graceMs) {
    if (!state || state.cancellationTimer || shouldSuppressCancellation()) return false;
    state.cancellationDeadlineAt = now() + delay;
    state.cancellationTimer = setTimer(finishCancellation, delay);
    persist();
    emit("cancellationScheduled", {
      cancellationScheduled: true,
      cancellationReason: "browserFinished without callback, exchange, or session",
    });
    return true;
  }

  function handleBrowserFinished() {
    if (!state) return { ignored: true, scheduled: false };
    state.browserFinishedReceived = true;
    persist();
    emit("browserFinishedStateReceived", { browserFinishedReceived: true });
    if (shouldSuppressCancellation()) {
      emit("browserFinishedIgnored", {
        cancellationReason: state.browserClosedByApp
          ? "browser closed by app"
          : "attempt already progressed",
      });
      return { ignored: true, scheduled: false };
    }
    return { ignored: false, scheduled: scheduleCancellation() };
  }

  function claimAuthorizationCode(code) {
    if (!code || exchangedCodes.has(code)) return false;
    exchangedCodes.add(code);
    return true;
  }

  if (state?.cancellationDeadlineAt && !state.completed && !state.cancelled) {
    scheduleCancellation(Math.max(0, state.cancellationDeadlineAt - now()));
  }

  return {
    beginAttempt,
    ensureAttempt,
    markCallbackReceived,
    markExchangeStarted,
    markExchangeSucceeded,
    markSessionDetected,
    markBrowserClosedByApp,
    markAccessDenied,
    markFailed,
    handleBrowserFinished,
    claimAuthorizationCode,
    clearCancellationTimer,
    getState: snapshot,
  };
}

export const oauthAttemptInternals = { ATTEMPT_STORAGE_KEY };
