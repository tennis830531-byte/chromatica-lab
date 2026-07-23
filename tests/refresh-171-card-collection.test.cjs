const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const app = read("app.js");
const shared = read("garden-shared.js");
const qa = read("garden-qa.js");
const html = read("index.html");
const css = read("styles.css");

const cards = [
  ["melody-sprout", "melody-sprout-art-card.png", "89449a74699c411d55c996490f65ede5d37e853093cfea8490151559655a595d"],
  ["mushroom-spirit", "mushroom-spirit-art-card.png", "6ce428e2a445c6910ab5bdc0b448be02fb48e8e6cbb8605e55fe95bfb209c331"],
  ["flower-spirit", "flower-spirit-art-card.png", "2a76be32e4e5ec7c5c7f39eb2bee5e5022d1f37d26319d698342833ed67a450c"],
];

test("confirmed card assets retain their exact bytes and single species mapping", () => {
  for (const [species, file, hash] of cards) {
    const bytes = fs.readFileSync(path.join(root, "public/assets/garden/cards", file));
    assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), hash);
    assert.match(shared, new RegExp(`"${species}": "\\./public/assets/garden/cards/${file.replaceAll(".", "\\.")}"`));
    assert.equal(bytes.subarray(1, 4).toString(), "PNG");
    assert.equal(bytes.readUInt32BE(16), 1024);
    assert.equal(bytes.readUInt32BE(20), 1536);
  }
});

test("collection is four equal 2:3 columns with full art or a same-size card back", () => {
  assert.match(css, /\.garden-collection \{[^}]*repeat\(4, minmax\(0, 1fr\)\)/s);
  assert.match(css, /\.garden-collection-cell \{[^}]*aspect-ratio: 2 \/ 3/s);
  assert.match(css, /\.garden-collection-art-card \{[^}]*object-fit: contain/s);
  assert.match(shared, /garden-collection-art-card/);
  assert.match(shared, /garden-collection-card-back/);
  assert.doesNotMatch(shared, /slot-number|garden-collection-spirit-thumb/);
  assert.match(shared, /garden-collection-head[^>]*><div><h3>。植物精靈圖鑑。<\/h3>/);
  assert.match(css, /\.garden-collection-head \{[^}]*justify-content: center;[^}]*text-align: center;/s);
});

