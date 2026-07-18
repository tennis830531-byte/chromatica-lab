import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createOAuthDiagnostics,
  oauthDiagnosticInternals,
  parseOAuthCallbackMetadata,
} from "../oauth-diagnostics.js";
import {
  createOAuthAttemptController,
  OAUTH_CANCELLATION_GRACE_MS,
} from "../oauth-attempt.js";

function createMemoryStorage() {
  const values = new Map();
  return {
    get length() { return values.size; },
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
}

function createFakeClock() {
  let timestamp = 0;
  let nextTimerId = 1;
  const timers = new Map();
  return {
    now: () => timestamp,
    setTimer(callback, delay) {
      const id = nextTimerId;
      nextTimerId += 1;
      timers.set(id, { callback, deadline: timestamp + delay });
      return id;
    },
    clearTimer(id) { timers.delete(id); },
    advance(duration) {
      const target = timestamp + duration;
      while (true) {
        const due = [...timers.entries()]
          .filter(([, timer]) => timer.deadline <= target)
          .sort((left, right) => left[1].deadline - right[1].deadline)[0];
        if (!due) break;
        const [id, timer] = due;
        timers.delete(id);
        timestamp = timer.deadline;
        timer.callback();
      }
      timestamp = target;
    },
    pendingCount: () => timers.size,
  };
}

function createAttemptHarness(storage = createMemoryStorage()) {
  const clock = createFakeClock();
  const events = [];
  const cancellations = [];
  const settled = [];
  const controller = createOAuthAttemptController({
    storage,
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    onEvent: (event, fields) => events.push({ event, ...fields }),
    onCancellation: (state) => cancellations.push(state),
    onSettled: (reason) => settled.push(reason),
  });
  return { clock, controller, events, cancellations, settled, storage };
}

test("diagnostics correlate lifecycle events without logging callback secrets", () => {
  let timestamp = 1_000;
  const entries = [];
  const diagnostics = createOAuthDiagnostics({
    platform: "android",
    storage: createMemoryStorage(),
    now: () => timestamp,
    random: () => 0.25,
    logger: (entry) => entries.push(entry),
  });

  diagnostics.beginAttempt();
  timestamp += 20;
  diagnostics.record("browserOpenRequested", { browserOpenRequested: true });
  timestamp += 30;
  diagnostics.recordCallback(
    "appUrlOpenReceived",
    "chromaticalab://login-callback?code=secret-authorization-code",
    { appUrlOpenReceived: true },
  );

  assert.equal(entries.length, 3);
  assert.equal(entries[2].relativeTimeMs, 50);
  assert.equal(entries[2].loginAttemptId, entries[0].loginAttemptId);
  assert.equal(entries[2].callbackScheme, "chromaticalab");
  assert.equal(entries[2].callbackHost, "login-callback");
  assert.equal(entries[2].callbackPath, "");
  assert.equal(entries[2].hasAuthorizationCode, true);
  assert.doesNotMatch(JSON.stringify(entries), /secret-authorization-code/);
});

test("diagnostics redact OAuth credentials from error messages", () => {
  const entries = [];
  const diagnostics = createOAuthDiagnostics({ logger: (entry) => entries.push(entry) });
  diagnostics.beginAttempt();
  diagnostics.recordExchangeFailure(new Error(
    "request failed ?code=secret&access_token=also-secret&refresh_token=third-secret",
  ));
  const serialized = JSON.stringify(entries.at(-1));
  assert.doesNotMatch(serialized, /also-secret|third-secret|code=secret/);
  assert.match(serialized, /\[redacted\]/);
});

test("PKCE diagnostics report only presence and upper-bound age", () => {
  let timestamp = 2_000;
  const entries = [];
  const pkceStorage = createMemoryStorage();
  const diagnostics = createOAuthDiagnostics({
    storage: createMemoryStorage(),
    pkceStorage,
    now: () => timestamp,
    logger: (entry) => entries.push(entry),
  });
  diagnostics.beginAttempt();
  pkceStorage.setItem("sb-project-auth-token-code-verifier", "never-log-this-verifier");
  timestamp += 75;
  diagnostics.recordPkceStorage("oauthRequestResolved");
  assert.equal(entries.at(-1).pkceVerifierPresent, true);
  assert.equal(entries.at(-1).pkceVerifierMaxAgeMs, 75);
  assert.doesNotMatch(JSON.stringify(entries), /never-log-this-verifier/);
});

test("browserFinished followed by callback and exchange within 500ms does not cancel", () => {
  const harness = createAttemptHarness();
  harness.controller.beginAttempt("attempt-1");
  harness.controller.handleBrowserFinished();
  harness.clock.advance(500);
  harness.controller.markCallbackReceived("attempt-1");
  harness.controller.markExchangeStarted("attempt-1");
  harness.controller.markExchangeSucceeded();
  harness.clock.advance(OAUTH_CANCELLATION_GRACE_MS);
  assert.equal(harness.cancellations.length, 0);
  assert.equal(harness.controller.getState().completed, true);
});

test("callback success then app Browser.close and browserFinished is ignored", () => {
  const harness = createAttemptHarness();
  harness.controller.beginAttempt("attempt-1");
  harness.controller.markCallbackReceived("attempt-1");
  harness.controller.markExchangeStarted("attempt-1");
  harness.controller.markExchangeSucceeded();
  harness.controller.markBrowserClosedByApp();
  const result = harness.controller.handleBrowserFinished();
  assert.deepEqual(result, { ignored: true, scheduled: false });
  assert.equal(harness.cancellations.length, 0);
});

test("browserFinished without progress displays cancellation once after 2500ms", () => {
  const harness = createAttemptHarness();
  harness.controller.beginAttempt("attempt-1");
  harness.controller.handleBrowserFinished();
  harness.controller.handleBrowserFinished();
  harness.clock.advance(2_499);
  assert.equal(harness.cancellations.length, 0);
  harness.clock.advance(1);
  assert.equal(harness.cancellations.length, 1);
  harness.clock.advance(10_000);
  assert.equal(harness.cancellations.length, 1);
});

test("access_denied callback settles as one explicit cancellation", () => {
  const harness = createAttemptHarness();
  harness.controller.beginAttempt("attempt-1");
  harness.controller.markCallbackReceived("attempt-1");
  harness.controller.markAccessDenied("attempt-1");
  assert.equal(harness.settled.filter((reason) => reason === "accessDenied").length, 1);
  assert.equal(harness.controller.getState().cancelled, true);
  assert.equal(harness.clock.pendingCount(), 0);
});

test("callback code exchange failure settles without cancellation", () => {
  const harness = createAttemptHarness();
  harness.controller.beginAttempt("attempt-1");
  harness.controller.markCallbackReceived("attempt-1");
  harness.controller.markExchangeStarted("attempt-1");
  harness.controller.markFailed("attempt-1");
  harness.clock.advance(10_000);
  assert.deepEqual(harness.settled, ["failed"]);
  assert.equal(harness.cancellations.length, 0);
  assert.equal(harness.controller.getState().cancelled, false);
});

test("session detected before cancellation deadline suppresses cancellation", () => {
  const harness = createAttemptHarness();
  harness.controller.beginAttempt("attempt-1");
  harness.controller.handleBrowserFinished();
  harness.clock.advance(1_000);
  harness.controller.markSessionDetected("attempt-1");
  harness.clock.advance(5_000);
  assert.equal(harness.cancellations.length, 0);
  assert.equal(harness.controller.getState().sessionDetected, true);
});

test("duplicate appUrlOpen authorization code is claimed once", () => {
  const harness = createAttemptHarness();
  harness.controller.beginAttempt("attempt-1");
  assert.equal(harness.controller.claimAuthorizationCode("one-time-code"), true);
  assert.equal(harness.controller.claimAuthorizationCode("one-time-code"), false);
});

test("getLaunchUrl and appUrlOpen receiving the same URL exchange once", () => {
  const harness = createAttemptHarness();
  harness.controller.beginAttempt("attempt-1");
  const processCallback = () => {
    harness.controller.markCallbackReceived("attempt-1");
    return harness.controller.claimAuthorizationCode("shared-code");
  };
  assert.equal(processCallback(), true);
  assert.equal(processCallback(), false);
});

test("a previous cancellation timer cannot affect a new attempt", () => {
  const harness = createAttemptHarness();
  harness.controller.beginAttempt("attempt-1");
  harness.controller.handleBrowserFinished();
  harness.controller.markFailed("attempt-1");
  assert.equal(harness.controller.beginAttempt("attempt-2").created, true);
  harness.clock.advance(10_000);
  assert.equal(harness.cancellations.length, 0);
  assert.equal(harness.controller.getState().loginAttemptId, "attempt-2");
});

test("rapid repeated sign-in cannot create concurrent attempts", () => {
  const harness = createAttemptHarness();
  assert.equal(harness.controller.beginAttempt("attempt-1").created, true);
  assert.equal(harness.controller.beginAttempt("attempt-2").created, false);
  assert.equal(harness.controller.getState().loginAttemptId, "attempt-1");
});

test("Browser.close generated browserFinished remains ignored", () => {
  const harness = createAttemptHarness();
  harness.controller.beginAttempt("attempt-1");
  harness.controller.markBrowserClosedByApp();
  harness.controller.handleBrowserFinished();
  harness.clock.advance(10_000);
  assert.equal(harness.clock.pendingCount(), 0);
  assert.equal(harness.cancellations.length, 0);
});

test("all success, failure, session, explicit cancel, and timeout paths settle once", () => {
  const cases = [
    (controller) => controller.markExchangeSucceeded(),
    (controller) => controller.markFailed("attempt"),
    (controller) => controller.markSessionDetected("attempt"),
    (controller) => controller.markAccessDenied("attempt"),
    (controller, clock) => { controller.handleBrowserFinished(); clock.advance(2_500); },
  ];
  cases.forEach((settle) => {
    const harness = createAttemptHarness();
    harness.controller.beginAttempt("attempt");
    settle(harness.controller, harness.clock);
    assert.equal(harness.settled.length, 1);
    assert.equal(harness.controller.getState().completed, true);
    assert.equal(harness.clock.pendingCount(), 0);
  });
});

test("manifest and auth source document the active Android callback contract", () => {
  const manifest = readFileSync(new URL("../android/app/src/main/AndroidManifest.xml", import.meta.url), "utf8");
  const authSource = readFileSync(new URL("../auth-entry.js", import.meta.url), "utf8");
  assert.match(manifest, /android:launchMode="singleTask"/);
  assert.match(manifest, /android:name="android\.intent\.action\.VIEW"/);
  assert.match(manifest, /android:name="android\.intent\.category\.DEFAULT"/);
  assert.match(manifest, /android:name="android\.intent\.category\.BROWSABLE"/);
  assert.match(manifest, /android:scheme="chromaticalab"/);
  assert.match(manifest, /android:host="login-callback"/);
  assert.match(authSource, /ANDROID_REDIRECT_URL = "chromaticalab:\/\/login-callback"/);
});

test("callback metadata parser never returns query values", () => {
  assert.deepEqual(
    oauthDiagnosticInternals.parseCallbackMetadata(
      "chromaticalab://login-callback/finish?code=do-not-log&state=also-private",
    ),
    {
      callbackScheme: "chromaticalab",
      callbackHost: "login-callback",
      callbackPath: "/finish",
      hasAuthorizationCode: true,
    },
  );
});

test("custom-scheme callback parsing does not depend on WebView URL hostname behavior", () => {
  assert.deepEqual(
    parseOAuthCallbackMetadata("chromaticalab://login-callback?code=never-return-this"),
    {
      callbackScheme: "chromaticalab",
      callbackHost: "login-callback",
      callbackPath: "",
      hasAuthorizationCode: true,
    },
  );
});
