(function initGardenQa(global) {
  "use strict";
  const ACTIVE_KEY = "chromatica.qaGardenMode";
  const SANDBOX_KEY = "chromatica.qaGardenSandbox.v1";
  const EXPECTED_HASH = "c8797332d85b5f34680d5df15de8f6ab3ec5045e469c7f5cf5043b22d3deb23b";
  const REQUIRED_CLICKS = 50;
  const MAX_FAILURES = 5;
  const LOCK_MS = 30000;
  let options = {};
  let titleClicks = 0;
  let failedAttempts = 0;
  let lockedUntil = 0;
  let lockTimer = null;

  function $(selector) { return document.querySelector(selector); }
  function defaultState() {
    const species = options.species?.[0];
    return {
      schemaVersion: 1,
      currentPlant: species ? createPlant(species.species) : null,
      collection: [],
      featuredSpiritId: "",
      featuredSpiritStage: 3,
      starterPlantSelected: Boolean(species),
      unlimitedWater: true,
    };
  }
  function createPlant(speciesId) {
    const species = getSpecies(speciesId);
    return { id: `qa-plant-${Date.now()}`, species: species.species, name: species.name, customName: false, stage: 1, waterProgress: 0 };
  }
  function getSpecies(id) { return options.species?.find((item) => item.species === id) || options.species?.[0] || { species: "", name: "測試植物", stageNames: ["幼苗", "成長", "成熟"], images: [] }; }
  function loadState() {
    try {
      const state = JSON.parse(sessionStorage.getItem(SANDBOX_KEY));
      return state?.schemaVersion === 1 ? state : defaultState();
    } catch { return defaultState(); }
  }
  function saveState(state) { sessionStorage.setItem(SANDBOX_KEY, JSON.stringify(state)); }
  function isActive() { return sessionStorage.getItem(ACTIVE_KEY) === "true"; }
  function setActive(active) { if (active) sessionStorage.setItem(ACTIVE_KEY, "true"); else sessionStorage.removeItem(ACTIVE_KEY); }
  function stageStart(stage) { return (options.stageRequirements || [100, 180, 250]).slice(0, Math.max(0, stage - 1)).reduce((sum, value) => sum + value, 0); }
  function totalRequired() { return (options.stageRequirements || [100, 180, 250]).reduce((sum, value) => sum + value, 0); }
  function getStage(progress) { return progress >= stageStart(3) ? 3 : progress >= stageStart(2) ? 2 : 1; }
  function stageRequired(stage) { return (options.stageRequirements || [100, 180, 250])[stage - 1]; }
  function stageProgress(progress, stage) { return Math.max(0, Math.min(stageRequired(stage), progress - stageStart(stage))); }
  function plantName(plant, stage = plant?.stage || 1) { const species = getSpecies(plant?.species); return plant?.customName ? plant.name : species.stageNames?.[stage - 1] || species.name; }
  function plantImage(plant, stage = plant?.stage || 1) { return getSpecies(plant?.species).images?.[stage - 1] || "./public/assets/garden/collection/starter-pot.png"; }
  function setModal(open) {
    $("#gardenQaPasswordModal")?.classList.toggle("hidden", !open);
    if (open) { $("#gardenQaPassword").value = ""; $("#gardenQaPasswordError").textContent = ""; setTimeout(() => $("#gardenQaPassword")?.focus(), 0); }
  }
  async function sha256(value) {
    const data = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  function updateLockUi() {
    const locked = Date.now() < lockedUntil;
    $("#gardenQaPassword").disabled = locked;
    $("#gardenQaEnter").disabled = locked;
    if (locked) {
      $("#gardenQaPasswordError").textContent = "嘗試次數過多，請稍後再試。";
      clearTimeout(lockTimer);
      lockTimer = setTimeout(updateLockUi, Math.max(0, lockedUntil - Date.now()) + 50);
    }
  }
  async function verifyPassword() {
    if (Date.now() < lockedUntil) return updateLockUi();
    const value = $("#gardenQaPassword")?.value || "";
    const hash = await sha256(value);
    $("#gardenQaPassword").value = "";
    if (hash !== EXPECTED_HASH) {
      failedAttempts += 1;
      $("#gardenQaPasswordError").textContent = "測試密碼不正確。";
      if (failedAttempts >= MAX_FAILURES) { failedAttempts = 0; lockedUntil = Date.now() + LOCK_MS; updateLockUi(); }
      return;
    }
    failedAttempts = 0; lockedUntil = 0; setModal(false);
    if (!sessionStorage.getItem(SANDBOX_KEY)) saveState(defaultState());
    setActive(true); render(); options.navigate?.("gardenqa");
  }
  function onHeroTitleClick() {
    if (options.getCurrentView?.() !== "intro") { titleClicks = 0; return; }
    titleClicks += 1;
    if (titleClicks < REQUIRED_CLICKS) return;
    titleClicks = 0; setModal(true);
  }
  function onViewChanged(view) { if (view !== "intro") titleClicks = 0; if (view !== "gardenqa" && isActive() && view === "garden") options.navigate?.("gardenqa"); }
  function renderCollection(state) {
    const collection = $("#gardenQaCollection"); if (!collection) return;
    collection.innerHTML = state.collection.map((spirit) => `<button type="button" data-qa-spirit="${spirit.id}" class="garden-qa-spirit ${state.featuredSpiritId === spirit.id ? "featured" : ""}"><img src="${plantImage(spirit, 1)}" alt=""><strong>${plantName(spirit, state.featuredSpiritId === spirit.id ? state.featuredSpiritStage : 3)}</strong></button>`).join("") || "<p>測試圖鑑尚無精靈。</p>";
  }
  function render() {
    if (!isActive()) return;
    const state = loadState(); const plant = state.currentPlant;
    $("#gardenQaWater").textContent = "∞";
    if (!plant) { $("#gardenQaPlantName").textContent = "全部測試完成"; $("#gardenQaPlantImage").src = "./public/assets/garden/collection/starter-pot.png"; $("#gardenQaProgress").textContent = "—"; $("#gardenQaProgressBar").style.width = "0%"; }
    else {
      plant.stage = getStage(plant.waterProgress || 0); saveState(state);
      const progress = stageProgress(plant.waterProgress || 0, plant.stage); const required = stageRequired(plant.stage);
      $("#gardenQaPlantName").textContent = plantName(plant);
      $("#gardenQaPlantImage").src = plantImage(plant);
      $("#gardenQaProgress").textContent = plant.waterProgress >= totalRequired() ? "可採收" : `${progress} / ${required}`;
      $("#gardenQaProgressBar").style.width = `${Math.min(100, progress / required * 100)}%`;
    }
    renderCollection(state);
  }
  function mutatePlant(action) {
    const state = loadState(); const plant = state.currentPlant; if (!plant) return;
    const total = totalRequired(); const previousStage = getStage(plant.waterProgress || 0);
    if (action === "water") plant.waterProgress = Math.min(total, (plant.waterProgress || 0) + 1);
    if (action === "fill") plant.waterProgress = Math.min(total, stageStart(previousStage) + stageRequired(previousStage));
    if (action === "mature") plant.waterProgress = total;
    if (action === "reset") state.currentPlant = createPlant(plant.species);
    saveState(state); render();
    if (["water", "fill", "mature"].includes(action)) options.playGardenEffect?.(getStage(plant.waterProgress) > previousStage);
  }
  function harvest() {
    const state = loadState(); const plant = state.currentPlant; if (!plant || plant.waterProgress < totalRequired()) return;
    if (!state.collection.some((item) => item.species === plant.species)) state.collection.push({ ...plant, id: `qa-spirit-${Date.now()}`, stage: 3, harvested: true });
    const nextSpecies = options.species?.find((item) => !state.collection.some((spirit) => spirit.species === item.species));
    state.currentPlant = nextSpecies ? createPlant(nextSpecies.species) : null;
    saveState(state); render();
  }
  function resetSandbox() { if (!confirm("確定重置測試花園嗎？")) return; sessionStorage.removeItem(SANDBOX_KEY); saveState(defaultState()); render(); }
  function leave() {
    const keep = confirm("要保留本次測試資料嗎？\n按「確定」保留，按「取消」清除。");
    setActive(false); if (!keep) sessionStorage.removeItem(SANDBOX_KEY);
    options.renderFormalWorkspace?.(); options.navigate?.("garden");
  }
  function bind() {
    $("#homeHeroQaTitle")?.addEventListener("click", onHeroTitleClick);
    $("#gardenQaCancel")?.addEventListener("click", () => setModal(false));
    $("#gardenQaEnter")?.addEventListener("click", verifyPassword);
    $("#gardenQaPassword")?.addEventListener("keydown", (event) => { if (event.key === "Enter") verifyPassword(); });
    $("#gardenQaPasswordModal")?.addEventListener("click", (event) => { if (event.target.id === "gardenQaPasswordModal") setModal(false); });
    $$('[data-qa-action]').forEach((button) => button.addEventListener("click", () => button.dataset.qaAction === "harvest" ? harvest() : mutatePlant(button.dataset.qaAction)));
    $("#gardenQaResetAll")?.addEventListener("click", resetSandbox);
    $$("[data-qa-leave]").forEach((button) => button.addEventListener("click", leave));
    $("#gardenQaCollection")?.addEventListener("click", (event) => { const button = event.target.closest("[data-qa-spirit]"); if (!button) return; const state = loadState(); const spirit = state.collection.find((item) => item.id === button.dataset.qaSpirit); if (!spirit) return; const name = prompt("精靈名字", plantName(spirit, 3)); if (name?.trim()) { spirit.name = name.trim().slice(0, 14); spirit.customName = true; state.featuredSpiritId = spirit.id; state.featuredSpiritStage = 3; saveState(state); render(); } });
  }
  function $$(selector) { return [...document.querySelectorAll(selector)]; }
  function init(nextOptions = {}) { options = nextOptions; bind(); if (isActive()) { render(); options.navigate?.("gardenqa"); } }
  global.ChromaticaGardenQA = Object.freeze({ init, isActive, onViewChanged, render, sha256, constants: Object.freeze({ ACTIVE_KEY, SANDBOX_KEY, EXPECTED_HASH, REQUIRED_CLICKS }) });
})(typeof window !== "undefined" ? window : globalThis);