test("harvest persists once before the guarded reveal and targets the exact species slot", () => {
  const harvest = app.match(/function harvestCurrentPlant\([\s\S]*?\n\}/)?.[0] || "";
  assert.match(harvest, /alreadyCollected/);
  assert.match(harvest, /setGardenCollection/);
  assert.match(harvest, /presentHarvestCard\(harvested\)/);
  assert.ok(harvest.indexOf("setGardenCollection") < harvest.indexOf("presentHarvestCard"));
  assert.match(app, /harvestCardAnimationActive/);
  assert.match(app, /data-collection-species/);
  assert.match(app, /dataset\.cardState/);
  assert.match(app, /targetRootSelector: "#gardenQaCollection"/);
  assert.match(app, /primaryActionSelector: "#gardenQaPrimaryAction"/);
  assert.ok(qa.indexOf("saveState(state); render();") < qa.indexOf("options.presentHarvestCard?.(harvested)"));
  assert.match(qa, /if \(harvested\) void options\.presentHarvestCard\?\.\(harvested\)/);
  assert.match(app, /harvest-card-button" data-haptic="manual"/);
  assert.match(app, /if \(revealed\) return;\s*revealed = true;\s*void window\.ChromaticaHaptics\?\.reveal\?\.\(\)/);
  for (const state of ["spinning-back", "revealing", "revealed", "flying", "completed"]) assert.match(app + css, new RegExp(state));
});

test("first card reveal uses one dedicated one-second haptic", () => {
  const haptics = read("haptic-feedback.js");
  assert.match(haptics, /reveal: 1000/);
  assert.match(haptics, /function reveal\(\)/);
  assert.match(haptics, /haptics\.vibrate\(\{ duration: FALLBACK_DURATIONS\.reveal \}\)/);
  assert.match(haptics, /Object\.freeze\(\{ tap, close, success, long, reveal,/);
});

test("formal and QA share the same upper-right garden action position without resizing it", () => {
  const rule = css.match(/\.watering-can-button \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(rule, /right: 8px/);
  assert.match(rule, /top: 6px/);
  assert.match(rule, /width: 76px/);
  assert.match(rule, /height: 76px/);
  assert.doesNotMatch(css, /#gardenQaPrimaryAction\s*\{/);
});

test("detail modal always opens on the art card and flips to the preserved detail controls", () => {
  assert.match(html, /id="gardenSpiritArtPage"[\s\S]*點一下翻頁/);
  assert.match(html, /id="gardenSpiritDetailPage"[\s\S]*gardenSpiritStageList[\s\S]*gardenSpiritEditName|gardenSpiritEditName[\s\S]*gardenSpiritDetailPage/);
  assert.match(app, /gardenSpiritModalPage = "card"/);
  assert.match(app, /function showGardenSpiritDetailPage/);
  assert.match(app, /function showGardenSpiritCardPage/);
  assert.match(app, /updateName/);
  assert.match(app, /setFeatured/);
});

test("QA hero supports nine combinations in session and cannot start formal practice", () => {
  assert.match(html, /data-qa-preview="garden"/);
  assert.match(html, /data-qa-preview="hero"/);
  assert.match(qa, /gardenQaHeroSpecies/);
  assert.match(qa, /gardenQaHeroStage/);
  assert.match(qa, /hero-stage-1", "hero-stage-2", "hero-stage-3/);
  assert.match(qa, /aria-disabled="true"/);
  assert.doesNotMatch(qa, /localStorage/);
});

test("leaderboard pill and daily goals expose only the approved visible copy", () => {
  assert.match(css, /\.leaderboard-card em \{[^}]*color: #fff;[^}]*background: #c43d3d;[^}]*font-size: 10px;[^}]*animation: leaderboardRankPillFlash 900ms ease-in-out infinite;/s);
  assert.match(css, /@keyframes leaderboardRankPillFlash \{[^}]*opacity: 1;[\s\S]*?opacity: 0\.52;/s);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.leaderboard-card em \{\s*animation: none;/s);
  assert.match(html, /<em>查看本週名次<\/em>/);
  assert.doesNotMatch(app, /下一組合：|下一個組合|接下來是/);
});

test("legacy splash uses a centered safe drawable while Android 12 keeps its dedicated system layer", () => {
  const legacy = read("android/app/src/main/res/values/styles.xml");
  const modern = read("android/app/src/main/res/values-v31/styles.xml");
  const safe = read("android/app/src/main/res/drawable/splash_screen_safe.xml");
  const colors = read("android/app/src/main/res/values/colors.xml");
  const mainActivity = read("android/app/src/main/java/com/yrpeng/chromaticalab/MainActivity.java");
  const splash = fs.readFileSync(path.join(root, "android/app/src/main/res/drawable-nodpi/splash_art_portrait.png"));
  assert.match(legacy, /@drawable\/splash_screen_safe/);
  assert.match(safe, /android:width="240dp"/);
  assert.match(safe, /android:height="360dp"/);
  assert.match(safe, /android:gravity="center"/);
  assert.match(modern, /windowSplashScreenAnimatedIcon/);
  assert.match(modern, /postSplashScreenTheme/);
  assert.match(mainActivity, /setImageResource\(R\.drawable\.splash_art_portrait\)/);
  assert.match(mainActivity, /configureSplashArtworkFit\(splashArtwork\)/);
  assert.match(mainActivity, /ImageView\.ScaleType\.FIT_CENTER/);
  assert.doesNotMatch(mainActivity, /ImageView\.ScaleType\.MATRIX/);
  assert.match(mainActivity, /R\.color\.chromatica_splash_background/);
  assert.match(colors, /chromatica_splash_background">#FAD08E</);
  assert.match(safe, /@color\/chromatica_splash_background/);
  assert.equal(splash.readUInt32BE(16), 941);
  assert.equal(splash.readUInt32BE(20), 1672);
  assert.equal(
    crypto.createHash("sha256").update(splash).digest("hex"),
    "a486575d971ae703b72dadcd342d2f15508086a08ee93805dd7dd7f0c4ff9e60"
  );
  assert.doesNotMatch(mainActivity, /setScaleType\(ImageView\.ScaleType\.CENTER_CROP\)/);
});
