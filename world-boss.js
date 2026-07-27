(() => {
  "use strict";

  const ASSET_ROOT = "./public/assets/world-boss";
  const state = {
    status: "loading",
    event: null,
    player: null,
    skillUnlocks: new Map(),
    busy: false,
  };

  const $ = (selector) => document.querySelector(selector);
  const auth = () => window.chromaticaAuth;
  const core = () => window.ChromaticaWorldBossCore;
  const requestId = () => globalThis.crypto?.randomUUID?.()
    || "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
      const value = Math.floor(Math.random() * 16);
      return (character === "x" ? value : (value & 3) | 8).toString(16);
    });

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

  function bossImage(status) {
    if (["defeated", "settling", "closed"].includes(status)) return `${ASSET_ROOT}/第一隻boss樹麻雀 死亡狀態.png`;
    if (status === "active" && Number(state.event?.remaining_hp) <= Number(state.event?.max_hp) / 2) {
      return `${ASSET_ROOT}/第一隻boss 樹麻雀 狂暴狀態.png`;
    }
    return `${ASSET_ROOT}/第一隻boss 樹麻雀.png`;
  }

  function renderEntry() {
    const button = $("#worldBossEntry");
    if (!button) return;
    const icon = $("#worldBossEntryIcon");
    const label = $("#worldBossEntryLabel");
    const fallbackWindow = core()?.getEventWindow?.() || {};
    const status = state.event?.status || fallbackWindow.phase || "scheduled";
    if (icon) icon.src = ["defeated", "settling", "closed"].includes(status)
      ? `${ASSET_ROOT}/boss入口iocn(死亡狀態）.png`
      : `${ASSET_ROOT}/boss入口icon.png`;
    if (label) {
      if (state.status === "unavailable") label.textContent = "世界 Boss 服務準備中";
      else if (status === "active") label.textContent = `樹麻雀 HP ${state.event?.remaining_hp ?? "—"} / ${state.event?.max_hp ?? 3000}`;
      else if (status === "defeated") label.textContent = "樹麻雀已被擊倒";
      else label.textContent = "世界 Boss 預告";
    }
  }

  function renderPage() {
    const page = $("#worldboss");
    if (!page) return;
    const statusText = $("#worldBossStatusText");
    const image = $("#worldBossImage");
    const hp = $("#worldBossHp");
    const battle = $("#worldBossBattleControls");
    const exchange = $("#worldBossExchangeEnergy");
    const energy = $("#worldBossEnergyCount");
    const status = state.event?.status || "scheduled";
    if (image) image.src = bossImage(status);
    if (energy) energy.textContent = String(state.player?.light_energy ?? 0);
    if (state.status === "unavailable") {
      if (statusText) statusText.textContent = "世界 Boss 服務準備中";
      if (hp) hp.textContent = "正式服務啟用後即可參加討伐。";
      battle?.classList.add("hidden");
      exchange?.classList.add("hidden");
      return;
    }
    if (statusText) {
      statusText.textContent = status === "active" ? "討伐進行中"
        : status === "defeated" ? "討伐成功"
          : ["settling", "closed"].includes(status) ? "結算中"
            : "下一場預告";
    }
    if (hp) {
      if (status === "active") hp.textContent = `HP ${state.event?.remaining_hp ?? 0} / ${state.event?.max_hp ?? 3000}`;
      else {
        const startsAt = state.event?.starts_at || core()?.getEventWindow?.().startsAt;
        const remaining = Math.max(0, new Date(startsAt).getTime() - Date.now());
        const hours = Math.floor(remaining / 3_600_000);
        const minutes = Math.floor((remaining % 3_600_000) / 60_000);
        hp.textContent = `距離討伐開始 ${hours} 小時 ${minutes} 分鐘`;
      }
    }
    battle?.classList.toggle("hidden", status !== "active");
    exchange?.classList.toggle("hidden", status !== "active");
  }

  async function refresh() {
    try {
      const result = await rpc("get_world_boss_status");
      const row = Array.isArray(result) ? result[0] : result;
      state.event = row || null;
      state.player = row || null;
      state.status = "ready";
    } catch (error) {
      state.status = isUnavailable(error) ? "unavailable" : "error";
      state.event = null;
    }
    renderEntry();
    renderPage();
    return state.status;
  }

  async function attack(type) {
    if (state.busy || state.status !== "ready") return;
    const species = $("#worldBossSpirit")?.value || "melody-sprout";
    const stage = Number($("#worldBossSpiritStage")?.value || 1);
    state.busy = true;
    try {
      await rpc("attack_world_boss", {
        p_event_id: state.event?.event_id,
        p_species: species,
        p_stage: stage,
        p_attack_type: type,
        p_request_id: requestId(),
      });
      await refresh();
    } catch (error) {
      $("#worldBossMessage").textContent = error?.message || "攻擊未完成，請稍後再試。";
    } finally {
      state.busy = false;
    }
  }

  async function exchangeEnergy() {
    if (state.busy || !state.event?.event_id) return;
    state.busy = true;
    try {
      await rpc("exchange_world_boss_energy", {
        p_event_id: state.event.event_id,
        p_quantity: 1,
        p_request_id: requestId(),
      });
      await refresh();
    } catch (error) {
      $("#worldBossMessage").textContent = error?.message?.includes("water")
        ? "水滴不足，無法兌換光之能量。" : "目前無法兌換光之能量。";
    } finally {
      state.busy = false;
    }
  }

  function renderSkillPanel({ species, stage, formal = true } = {}) {
    const panel = $("#gardenSpiritSkillPanel");
    if (!panel) return;
    const skill = core()?.getSkill?.(species);
    const visible = formal && Number(stage) === 3 && !!skill;
    panel.classList.toggle("hidden", !visible);
    if (!visible) return;
    panel.dataset.species = species;
    const unlocked = state.skillUnlocks.get(species);
    $("#gardenSpiritSkillName").textContent = unlocked ? `已習得：${skill.skillName}` : skill.skillName;
    $("#gardenSpiritSkillLearn").classList.toggle("hidden", !!unlocked);
  }

  async function refreshSkillUnlocks() {
    try {
      const result = await rpc("get_my_world_boss_skills");
      state.skillUnlocks = new Map((result || []).map((row) => [row.species, row]));
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
    const species = $("#gardenSpiritSkillPanel")?.dataset.species || "";
    const skill = core()?.getSkill?.(species);
    if (!skill || state.skillUnlocks.has(species)) return;
    state.busy = true;
    $("#gardenSpiritSkillStatus").textContent = "正在安全學習技能…";
    try {
      const result = await rpc("learn_world_boss_skill", {
        p_species: species,
        p_request_id: requestId(),
      });
      const row = Array.isArray(result) ? result[0] : result;
      state.skillUnlocks.set(species, row || { species });
      renderSkillPanel({ species, stage: 3, formal: true });
      $("#gardenSpiritSkillStatus").textContent = "";
      showSkillSuccess(species);
    } catch (error) {
      $("#gardenSpiritSkillStatus").textContent = error?.message?.includes("water")
        ? "水滴不足，無法學習技能。" : "技能學習未完成，沒有扣除水滴。";
    } finally {
      state.busy = false;
    }
  }

  async function recordPracticeCompletion({ practiceDate } = {}) {
    try {
      return await rpc("grant_world_boss_practice_energy", {
        p_practice_date: practiceDate || new Date().toISOString().slice(0, 10),
        p_request_id: requestId(),
      });
    } catch (error) {
      if (!isUnavailable(error)) console.warn("World Boss practice energy was not recorded.");
      return null;
    }
  }

  function init() {
    $("#worldBossEntry")?.addEventListener("click", () => {
      window.chromaticaApp?.navigate?.("worldboss");
      void refresh();
    });
    $("#worldBossNormalAttack")?.addEventListener("click", () => void attack("normal"));
    $("#worldBossSpecialAttack")?.addEventListener("click", () => void attack("special"));
    $("#worldBossExchangeEnergy")?.addEventListener("click", () => void exchangeEnergy());
    $("#gardenSpiritSkillLearn")?.addEventListener("click", () => void learnSelectedSkill());
    $("#worldBossSkillSuccessClose")?.addEventListener("click", () => $("#worldBossSkillSuccessModal")?.classList.add("hidden"));
    void Promise.all([refresh(), refreshSkillUnlocks()]);
  }

  window.ChromaticaWorldBoss = Object.freeze({
    init,
    refresh,
    renderSkillPanel,
    recordPracticeCompletion,
  });
})();
