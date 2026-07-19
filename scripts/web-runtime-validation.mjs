import path from "node:path";
import { stat } from "node:fs/promises";

const scriptSourcePattern = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
const externalScriptPattern = /^(?:https?:)?\/\//i;

export function getLocalScriptSources(indexHtml) {
  return [...indexHtml.matchAll(scriptSourcePattern)]
    .map((match) => match[1].trim())
    .filter((source) => source && !externalScriptPattern.test(source))
    .map((source) => source.split(/[?#]/, 1)[0].replace(/^\.\//, ""));
}

async function isFile(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

export async function assertLocalRuntimeScripts({ indexHtml, trackedSourceFiles, outputRoot }) {
  const localScripts = getLocalScriptSources(indexHtml);
  const untrackedScripts = localScripts.filter((script) => !trackedSourceFiles.has(script));
  const missingOutputScripts = [];

  for (const script of localScripts) {
    if (!(await isFile(path.join(outputRoot, script)))) missingOutputScripts.push(script);
  }

  if (untrackedScripts.length || missingOutputScripts.length) {
    const details = [];
    if (untrackedScripts.length) details.push(`not tracked by Git: ${untrackedScripts.join(", ")}`);
    if (missingOutputScripts.length) details.push(`missing from www: ${missingOutputScripts.join(", ")}`);
    throw new Error(`Local runtime script validation failed (${details.join("; ")}).`);
  }

  return localScripts;
}
