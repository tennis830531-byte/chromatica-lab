const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const fixture = path.join(__dirname, "fixtures", "leaderboard-row-visual.html");

function inspect(width) {
  const result = spawnSync(chrome, [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    `--window-size=${width},900`, "--allow-file-access-from-files", "--virtual-time-budget=3000",
    "--dump-dom", `file://${fixture}?viewport=${width}`,
  ], { encoding: "utf8", timeout: 30000 });
  assert.equal(result.status, 0, result.stderr || "headless Chrome failed");
  const encoded = result.stdout.match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1] || "";
  return JSON.parse(encoded.replaceAll("&quot;", '"').replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">"));
}

test("leaderboard rows keep long names podium avatars spirits and scores inside narrow phones", () => {
  for (const width of [390, 412, 430]) {
    const result = inspect(width);
    assert.ok(result.documentWidth <= result.viewport, `${width}px horizontal overflow`);
    for (const row of result.rows) {
      assert.equal(row.columnGap, "13px");
      assert.ok(row.rankAvatarGap > 0);
      assert.ok(row.avatarNameGap > 0);
      assert.equal(row.nameSpiritAligned, true);
      assert.ok(row.scoreRightInset >= 9);
      assert.equal(row.nameEllipsis, "ellipsis");
      assert.equal(row.nameOverflowContained, true);
      assert.ok(row.box.left >= 8 && row.box.right <= result.viewport - 8);
    }
  }
});

test("leaderboard desktop grid retains the approved sixteen-pixel column gap", () => {
  const result = inspect(720);
  assert.ok(result.documentWidth <= result.viewport);
  for (const row of result.rows) {
    assert.equal(row.columnGap, "16px");
    assert.ok(row.rankAvatarGap >= 16);
    assert.ok(row.avatarNameGap >= 16);
    assert.ok(row.scoreRightInset >= 9);
  }
});
