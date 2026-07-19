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
