import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("exit control is Android-only and preserves the signed-in account", () => {
  assert.match(app, /appExitBtn"\)\?\.classList\.toggle\("hidden", !isNativeAndroidApp\(\)\)/);
  assert.match(app, /if \(appExitBusy \|\| !isNativeAndroidApp\(\)\) return/);
  assert.match(html, /將關閉 App，您的 Google 帳號仍會保持登入/);
  assert.doesNotMatch(app.match(/async function confirmAppExit\(\)[\s\S]*?\n}/)?.[0] || "", /signOut|clearActiveAccount|cancelPracticeReminder/);
});

test("exit flushes locally before bounded best-effort cloud sync and exitApp", () => {
  const body = app.match(/async function confirmAppExit\(\)[\s\S]*?\n}/)?.[0] || "";
  assert.ok(body.indexOf("flushSave") < body.indexOf("syncBestEffort"));
  assert.ok(body.indexOf("syncBestEffort") < body.indexOf("exitApp"));
  assert.match(body, /window\.setTimeout\(resolve, 1500\)/);
  assert.match(body, /無法保存目前資料，請稍後再試/);
});
