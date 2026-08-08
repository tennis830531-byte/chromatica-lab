(() => {
  "use strict";

  const ASSET_ROOT = "./public/assets/world-boss/";
  const BOSS_MUSIC_PATH = "./public/assets/sounds/The Lament of the Fallen.wav";
  const NORMAL_ATTACK_SOUND_PATH = "./public/assets/sounds/精靈普通攻擊_1秒.wav";
  const SPECIAL_ATTACK_SOUND_PATH = "./public/assets/sounds/Arcane Surge.wav";
  const LEADERBOARD_AVATAR_FALLBACK = "./public/assets/chromatic-refresh/brand/chl_brand_badge.png";
  const BOSS_PRESENTATIONS = Object.freeze({
    "tree-sparrow": Object.freeze({
      name: "樹麻雀",
      maxHp: 3000,
      idle: Object.freeze([
        `${ASSET_ROOT}第一隻boss 樹麻雀.png`,
        `${ASSET_ROOT}ChatGPT Image 2026年7月27日 下午05_48_36.png`,
      ]),
      counter: `${ASSET_ROOT}第一隻boss 樹麻雀 狂暴狀態.png`,
      defeated: `${ASSET_ROOT}第一隻boss樹麻雀 死亡狀態.png`,
    }),
    "hill-myna": Object.freeze({
      name: "嘯八哥",
      maxHp: 5000,
      idle: Object.freeze([
        `${ASSET_ROOT}第二隻boss 嘯八哥.png`,
        `${ASSET_ROOT}第二隻boss 嘯八哥 呼吸狀態.png`,
      ]),
      counter: `${ASSET_ROOT}第二隻boss 嘯八哥 反擊狀態.png`,
      defeated: `${ASSET_ROOT}第二隻boss 嘯八哥 死亡狀態.png`,
    }),
  });
  const SPECIAL_CARD_ASSETS = Object.freeze({
    "melody-sprout": "./public/assets/garden/cards/melody-sprout-art-card.png",
    "mushroom-spirit": "./public/assets/garden/cards/mushroom-spirit-art-card.png",
    "flower-spirit": "./public/assets/garden/cards/flower-spirit-art-card.png",
    "lucky-clover-spirit": "./public/assets/garden/cards/lucky-clover-spirit-art-card.jpeg",
    "lotus-spirit": "./public/assets/garden/cards/lotus-spirit-art-card.jpeg",
    "cactus-spirit": "./public/assets/garden/cards/cactus-spirit-art-card.jpeg",
  });
  const QA_STAGE_NAMES = Object.freeze({
    "melody-sprout": Object.freeze(["旋律芽芽", "旋律葉靈", "旋律森使"]),
    "mushroom-spirit": Object.freeze(["菇鳴靈", "菇鳴樂手", "菇鳴賢者"]),
    "flower-spirit": Object.freeze(["花樂精靈", "花樂舞靈", "花樂仙子"]),
    "lucky-clover-spirit": Object.freeze(["幸芽靈", "幸葉樂童", "四葉祝使"]),
    "lotus-spirit": Object.freeze(["蓮苞靈", "蓮音舞靈", "蓮華樂仙"]),
    "cactus-spirit": Object.freeze(["刺芽球", "刺奏舞者", "荒漠樂將"]),
  });
  let bossMusicAudio = null;
  let normalAttackAudio = null;
  let specialAttackAudio = null;
  const state = {
    status: "loading",
    event: null,
    player: null,
    settlement: null,
    skillUnlocks: new Map(),
    busy: false,
    countdownTimer: 0,
    refreshTimer: 0,
    counterTimer: 0,
    counterPromise: null,
    counterResolve: null,
    pendingSpecial: null,
    pendingSkillSpecies: "",
    attackMode: "normal",
    spiritRoster: [],
    spiritIndex: 0,
    spiritRosterQa: null,
    breathingTimer: 0,
    breathingFrame: 0,
  };
  const QA_STORAGE_KEY = "chromatica.qaWorldBossSession.v1";
  const QA_EVENT_ID = "qa-world-boss-session";
  const QA_PLAYER_NAME = "QA 培育師";

  const $ = (selector) => document.querySelector(selector);
  const auth = () => window.chromaticaAuth;
  const core = () => window.ChromaticaWorldBossCore;
  const requestId = () => globalThis.crypto?.randomUUID?.()
    || "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
      const value = Math.floor(Math.random() * 16);
      return (character === "x" ? value : (value & 3) | 8).toString(16);
    });

  function getBossMusicAudio() {
    if (!bossMusicAudio) {
      bossMusicAudio = new Audio(BOSS_MUSIC_PATH);
      bossMusicAudio.preload = "metadata";
      bossMusicAudio.loop = true;
      bossMusicAudio.volume = 0.28;
    }
    return bossMusicAudio;
  }

  function stopBossMusic({ reset = true } = {}) {
    if (!bossMusicAudio) return;
    bossMusicAudio.pause();
    if (reset) bossMusicAudio.currentTime = 0;
  }

  function playNormalAttackSound() {
    if (window.chromaticaApp?.isAppSoundAllowed?.() === false) return;
    try {
      if (normalAttackAudio) {
        normalAttackAudio.pause();
        normalAttackAudio.currentTime = 0;
      }
      normalAttackAudio = new Audio(NORMAL_ATTACK_SOUND_PATH);
      normalAttackAudio.volume = 0.175;
      normalAttackAudio.play()?.catch?.(() => {});
    } catch {
      // An unavailable optional effect must never interrupt an attack.
    }
  }

  function playSpecialAttackSound() {
    if (window.chromaticaApp?.isAppSoundAllowed?.() === false) return;
    try {
      if (specialAttackAudio) {
        specialAttackAudio.pause();
        specialAttackAudio.currentTime = 0;
      }
      specialAttackAudio = new Audio(SPECIAL_ATTACK_SOUND_PATH);
      specialAttackAudio.volume = 0.462;
      specialAttackAudio.play()?.catch?.(() => {});
    } catch {
      // The visual presentation remains usable if optional audio is unavailable.
    }
  }

  function playBossMusic() {
    if (window.chromaticaApp?.isAppSoundAllowed?.() === false) {
      stopBossMusic();
      return;
    }
    try {
      const audio = getBossMusicAudio();
      if (!audio.paused) return;
      const playPromise = audio.play();
      playPromise?.catch?.(() => {
        // Android WebView may reject playback without a real user gesture.
      });
    } catch {
      // Missing or unavailable audio must not block the World Boss page.
    }
  }

  function onViewChanged(view) {
    if (view === "worldboss") {
      state.spiritRoster = [];
      state.spiritRosterQa = null;
      playBossMusic();
      startBossBreathing();
    } else {
      stopBossMusic();
      stopBossBreathing();
      if (view === "intro" && !state.busy) void refresh();
    }
  }

  function onAppBackground() {
    stopBossMusic({ reset: false });
    stopBossBreathing();
  }

  function refreshHomeEntry() {
    if (!state.busy && $("#intro.view.active")) {
      void refreshSkillUnlocks();
      return refresh();
    }
    return Promise.resolve(state.status);
  }

  async function rpc(name, params = {}) {
    const account = auth()?.getLeaderboardAccount?.();
    if (!account?.id) throw new Error("auth-required");
    const result = await auth().leaderboardRpc(name, params, { expectedUserId: account.id });
    if (result.error) throw result.error;
    return result.data;
  }

  function isUnavailable(error) {
    const text = `${error?.code || ""} ${error?.message || ""}`.toLowerCase();
    return text.includes("world_boss") || text.includes("could not find the function") || text.includes("schema cache");
  }

  function isQaMode() {
    return Boolean(window.ChromaticaGardenQA?.isGardenQaSessionActive?.());
  }

  function bossKey(event = state.event) {
    if (BOSS_PRESENTATIONS[event?.boss_key]) return event.boss_key;
    if (event?.boss_name === "嘯八哥") return "hill-myna";
    return "tree-sparrow";
  }

  function bossPresentation(event = state.event) {
    return BOSS_PRESENTATIONS[bossKey(event)];
  }

  function defaultQaSession(selectedBossKey = "tree-sparrow") {
    const resolvedBossKey = BOSS_PRESENTATIONS[selectedBossKey] ? selectedBossKey : "tree-sparrow";
    const boss = BOSS_PRESENTATIONS[resolvedBossKey];
    const specialAttackDateKey = taipeiDateKey();
    return {
      schemaVersion: 1,
      unlimitedEnergy: true,
      unlimitedSpecial: true,
      specialAttackDateKey,
      qaWaterDrops: 300,
      exchangedEnergy: 0,
      event: {
        event_id: QA_EVENT_ID,
        boss_key: resolvedBossKey,
        boss_name: boss.name,
        status: "active",
        remaining_hp: boss.maxHp,
        max_hp: boss.maxHp,
        starts_at: new Date(Date.now() - 60_000).toISOString(),
        ends_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        light_energy: 1,
        special_attack_remaining: 2,
        player_damage: 0,
        player_attack_count: 0,
        battle_log: [],
        live_ranking: [],
        first_attacker_display_name: null,
        final_attacker_display_name: null,
      },
      settlement: null,
    };
  }

  function sanitizeQaSession(value) {
    const selectedBossKey = BOSS_PRESENTATIONS[value?.event?.boss_key] ? value.event.boss_key : "tree-sparrow";
    const fallback = defaultQaSession(selectedBossKey);
    if (!value || value.schemaVersion !== 1 || !value.event) return fallback;
    const specialAttackDateKey = taipeiDateKey();
    const isSameSpecialAttackDay = value.specialAttackDateKey === specialAttackDateKey;
    const remaining = Math.max(0, Math.min(fallback.event.max_hp, Number(value.event.remaining_hp) || 0));
    const battleLog = Array.isArray(value.event.battle_log) ? value.event.battle_log.slice(0, 30) : [];
    return {
      schemaVersion: 1,
      unlimitedEnergy: value.unlimitedEnergy !== false,
      unlimitedSpecial: value.unlimitedSpecial !== false,
      specialAttackDateKey,
      qaWaterDrops: Math.max(0, Math.min(9999, Number(value.qaWaterDrops ?? 300) || 0)),
      exchangedEnergy: Math.max(0, Number(value.exchangedEnergy) || 0),
      event: {
        ...fallback.event,
        ...value.event,
        event_id: QA_EVENT_ID,
        boss_key: selectedBossKey,
        boss_name: fallback.event.boss_name,
        max_hp: fallback.event.max_hp,
        remaining_hp: remaining,
        status: ["active", "defeated", "expired", "settling", "closed"].includes(value.event.status)
          ? value.event.status
          : "active",
        light_energy: Math.max(0, Number(value.event.light_energy) || 0),
        special_attack_remaining: isSameSpecialAttackDay
          ? Math.max(0, Math.min(2, Number(value.event.special_attack_remaining) || 0))
          : 2,
        player_damage: Math.max(0, Number(value.event.player_damage) || 0),
        player_attack_count: Math.max(0, Number(value.event.player_attack_count) || 0),
        battle_log: battleLog,
        live_ranking: Array.isArray(value.event.live_ranking) ? value.event.live_ranking.slice(0, 10) : [],
        first_attacker_display_name: value.event.first_attacker_display_name || null,
        final_attacker_display_name: value.event.final_attacker_display_name || null,
      },
      settlement: value.settlement && typeof value.settlement === "object" ? value.settlement : null,
    };
  }

  function loadQaSession() {
    if (!isQaMode()) return null;
    try {
      const stored = sessionStorage.getItem(QA_STORAGE_KEY);
      const session = sanitizeQaSession(stored ? JSON.parse(stored) : null);
      sessionStorage.setItem(QA_STORAGE_KEY, JSON.stringify(session));
      return session;
    } catch {
      const session = defaultQaSession();
      sessionStorage.setItem(QA_STORAGE_KEY, JSON.stringify(session));
      return session;
    }
  }

  function taipeiDateKey(value = Date.now()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(value));
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  function saveQaSession(session) {
    if (!isQaMode()) return;
    sessionStorage.setItem(QA_STORAGE_KEY, JSON.stringify(sanitizeQaSession(session)));
  }

  function applyQaSession(session = loadQaSession()) {
    if (!session) return false;
    state.status = "ready";
    state.event = {
      ...session.event,
      qa_unlimited_energy: session.unlimitedEnergy,
      qa_unlimited_special: session.unlimitedSpecial,
    };
    state.player = state.event;
    state.settlement = session.settlement;
    return true;
  }

  function qaDelay(duration) {
    return new Promise((resolve) => window.setTimeout(resolve, duration));
  }

  function prefersReducedMotion() {
    return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  }

  function stopBossBreathing() {
    window.clearInterval(state.breathingTimer);
    state.breathingTimer = 0;
  }

  function renderBossIdleImage() {
    const image = $("#worldBossImage");
    if (!image || state.counterPromise || Number(state.event?.remaining_hp || 0) <= 0) return;
    const idleImages = bossPresentation().idle;
    image.src = idleImages[state.breathingFrame % idleImages.length];
  }

  function startBossBreathing() {
    stopBossBreathing();
    if (Number(state.event?.remaining_hp || 0) <= 0 || !["active", "scheduled", "expired"].includes(state.event?.status)) return;
    const interval = prefersReducedMotion() ? 2000 : 500;
    state.breathingTimer = window.setInterval(() => {
      if (state.busy || state.counterPromise || !$("#worldboss.view.active")) return;
      state.breathingFrame = state.breathingFrame === 0 ? 1 : 0;
      renderBossIdleImage();
    }, interval);
  }

  function bossImage() {
    const visual = core()?.getBossVisualState?.(
      state.event?.remaining_hp,
      state.event?.max_hp,
      state.event?.status,
    ) || "normal";
    const presentation = bossPresentation();
    if (visual === "defeated") return presentation.defeated;
    return presentation.idle[state.breathingFrame % presentation.idle.length];
  }

  function initializeSpiritRoster() {
    const qaActive = isQaMode();
    if (state.spiritRoster.length > 0 && state.spiritRosterQa === qaActive) return;
    const formalRoster = window.chromaticaApp?.getWorldBossSpiritRoster?.() || [];
    const qaRoster = Object.entries(core()?.SPECIES || {}).map(([species, skill]) => ({
      species,
      stage: 3,
      maxStage: 3,
      name: skill.spiritName,
      stageNames: QA_STAGE_NAMES[species] || [],
      image: `./public/assets/garden/plants/${species}-stage3.png`,
    }));
    state.spiritRoster = qaActive ? qaRoster : formalRoster;
    state.spiritRosterQa = qaActive;
    if (state.spiritRoster.length === 0) {
      state.spiritRoster = [{
        species: "melody-sprout",
        stage: 1,
        maxStage: 1,
        name: "旋律芽芽",
        image: "./public/assets/garden/plants/melody-sprout-stage1.png?v=hd-20260728b",
      }];
    }
    state.spiritIndex = Math.max(0, Math.min(state.spiritIndex, state.spiritRoster.length - 1));
    const selected = state.spiritRoster[state.spiritIndex];
    if ($("#worldBossSpirit")) $("#worldBossSpirit").value = selected.species;
    if ($("#worldBossSpiritStage")) $("#worldBossSpiritStage").value = String(selected.stage);
  }

  function selectedSpirit() {
    const rosterSpirit = state.spiritRoster[state.spiritIndex];
    const species = rosterSpirit?.species || $("#worldBossSpirit")?.value || "melody-sprout";
    const stage = Number(rosterSpirit?.stage || $("#worldBossSpiritStage")?.value || 1);
    return { ...rosterSpirit, species, stage, skill: core()?.getSkill?.(species) || null };
  }

  function rosterSpiritName(spirit, stage = spirit?.stage) {
    if (spirit?.customName && spirit?.name) return spirit.name;
    return spirit?.stageNames?.[Math.max(1, Math.min(3, Number(stage) || 1)) - 1]
      || spirit?.name
      || spirit?.skill?.spiritName
      || "出戰精靈";
  }

  function refreshSpiritRoster() {
    const previous = selectedSpirit();
    state.spiritRoster = [];
    state.spiritRosterQa = null;
    initializeSpiritRoster();
    const matchingIndex = state.spiritRoster.findIndex((spirit) => spirit.species === previous.species);
    if (matchingIndex >= 0) {
      state.spiritIndex = matchingIndex;
      state.spiritRoster[matchingIndex].stage = Math.max(
        1,
        Math.min(Number(state.spiritRoster[matchingIndex].maxStage || 1), Number(previous.stage) || 1),
      );
    }
    if (document.querySelector("#worldboss.view.active")) renderPage();
  }

  function isSkillUnlocked(species) {
    if (isQaMode()) {
      const adapter = window.ChromaticaGardenQA?.getDetailAdapter?.();
      return adapter?.isSkillUnlocked?.(species) === true;
    }
    return state.skillUnlocks.has(species);
  }

  function canUseSelectedSpecial() {
    const selected = selectedSpirit();
    return selected.stage === 3 && isSkillUnlocked(selected.species);
  }

  function renderSpiritPickerOptions() {
    const list = $("#worldBossSpiritPickerList");
    if (!list) return;
    list.replaceChildren();
    state.spiritRoster.forEach((spirit, rosterIndex) => {
      for (let stage = 1; stage <= Number(spirit.maxStage || 1); stage += 1) {
        const button = document.createElement("button");
        const image = document.createElement("img");
        const name = document.createElement("strong");
        const stageLabel = document.createElement("small");
        button.type = "button";
        button.className = "world-boss-spirit-choice";
        button.dataset.rosterIndex = String(rosterIndex);
        button.dataset.stage = String(stage);
        button.classList.toggle("is-selected", rosterIndex === state.spiritIndex && stage === Number(spirit.stage));
        image.src = `./public/assets/garden/plants/${spirit.species}-stage${stage}.png`;
        image.alt = "";
        name.textContent = rosterSpiritName(spirit, stage);
        stageLabel.textContent = `第 ${stage} 階段`;
        button.setAttribute("aria-label", `選擇${name.textContent}，${stageLabel.textContent}`);
        button.append(image, name, stageLabel);
        list.append(button);
      }
    });
  }

  function openSpiritPicker() {
    if (state.busy || state.spiritRoster.length === 0) return;
    renderSpiritPickerOptions();
    $("#worldBossSpiritPickerModal")?.classList.remove("hidden");
  }

  function closeSpiritPicker() {
    $("#worldBossSpiritPickerModal")?.classList.add("hidden");
  }

  function selectSpiritFromPicker(button) {
    const rosterIndex = Number(button?.dataset?.rosterIndex);
    const stage = Number(button?.dataset?.stage);
    const spirit = state.spiritRoster[rosterIndex];
    if (!spirit || !Number.isInteger(stage) || stage < 1 || stage > Number(spirit.maxStage || 1)) return;
    state.spiritIndex = rosterIndex;
    spirit.stage = stage;
    state.attackMode = "normal";
    closeSpiritPicker();
    renderPage();
  }

  function setBattleLocked(locked) {
    state.busy = locked;
    ["#worldBossAttackAction", "#worldBossAttackModeToggle", "#worldBossSpiritPicker", "#worldBossSpirit", "#worldBossSpiritStage"]
      .forEach((selector) => {
        const element = $(selector);
        if (element) element.disabled = locked;
      });
  }

  function renderEntry() {
    const button = $("#worldBossEntry");
    if (!button) return;
    const icon = $("#worldBossEntryIcon");
    const label = $("#worldBossEntryLabel");
    const fallbackWindow = core()?.getEventWindow?.() || {};
    const status = state.event?.status || fallbackWindow.phase || "scheduled";
    const resultStatuses = new Set(["defeated", "expired", "settling", "closed"]);
    const resultDeadline = state.event?.ends_at
      ? new Date(new Date(state.event.ends_at).getTime() + (2 * 60 * 60 * 1000))
      : null;
    const zeroHp = state.event && Number(state.event.remaining_hp) <= 0;
    const resultVisible = Boolean(
      state.event
      && (resultStatuses.has(status) || zeroHp)
      && resultDeadline
      && Number.isFinite(resultDeadline.getTime())
      && Date.now() < resultDeadline.getTime(),
    );
    const settlementSucceeded = state.settlement?.snapshot?.success === true;
    const defeated = zeroHp || (resultVisible && (
      status === "defeated"
      || settlementSucceeded
    ));
    const active = status === "active" && !defeated;
    const presentation = bossPresentation();
    button.classList.toggle("is-dormant", !active && !defeated);
    button.classList.toggle("is-active", active);
    button.classList.toggle("is-defeated", defeated);
    if (icon) icon.src = defeated
      ? `${ASSET_ROOT}boss入口iocn(死亡狀態）.png`
      : `${ASSET_ROOT}boss入口icon.png`;
    if (label) {
      if (defeated) label.textContent = `${presentation.name}被擊倒了！`;
      else if (state.status === "unavailable" || (resultStatuses.has(status) && !resultVisible)) {
        label.textContent = "世界 Boss 尚未出沒";
      }
      else if (status === "active") label.textContent = `${presentation.name}出沒了！`;
      else if (resultVisible) label.textContent = "討伐失敗！";
      else label.textContent = "世界 Boss 預告";
    }
  }

  function updateCountdown() {
    const fallbackWindow = core()?.getEventWindow?.() || {};
    const status = state.event?.status || fallbackWindow.phase || "scheduled";
    const target = status === "scheduled"
      ? state.event?.starts_at || fallbackWindow.startsAt
      : state.event?.ends_at || fallbackWindow.endsAt;
    const countdown = $("#worldBossCountdown");
    const previewCard = $("#worldBossPreviewCountdownCard");
    const previewValue = $("#worldBossPreviewCountdownValue");
    const presentation = bossPresentation();
    const scheduled = status === "scheduled" && Boolean(target);
    previewCard?.classList.toggle("hidden", !scheduled);
    countdown?.classList.toggle("hidden", scheduled);
    const remaining = target ? core()?.formatRemainingTime?.(target) || "—" : "—";
    if (previewValue && scheduled) previewValue.textContent = `倒數 ${remaining}`;
    const previewImage = $("#worldBossPreviewCountdownCard img");
    const previewName = $("#worldBossPreviewCountdownCard strong");
    if (previewImage) previewImage.src = presentation.idle[0];
    if (previewName) previewName.textContent = `${presentation.name}即將出沒`;
    if (!countdown || !target) return;
    const prefix = scheduled ? "距離討伐開始" : "活動剩餘";
    countdown.textContent = `${prefix} ${remaining}`;
  }

  function renderBattleLog(rows = []) {
    const list = $("#worldBossBattleLog");
    if (!list) return;
    list.replaceChildren();
    rows.forEach((row) => {
      const item = document.createElement("li");
      const label = row.attack_type === "special"
        ? `${row.skill_name || "專屬技能"}`
        : "普通攻擊";
      item.textContent = `${row.display_name || "培育師"}使用${label}，造成 ${Number(row.damage || 0)} 傷害`;
      if (row.is_first_hit) item.dataset.badge = "第一刀";
      if (row.is_final_hit) item.dataset.badge = "尾刀";
      list.append(item);
    });
    $("#worldBossBattleLogSection")?.classList.toggle("hidden", rows.length === 0);
  }

  function renderLiveRanking(rows = []) {
    const section = $("#worldBossLiveRankingSection");
    const list = $("#worldBossLiveRanking");
    if (!section || !list) return;
    const ranking = Array.isArray(rows) ? rows.slice(0, 10) : [];
    $("#worldBossFirstHitPlayer").textContent = state.event?.first_attacker_display_name || "尚未產生";
    $("#worldBossFinalHitPlayer").textContent = state.event?.final_attacker_display_name || "尚未產生";
    list.replaceChildren();
    ranking.forEach((row, index) => {
      const item = document.createElement("li");
      const rank = document.createElement("span");
      const avatar = document.createElement("img");
      const identity = document.createElement("span");
      const name = document.createElement("strong");
      const spirit = document.createElement("span");
      const spiritImage = document.createElement("img");
      const spiritName = document.createElement("span");
      const damage = document.createElement("span");
      const species = String(row.species || row.featured_spirit_species || "");
      const stage = Math.max(1, Math.min(3, Number(row.stage || row.featured_spirit_stage || 1)));
      const avatarPath = String(row.avatar_path || row.custom_avatar_path || "");
      const avatarVersion = Number(row.avatar_version || 0);
      rank.textContent = `第 ${Number(row.rank || index + 1)} 名`;
      rank.className = "world-boss-live-rank";
      avatar.className = "world-boss-live-avatar";
      avatar.alt = "";
      avatar.onerror = () => {
        avatar.onerror = null;
        avatar.src = LEADERBOARD_AVATAR_FALLBACK;
      };
      avatar.src = avatarPath
        ? auth()?.getLeaderboardAvatarUrl?.(avatarPath, avatarVersion) || LEADERBOARD_AVATAR_FALLBACK
        : LEADERBOARD_AVATAR_FALLBACK;
      identity.className = "world-boss-live-identity";
      name.textContent = row.display_name || "培育師";
      spirit.className = "world-boss-live-spirit";
      spiritImage.alt = "";
      if (species) spiritImage.src = `./public/assets/garden/plants/${species}-stage${stage}.png`;
      else spiritImage.classList.add("hidden");
      spiritName.textContent = row.spirit_name
        || row.featured_spirit_name
        || QA_STAGE_NAMES[species]?.[stage - 1]
        || "尚未展示精靈";
      spirit.append(spiritImage, spiritName);
      identity.append(name, spirit);
      damage.textContent = `${Number(row.damage || 0)} 傷害`;
      damage.className = "world-boss-live-damage";
      item.append(rank, avatar, identity, damage);
      list.append(item);
    });
    section.classList.toggle(
      "hidden",
      ranking.length === 0
        && !state.event?.first_attacker_display_name
        && !state.event?.final_attacker_display_name,
    );
  }

  function renderSettlement() {
    const panel = $("#worldBossSettlement");
    const data = state.settlement;
    panel?.classList.toggle("hidden", !data);
    if (!panel || !data) return;
    const success = data.snapshot?.success === true;
    const presentation = bossPresentation();
    const settlementBoss = $("#worldBossSettlementBossImage");
    if (settlementBoss) {
      settlementBoss.src = success ? presentation.defeated : presentation.idle[0];
      settlementBoss.alt = success ? `已被擊倒的${presentation.name}` : `仍站立的${presentation.name}`;
    }
    $("#worldBossSettlementTitle").textContent = success ? "討伐成功！" : "討伐未成功";
    const summary = $("#worldBossSettlementSummary");
    summary.replaceChildren();
    [
      ["參與人數", `${Number(data.participant_count || 0)} 人`],
      ["全體總攻擊", `${Number(data.total_attack_count || 0)} 次`],
      ["Boss 存活時間", core()?.formatRemainingTime?.(Date.now() + Number(data.boss_alive_seconds || 0) * 1000, Date.now()) || "—"],
      ["第一刀", data.snapshot?.first_attacker_user_id ? "已產生" : "—"],
      ["最後一擊", data.snapshot?.final_attacker_user_id ? "已產生" : "—"],
    ].forEach(([label, value]) => {
      const row = document.createElement("div");
      const term = document.createElement("span");
      const result = document.createElement("strong");
      term.textContent = label;
      result.textContent = value;
      row.append(term, result);
      summary.append(row);
    });
    const ranking = $("#worldBossSettlementRanking");
    ranking.replaceChildren();
    (data.top_ten || []).forEach((row) => {
      const item = document.createElement("li");
      item.textContent = `第 ${row.rank} 名　${row.display_name || "培育師"}　${row.damage} 傷害`;
      ranking.append(item);
    });
    const mine = $("#worldBossMySettlement");
    const me = data.me;
    mine.replaceChildren();
    if (!me) {
      mine.textContent = "本場未參與攻擊。";
      return;
    }
    const rewardTotal = (me.rewards || []).reduce((sum, reward) => sum + Number(reward.water || 0), 0);
    const playerSummary = document.createElement("strong");
    playerSummary.textContent = `我的第 ${me.rank} 名｜${me.damage} 傷害｜${me.attack_count} 次攻擊｜獎勵 ${rewardTotal}💧`;
    const labels = {
      participation: "參與獎",
      first_hit: "第一刀",
      rank_1: "傷害第 1 名",
      rank_2: "傷害第 2 名",
      rank_3: "傷害第 3 名",
      last_hit: "最後一擊",
      boss_defeated: "成功擊倒",
    };
    const details = document.createElement("ul");
    details.className = "world-boss-my-rewards";
    (me.rewards || []).forEach((reward) => {
      const item = document.createElement("li");
      item.textContent = `${labels[reward.type] || reward.type}　+${Number(reward.water || 0)}💧`;
      details.append(item);
    });
    mine.append(playerSummary, details);
  }

  function renderPage() {
    const statusText = $("#worldBossStatusText");
    const image = $("#worldBossImage");
    const hp = $("#worldBossHp");
    const battle = $("#worldBossBattleControls");
    const energy = $("#worldBossEnergyCount");
    const status = state.event?.status || "scheduled";
    const qaActive = isQaMode();
    const presentation = bossPresentation();
    initializeSpiritRoster();
    $("#worldBossQaPanel")?.classList.toggle("hidden", !qaActive);
    if ($("#worldBossQaBoss")) $("#worldBossQaBoss").value = bossKey();
    if ($("#worldBossName")) $("#worldBossName").textContent = `世界 Boss・${presentation.name}`;
    if ($("#worldBossCounterMessage")) $("#worldBossCounterMessage").textContent = `${presentation.name}發動反擊！`;
    if (image) image.alt = `世界 Boss ${presentation.name}`;
    if (image) {
      image.src = bossImage();
      image.classList.toggle("hidden", status === "scheduled");
    }
    if (energy) energy.textContent = qaActive && state.event?.qa_unlimited_energy
      ? "∞"
      : String(state.event?.light_energy ?? state.player?.light_energy ?? 0);
    const specialRemaining = qaActive && state.event?.qa_unlimited_special
      ? "∞"
      : String(Number(state.event?.special_attack_remaining ?? 2));
    if ($("#worldBossSpecialRemaining")) $("#worldBossSpecialRemaining").textContent = specialRemaining;
    $("#worldBossPlayerDamage").textContent = String(state.event?.player_damage ?? 0);
    $("#worldBossPlayerAttackCount").textContent = String(state.event?.player_attack_count ?? 0);
    $("#worldBossPlayerStats")?.classList.toggle("hidden", state.status !== "ready");
    if (state.status === "unavailable" || state.status === "error") {
      if (statusText) statusText.textContent = "世界 Boss 服務準備中";
      if (hp) hp.textContent = "正式服務啟用後即可參加討伐。";
      battle?.classList.add("hidden");
      $("#worldBossSettlement")?.classList.add("hidden");
      stopBossBreathing();
      updateCountdown();
      return;
    }
    if (qaActive && statusText) statusText.textContent = `QA 隔離活動｜${status}`;
    if (statusText) {
      statusText.textContent = status === "active" ? "討伐進行中"
        : status === "defeated" ? "討伐成功，等待結算"
          : status === "settling" ? "正在結算"
            : status === "closed" ? "本週結算完成"
              : status === "expired" ? "討伐時間結束"
                : "下一場預告";
    }
    const remaining = Number(state.event?.remaining_hp || 0);
    const maximum = Number(state.event?.max_hp || presentation.maxHp);
    if (remaining <= 0 && state.counterPromise) finishBossCounter();
    if (hp) hp.textContent = `HP ${remaining} / ${maximum}`;
    const ratio = maximum > 0 ? Math.max(0, Math.min(1, remaining / maximum)) : 0;
    $("#worldBossHpFill").style.width = `${ratio * 100}%`;
    battle?.classList.toggle("hidden", status !== "active" || remaining <= 0);
    renderLiveRanking(state.event?.live_ranking || []);
    renderBattleLog(state.event?.battle_log || []);
    renderSettlement();
    const settlementView = status === "closed" && Boolean(state.settlement);
    $("#worldBossCombatView")?.classList.toggle("hidden", settlementView);
    updateCountdown();
    const selected = selectedSpirit();
    const activeSpirit = $("#worldBossActiveSpirit");
    if (activeSpirit) {
      activeSpirit.src = `./public/assets/garden/plants/${selected.species}-stage${selected.stage}.png`;
      activeSpirit.alt = `${selected.skill?.spiritName || "出戰精靈"}出戰中`;
    }
    if ($("#worldBossActiveSpiritName")) {
      $("#worldBossActiveSpiritName").textContent = rosterSpiritName(selected, selected.stage);
    }
    if ($("#worldBossActiveSpiritStage")) $("#worldBossActiveSpiritStage").textContent = `第 ${selected.stage} 階段`;
    if ($("#worldBossSpirit")) $("#worldBossSpirit").value = selected.species;
    if ($("#worldBossSpiritStage")) $("#worldBossSpiritStage").value = String(selected.stage);
    const specialEligible = canUseSelectedSpecial();
    if (!specialEligible) state.attackMode = "normal";
    $("#worldBossAttackModeToggle")?.classList.toggle("hidden", !specialEligible);
    $("#worldBossAttackModeToggle")?.classList.toggle("is-special", state.attackMode === "special");
    if ($("#worldBossAttackModeToggle")) {
      $("#worldBossAttackModeToggle").textContent = state.attackMode === "special" ? "改用一般攻擊" : `切換${selected.skill?.skillName || "專屬技能"}`;
    }
    if ($("#worldBossAttackActionIcon")) {
      $("#worldBossAttackActionIcon").src = state.attackMode === "special"
        ? `${ASSET_ROOT}專屬攻擊技能按鈕.png`
        : `${ASSET_ROOT}攻擊按鈕.png`;
    }
    if ($("#worldBossAttackActionLabel")) {
      $("#worldBossAttackActionLabel").textContent = state.attackMode === "special"
        ? selected.skill?.skillName || "專屬技能"
        : "攻擊";
    }
    $("#worldBossSpecialRemaining")?.classList.toggle("hidden", state.attackMode !== "special");
    if (!state.counterPromise) {
      if (image) image.src = bossImage();
      startBossBreathing();
    }
    if (qaActive) {
      const session = loadQaSession();
      if ($("#worldBossQaUnlimitedEnergy")) $("#worldBossQaUnlimitedEnergy").checked = session?.unlimitedEnergy !== false;
      if ($("#worldBossQaUnlimitedSpecial")) $("#worldBossQaUnlimitedSpecial").checked = session?.unlimitedSpecial !== false;
      if ($("#worldBossQaWater")) $("#worldBossQaWater").value = String(session?.qaWaterDrops ?? 300);
      if ($("#worldBossQaExchangeCount")) $("#worldBossQaExchangeCount").textContent = String(session?.exchangedEnergy || 0);
    }
  }

  async function refreshSettlement() {
    if (isQaMode()) {
      state.settlement = loadQaSession()?.settlement || null;
      return;
    }
    if (!state.event?.event_id || !["closed", "settling", "defeated", "expired"].includes(state.event.status)) {
      state.settlement = null;
      return;
    }
    try {
      const data = await rpc("get_world_boss_settlement", { p_event_id: state.event.event_id });
      state.settlement = Array.isArray(data) ? data[0] : data;
    } catch {
      state.settlement = null;
    }
  }

  async function refresh() {
    if (isQaMode()) {
      applyQaSession();
      renderEntry();
      renderPage();
      return state.status;
    }
    try {
      let result;
      try {
        result = await rpc("get_world_boss_battle_context_v2", { p_log_limit: 30 });
      } catch (error) {
        if (!isUnavailable(error)) throw error;
        result = await rpc("get_world_boss_status");
      }
      const row = Array.isArray(result) ? result[0] : result;
      if (row && row.special_attack_remaining == null && row.special_attack_count != null) {
        row.special_attack_remaining = Math.max(0, 2 - Number(row.special_attack_count || 0));
      }
      state.event = row || null;
      state.player = row || null;
      state.status = "ready";
      await refreshSettlement();
    } catch (error) {
      state.status = isUnavailable(error) ? "unavailable" : "error";
      state.event = null;
    }
    renderEntry();
    renderPage();
    return state.status;
  }

  function playAttackEffect(type) {
    const arena = $("#worldBossArena");
    const effect = $("#worldBossAttackEffect");
    if (!arena || !effect) return;
    arena.dataset.attackType = type;
    arena.classList.remove("is-attacking");
    effect.classList.remove("hidden", "is-playing");
    void arena.offsetWidth;
    arena.classList.add("is-attacking");
    effect.classList.add("is-playing");
    window.setTimeout(() => {
      effect.classList.add("hidden");
      arena.classList.remove("is-attacking");
    }, 520);
  }

  function finishBossCounter() {
    window.clearTimeout(state.counterTimer);
    state.counterTimer = 0;
    $("#worldBossArena")?.classList.remove("is-countering");
    $("#worldBossBattleControls")?.classList.remove("is-countering");
    $("#worldBossCounterMessage")?.classList.add("hidden");
    const image = $("#worldBossImage");
    if (image) image.src = bossImage();
    const resolve = state.counterResolve;
    state.counterResolve = null;
    state.counterPromise = null;
    resolve?.();
    startBossBreathing();
  }

  function playBossCounter() {
    const image = $("#worldBossImage");
    const arena = $("#worldBossArena");
    const message = $("#worldBossCounterMessage");
    if (!image || !arena || Number(state.event?.remaining_hp || 0) <= 0) return Promise.resolve();
    if (state.counterPromise) return state.counterPromise;
    image.src = bossPresentation().counter;
    arena.classList.add("is-countering");
    $("#worldBossBattleControls")?.classList.add("is-countering");
    message?.classList.remove("hidden");
    state.counterPromise = new Promise((resolve) => {
      state.counterResolve = resolve;
      state.counterTimer = window.setTimeout(finishBossCounter, 1000);
    });
    return state.counterPromise;
  }

  async function playSpecialAttackPresentation(species) {
    const modal = $("#worldBossSpecialPresentation");
    const card = $("#worldBossSpecialPresentationCard");
    const name = $("#worldBossSpecialPresentationName");
    const skill = core()?.getSkill?.(species);
    if (!modal || !card || !name || !skill) return;
    card.src = SPECIAL_CARD_ASSETS[species] || "";
    card.alt = `${skill.spiritName}藝術卡牌`;
    name.textContent = skill.skillName;
    modal.classList.remove("hidden", "is-playing");
    void modal.offsetWidth;
    modal.classList.add("is-playing");
    playSpecialAttackSound();
    await qaDelay(prefersReducedMotion() ? 520 : 1900);
    modal.classList.add("hidden");
    modal.classList.remove("is-playing");
  }

  async function presentSuccessfulAttack({ type, species, row }) {
    if (!row?.attack_id || Number(row?.effective_damage || 0) <= 0) {
      throw new Error("攻擊未完成，未播放攻擊動畫。");
    }
    if (type === "special") await playSpecialAttackPresentation(species);
    playNormalAttackSound();
    if (type === "special") void window.ChromaticaHaptics?.long?.();
    else void window.ChromaticaHaptics?.success?.();
    playAttackEffect(type);
    $("#worldBossMessage").textContent = `造成 ${Number(row.effective_damage)} 點有效傷害！`;
  }

  async function performAttack(type, { exchange = false } = {}) {
    if (state.busy || state.status !== "ready" || state.event?.status !== "active") return;
    const { species, stage } = selectedSpirit();
    const qaUnlimitedEnergy = isQaMode() && state.event?.qa_unlimited_energy;
    if (type === "special" && !canUseSelectedSpecial()) return;
    if (!qaUnlimitedEnergy && Number(state.event?.light_energy || 0) <= 0 && !exchange) {
      state.pendingSpecial = { species, stage, type };
      $("#worldBossExchangeAttackModal")?.classList.remove("hidden");
      return;
    }
    const gardenLockAcquired = !exchange || isQaMode()
      ? false
      : window.chromaticaApp?.beginFormalGardenMutation?.() === true;
    if (exchange && !isQaMode() && !gardenLockAcquired) {
      $("#worldBossMessage").textContent = "花園資料正在同步，請稍後再試。";
      return;
    }
    setBattleLocked(true);
    $("#worldBossMessage").textContent = exchange ? "正在確認兌換與攻擊…" : "正在確認攻擊…";
    try {
      if (exchange && !isQaMode()) {
        const syncState = await window.chromaticaAccountWorkspace?.syncBestEffort?.();
        if (syncState && syncState.status !== "synced") throw new Error("game-save-sync-required");
      }
      const params = {
        p_event_id: state.event?.event_id,
        p_species: species,
        p_stage: stage,
        p_attack_type: type,
        p_request_id: requestId(),
      };
      const result = isQaMode()
        ? performQaAttack({ type, species, stage, exchange })
        : exchange
          ? await rpc("exchange_and_attack_world_boss", {
            p_event_id: params.p_event_id,
            p_species: species,
            p_stage: stage,
            p_attack_type: type,
            p_exchange_request_id: requestId(),
            p_attack_request_id: params.p_request_id,
          })
          : await rpc("attack_world_boss", params);
      const row = Array.isArray(result) ? result[0] : result;
      if (!row?.attack_id || Number(row?.effective_damage || 0) <= 0) throw new Error("攻擊未完成，未播放攻擊動畫。");
      if (exchange && !isQaMode()) {
        await window.chromaticaApp?.applyAuthoritativeGardenGameSave?.(row);
      }
      await presentSuccessfulAttack({ type, species, row });
      await refresh();
      if (Number(row?.effective_damage || 0) > 0 && Number(row?.remaining_hp || 0) > 0) {
        await playBossCounter();
      }
    } catch (error) {
      if (!isQaMode()) {
        await window.chromaticaApp?.refreshAuthoritativeGardenGameSave?.().catch(() => null);
      }
      const message = String(error?.message || "");
      const displayMessage = /insufficient[-_ ]water|water[-_ ]insufficient/i.test(message)
        ? "水滴不足，無法兌換光之能量"
        : message || "攻擊未完成，請稍後再試。";
      $("#worldBossMessage").textContent = displayMessage;
      if ($("#worldBossAttackErrorCopy")) $("#worldBossAttackErrorCopy").textContent = displayMessage;
      $("#worldBossAttackErrorModal")?.classList.remove("hidden");
    } finally {
      setBattleLocked(false);
      if (gardenLockAcquired) window.chromaticaApp?.endFormalGardenMutation?.();
    }
  }

  function performQaAttack({ type, species, stage, exchange = false }) {
    const session = loadQaSession();
    if (!session || session.event.status !== "active" || session.event.remaining_hp <= 0) {
      throw new Error("QA Boss 已結束，不能再攻擊。");
    }
    if (type === "special" && !session.unlimitedSpecial && session.event.special_attack_remaining <= 0) {
      throw new Error("今日專屬技能次數已用完。");
    }
    if (!session.unlimitedEnergy && session.event.light_energy <= 0) {
      if (!exchange) throw new Error("光之能量不足。");
      if (session.qaWaterDrops < 3) throw new Error("水滴不足");
    }
    const attemptedDamage = type === "special" ? 100 : Number(core()?.getNormalDamage?.(stage) || 0);
    const effectiveDamage = Math.min(attemptedDamage, session.event.remaining_hp);
    if (effectiveDamage <= 0) throw new Error("QA Boss 已結束，不能再攻擊。");
    const isFirstHit = session.event.battle_log.length === 0;
    if (!session.unlimitedEnergy && session.event.light_energy <= 0 && exchange) {
      session.qaWaterDrops -= 3;
      session.exchangedEnergy += 1;
      session.event.light_energy += 1;
    }
    session.event.remaining_hp -= effectiveDamage;
    session.event.player_damage += effectiveDamage;
    session.event.player_attack_count += 1;
    session.event.live_ranking = [{
      rank: 1,
      display_name: QA_PLAYER_NAME,
      avatar_path: "",
      avatar_version: 0,
      species,
      stage,
      spirit_name: QA_STAGE_NAMES[species]?.[stage - 1] || "出戰精靈",
      damage: session.event.player_damage,
      attack_count: session.event.player_attack_count,
    }];
    if (isFirstHit) session.event.first_attacker_display_name = QA_PLAYER_NAME;
    if (!session.unlimitedEnergy) session.event.light_energy -= 1;
    if (type === "special" && !session.unlimitedSpecial) session.event.special_attack_remaining -= 1;
    const isFinalHit = session.event.remaining_hp === 0;
    if (isFinalHit) session.event.final_attacker_display_name = QA_PLAYER_NAME;
    session.event.battle_log.unshift({
      id: `qa-attack-${session.event.player_attack_count}`,
      display_name: QA_PLAYER_NAME,
      species,
      stage,
      attack_type: type,
      skill_name: type === "special" ? core()?.getSkill?.(species)?.skillName : null,
      attempted_damage: attemptedDamage,
      damage: effectiveDamage,
      is_first_hit: isFirstHit,
      is_final_hit: isFinalHit,
      created_at: new Date().toISOString(),
    });
    if (isFinalHit) session.event.status = "defeated";
    saveQaSession(session);
    applyQaSession(session);
    return {
      attack_id: `qa-attack-${session.event.player_attack_count}`,
      attempted_damage: attemptedDamage,
      effective_damage: effectiveDamage,
      remaining_hp: session.event.remaining_hp,
      is_first_hit: isFirstHit,
      is_final_hit: isFinalHit,
    };
  }

  function createQaSettlement(session, success) {
    const attackCount = Number(session.event.player_attack_count || 0);
    const damage = Number(session.event.player_damage || 0);
    const rewardRows = success
      ? [
        { type: "participation", water: 5 },
        { type: "first_hit", water: 30 },
        { type: "rank_1", water: 100 },
        { type: "last_hit", water: 30 },
        { type: "boss_defeated", water: 10 },
      ]
      : [
        { type: "participation", water: 5 },
        { type: "first_hit", water: 15 },
        { type: "rank_1", water: 50 },
      ];
    const otherPlayers = [
      { rank: 2, display_name: "QA 培育師二號", damage: Math.max(0, damage - 20) },
      { rank: 3, display_name: "QA 培育師三號", damage: Math.max(0, damage - 40) },
    ];
    return {
      snapshot: {
        success,
        first_attacker_user_id: "qa-first-attacker",
        final_attacker_user_id: success ? "qa-final-attacker" : null,
      },
      participant_count: 3,
      total_attack_count: attackCount + 4,
      boss_alive_seconds: 240,
      top_ten: [
        { rank: 1, display_name: QA_PLAYER_NAME, damage },
        ...otherPlayers,
      ],
      me: {
        rank: 1,
        damage,
        attack_count: attackCount,
        rewards: rewardRows,
      },
    };
  }

  async function simulateQaSettlement(success) {
    if (!isQaMode() || state.busy) return;
    setBattleLocked(true);
    const session = loadQaSession();
    if (!session) return setBattleLocked(false);
    session.event.remaining_hp = success ? 0 : Math.max(1, session.event.remaining_hp);
    session.event.status = success ? "defeated" : "expired";
    session.settlement = null;
    saveQaSession(session);
    applyQaSession(session);
    renderPage();
    $("#worldBossMessage").textContent = success ? "QA：Boss 已擊倒，準備結算…" : "QA：討伐時間結束，準備失敗結算…";
    await qaDelay(650);
    session.event.status = "settling";
    saveQaSession(session);
    applyQaSession(session);
    renderPage();
    $("#worldBossMessage").textContent = "QA：settling，正在建立不可變結算畫面…";
    await qaDelay(650);
    session.event.status = "closed";
    session.settlement = createQaSettlement(session, success);
    saveQaSession(session);
    applyQaSession(session);
    renderPage();
    $("#worldBossMessage").textContent = success ? "QA 成功結算完成。" : "QA 失敗結算完成。";
    requestAnimationFrame(() => $("#worldBossSettlement")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    setBattleLocked(false);
  }

  function setQaHp(value) {
    if (!isQaMode() || state.busy) return;
    const session = loadQaSession();
    if (!session) return;
    session.event.remaining_hp = Math.max(0, Math.min(session.event.max_hp, Number(value) || 0));
    session.event.status = session.event.remaining_hp === 0 ? "defeated" : "active";
    session.settlement = null;
    saveQaSession(session);
    applyQaSession(session);
    renderPage();
    $("#worldBossMessage").textContent = `QA：Boss HP 已設為 ${session.event.remaining_hp}。`;
  }

  function setQaBoss(selectedBossKey) {
    if (!isQaMode() || state.busy || !BOSS_PRESENTATIONS[selectedBossKey]) return;
    finishBossCounter();
    const current = loadQaSession();
    const session = defaultQaSession(selectedBossKey);
    session.unlimitedEnergy = current?.unlimitedEnergy !== false;
    session.unlimitedSpecial = current?.unlimitedSpecial !== false;
    session.qaWaterDrops = current?.qaWaterDrops ?? 300;
    saveQaSession(session);
    applyQaSession(session);
    renderEntry();
    renderPage();
    $("#worldBossMessage").textContent = `QA：已切換為${bossPresentation().name}，活動資料已獨立重置。`;
  }

  function updateQaOption(option, enabled) {
    if (!isQaMode()) return;
    const session = loadQaSession();
    if (!session) return;
    if (option === "energy") session.unlimitedEnergy = enabled;
    if (option === "special") session.unlimitedSpecial = enabled;
    saveQaSession(session);
    applyQaSession(session);
    renderPage();
  }

  function setQaEnergy(value) {
    if (!isQaMode() || state.busy) return;
    const session = loadQaSession();
    if (!session) return;
    session.unlimitedEnergy = false;
    session.event.light_energy = Math.max(0, Number(value) || 0);
    saveQaSession(session);
    applyQaSession(session);
    renderPage();
  }

  function setQaWater(value) {
    if (!isQaMode() || state.busy) return;
    const session = loadQaSession();
    if (!session) return;
    session.qaWaterDrops = Math.max(0, Math.min(9999, Number(value) || 0));
    saveQaSession(session);
    applyQaSession(session);
    renderPage();
  }

  function resetQaSession() {
    if (!isQaMode()) return;
    finishBossCounter();
    const selectedBossKey = bossKey(loadQaSession()?.event);
    saveQaSession(defaultQaSession(selectedBossKey));
    state.spiritRoster = [];
    state.spiritRosterQa = null;
    state.attackMode = "normal";
    applyQaSession(loadQaSession());
    renderEntry();
    renderPage();
    $("#worldBossMessage").textContent = "QA 活動已重置，不影響正式資料。";
  }

  function openQa() {
    if (!isQaMode()) return false;
    window.chromaticaApp?.navigate?.("worldboss");
    applyQaSession(loadQaSession());
    renderEntry();
    renderPage();
    return true;
  }

  async function confirmExchangeAndAttack() {
    $("#worldBossExchangeAttackModal")?.classList.add("hidden");
    const type = state.pendingSpecial?.type || "special";
    await performAttack(type, { exchange: true });
    state.pendingSpecial = null;
  }

  function renderSkillPanel({ species, stage, adapter = null } = {}) {
    const panel = $("#gardenSpiritSkillPanel");
    if (!panel) return;
    const skill = core()?.getSkill?.(species);
    const harvested = adapter?.getCollection?.().some((spirit) => spirit.species === species && spirit.harvested === true);
    const visible = Boolean(harvested && Number(stage) === 3 && skill);
    panel.classList.toggle("hidden", !visible);
    if (!visible) return;
    panel.dataset.species = species;
    const unlocked = adapter?.isSkillUnlocked?.(species) === true;
    $("#gardenSpiritSkillName").textContent = unlocked ? `已習得：${skill.skillName}` : skill.skillName;
    $("#gardenSpiritSkillLearn").classList.toggle("hidden", !!unlocked);
    $("#gardenSpiritSkillStatus").textContent = unlocked ? `已習得：${skill.skillName}` : "";
  }

  async function refreshSkillUnlocks() {
    if (isQaMode()) return;
    try {
      const result = await rpc("get_my_world_boss_skills");
      state.skillUnlocks = new Map((result || []).map((row) => [row.species, row]));
      window.chromaticaApp?.refreshGardenSpiritSkillPresentation?.();
    } catch (error) {
      if (!isUnavailable(error)) console.warn("World Boss skill state unavailable.");
    }
  }

  function showSkillSuccess(species) {
    const skill = core()?.getSkill?.(species);
    if (!skill) return;
    $("#worldBossSkillSuccessSpirit").textContent = `恭喜獲得${skill.spiritName}的`;
    $("#worldBossSkillSuccessName").textContent = skill.skillName;
    $("#worldBossSkillSuccessModal")?.classList.remove("hidden");
  }

  async function learnSelectedSkill() {
    if (state.busy) return;
    const species = state.pendingSkillSpecies || $("#gardenSpiritSkillPanel")?.dataset.species || "";
    const skill = core()?.getSkill?.(species);
    const qaAdapter = isQaMode() ? window.ChromaticaGardenQA?.getDetailAdapter?.() : null;
    if (!skill || (qaAdapter ? qaAdapter.isSkillUnlocked(species) : state.skillUnlocks.has(species))) return;
    const gardenLockAcquired = qaAdapter ? true : window.chromaticaApp?.beginFormalGardenMutation?.() === true;
    if (!gardenLockAcquired) return;
    $("#worldBossSkillLearnConfirmModal")?.classList.add("hidden");
    state.busy = true;
    $("#gardenSpiritSkillStatus").textContent = "正在安全學習技能…";
    try {
      if (qaAdapter) {
        const qaResult = qaAdapter.learnWorldBossSkill(species, 100);
        if (!qaResult?.ok) {
          if (qaResult?.reason === "insufficient-water") throw new Error("water-insufficient");
          throw new Error("qa-skill-unavailable");
        }
      } else {
        const syncState = await window.chromaticaAccountWorkspace?.syncBestEffort?.();
        if (syncState && syncState.status !== "synced") throw new Error("game-save-sync-required");
        const result = await rpc("learn_world_boss_skill", { p_species: species, p_request_id: requestId() });
        const row = Array.isArray(result) ? result[0] : result;
        await window.chromaticaApp?.applyAuthoritativeGardenGameSave?.(row);
        state.skillUnlocks.set(species, row || { species });
      }
      window.chromaticaApp?.refreshGardenSpiritSkillPresentation?.();
      $("#gardenSpiritSkillStatus").textContent = "";
      showSkillSuccess(species);
    } catch (error) {
      if (!qaAdapter) {
        await window.chromaticaApp?.refreshAuthoritativeGardenGameSave?.().catch(() => null);
        await refreshSkillUnlocks();
      }
      if (!qaAdapter && state.skillUnlocks.has(species)) {
        $("#gardenSpiritSkillStatus").textContent = "";
        showSkillSuccess(species);
      } else {
        $("#gardenSpiritSkillStatus").textContent = error?.message?.includes("water")
          ? "水滴不足，無法學習技能。" : "技能學習未完成，正式花園狀態已重新同步。";
      }
    } finally {
      state.busy = false;
      state.pendingSkillSpecies = "";
      if (!qaAdapter) window.chromaticaApp?.endFormalGardenMutation?.();
    }
  }

  function requestLearnSelectedSkill() {
    const species = $("#gardenSpiritSkillPanel")?.dataset.species || "";
    const skill = core()?.getSkill?.(species);
    if (!skill || isSkillUnlocked(species)) return;
    state.pendingSkillSpecies = species;
    $("#worldBossSkillLearnConfirmCopy").textContent = `將花費 100 水滴學習「${skill.skillName}」。`;
    $("#worldBossSkillLearnConfirmModal")?.classList.remove("hidden");
  }

  async function showNextNotification() {
    if (isQaMode()) return;
    if (window.ChromaticaPushNotifications?.worldBossEnabled?.() === false) {
      $("#worldBossTopNotice")?.classList.add("hidden");
      return;
    }
    try {
      const rows = await rpc("get_my_world_boss_notifications");
      const row = rows?.[0];
      if (!row) return;
      if (window.ChromaticaPushNotifications?.worldBossEnabled?.() === false) {
        $("#worldBossTopNotice")?.classList.add("hidden");
        return;
      }
      const [title, body] = core()?.notificationCopy?.(row.notification_type) || ["世界 Boss", "戰況已更新。"];
      $("#worldBossTopNotice").dataset.notificationId = row.id;
      $("#worldBossTopNoticeTitle").textContent = title;
      $("#worldBossTopNoticeBody").textContent = body;
      $("#worldBossTopNotice").classList.remove("hidden");
    } catch {
      // Phase 2 migration is optional until deployment.
    }
  }

  function showQaNotification(notificationType) {
    if (!isQaMode()) return false;
    if (window.ChromaticaPushNotifications?.worldBossEnabled?.() === false) {
      $("#worldBossTopNotice")?.classList.add("hidden");
      window.chromaticaApp?.showNonBlockingToast?.("世界 Boss 提醒通知目前已關閉");
      return false;
    }
    const presentation = bossPresentation();
    const [title, template] = core()?.notificationCopy?.(notificationType) || ["世界 Boss", "戰況已更新。"];
    const notice = $("#worldBossTopNotice");
    if (!notice) return false;
    notice.dataset.notificationId = "";
    $("#worldBossTopNoticeTitle").textContent = title;
    const body = String(template).replaceAll("樹麻雀", presentation.name);
    $("#worldBossTopNoticeBody").textContent = body;
    notice.classList.remove("hidden");
    const systemNotification = window.ChromaticaPushNotifications?.showQaWorldBossNotification?.(notificationType, { title, body });
    if (!systemNotification) {
      window.chromaticaApp?.showNonBlockingToast?.("已顯示 App 內提醒；系統通知元件尚未就緒");
      return true;
    }
    void Promise.resolve(systemNotification).then((scheduled) => {
      window.chromaticaApp?.showNonBlockingToast?.(scheduled
        ? "系統通知已排程，請在 10 秒內切到背景"
        : "世界 Boss 提醒通知目前已關閉");
    }).catch(() => {
      window.chromaticaApp?.showNonBlockingToast?.("App 內提醒已顯示，但系統通知排程失敗");
    });
    return true;
  }

  async function closeTopNotice() {
    const notice = $("#worldBossTopNotice");
    const id = notice?.dataset.notificationId;
    notice?.classList.add("hidden");
    if (id && !isQaMode()) await rpc("read_world_boss_notification", { p_notification_id: id }).catch(() => null);
  }

  async function recordPracticeCompletion({ practiceDate } = {}) {
    if (isQaMode()) return null;
    try {
      const result = await rpc("grant_world_boss_practice_energy_v2", {
        p_request_id: requestId(),
      });
      const row = Array.isArray(result) ? result[0] : result;
      return {
        eventId: row?.event_id || null,
        lightEnergy: Number(row?.light_energy || 0),
        practiceDate: row?.practice_date || practiceDate || null,
        worldBossEventStartEnergyGranted: row?.world_boss_event_start_energy_granted === true,
        worldBossDailyPracticeEnergyGranted: row?.world_boss_daily_practice_energy_granted === true,
      };
    } catch (error) {
      if (!isUnavailable(error)) console.warn("World Boss practice energy was not recorded.");
      return null;
    }
  }

  function init() {
    const capacitor = window.Capacitor;
    const appPlugin = capacitor?.isNativePlatform?.() && capacitor.getPlatform?.() === "android"
      ? capacitor.Plugins?.App
      : null;
    appPlugin?.addListener?.("appStateChange", ({ isActive }) => {
      if (isActive) void refreshHomeEntry();
    })?.catch?.(() => {});
    $("#worldBossEntry")?.addEventListener("click", () => {
      window.chromaticaApp?.navigate?.("worldboss");
      void refresh();
    });
    $("#worldBossSpiritPicker")?.addEventListener("click", openSpiritPicker);
    $("#worldBossSpiritPickerList")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-roster-index][data-stage]");
      if (button) selectSpiritFromPicker(button);
    });
    $("#worldBossSpiritPickerClose")?.addEventListener("click", closeSpiritPicker);
    $("#worldBossAttackModeToggle")?.addEventListener("click", () => {
      if (!canUseSelectedSpecial()) return;
      state.attackMode = state.attackMode === "special" ? "normal" : "special";
      renderPage();
    });
    $("#worldBossAttackAction")?.addEventListener("click", () => void performAttack(state.attackMode));
    $("#worldBossExchangeAttackCancel")?.addEventListener("click", () => {
      state.pendingSpecial = null;
      $("#worldBossExchangeAttackModal")?.classList.add("hidden");
    });
    $("#worldBossExchangeAttackConfirm")?.addEventListener("click", () => void confirmExchangeAndAttack());
    $("#worldBossAttackErrorClose")?.addEventListener("click", () => {
      $("#worldBossAttackErrorModal")?.classList.add("hidden");
    });
    $("#worldBossInfoOpen")?.addEventListener("click", () => {
      $("#worldBossInfoModal")?.classList.remove("hidden");
    });
    $("#worldBossInfoClose")?.addEventListener("click", () => {
      $("#worldBossInfoModal")?.classList.add("hidden");
    });
    document.querySelectorAll("[data-world-boss-qa-hp]").forEach((button) => {
      button.addEventListener("click", () => setQaHp(button.dataset.worldBossQaHp));
    });
    $("#worldBossQaUnlimitedEnergy")?.addEventListener("change", (event) => updateQaOption("energy", event.target.checked));
    $("#worldBossQaUnlimitedSpecial")?.addEventListener("change", (event) => updateQaOption("special", event.target.checked));
    $("#worldBossQaZeroEnergy")?.addEventListener("click", () => setQaEnergy(0));
    $("#worldBossQaWater")?.addEventListener("change", (event) => setQaWater(event.target.value));
    $("#worldBossQaBoss")?.addEventListener("change", (event) => setQaBoss(event.target.value));
    $("#worldBossQaSuccess")?.addEventListener("click", () => void simulateQaSettlement(true));
    $("#worldBossQaFailure")?.addEventListener("click", () => void simulateQaSettlement(false));
    $("#worldBossQaReset")?.addEventListener("click", resetQaSession);
    $("#worldBossQaAppearedNotice")?.addEventListener("click", () => showQaNotification("boss_appeared"));
    $("#worldBossQaDefeatedNotice")?.addEventListener("click", () => showQaNotification("boss_defeated"));
    $("#worldBossQaReturn")?.addEventListener("click", () => window.chromaticaApp?.navigate?.("gardenqa"));
    $("#gardenSpiritSkillLearn")?.addEventListener("click", requestLearnSelectedSkill);
    $("#worldBossSkillLearnCancel")?.addEventListener("click", () => {
      state.pendingSkillSpecies = "";
      $("#worldBossSkillLearnConfirmModal")?.classList.add("hidden");
    });
    $("#worldBossSkillLearnConfirm")?.addEventListener("click", () => void learnSelectedSkill());
    $("#worldBossSkillSuccessClose")?.addEventListener("click", () => $("#worldBossSkillSuccessModal")?.classList.add("hidden"));
    $("#worldBossTopNoticeClose")?.addEventListener("click", () => void closeTopNotice());
    window.clearInterval(state.countdownTimer);
    state.countdownTimer = window.setInterval(updateCountdown, 1000);
    window.clearInterval(state.refreshTimer);
    state.refreshTimer = window.setInterval(() => {
      if (!state.busy && $("#worldboss.view.active")) void refresh();
    }, 5000);
    void Promise.all([refresh(), refreshSkillUnlocks(), showNextNotification()]);
  }

  window.ChromaticaWorldBoss = Object.freeze({
    init,
    refresh,
    openQa,
    onViewChanged,
    onAppBackground,
    refreshHomeEntry,
    renderSkillPanel,
    isSkillUnlocked,
    refreshSpiritRoster,
    recordPracticeCompletion,
  });
})();
