import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const ui = fs.readFileSync(path.join(root, "metronome.js"), "utf8");
const viewports = [320, 360, 375, 390, 412, 430];
const signatures = ["2/4", "4/4", "5/4", "6/8", "7/8", "9/8", "12/8", "11/16"];

function beatLayout(viewport, signature) {
  const numerator = Number(signature.split("/")[0]);
  const columns = Math.min(4, Math.max(1, numerator));
  const pageWidth = viewport - 24;
  const contentWidth = pageWidth - 40;
  const gapWidth = (columns - 1) * 8;
  const cellWidth = (contentWidth - gapWidth) / columns;
  return { numerator, columns, rows: Math.ceil(numerator / columns), pageWidth, contentWidth, cellWidth };
}

test("metronome page and every card explicitly allow grid items to shrink", () => {
  assert.match(css, /\.metronome-page[^}]*width:\s*100%[^}]*max-width:\s*100%[^}]*min-width:\s*0/s);
  assert.match(css, /\.metronome-page > \*[\s\S]*?\.metronome-controls[\s\S]*?min-width:\s*0/);
});

test("interactive beat dots are a bounded responsive grid instead of a horizontal flex row", () => {
  const rule = css.match(/\.metronome-beat-dots\s*\{([^}]*)\}/)?.[1] || "";
  assert.match(rule, /display:\s*grid/);
  assert.match(rule, /repeat\(var\(--metronome-beat-columns, 4\), minmax\(0, 1fr\)\)/);
  assert.match(rule, /width:\s*min\(100%, 264px\)/);
  assert.doesNotMatch(rule, /overflow-x|flex/);
});

test("beat buttons remain circular and shrink inside their grid cell", () => {
  const rule = css.match(/\.metronome-beat-dots button\s*\{([^}]*)\}/)?.[1] || "";
  assert.match(rule, /width:\s*48px/);
  assert.match(rule, /max-width:\s*100%/);
  assert.match(rule, /min-width:\s*0/);
  assert.match(rule, /border-radius:\s*50%/);
  assert.doesNotMatch(rule, /flex:\s*0 0|width:\s*64px/);
});

test("rendering caps beat columns at four", () => {
  assert.match(ui, /--metronome-beat-columns[\s\S]*Math\.min\(4, Math\.max\(1, settings\.accents\.length\)\)/);
});

test("stage selectors, BPM and trainer grids use zero-minimum tracks", () => {
  for (const selector of ["metronome-stage-selectors", "metronome-bpm-controls", "metronome-trainer-grid"]) {
    const rule = css.match(new RegExp(`\\.${selector}\\s*\\{([^}]*)\\}`))?.[1] || "";
    assert.match(rule, /minmax\(0,/);
  }
});

test("preset rows and long labels can shrink and wrap", () => {
  assert.match(css, /\.metronome-preset-list li[^}]*grid-template-columns:\s*minmax\(0,1fr\)/);
  assert.match(css, /\.metronome-controls button\s*\{\s*overflow-wrap:\s*anywhere/);
});

for (const viewport of viewports) {
  for (const signature of signatures) {
    test(`${viewport}px ${signature} beat grid remains within its content width`, () => {
      const layout = beatLayout(viewport, signature);
      assert.ok(layout.columns >= 1 && layout.columns <= 4);
      assert.equal(layout.rows, Math.ceil(layout.numerator / 4) || 1);
      assert.ok(layout.cellWidth > 0);
      const occupied = layout.cellWidth * layout.columns + (layout.columns - 1) * 8;
      assert.ok(Math.abs(occupied - layout.contentWidth) <= 0.001);
      assert.ok(occupied <= layout.pageWidth);
    });
  }
}

test("four-column wrapping makes beats 5 through 12 visible on later rows", () => {
  assert.deepEqual(beatLayout(320, "5/4"), { numerator: 5, columns: 4, rows: 2, pageWidth: 296, contentWidth: 256, cellWidth: 58 });
  assert.equal(beatLayout(320, "9/8").rows, 3);
  assert.equal(beatLayout(320, "12/8").rows, 3);
});
