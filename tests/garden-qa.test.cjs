const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const source = fs.readFileSync(path.join(__dirname, "..", "garden-qa.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const account = fs.readFileSync(path.join(__dirname, "..", "account-workspace.js"), "utf8");

test("stores only the expected password hash", () => {
  assert.match(source, /c8797332d85b5f34680d5df15de8f6ab3ec5045e469c7f5cf5043b22d3deb23b/);
  assert.doesNotMatch(source, /90947822/);
  assert.equal(crypto.createHash("sha256").update("90947822").digest("hex"), "c8797332d85b5f34680d5df15de8f6ab3ec5045e469c7f5cf5043b22d3deb23b");
});
test("49 title clicks stay hidden and click 50 opens", () => { assert.match(source, /REQUIRED_CLICKS = 50/); assert.match(source, /titleClicks < REQUIRED_CLICKS/); assert.match(source, /setModal\(true\)/); });
test("only the visible hero title owns the hidden listener", () => { assert.match(html, /id="homeHeroQaTitle">半音階口琴練習室/); assert.match(source, /#homeHeroQaTitle.*addEventListener\("click"/); });
test("hero image has no QA click target", () => { assert.doesNotMatch(source, /home-hero|hero-copy|homeHeroQaImage|heroPlantSlot/); });
test("container blank clicks have no QA listener", () => { assert.doesNotMatch(source, /\.home-hero.*addEventListener|\.hero-copy.*addEventListener/); });
test("password field is numeric, private and not saved", () => { assert.match(html, /id="gardenQaPassword" type="password" inputmode="numeric" maxlength="8" autocomplete="off"/); assert.doesNotMatch(source, /localStorage/); });
test("five failures lock for thirty seconds", () => { assert.match(source, /MAX_FAILURES = 5/); assert.match(source, /LOCK_MS = 30000/); assert.match(source, /lockedUntil = Date\.now\(\) \+ LOCK_MS/); });
test("sandbox uses sessionStorage only", () => { assert.match(source, /sessionStorage/); assert.doesNotMatch(source, /localStorage|indexedDB/); });
test("sandbox schema has unlimited water and isolated garden fields", () => { for (const field of ["schemaVersion","currentPlant","collection","featuredSpiritId","featuredSpiritStage","starterPlantSelected","unlimitedWater"]) assert.match(source, new RegExp(field)); assert.match(source, /unlimitedWater: true/); });
test("QA water displays infinity and watering does not decrement", () => { assert.match(source, /gardenQaWater.*∞/); assert.doesNotMatch(source, /waterDrops|setWaterDrops|chromatica\.waterDrops/); });
test("QA supports progression mature harvest collection rename and featured", () => { for (const token of ["water","fill","mature","harvest","collection","customName","featuredSpiritId"]) assert.match(source, new RegExp(token)); });
test("QA module cannot invoke formal save or cloud APIs", () => { assert.doesNotMatch(source, /scheduleAccountSnapshotSave|flushSave|noteLocalSnapshot|syncBestEffort|save_game_state|cloudSaveService/); });
test("QA keys are not account scoped", () => { assert.doesNotMatch(account, /qaGardenSandbox|qaGardenMode/); });
test("formal garden keys are absent from QA module", () => { for (const key of ["chromatica.waterDrops","chromatica.currentPlant","chromatica.spiritCollection","chromatica.featuredSpiritId","chromatica.featuredSpiritStage","chromatica.starterPlantSelected"]) assert.doesNotMatch(source, new RegExp(key.replaceAll(".","\\."))); });
test("leaving disables QA before rendering formal workspace", () => { assert.match(source, /setActive\(false\);[\s\S]*renderFormalWorkspace\?\.\(\);[\s\S]*navigate\?\.\("garden"\)/); });
test("reset confirmation clears sandbox state only", () => { assert.match(source, /確定重置測試花園嗎/); assert.match(source, /sessionStorage\.removeItem\(SANDBOX_KEY\)/); });
test("reload resumes active QA without copying formal snapshot", () => { assert.match(source, /if \(isActive\(\)\).*render\(\).*navigate\?\.\("gardenqa"\)/); assert.doesNotMatch(source, /getWaterDrops|getGardenCollection|getCurrentPlant/); });
test("app integrates shared species rules without exporting QA keys", () => { assert.match(app, /species: gardenSpecies/); assert.match(app, /stageRequirements: PLANT_STAGE_WATER_REQUIREMENTS/); assert.doesNotMatch(account, /chromatica\.qaGarden/); });
test("QA banner and exit controls are confined to QA view", () => { const section = html.match(/<section id="gardenqa"[\s\S]*?<\/section>/)?.[0] || ""; assert.match(section, /植物測試模式｜不影響正式進度/); assert.match(section, /data-qa-leave/); assert.doesNotMatch(html.match(/<section id="garden"[\s\S]*?<\/section>/)?.[0] || "", /data-qa-leave/); });
