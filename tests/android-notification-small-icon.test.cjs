const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
const manifestSource = fs.readFileSync(
  path.join(root, "android/app/src/main/AndroidManifest.xml"),
  "utf8",
);
const colorsSource = fs.readFileSync(
  path.join(root, "android/app/src/main/res/values/colors.xml"),
  "utf8",
);
const iconPath = path.join(
  root,
  "android/app/src/main/res/drawable/ic_stat_chromatica_notification.xml",
);
const iconSource = fs.readFileSync(iconPath, "utf8");
const activitySource = fs.readFileSync(
  path.join(root, "android/app/src/main/java/com/yrpeng/chromaticalab/MainActivity.java"),
  "utf8",
);
const pushSource = fs.readFileSync(path.join(root, "push-notifications.js"), "utf8");

test("Android notification drawable is a transparent monochrome harmonica and sprout vector", () => {
  assert.equal(fs.existsSync(iconPath), true);
  assert.match(iconSource, /<vector[\s\S]*android:viewportWidth="24"[\s\S]*android:viewportHeight="24"/);
  assert.match(iconSource, /android:fillColor="#FFFFFFFF"/);
  assert.match(iconSource, /android:fillType="evenOdd"/);
  assert.doesNotMatch(iconSource, /<bitmap|android:alpha=|#[0-9A-Fa-f]{6}(?!FF)/);
  assert.doesNotMatch(iconSource, /M12,2a7,7|bell/i);
});

test("formal and QA local reminders use the Chromatica small icon and approved tint", () => {
  const iconReferences = appSource.match(/smallIcon:\s*"ic_stat_chromatica_notification"/g) || [];
  const colorReferences = appSource.match(/iconColor:\s*"#8A5A32"/g) || [];
  assert.equal(iconReferences.length, 2);
  assert.equal(colorReferences.length, 2);
  assert.doesNotMatch(appSource, /smallIcon:\s*"ic_practice_notification"/);
});

test("FCM defaults point to the Chromatica notification icon and color exactly once", () => {
  assert.equal(
    (manifestSource.match(/com\.google\.firebase\.messaging\.default_notification_icon/g) || []).length,
    1,
  );
  assert.equal(
    (manifestSource.match(/com\.google\.firebase\.messaging\.default_notification_color/g) || []).length,
    1,
  );
  assert.match(
    manifestSource,
    /android:name="com\.google\.firebase\.messaging\.default_notification_icon"\s+android:resource="@drawable\/ic_stat_chromatica_notification"/,
  );
  assert.match(
    manifestSource,
    /android:name="com\.google\.firebase\.messaging\.default_notification_color"\s+android:resource="@color\/chromatica_notification_icon_color"/,
  );
  assert.match(colorsSource, /<color name="chromatica_notification_icon_color">#8A5A32<\/color>/);
});

test("launcher icons and notification click single-task routing remain unchanged", () => {
  assert.match(manifestSource, /android:icon="@mipmap\/ic_launcher"/);
  assert.match(manifestSource, /android:roundIcon="@mipmap\/ic_launcher_round"/);
  assert.match(manifestSource, /android:launchMode="singleTask"/);
  assert.match(activitySource, /protected void onNewIntent\(Intent intent\)/);
  assert.match(pushSource, /pushNotificationActionPerformed/);
  assert.match(pushSource, /openHomeFromPushNotification/);
});
