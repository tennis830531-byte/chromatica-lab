const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const edge = fs.readFileSync(path.join(root, "supabase/functions/send-feedback/index.ts"), "utf8");

test("feedback stays in app and invokes the authenticated Edge Function", () => {
  assert.doesNotMatch(`${app}\n${html}`, /mailto:/i);
  assert.doesNotMatch(app, /window\.location\.href\s*=.*mail/i);
  assert.match(app, /invokeFunction\?\.\("send-feedback"/);
  assert.doesNotMatch(html, /重現步驟|feedbackReproductionSteps|reproductionSteps/);
});

test("frontend sends only bounded report metadata", () => {
  const invocation = app.slice(app.indexOf('invokeFunction?.("send-feedback"'), app.indexOf('invokeFunction?.("send-feedback"') + 600);
  assert.doesNotMatch(invocation, /access_token|refresh_token|snapshot|userId|localStorage/i);
  assert.match(invocation, /category/);
  assert.match(invocation, /description/);
  assert.match(invocation, /requestId/);
  assert.doesNotMatch(invocation, /reproductionSteps/);
});

test("Edge Function verifies auth, validates fields, and safely fails without secrets", () => {
  assert.match(edge, /\/auth\/v1\/user/);
  assert.match(edge, /authentication_required/);
  assert.match(edge, /CATEGORIES\.has\(category\)/);
  assert.match(edge, /feedback_not_configured/);
  assert.match(edge, /Idempotency-Key/);
  assert.match(edge, /delivery_failed/);
  assert.doesNotMatch(edge, /service_role/i);
  assert.doesNotMatch(edge, /reproductionSteps|重現步驟/);
});

test("legacy reproductionSteps input is ignored because the function reads only allowed fields", () => {
  assert.match(edge, /const description = cleanText\(payload\.description, 2000\)/);
  assert.doesNotMatch(edge, /payload\.reproductionSteps/);
});

test("description remains required at 10 to 2000 characters", () => {
  assert.match(html, /id="feedbackDescription"[^>]*minlength="10"[^>]*maxlength="2000"[^>]*required/);
  assert.match(app, /description\.length < 10 \|\| description\.length > 2000/);
  assert.match(edge, /description\.length < 10 \|\| description\.length > 2000/);
});
