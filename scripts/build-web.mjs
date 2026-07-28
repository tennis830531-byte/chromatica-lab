import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { assertLocalRuntimeScripts } from "./web-runtime-validation.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(projectRoot, "www");
const webSourceFiles = [
  "index.html",
  "app.js",
  "styles.css",
  "manifest.webmanifest",
  "supabase-config.js",
  "haptic-feedback.js",
  "practice-reminders.js",
  "daily-login-bonus.js",
  "daily-goal-rewards.js",
  "quick-practice.js",
  "metronome-core.js",
  "metronome.js",
  "leaderboard-core.js",
  "leaderboard.js",
  "world-boss-core.js",
  "world-boss.js",
  "announcements.js",
  "push-notifications.js",
  "garden-shared.js",
  "garden-qa.js",
  "auth-runtime.js",
];
const assetReferencePattern = /\.\/public\/assets\/[^"'`()<>$\r\n]+/g;
const serviceWorkerCallPattern = /^\s*registerServiceWorker\(\);$/gm;
const execFileAsync = promisify(execFile);

const { stdout: trackedOutput } = await execFileAsync("git", ["ls-files", "-z"], {
  cwd: projectRoot,
  encoding: "utf8",
});
const trackedSourceFiles = new Set(trackedOutput.split("\0").filter(Boolean));
const reviewAssetHashes = new Map([
  ["public/assets/garden/cards/melody-sprout-art-card.png", "b04847d079a4c73015de745057122e5bbd862a790ee7dc305cb0d0d943d524fc"],
  ["public/assets/garden/cards/mushroom-spirit-art-card.png", "bfc95b9b1cd6467df002915202ccfe06eaa35a362587b2879bfdc28ef81b7cab"],
  ["public/assets/garden/cards/flower-spirit-art-card.png", "d09446af36931e65b8bca6301efce9eca333c884b168007352118cbfcbdb5524"],
  ["public/assets/garden/cards/lucky-clover-spirit-art-card.jpeg", "28134ec95ad2261a16d11a9a9faa894d3f845cf630e09f2cfe4b2c37d546b2ea"],
  ["public/assets/garden/cards/lotus-spirit-art-card.jpeg", "7d8165011f7de4f1c0858d60e7028fd34948712fbc18a547cc3f378f9cb46555"],
  ["public/assets/garden/cards/cactus-spirit-art-card.jpeg", "9d1c9f63686ddea9d25d5eefcab6dba110f0e50e028bcfd76d7bd75f317679be"],
  ["public/assets/garden/plants/lucky-clover-spirit-stage1.png", "cb6c5db6aab0567b6bcd288104c426382b8cd1316f7d21052c8f15f7e5bf0412"],
  ["public/assets/garden/plants/lucky-clover-spirit-stage2.png", "8a360720e6a664d268ae31facc5424b7d299fdca10c618a26dff107d0661bb3b"],
  ["public/assets/garden/plants/lucky-clover-spirit-stage3.png", "4d34fba721b102c2344d2dc91ac5644ad25584309d9f77ffadc655f432837b92"],
  ["public/assets/garden/plants/lotus-spirit-stage1.png", "e74b557da3d7c309c15c02c2bf9ac2fc33364c695d5ab3ef953d93d9149026ec"],
  ["public/assets/garden/plants/lotus-spirit-stage2.png", "41f6d1eae4b53b8dd1772cf8f0832e9d33e705fd863c06b712d0d3d7345bcb4e"],
  ["public/assets/garden/plants/lotus-spirit-stage3.png", "21f6124a10f7e958b902c8329dfc682a9708f7800a03123f7330a41f6c138f1e"],
  ["public/assets/garden/plants/cactus-spirit-stage1.png", "fcb65d4adc20f9ad5601bf8f3a28a1e8ca8d81f986af9a0b8bb7d4e36d9cd0c5"],
  ["public/assets/garden/plants/cactus-spirit-stage2.png", "f56df2a85af6f25c2d5ed230536d0fbd9fedda1647bbb0be00b1e5e429c9027c"],
  ["public/assets/garden/plants/cactus-spirit-stage3.png", "04b0cbee955212880d0c174ac386688554f7abc427d0810f22d180dd66fb3524"],
  ["public/assets/world-boss/100水滴習得技能的icon.png", "3980ef061a250cb2ccf05fbf55603a6444bf036ef09d0709dc6e7ca2ab1bf42b"],
  ["public/assets/world-boss/光之能量.png", "ae0a550107730b3825913f602d5dee370a2dc1a5128c94da4809998a83041682"],
  ["public/assets/world-boss/攻擊按鈕.png", "2dfbc48d3e365d5e776386b883230f08ab4ffe0e580508ff3e705b6ba821adbb"],
  ["public/assets/world-boss/攻擊特效.png", "e5b502fa49076e31083ba6d9762ccc2bb78224073f6636bfe5e7b689df145f03"],
  ["public/assets/world-boss/專屬攻擊技能按鈕.png", "e1061f4145d8e10509f64d3e03e231cb0da28d16ab430e525225a57e840b34be"],
  ["public/assets/world-boss/第一隻boss 樹麻雀 狂暴狀態.png", "e29846c2077e7e82defe9ba8cda11e38fd4fb6851a2e1830958619144f5b7580"],
  ["public/assets/world-boss/第一隻boss 樹麻雀.png", "d9d1a1f3b132462ca69253760250922d36bb86624c3c22302a05c3729f76306a"],
  ["public/assets/world-boss/第一隻boss樹麻雀 死亡狀態.png", "8d7f5f35fc7b9e04df9fc1f2e29f81164d31a2e21f0666c6cfdebc946783b076"],
  ["public/assets/world-boss/boss入口icon.png", "3f74589b4f14e29659831f521fd5f138a61ef6aadae98e46d4ecc6f24e37dc9f"],
  ["public/assets/world-boss/boss入口iocn(死亡狀態）.png", "c7d52e1ddf849fc106357943622f10800b8b0f34a53f4004d2d4958bae5300d2"],
  ["public/assets/world-boss/world-boss-arena-background.png", "53cc3a8696fcdc8aed5ea88a1101cead02cfe30f3a5a94f0969fba0aae592fb4"],
  ["public/assets/world-boss/ChatGPT Image 2026年7月27日 下午05_48_36.png", "c66c2edb5a2a18f40f7765b62cd5f918feecc413591f91b46fc54b5b64cd385a"],
  ["public/assets/garden/backgrounds/collection-stage-gravel.jpg", "7b10e1d07d0fa99881f114714681a3e8cf13c981e18df9b1b4706055395a7056"],
  ["public/assets/garden/backgrounds/starter-selection-grass.jpg", "5725dcc61f9b9203b44ddb85588371ad87a62075ebb80fcbcf2df392d1d2573f"],
  ["public/assets/sounds/精靈採收卡牌音效.wav", "5595e78ebfb781929c8923d257f68f504556912589aef2cc29ee560af5e14f2f"],
  ["public/assets/sounds/The Lament of the Fallen.wav", "7076a94183eddaea1c9a7694a2a8af6cff3660b89149e25c34d2b1b4d0aaa2e3"],
  ["public/assets/sounds/Arcane Surge.wav", "3dfe1e00ac13a90553176090068f7683bf0cc2e93e4f86e99f2206ac6bc475e8"],
  ["public/assets/sounds/精靈普通攻擊_1秒.wav", "122b0e834c0631cd8459386a0d92672f156378635f3a08b2f8c0847dec507e4b"],
  ["public/assets/fonts/cubic-11/Cubic_11.woff2", "d28e92846e00c3696b30d950d4eddf445dd90b2a970e67cdb629796c1997ef67"],
  ["public/assets/fonts/cubic-11/OFL.txt", "bdd640c94530f5845de621089875aefcaec17585dbd4dab191c97118539bf92f"],
  ["public/assets/fonts/cubic-11/SOURCE.md", "d508cdb665c694306b49f38798ba8023166843217d18d29253e052fda28dc3e3"],
  ["public/assets/leaderboard/podium-flag-gold-1.png", "c68f5a548d1039250c116cc91d9753a2e958b01eab4f8039495ac40a42547176"],
  ["public/assets/leaderboard/podium-flag-silver-2.png", "49bb1ccc6db4f7d0956808021dc73653ffc814f0a21888d3b5504c7a34c8a50b"],
  ["public/assets/leaderboard/podium-flag-bronze-3.png", "cb5631b9aa93f860b06a3bbbcc0dcf6c641c679240cfba3da71aef8b6a30fb16"],
  ["public/assets/chromatic-refresh/feature/discussion-forum-icon.png", "7ab08b74038065a96cc33e86c1fc24a58672e82537b6e43d0b41efc3dda2c4d7"],
]);

function normalizeRelativePath(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function assertTrackedSource(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  if (!trackedSourceFiles.has(normalized) && !reviewAssetHashes.has(normalized)) {
    throw new Error(`Required build source is not tracked by Git: ${normalized}`);
  }
}

function isForbiddenOutput(relativePath) {
  const normalized = relativePath.split(path.sep).join("/");
  const fileName = path.basename(normalized);
  return (
    normalized.startsWith("public/assets/chromatic-refresh/docs/") ||
    normalized.startsWith("public/assets/chromatic-refresh/assets/") ||
    /dark-check|check|backup|copy|\(1\)/i.test(fileName) ||
    fileName === "README.txt" ||
    fileName === "CODEX_MASTER_PROMPT.txt"
  );
}

async function copyRelativeFile(relativePath) {
  if (isForbiddenOutput(relativePath)) {
    throw new Error(`Refusing to copy forbidden output: ${relativePath}`);
  }

  const sourcePath = path.resolve(projectRoot, relativePath);
  const destinationPath = path.resolve(outputRoot, relativePath);
  const allowedAssetRoot = path.join(projectRoot, "public", "assets") + path.sep;
  const allowedOutputAssetRoot = path.join(outputRoot, "public", "assets") + path.sep;

  if (relativePath.startsWith(`public${path.sep}assets${path.sep}`)) {
    if (!sourcePath.startsWith(allowedAssetRoot) || !destinationPath.startsWith(allowedOutputAssetRoot)) {
      throw new Error(`Asset path escaped its allowed root: ${relativePath}`);
    }
  }

  assertTrackedSource(relativePath);
  let sourceStat;
  try {
    sourceStat = await stat(sourcePath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`Required tracked source is missing: ${normalizeRelativePath(relativePath)}`);
    }
    throw error;
  }
  if (!sourceStat.isFile()) throw new Error(`Required source is not a file: ${relativePath}`);
  const expectedReviewHash = reviewAssetHashes.get(normalizeRelativePath(relativePath));
  if (expectedReviewHash) {
    const actualReviewHash = createHash("sha256").update(await readFile(sourcePath)).digest("hex");
    if (actualReviewHash !== expectedReviewHash) throw new Error(`Review asset hash mismatch: ${relativePath}`);
  }
  await mkdir(path.dirname(destinationPath), { recursive: true });
  await copyFile(sourcePath, destinationPath);
}

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

const sourceContents = new Map();
for (const sourceFile of webSourceFiles) {
  assertTrackedSource(sourceFile);
  sourceContents.set(sourceFile, await readFile(path.join(projectRoot, sourceFile), "utf8"));
}

const appSource = sourceContents.get("app.js");
const serviceWorkerCalls = appSource.match(serviceWorkerCallPattern) || [];
if (serviceWorkerCalls.length !== 1) {
  throw new Error(`Expected exactly one registerServiceWorker() call, found ${serviceWorkerCalls.length}.`);
}

const nativeAppSource = appSource.replace(
  serviceWorkerCallPattern,
  [
    "// GitHub Pages PWA continues to register sw.js from the root app.js.",
    "// Capacitor packages local assets, so the native bundle works offline without a service worker.",
    "// registerServiceWorker();",
  ].join("\n"),
);

await writeFile(path.join(outputRoot, "app.js"), nativeAppSource, "utf8");
for (const sourceFile of webSourceFiles.filter((file) => file !== "app.js")) {
  await copyRelativeFile(sourceFile);
}

const requiredAssets = new Set();
for (const contents of sourceContents.values()) {
  for (const match of contents.matchAll(assetReferencePattern)) {
    const assetPath = match[0].split(/[?#]/, 1)[0].replace(/^\.\//, "");
    if (assetPath.endsWith("/")) continue;
    requiredAssets.add(assetPath.split("/").join(path.sep));
  }
}

for (const trackedPath of trackedSourceFiles) {
  if (trackedPath.startsWith("public/assets/sounds/") || trackedPath.startsWith("public/assets/fonts/")) {
    requiredAssets.add(trackedPath.split("/").join(path.sep));
  }
}
for (const reviewedPath of reviewAssetHashes.keys()) {
  requiredAssets.add(reviewedPath.split("/").join(path.sep));
}

for (const assetPath of [...requiredAssets].sort()) {
  await copyRelativeFile(assetPath);
}

const localRuntimeScripts = await assertLocalRuntimeScripts({
  indexHtml: sourceContents.get("index.html"),
  trackedSourceFiles,
  outputRoot,
});

console.log(
  `Built Capacitor web bundle with ${requiredAssets.size} runtime assets and ${localRuntimeScripts.length} verified local scripts.`,
);
