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
  "announcements.js",
  "push-notifications.js",
  "garden-shared.js",
  "garden-qa.js",
  "auth-runtime.js",
];
const assetReferencePattern = /\.\/public\/assets\/[^\s"'`()<>$]+/g;
const serviceWorkerCallPattern = /^\s*registerServiceWorker\(\);$/gm;
const execFileAsync = promisify(execFile);

const { stdout: trackedOutput } = await execFileAsync("git", ["ls-files", "-z"], {
  cwd: projectRoot,
  encoding: "utf8",
});
const trackedSourceFiles = new Set(trackedOutput.split("\0").filter(Boolean));
const reviewAssetHashes = new Map([
  ["public/assets/garden/cards/melody-sprout-art-card.png", "89449a74699c411d55c996490f65ede5d37e853093cfea8490151559655a595d"],
  ["public/assets/garden/cards/mushroom-spirit-art-card.png", "6ce428e2a445c6910ab5bdc0b448be02fb48e8e6cbb8605e55fe95bfb209c331"],
  ["public/assets/garden/cards/flower-spirit-art-card.png", "2a76be32e4e5ec7c5c7f39eb2bee5e5022d1f37d26319d698342833ed67a450c"],
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
  if (reviewedPath.startsWith("public/assets/fonts/")) requiredAssets.add(reviewedPath.split("/").join(path.sep));
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
