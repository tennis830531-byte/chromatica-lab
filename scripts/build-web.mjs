import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(projectRoot, "www");
const webSourceFiles = ["index.html", "app.js", "styles.css", "manifest.webmanifest"];
const assetReferencePattern = /\.\/public\/assets\/[^\s"'`()<>$]+/g;
const serviceWorkerCallPattern = /^registerServiceWorker\(\);$/gm;

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

async function collectDirectoryAssets(directory, output = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectDirectoryAssets(absolutePath, output);
    } else if (entry.isFile()) {
      output.push(path.relative(projectRoot, absolutePath));
    }
  }
  return output;
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

  const sourceStat = await stat(sourcePath);
  if (!sourceStat.isFile()) throw new Error(`Required source is not a file: ${relativePath}`);
  await mkdir(path.dirname(destinationPath), { recursive: true });
  await copyFile(sourcePath, destinationPath);
}

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

const sourceContents = new Map();
for (const sourceFile of webSourceFiles) {
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

for (const soundPath of await collectDirectoryAssets(path.join(projectRoot, "public", "assets", "sounds"))) {
  requiredAssets.add(soundPath);
}

for (const fontPath of await collectDirectoryAssets(path.join(projectRoot, "public", "assets", "fonts"))) {
  requiredAssets.add(fontPath);
}

for (const assetPath of [...requiredAssets].sort()) {
  await copyRelativeFile(assetPath);
}

console.log(`Built Capacitor web bundle with ${requiredAssets.size} runtime assets.`);
