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
  let initialized = false;
  let exitPromise = null;

  function isGardenQaSessionActive() {
    return sessionStorage.getItem(ACTIVE_KEY) === "true";
  }
  function syncDocumentMode(active = isGardenQaSessionActive()) {
    if (active) document.documentElement.dataset.qaGardenActive = "true";
    else delete document.documentElement.dataset.qaGardenActive;
  }
  const qaResumeRequested = isGardenQaSessionActive();
  syncDocumentMode(qaResumeRequested);

  function $(selector) { return document.querySelector(selector); }
  function qaRoot() { return document.getElementById("gardenqa"); }
  function qa$(selector) { return qaRoot()?.querySelector(selector) || null; }
  function qa$$(selector) { return [...(qaRoot()?.querySelectorAll(selector) || [])]; }
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
  function isActive() { return isGardenQaSessionActive(); }
  function setActive(active) {
    if (active) sessionStorage.setItem(ACTIVE_KEY, "true");
    else sessionStorage.removeItem(ACTIVE_KEY);
    syncDocumentMode(active);
  }
  function resolveInitialView({ qaActive = isActive(), savedView = "", defaultView = "intro" } = {}) {
    return qaActive ? "gardenqa" : (savedView || defaultView);
  }
  function resumeGardenQaSession({ reason = "qa-resume", afterAuthReady = false } = {}) {
    if (!isActive()) return false;
    syncDocumentMode(true);
    if (!initialized) return true;
    render();
    options.navigate?.(resolveInitialView({ qaActive: true }), { reason, afterAuthReady });
    return true;
  }
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
    setActive(true);
    options.enterIsolation?.();
    resumeGardenQaSession({ reason: "user-navigation", afterAuthReady: true });
  }
  function onHeroTitleClick() {
    if (options.getCurrentView?.() !== "intro") { titleClicks = 0; return; }
    titleClicks += 1;
    if (titleClicks < REQUIRED_CLICKS) return;
    titleClicks = 0; setModal(true);
  }
  function onViewChanged(view) { if (view !== "intro") titleClicks = 0; if (view !== "gardenqa" && isActive() && view === "garden") options.navigate?.("gardenqa"); }
  function renderCollection(state) {
    const collection = qa$("#gardenQaCollection"); if (!collection) return;
    collection.innerHTML = state.collection.map((spirit) => `<button type="button" data-qa-spirit="${spirit.id}" class="garden-qa-spirit ${state.featuredSpiritId === spirit.id ? "featured" : ""}"><img src="${plantImage(spirit, 1)}" alt=""><strong>${plantName(spirit, state.featuredSpiritId === spirit.id ? state.featuredSpiritStage : 3)}</strong></button>`).join("") || "<p>測試圖鑑尚無精靈。</p>";
  }
  function setPlantPresentation(plant) {
    const stage = plant?.stage || 1;
    [qa$("#gardenQaPlantActionLayer"), qa$("#gardenQaPlantImage")].forEach((element) => {
      if (!element) return;
      element.classList.remove("garden-stage-1", "garden-stage-2", "garden-stage-3");
      for (const species of options.species || []) element.classList.remove(`species-${species.species}`);
      element.classList.add(`garden-stage-${stage}`);
      if (plant?.species) element.classList.add(`species-${plant.species}`);
    });
  }
  function playPlantEffect(evolved) {
    const scene = qa$("#gardenQaPlantScene");
    const actionLayer = qa$("#gardenQaPlantActionLayer");
    const className = evolved ? "is-stage-up" : "is-watered";
    actionLayer?.classList.remove("is-watered", "is-stage-up");
    scene?.classList.toggle("is-evolving", evolved);
    void actionLayer?.offsetWidth;
    actionLayer?.classList.add(className);
    setTimeout(() => {
      actionLayer?.classList.remove(className);
      scene?.classList.remove("is-evolving");
    }, evolved ? 1700 : 600);
    options.playGardenEffect?.(evolved);
  }
  function render() {
    if (!isActive()) return;
    const state = loadState(); const plant = state.currentPlant;
    const water = qa$("#gardenQaWater");
    if (!water) return;
    water.textContent = "∞";
    if (!plant) { qa$("#gardenQaPlantName").textContent = "全部測試完成"; qa$("#gardenQaPlantImage").src = "./public/assets/garden/collection/starter-pot.png"; qa$("#gardenQaProgress").textContent = "—"; qa$("#gardenQaProgressBar").style.width = "0%"; setPlantPresentation(null); }
    else {
      plant.stage = getStage(plant.waterProgress || 0); saveState(state);
      const progress = stageProgress(plant.waterProgress || 0, plant.stage); const required = stageRequired(plant.stage);
      qa$("#gardenQaPlantName").textContent = plantName(plant);
      qa$("#gardenQaPlantImage").src = plantImage(plant);
      setPlantPresentation(plant);
      qa$("#gardenQaProgress").textContent = plant.waterProgress >= totalRequired() ? "可採收" : `${progress} / ${required}`;
      qa$("#gardenQaProgressBar").style.width = `${Math.min(100, progress / required * 100)}%`;
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
    if (["water", "fill", "mature"].includes(action)) playPlantEffect(getStage(plant.waterProgress) > previousStage);
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
    if (exitPromise) return exitPromise;
    const keep = confirm("要保留本次測試資料嗎？\n按「確定」保留，按「取消」清除。");
    setActive(false); if (!keep) sessionStorage.removeItem(SANDBOX_KEY);
    exitPromise = Promise.resolve(options.resumeFormalWorkspace?.({ reason: "qa-exit" }))
      .finally(() => { exitPromise = null; });
    return exitPromise;
  }
  function bind() {
    $("#homeHeroQaTitle")?.addEventListener("click", onHeroTitleClick);
    $("#gardenQaCancel")?.addEventListener("click", () => setModal(false));
    $("#gardenQaEnter")?.addEventListener("click", verifyPassword);
    $("#gardenQaPassword")?.addEventListener("keydown", (event) => { if (event.key === "Enter") verifyPassword(); });
    $("#gardenQaPasswordModal")?.addEventListener("click", (event) => { if (event.target.id === "gardenQaPasswordModal") setModal(false); });
    qa$$('[data-qa-action]').forEach((button) => button.addEventListener("click", () => button.dataset.qaAction === "harvest" ? harvest() : mutatePlant(button.dataset.qaAction)));
    $("#gardenQaResetAll")?.addEventListener("click", resetSandbox);
    qa$$("[data-qa-leave]").forEach((button) => button.addEventListener("click", leave));
    qa$("#gardenQaCollection")?.addEventListener("click", (event) => { const button = event.target.closest("[data-qa-spirit]"); if (!button) return; const state = loadState(); const spirit = state.collection.find((item) => item.id === button.dataset.qaSpirit); if (!spirit) return; const name = prompt("精靈名字", plantName(spirit, 3)); if (name?.trim()) { spirit.name = name.trim().slice(0, 14); spirit.customName = true; state.featuredSpiritId = spirit.id; state.featuredSpiritStage = 3; saveState(state); render(); } });
  }
  function init(nextOptions = {}) {
    options = nextOptions;
    if (!initialized) { initialized = true; bind(); }
    resumeGardenQaSession({ reason: "bootstrap", afterAuthReady: false });
  }
  global.ChromaticaGardenQA = Object.freeze({
    init,
    isActive,
    isGardenQaSessionActive,
    resolveInitialView,
    resumeGardenQaSession,
    onViewChanged,
    render,
    sha256,
    qaResumeRequested,
    constants: Object.freeze({ ACTIVE_KEY, SANDBOX_KEY, EXPECTED_HASH, REQUIRED_CLICKS }),
  });
})(typeof window !== "undefined" ? window : globalThis);
