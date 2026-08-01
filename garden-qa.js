(function initGardenQa(global) {
  "use strict";
  const ACTIVE_KEY = "chromatica.qaGardenMode";
  const SANDBOX_KEY = "chromatica.qaGardenSandbox.v1";
  const EXPECTED_HASH = "c8797332d85b5f34680d5df15de8f6ab3ec5045e469c7f5cf5043b22d3deb23b";
  const REQUIRED_CLICKS = 50;
  const MAX_FAILURES = 5;
  const LOCK_MS = 30000;
  const QA_SKILL_TEST_WATER = 600;
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
      schemaVersion: 2,
      currentPlant: species ? createPlant(species.species) : null,
      collection: [],
      featuredSpiritId: "",
      featuredSpiritStage: 3,
      starterPlantSelected: Boolean(species),
      unlimitedWater: true,
      qaWaterDrops: QA_SKILL_TEST_WATER,
      worldBossSkillUnlocks: [],
      previewMode: "garden",
      heroSpecies: species?.species || "",
      heroStage: 1,
    };
  }
  function createPlant(speciesId) {
    const species = getSpecies(speciesId);
    return { id: `qa-plant-${Date.now()}`, species: species.species, name: species.name, customName: false, stage: 1, waterProgress: 0 };
  }
  function getSpecies(id) { return options.species?.find((item) => item.species === id) || options.species?.[0] || { species: "", name: "測試植物", stageNames: ["幼苗", "成長", "成熟"], images: [] }; }
  function isDefaultSpeciesName(speciesId, name) {
    const species = getSpecies(speciesId);
    return [species.name, ...(species.stageNames || [])].filter(Boolean).includes(name);
  }
  function sanitizeState(rawState) {
    const allowedIds = new Set((options.species || []).map((species) => species.species));
    const legacySkillBudget = rawState?.schemaVersion === 1;
    const state = [1, 2].includes(rawState?.schemaVersion) ? { ...rawState } : defaultState();
    state.collection = Array.isArray(state.collection)
      ? state.collection.filter((spirit) => allowedIds.has(spirit?.species))
      : [];
    const collectedSpecies = new Set(state.collection.map((spirit) => spirit.species));
    if (!allowedIds.has(state.currentPlant?.species)) {
      const nextSpecies = options.species?.find((species) => !collectedSpecies.has(species.species));
      state.currentPlant = nextSpecies ? createPlant(nextSpecies.species) : null;
    }
    if (!state.collection.some((spirit) => spirit.id === state.featuredSpiritId)) {
      state.featuredSpiritId = "";
      state.featuredSpiritStage = 3;
    }
    state.schemaVersion = 2;
    state.starterPlantSelected = Boolean(state.currentPlant || state.collection.length);
    state.unlimitedWater = true;
    state.qaWaterDrops = Math.max(
      0,
      Math.min(9999, (Number(state.qaWaterDrops ?? QA_SKILL_TEST_WATER) || 0) + (legacySkillBudget ? 300 : 0)),
    );
    state.worldBossSkillUnlocks = Array.isArray(state.worldBossSkillUnlocks)
      ? [...new Set(state.worldBossSkillUnlocks.filter((speciesId) => allowedIds.has(speciesId)))]
      : [];
    if (state.previewMode !== undefined) state.previewMode = state.previewMode === "hero" ? "hero" : "garden";
    if (state.heroSpecies !== undefined && !allowedIds.has(state.heroSpecies)) state.heroSpecies = options.species?.[0]?.species || "";
    if (state.heroStage !== undefined) state.heroStage = Math.max(1, Math.min(3, Number(state.heroStage) || 1));
    return state;
  }
  function loadState() {
    try {
      const stored = sessionStorage.getItem(SANDBOX_KEY);
      const parsed = stored ? JSON.parse(stored) : defaultState();
      const state = sanitizeState(parsed);
      const serialized = JSON.stringify(state);
      if (serialized !== stored) sessionStorage.setItem(SANDBOX_KEY, serialized);
      return state;
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
    const currentView = options.getCurrentView?.();
    const preserveActiveFeatureView = afterAuthReady
      && currentView
      && !["intro", "garden", "gardenqa"].includes(currentView)
      && !["user-navigation", "remote-apply"].includes(reason);
    if (preserveActiveFeatureView) return true;
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
    const adapter = createDetailAdapter();
    global.ChromaticaGardenShared?.renderGardenCollection?.({
      container: qa$("#gardenQaCollection"),
      storeAdapter: adapter,
    });
  }

  function mountHeroPreview() {
    const root = qa$("#gardenQaHeroRoot");
    if (!root || typeof root.querySelector !== "function" || root.dataset?.ready === "true") return;
    root.innerHTML = `<div class="garden-qa-hero-controls">
      <label>植物<select id="gardenQaHeroSpecies">${(options.species || []).map((item) => `<option value="${item.species}">${item.name}</option>`).join("")}</select></label>
      <label>階段<select id="gardenQaHeroStage"><option value="1">Stage 1</option><option value="2">Stage 2</option><option value="3">Stage 3</option></select></label>
    </div>`;
    root.querySelector?.("#gardenQaHeroSpecies")?.addEventListener("change", (event) => {
      const state = loadState(); state.heroSpecies = event.target.value; saveState(state); render();
    });
    root.querySelector?.("#gardenQaHeroStage")?.addEventListener("change", (event) => {
      const state = loadState(); state.heroStage = Number(event.target.value) || 1; saveState(state); render();
    });
    if (root.dataset) root.dataset.ready = "true";
  }

  function syncFormalHeroPreview(root) {
    const formalHero = document.querySelector("#intro .home-hero");
    if (!root || !formalHero) return null;
    const preview = formalHero.cloneNode(true);
    preview.classList.add("garden-qa-hero-preview");
    preview.querySelectorAll("[id]").forEach((element) => element.removeAttribute("id"));
    preview.querySelectorAll("[data-jump], [data-start-practice-launch]").forEach((element) => {
      element.removeAttribute("data-jump");
      element.removeAttribute("data-start-practice-launch");
    });
    const image = preview.querySelector(".hero-garden-plant-image");
    const name = preview.querySelector(".hero-plant-name-card b");
    const slot = preview.querySelector(".hero-plant-slot");
    if (image) image.id = "gardenQaHeroPlant";
    if (name) name.id = "gardenQaHeroName";
    if (slot) slot.setAttribute("aria-label", "QA首頁植物預覽");
    preview.querySelectorAll("button").forEach((button) => {
      button.setAttribute("aria-disabled", "true");
      button.tabIndex = -1;
    });
    preview.addEventListener("click", (event) => {
      if (event.target.closest("button")) event.preventDefault();
    });
    const existingPreview = root.querySelector(".garden-qa-hero-preview");
    if (existingPreview) existingPreview.replaceWith(preview);
    else root.append(preview);
    return preview;
  }

  function renderHeroPreview(state) {
    mountHeroPreview();
    const root = qa$("#gardenQaHeroRoot");
    syncFormalHeroPreview(root);
    const species = getSpecies(state.heroSpecies || options.species?.[0]?.species);
    const stage = Math.max(1, Math.min(3, Number(state.heroStage) || 1));
    const image = root?.querySelector?.("#gardenQaHeroPlant");
    if (image) {
      (options.species || []).forEach((item) => image.classList.remove(`species-${item.species}`));
      image.classList.remove("hero-stage-1", "hero-stage-2", "hero-stage-3");
      image.classList.add(`species-${species.species}`, `hero-stage-${stage}`);
      image.src = species.images?.[stage - 1] || "./public/assets/garden/collection/starter-pot.png";
    }
    const collected = state.collection.find((item) => item.species === species.species);
    const name = collected?.customName ? collected.name : species.stageNames?.[stage - 1] || species.name;
    if (root?.querySelector?.("#gardenQaHeroName")) root.querySelector("#gardenQaHeroName").textContent = name;
    if (root?.querySelector?.("#gardenQaHeroSpecies")) root.querySelector("#gardenQaHeroSpecies").value = species.species;
    if (root?.querySelector?.("#gardenQaHeroStage")) root.querySelector("#gardenQaHeroStage").value = String(stage);
  }

  function applyPreviewMode(state) {
    const hero = state.previewMode === "hero";
    qa$("#gardenQaSharedRoot")?.classList?.toggle("hidden", hero);
    qa$("#gardenQaHeroRoot")?.classList?.toggle("hidden", !hero);
    qa$(".garden-qa-toolbar")?.classList?.toggle("hidden", hero);
    qa$$('[data-qa-preview]').forEach((button) => {
      const active = button.dataset.qaPreview === state.previewMode;
      button.classList?.toggle("active", active);
      button.setAttribute?.("aria-selected", active ? "true" : "false");
    });
  }

  function createDetailAdapter() {
    const adapter = {
      isFormal: false,
      getCollection() { return loadState().collection; },
      getSpeciesList() { return options.species || []; },
      getSpirit(id) { return loadState().collection.find((spirit) => spirit.id === id) || null; },
      getFeaturedId() { return loadState().featuredSpiritId; },
      getFeaturedStage() { return loadState().featuredSpiritStage || 3; },
      getSpecies,
      getDisplayName: plantName,
      getStageName(spirit, stage) { return getSpecies(spirit.species).stageNames?.[stage - 1] || `階段 ${stage}`; },
      getImage: plantImage,
      isSkillUnlocked(species) {
        return loadState().worldBossSkillUnlocks.includes(species);
      },
      getQaWaterDrops() {
        return loadState().qaWaterDrops;
      },
      learnWorldBossSkill(species, cost = 100) {
        const state = loadState();
        const collected = state.collection.some((spirit) => spirit.species === species && spirit.harvested === true);
        if (!collected) return { ok: false, reason: "not-harvested" };
        if (state.worldBossSkillUnlocks.includes(species)) return { ok: true, alreadyUnlocked: true };
        if (state.qaWaterDrops < cost) return { ok: false, reason: "insufficient-water" };
        state.qaWaterDrops -= cost;
        state.worldBossSkillUnlocks.push(species);
        saveState(state);
        render();
        return { ok: true, waterDrops: state.qaWaterDrops };
      },
      updateName(id, name) {
        const state = loadState();
        const spirit = state.collection.find((item) => item.id === id);
        if (!spirit) return null;
        spirit.name = name;
        spirit.customName = !isDefaultSpeciesName(spirit.species, name);
        saveState(state);
        return spirit;
      },
      setFeatured(id, stage) {
        const state = loadState();
        if (!state.collection.some((spirit) => spirit.id === id)) return;
        state.featuredSpiritId = id;
        state.featuredSpiritStage = stage;
        saveState(state);
      },
      render,
    };
    adapter.openSpirit = (id) => options.openSpiritDetail?.(id, adapter);
    return adapter;
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
    const dailyWater = qa$("#gardenQaDailyWaterText");
    if (dailyWater) dailyWater.textContent = "∞";
    if (!plant) {
      global.ChromaticaGardenShared?.renderPlantScene?.({
        elements: {
          name: qa$("#gardenQaPlantName"), stage: qa$("#gardenQaPlantStage"), image: qa$("#gardenQaPlantImage"),
          scene: qa$("#gardenQaPlantScene"),
          idleLayer: qa$("#gardenQaPlantIdleLayer"), actionLayer: qa$("#gardenQaPlantActionLayer"),
          progressText: qa$("#gardenQaProgress"), progressBar: qa$("#gardenQaProgressBar"),
        },
        speciesIds: (options.species || []).map((item) => item.species),
        displayName: "全部測試完成",
      });
    }
    else {
      plant.stage = getStage(plant.waterProgress || 0); saveState(state);
      const progress = stageProgress(plant.waterProgress || 0, plant.stage); const required = stageRequired(plant.stage);
      global.ChromaticaGardenShared?.renderPlantScene?.({
        elements: {
          name: qa$("#gardenQaPlantName"), stage: qa$("#gardenQaPlantStage"), image: qa$("#gardenQaPlantImage"),
          scene: qa$("#gardenQaPlantScene"),
          idleLayer: qa$("#gardenQaPlantIdleLayer"), actionLayer: qa$("#gardenQaPlantActionLayer"),
          progressText: qa$("#gardenQaProgress"), progressBar: qa$("#gardenQaProgressBar"),
        },
        speciesIds: (options.species || []).map((item) => item.species),
        species: plant.species,
        stage: plant.stage,
        imageSrc: plantImage(plant),
        displayName: plantName(plant),
        stageLabel: plant.waterProgress >= totalRequired() ? "可採收" : (getSpecies(plant.species).stageNames?.[plant.stage - 1] || `階段 ${plant.stage}`),
        progressText: plant.waterProgress >= totalRequired() ? "可採收" : `${progress} / ${required}`,
        progressPercent: Math.min(100, progress / required * 100),
      });
      const primary = qa$("#gardenQaPrimaryAction");
      if (primary) {
        const ready = plant.waterProgress >= totalRequired();
        primary.dataset.qaAction = ready ? "harvest" : "water";
        primary.setAttribute?.("aria-label", ready ? "採收植物" : "澆水");
        primary.classList.toggle("is-harvest-ready", ready);
        const icon = primary.querySelector?.("img");
        if (icon) icon.src = ready ? "./public/assets/garden/icons/garden-shovel.png" : "./public/assets/garden/icons/watering-can.png";
      }
    }
    renderCollection(state);
    renderHeroPreview(state);
    applyPreviewMode(state);
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
    let harvested = null;
    if (!state.collection.some((item) => item.species === plant.species)) {
      harvested = { ...plant, id: `qa-spirit-${Date.now()}`, stage: 3, harvested: true };
      state.collection.push(harvested);
    }
    const nextSpecies = options.species?.find((item) => !state.collection.some((spirit) => spirit.species === item.species));
    state.currentPlant = nextSpecies ? createPlant(nextSpecies.species) : null;
    saveState(state); render();
    if (harvested) void options.presentHarvestCard?.(harvested);
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
    qa$$('[data-qa-preview]').forEach((button) => button.addEventListener("click", () => {
      const state = loadState();
      state.previewMode = button.dataset.qaPreview === "hero" ? "hero" : "garden";
      saveState(state); render();
    }));
    $("#gardenQaResetAll")?.addEventListener("click", resetSandbox);
    $("#gardenQaWorldBoss")?.addEventListener("click", () => global.ChromaticaWorldBoss?.openQa?.());
    qa$$("[data-qa-leave]").forEach((button) => button.addEventListener("click", leave));
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
    sanitizeState,
    sha256,
    getDetailAdapter: createDetailAdapter,
    qaResumeRequested,
    constants: Object.freeze({ ACTIVE_KEY, SANDBOX_KEY, EXPECTED_HASH, REQUIRED_CLICKS }),
  });
})(typeof window !== "undefined" ? window : globalThis);
