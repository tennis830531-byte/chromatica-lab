import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFile, mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

import { assertLocalRuntimeScripts, getLocalScriptSources } from "../scripts/web-runtime-validation.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(projectRoot, "www");
const indexHtml = await readFile(path.join(projectRoot, "index.html"), "utf8");
const localScripts = getLocalScriptSources(indexHtml);
const trackedSourceFiles = new Set(
  execFileSync("git", ["ls-files", "-z"], { cwd: projectRoot, encoding: "utf8" }).split("\0").filter(Boolean),
);

test("every local index script is tracked and exists in www", async () => {
  const verified = await assertLocalRuntimeScripts({ indexHtml, trackedSourceFiles, outputRoot });
  assert.deepEqual(verified, localScripts);
});

for (const script of ["daily-login-bonus.js", "daily-goal-rewards.js", "quick-practice.js", "metronome-core.js", "metronome.js", "garden-qa.js", "app.js", "auth-runtime.js"]) {
  test(`${script} exists in the web bundle`, () => {
    assert.ok(localScripts.includes(script));
    assert.ok(trackedSourceFiles.has(script));
  });
}

test("runtime validation fails when any required script is removed", async () => {
  const temporaryOutput = await mkdtemp(path.join(os.tmpdir(), "chromatica-runtime-test-"));
  try {
    for (const script of localScripts) {
      await mkdir(path.dirname(path.join(temporaryOutput, script)), { recursive: true });
      await copyFile(path.join(outputRoot, script), path.join(temporaryOutput, script));
    }
    await rm(path.join(temporaryOutput, "quick-practice.js"));
    await assert.rejects(
      assertLocalRuntimeScripts({ indexHtml, trackedSourceFiles, outputRoot: temporaryOutput }),
      /missing from www: quick-practice\.js/,
    );
  } finally {
    await rm(temporaryOutput, { recursive: true, force: true });
  }
});

test("native web bundle excludes sw.js", async () => {
  await assert.rejects(readFile(path.join(outputRoot, "sw.js")), { code: "ENOENT" });
});

test("daily login runtime is available before app initialization", async () => {
  const context = vm.createContext({});
  context.window = context;
  vm.runInContext(await readFile(path.join(outputRoot, "daily-login-bonus.js"), "utf8"), context);
  assert.equal(typeof context.window.ChromaticaDailyLoginBonusCore?.createController, "function");
  assert.ok(localScripts.indexOf("daily-login-bonus.js") < localScripts.indexOf("app.js"));
});

test("quick practice runtime is available before app initialization", async () => {
  const context = vm.createContext({});
  context.window = context;
  vm.runInContext(await readFile(path.join(outputRoot, "quick-practice.js"), "utf8"), context);
  assert.equal(typeof context.window.ChromaticaQuickPracticeCore, "object");
  assert.ok(localScripts.indexOf("quick-practice.js") < localScripts.indexOf("app.js"));
});

test("daily goal reward runtime is available before app initialization", async () => {
  const context = vm.createContext({});
  context.window = context;
  vm.runInContext(await readFile(path.join(outputRoot, "daily-goal-rewards.js"), "utf8"), context);
  assert.equal(typeof context.window.ChromaticaDailyGoalRewardCore?.createController, "function");
  assert.ok(localScripts.indexOf("daily-goal-rewards.js") < localScripts.indexOf("app.js"));
});

test("metronome and garden QA runtimes load before app initialization", async () => {
  for (const script of ["metronome-core.js", "metronome.js", "garden-qa.js"]) {
    assert.ok(localScripts.indexOf(script) < localScripts.indexOf("app.js"));
  }
});

test("microphone gate controls and click handler registrations remain bundled", async () => {
  const bundledHtml = await readFile(path.join(outputRoot, "index.html"), "utf8");
  const bundledApp = await readFile(path.join(outputRoot, "app.js"), "utf8");
  assert.match(bundledHtml, /id="micGateBtn"/);
  assert.match(bundledHtml, /id="micGateSkip"/);
  assert.match(bundledApp, /\$\("#micGateBtn"\)\.addEventListener\("click", async \(\) =>/);
  assert.match(bundledApp, /\$\("#micGateSkip"\)\.addEventListener\("click", \(\) =>/);
});
