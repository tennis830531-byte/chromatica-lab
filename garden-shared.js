(function initializeSharedGardenPresentation(global) {
  "use strict";

  const PRESENTATION_IDS = Object.freeze({
    formal: Object.freeze({
      root: "gardenSharedRoot", plantName: "gardenPlantName", plantStage: "gardenPlantStage",
      water: "waterDropCount", primaryAction: "gardenPrimaryAction", wateringCan: "gardenWateringCan",
      fxLayer: "gardenFxLayer", scene: "gardenPlantScene", idleLayer: "gardenPlantIdleLayer",
      actionLayer: "gardenPlantActionLayer", plantImage: "gardenPlantImage", progress: "gardenProgressText",
      progressBar: "gardenProgressBar", dailyWater: "dailyPracticeWaterText", collection: "gardenCollection",
    }),
    qa: Object.freeze({
      root: "gardenQaSharedRoot", plantName: "gardenQaPlantName", plantStage: "gardenQaPlantStage",
      water: "gardenQaWater", primaryAction: "gardenQaPrimaryAction", wateringCan: "gardenQaWateringCan",
      fxLayer: "gardenQaFxLayer", scene: "gardenQaPlantScene", idleLayer: "gardenQaPlantIdleLayer",
      actionLayer: "gardenQaPlantActionLayer", plantImage: "gardenQaPlantImage", progress: "gardenQaProgress",
      progressBar: "gardenQaProgressBar", dailyWater: "gardenQaDailyWaterText", collection: "gardenQaCollection",
    }),
  });

  const GARDEN_CARD_ASSETS = Object.freeze({
    "melody-sprout": "./public/assets/garden/cards/melody-sprout-art-card.png",
    "mushroom-spirit": "./public/assets/garden/cards/mushroom-spirit-art-card.png",
    "flower-spirit": "./public/assets/garden/cards/flower-spirit-art-card.png",
  });

  function getGardenCardAsset(speciesId = "") {
    return GARDEN_CARD_ASSETS[String(speciesId)] || "";
  }

  function gardenPresentationMarkup(ids) {
    return `<div class="garden-layout" data-garden-presentation="shared">
      <section class="garden-card paper-card">
        <div class="garden-card-head">
          <div class="garden-plant-heading"><div class="garden-plant-title-line">
            <h3 id="${ids.plantName}">旋律芽芽</h3>
            <span id="${ids.plantStage}" class="garden-stage-pill">幼苗</span>
          </div></div>
          <div class="water-balance"><img src="./public/assets/garden/icons/water-drop.png" alt=""><span><b id="${ids.water}">0</b> 滴</span></div>
        </div>
        <div id="${ids.scene}" class="garden-plant-scene">
          <button id="${ids.primaryAction}" class="watering-can-button" data-haptic="manual" type="button" aria-label="澆水">
            <img id="${ids.wateringCan}" class="watering-can" src="./public/assets/garden/icons/watering-can.png" alt="" aria-hidden="true">
          </button>
          <div id="${ids.fxLayer}" class="garden-fx-layer" aria-hidden="true"></div>
          <img class="garden-scene-backdrop" src="./public/assets/garden/icons/garden-stage-backdrop-refresh.png" alt="" aria-hidden="true">
          <div id="${ids.idleLayer}" class="plant-idle-layer is-idle">
            <div id="${ids.actionLayer}" class="plant-action-layer">
              <img id="${ids.plantImage}" class="garden-plant-image garden-stage-1" src="./public/assets/garden/collection/starter-pot.png" alt="">
            </div>
          </div>
        </div>
        <div class="garden-progress">
          <div class="garden-progress-row"><span>階段進度</span><b id="${ids.progress}">0 / 100</b></div>
          <div class="garden-progress-track"><i id="${ids.progressBar}"></i></div>
          <div class="daily-practice-water"><span>今日練習水滴上限</span><b id="${ids.dailyWater}">0 / 80</b></div>
        </div>
      </section>
      <section class="garden-card paper-card garden-collection-card">
        <div class="garden-card-head compact garden-collection-head"><div><h3>。植物精靈圖鑑。</h3></div></div>
        <div id="${ids.collection}" class="garden-collection"></div>
        <p class="garden-hint">採收成熟植物精靈後，可在圖鑑中選一株放到首頁展示。</p>
      </section>
    </div>`;
  }

  function mountGardenPresentation(mode) {
    const ids = PRESENTATION_IDS[mode];
    const root = ids ? document.getElementById(ids.root) : null;
    if (!root || root.dataset.ready === "true") return Boolean(root);
    root.innerHTML = gardenPresentationMarkup(ids);
    if (mode === "qa") root.querySelector(`#${ids.primaryAction}`)?.setAttribute("data-qa-action", "water");
    root.dataset.ready = "true";
    root.dataset.gardenStore = mode;
    return true;
  }

  function applySpeciesStageClasses(element, { species = "", stage = 1, speciesIds = [] } = {}) {
    if (!element) return;
    element.classList.remove("garden-stage-1", "garden-stage-2", "garden-stage-3");
    speciesIds.forEach((speciesId) => element.classList.remove(`species-${speciesId}`));
    element.classList.add(`garden-stage-${Math.max(1, Math.min(3, Number(stage) || 1))}`);
    if (species) element.classList.add(`species-${species}`);
  }

  function applyGardenPlantPresentation({
    plant = null,
    plantImage = null,
    idleLayer = null,
    actionLayer = null,
    scene = null,
    speciesIds = [],
    imageSrc = "./public/assets/garden/collection/starter-pot.png",
  } = {}) {
    const species = String(plant?.species || "");
    const stage = Math.max(1, Math.min(3, Number(plant?.stage) || 1));
    if (plantImage) plantImage.src = imageSrc;
    [plantImage, idleLayer, actionLayer, scene].forEach((element) => {
      applySpeciesStageClasses(element, { species, stage, speciesIds });
    });
    if (scene) {
      scene.dataset.gardenSpecies = species;
      scene.dataset.gardenStage = String(stage);
    }
    return { species, stage, imageSrc };
  }

  function renderPlantScene({
    elements = {}, speciesIds = [], species = "", stage = 1,
    imageSrc = "./public/assets/garden/collection/starter-pot.png",
    displayName = "等待新植物", stageLabel = "已全收集", progressText = "—", progressPercent = 0,
  } = {}) {
    applyGardenPlantPresentation({
      plant: { species, stage }, plantImage: elements.image, idleLayer: elements.idleLayer,
      actionLayer: elements.actionLayer, scene: elements.scene, speciesIds, imageSrc,
    });
    if (elements.name) elements.name.textContent = displayName;
    if (elements.stage) elements.stage.textContent = stageLabel;
    if (elements.progressText) elements.progressText.textContent = progressText;
    if (elements.progressBar) elements.progressBar.style.width = `${Math.max(0, Math.min(100, Number(progressPercent) || 0))}%`;
  }

  function renderGardenCollection({
    container,
    storeAdapter = null,
    species = storeAdapter?.getSpeciesList?.() || [],
    collection = storeAdapter?.getCollection?.() || [],
    featuredId = storeAdapter?.getFeaturedId?.() || "",
    getDisplayName = storeAdapter?.getDisplayName || ((plant) => plant?.name || "植物精靈"),
    getImage = storeAdapter?.getImage || (() => ""),
    slots = 50,
  } = {}) {
    if (!container) return;
    const collectionBySpecies = new Map(collection.map((item) => [item.species, item]));
    const fragment = document.createDocumentFragment();
    Array.from({ length: slots }, (_, index) => index).forEach((index) => {
      const slot = index + 1;
      const speciesForSlot = species[index];
      const collected = speciesForSlot ? collectionBySpecies.get(speciesForSlot.species) : null;
      const cell = document.createElement("div");
      cell.className = `garden-collection-cell${collected?.id === featuredId ? " featured" : ""}`;
      cell.dataset.collectionSlot = String(slot);
      if (speciesForSlot?.species) cell.dataset.collectionSpecies = speciesForSlot.species;
      if (collected) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.openSpirit = collected.id;
        button.setAttribute("aria-label", `查看 ${getDisplayName(collected, 3)}的藝術卡與詳細資料`);
        button.addEventListener("click", () => storeAdapter?.openSpirit?.(collected.id));
        const image = document.createElement("img");
        image.className = "garden-collection-art-card";
        image.src = getGardenCardAsset(collected.species);
        image.alt = "";
        button.append(image);
        cell.append(button);
      } else {
        const back = document.createElement("span");
        back.className = "garden-collection-card-back";
        back.setAttribute("aria-hidden", "true");
        if (speciesForSlot) {
          cell.classList.add("locked");
          back.classList.add("is-locked");
        } else {
          cell.classList.add("empty");
          back.classList.add("is-empty");
        }
        cell.append(back);
      }
      fragment.append(cell);
    });
    container.replaceChildren(fragment);
  }

  mountGardenPresentation("formal");
  mountGardenPresentation("qa");
  global.ChromaticaGardenShared = Object.freeze({
    mountGardenPresentation,
    applyGardenPlantPresentation,
    renderPlantScene,
    renderGardenCollection,
    getGardenCardAsset,
    GARDEN_CARD_ASSETS,
    PRESENTATION_IDS,
  });
})(typeof window !== "undefined" ? window : globalThis);
