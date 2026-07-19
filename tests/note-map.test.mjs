import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const appSource = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");

test("note map uses each model's authoritative mapping", () => {
  assert.match(appSource, /const layout = makeLayout\(selectedHoles\)/);
  assert.doesNotMatch(appSource, /makeLayout\(16\)\.slice/);
  for (const holes of [12, 14, 16]) {
    const block = appSource.match(new RegExp(`\\n  ${holes}: \\{([\\s\\S]*?)\\n  \\},`))?.[1] || "";
    for (const key of ["blow", "draw", "buttonBlow", "buttonDraw"]) {
      const values = block.match(new RegExp(`${key}: \\[([^\\]]+)\\]`))?.[1]
        .split(",").map((value) => value.trim()).filter(Boolean) || [];
      assert.equal(values.length, holes, `${holes}-hole ${key} mapping length`);
    }
  }
});

test("holes are accessible circular buttons in an eight-wide scrolling row", () => {
  assert.match(html, /id="noteMapHoles"[^>]*aria-label="口琴孔位"/);
  assert.match(appSource, /aria-label="第 \$\{hole\} 孔" aria-pressed=/);
  assert.match(css, /\.note-map-holes[\s\S]*?overflow-x: auto/);
  assert.match(css, /calc\(\(100% - 56px\) \/ 8\)/);
  assert.match(css, /\.note-map-hole[\s\S]*?border-radius: 50%/);
});

test("hole labels use low-register upper dots before the standard twelve-hole numbering", () => {
  assert.match(appSource, /function getNoteMapHoleDisplay\(holeCount, hole\)/);
  assert.match(appSource, /const lowRegisterOffset = Math\.max\(0, holeCount - 12\)/);
  assert.match(appSource, /label: String\(hole \+ \(4 - lowRegisterOffset\)\)/);
  assert.match(appSource, /label: String\(hole - lowRegisterOffset\)/);
  assert.match(appSource, /function renderNoteMapHoleNumber\(display\)/);
  assert.match(appSource, /第 \$\{renderNoteMapHoleNumber\(selectedDisplay\)\} 孔/);
  assert.match(css, /\.note-map-number\.has-upper-dot::before[\s\S]*?position: absolute/);
});
