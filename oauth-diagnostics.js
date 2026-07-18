const DIAGNOSTIC_STORAGE_KEY = "chromatica.oauth.diagnostic-attempt";

const EMPTY_EVENT_FIELDS = Object.freeze({
  browserOpenRequested: false,
  browserOpenResolved: false,
  appBecameInactive: false,
  appBecameActive: false,
  browserFinishedReceived: false,
  appUrlOpenReceived: false,
  launchUrlReceived: false,
  callbackScheme: "",
  callbackHost: "",
  callbackPath: "",
  hasAuthorizationCode: false,
  exchangeStarted: false,
  exchangeSucceeded: false,
  exchangeFailedErrorName: "",
  exchangeFailedErrorMessage: "",
  sessionDetected: false,
  cancellationScheduled: false,
  cancellationDisplayed: false,
  cancellationReason: "",
  pkceVerifierPresent: false,
  pkceVerifierMaxAgeMs: null,
});

function createAttemptId(now, random) {
  return `oauth-${now().toString(36)}-${Math.floor(random() * 0x1000000).toString(36)}`;
}

function sanitizeErrorText(value) {
  return String(value || "")
    .replace(/([?&](?:code|access_token|refresh_token|code_verifier)=)[^&#\s]+/gi, "$1[redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted-token]")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[redacted-value]")
    .slice(0, 240);
}

export function parseOAuthCallbackMetadata(callbackUrl) {
  const rawUrl = String(callbackUrl || "");
  const hierarchicalMatch = rawUrl.match(/^([A-Za-z][A-Za-z0-9+.-]*):\/\/([^/?#]+)([^?#]*)/);
  if (hierarchicalMatch) {
    return {
      callbackScheme: hierarchicalMatch[1].toLowerCase(),
      callbackHost: hierarchicalMatch[2].toLowerCase(),
      callbackPath: hierarchicalMatch[3] || "",
      hasAuthorizationCode: new URLSearchParams(rawUrl.split("?", 2)[1]?.split("#", 1)[0] || "").has("code"),
    };
  }
  try {
    const url = new URL(rawUrl);
    return {
      callbackScheme: url.protocol.replace(/:$/, ""),
      callbackHost: url.hostname,
      callbackPath: url.pathname,
      hasAuthorizationCode: url.searchParams.has("code"),
    };
  } catch {
    return {};
  }
}

export function createOAuthDiagnostics({
  platform = "unknown",
  storage = null,
  pkceStorage = null,
  now = () => Date.now(),
  random = () => Math.random(),
  logger = (entry) => console.info("[ChromaticaOAuth]", JSON.stringify(entry)),
} = {}) {
  let attempt = null;

  function restoreAttempt() {
    if (attempt || !storage) return attempt;
    try {
      const restored = JSON.parse(storage.getItem(DIAGNOSTIC_STORAGE_KEY) || "null");
      if (restored?.id && Number.isFinite(restored.startedAt)) attempt = restored;
    } catch { /* Diagnostics must never interrupt authentication. */ }
    return attempt;
  }

  function saveAttempt() {
    if (!storage || !attempt) return;
    try { storage.setItem(DIAGNOSTIC_STORAGE_KEY, JSON.stringify(attempt)); } catch { /* Best effort only. */ }
  }

  function ensureAttempt() {
    return restoreAttempt() || beginAttempt();
  }

  function beginAttempt() {
    const startedAt = now();
    attempt = { id: createAttemptId(now, random), startedAt };
    saveAttempt();
    record("loginAttemptStarted");
    return attempt.id;
  }

  function record(event, fields = {}) {
    const current = attempt || restoreAttempt();
    const timestamp = now();
    const entry = {
      relativeTimeMs: current ? Math.max(0, timestamp - current.startedAt) : 0,
      loginAttemptId: current?.id || "none",
      platform,
      event,
      ...EMPTY_EVENT_FIELDS,
      ...fields,
    };
    if (entry.exchangeFailedErrorMessage) {
      entry.exchangeFailedErrorMessage = sanitizeErrorText(entry.exchangeFailedErrorMessage);
    }
    logger(entry);
    return entry;
  }

  function recordCallback(event, callbackUrl, fields = {}) {
    ensureAttempt();
    return record(event, { ...parseOAuthCallbackMetadata(callbackUrl), ...fields });
  }

  function recordPkceStorage(event, fields = {}) {
    const current = ensureAttempt();
    let pkceVerifierPresent = false;
    try {
      for (let index = 0; index < (pkceStorage?.length || 0); index += 1) {
        if (pkceStorage.key(index)?.endsWith("-code-verifier")) {
          pkceVerifierPresent = true;
          break;
        }
      }
    } catch { /* Only report absence when storage inspection is unavailable. */ }
    return record(event, {
      pkceVerifierPresent,
      pkceVerifierMaxAgeMs: pkceVerifierPresent ? Math.max(0, now() - current.startedAt) : null,
      ...fields,
    });
  }

  function recordExchangeFailure(error) {
    return record("exchangeFailed", {
      exchangeFailedErrorName: sanitizeErrorText(error?.name || "Error"),
      exchangeFailedErrorMessage: sanitizeErrorText(error?.message || "Unknown error"),
    });
  }

  return {
    beginAttempt,
    ensureAttempt,
    record,
    recordCallback,
    recordPkceStorage,
    recordExchangeFailure,
  };
}

export const oauthDiagnosticInternals = {
  DIAGNOSTIC_STORAGE_KEY,
  parseCallbackMetadata: parseOAuthCallbackMetadata,
  sanitizeErrorText,
};
