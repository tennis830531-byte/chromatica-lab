import { execFile } from "node:child_process";
import { copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(projectRoot, "www");
const webSourceFiles = ["index.html", "app.js", "styles.css", "manifest.webmanifest"];
const assetReferencePattern = /\.\/public\/assets\/[^\s"'`()<>$]+/g;
const serviceWorkerCallPattern = /^registerServiceWorker\(\);$/gm;
const execFileAsync = promisify(execFile);

const { stdout: trackedOutput } = await execFileAsync("git", ["ls-files", "-z"], {
  cwd: projectRoot,
  encoding: "utf8",
});
const trackedSourceFiles = new Set(trackedOutput.split("\0").filter(Boolean));

function normalizeRelativePath(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function assertTrackedSource(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  if (!trackedSourceFiles.has(normalized)) {
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

for (const assetPath of [...requiredAssets].sort()) {
  await copyRelativeFile(assetPath);
}

console.log(`Built Capacitor web bundle with ${requiredAssets.size} runtime assets.`);
