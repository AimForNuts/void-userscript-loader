(function () {
  'use strict';

  function createLootHelperModule(definition) {

  /**************************************************************************
   * CONSTANTS
   **************************************************************************/

  const RARITY_COLOR = {
    MYTHIC: "#B33A3A", LEGENDARY: "#C6A85C",
    EPIC:   "#6B3A8A", RARE:      "#2F6B5F", COMMON: "#7A6E62",
  };

  // Game stat keys that differ from our internal keys
  const STAT_KEY_MAP = {
    cooldownReduction: "cdr",
    critDamage:        "critDmg",
  };

  const FORGE_TIER_SYMBOL = {
    starforged: "★",
    moonforged: "☽",
    sunforged:  "☀",
  };

  // Total stat slots per rarity (1 primary + bonus slots: Common 0, Rare 1, Epic 2, Legendary 3, Mythic 4)
  // Fewer unique stats than slots = a stat was multi-rolled
  const RARITY_STAT_SLOTS = { COMMON:1, RARE:2, EPIC:3, LEGENDARY:4, MYTHIC:5 };

  // Primary stat multiplier by rarity (applied on top of base × tier)
  const RARITY_MULT = { COMMON:1.00, RARE:1.10, EPIC:1.25, LEGENDARY:1.40, MYTHIC:1.85 };

  // Forge multipliers on primary stat only
  const FORGE_MULT = { moonforged:1.20, sunforged:1.50 };

  // Primary stat for each slot — quality% on primary = rolled / (T_base_max × rarity_mult × forge_mult)
  const SLOT_PRIMARY_STAT = {
    Weapon:"atk", Hands:"atk",
    Shield:"def", Chest:"def", Helmet:"def", Shoulders:"def", Legs:"def", Boots:"def",
    Amulet:"hp",
    Ring:null,  // random: atk / def / hp
  };

  // Primary base ranges by weapon group, T1–T9 (roll 80–100% of these, then × rarity_mult)
  const PRIMARY_BASE_RANGES = {
    "Sword/Bow/Spear": [[10,13],[14,18],[20,25],[27,36],[38,50],[54,70],[75,98],[105,137],[148,192]],
    "Staff/Harp":      [[ 8,10],[11,14],[16,20],[22,27],[31,38],[43,54],[60,75],[ 84,105],[118,148]],
    "Fan":             [[ 9,11],[13,15],[18,22],[25,30],[35,42],[48,59],[68,83],[ 95,116],[133,162]],
    "Hands/Ring(ATK)": [[ 2, 3],[ 3, 4],[ 4, 6],[ 5, 8],[ 8,12],[11,16],[15,23],[ 21, 32],[ 30, 44]],
    "Shield/Chest":    [[ 6, 8],[ 8,11],[12,16],[16,22],[23,31],[32,43],[45,60],[ 63, 84],[ 89,118]],
    "Helmet/Shoulders/Legs/Boots/Ring(DEF)":
                       [[ 4, 5],[ 6, 7],[ 8,10],[11,14],[15,19],[22,27],[30,38],[ 42, 53],[ 59, 74]],
    "Amulet/Ring(HP)": [[10,13],[14,18],[20,25],[27,36],[38,50],[54,70],[75,98],[105,137],[148,192]],
  };

  // Bonus stat roll ranges (80–100% of these values; same pool regardless of item rarity)
  // { min, max, step } — quality% = rolled / max
  const BONUS_STAT_RANGES = {
    atk:        { min:2,   max:3,   step:1   },
    def:        { min:4,   max:6,   step:1   },
    hp:         { min:9,   max:12,  step:1   },
    mana:       { min:8,   max:10,  step:1   },
    critChance: { min:2.0, max:2.5, step:0.1 },
    critDmg:    { min:6.0, max:8.0, step:0.1 },
    healPower:  { min:4.5, max:6.0, step:0.1 },
    cdr:        { min:1.0, max:1.5, step:0.1 },
    dropRate:   { min:16,  max:20,  step:0.1 },
    atkSpeed:   { min:3.0, max:4.0, step:0.1 },
    allStats:   { min:1.5, max:2.0, step:0.1 },
    manaRegen:  { min:4,   max:5,   step:1   },
  };

  const ZONE_TIERS = {
    "Bamboo Thicket": 1, "Jade River Delta": 1,
    "Crimson Petal Grove": 2, "Iron Gate Pass": 2,
    "Ascending Mist Temple": 3, "Sunken Lotus Marshes": 3,
    "Shattered Sky Ridge": 4, "Desert of Forgotten Kings": 4,
    "Sea of Swaying Bamboo": 5, "Frost Peak Hermitage": 5,
    "Celestial Dragon Spire": 6, "Palace of Jade Emperor": 6,
    "Abyssal Demon Pit": 7, "Void Nexus": 7,
    "Immortal Battlefield": 8, "Primordial Chaos Wastes": 8,
    "Throne of the Dao": 9,
  };

  const ITEM_TYPE_TO_SLOT = {
    bow:"Weapon", sword:"Weapon", spear:"Weapon", staff:"Weapon",
    harp:"Weapon", fan:"Weapon", axe:"Weapon", dagger:"Weapon",
    mace:"Weapon", wand:"Weapon", scepter:"Weapon", scythe:"Weapon",
    crossbow:"Weapon", helmet:"Helmet", helm:"Helmet",
    shoulders:"Shoulders", chest:"Chest", robe:"Chest", vestment:"Chest",
    hands:"Hands", gauntlets:"Hands", gloves:"Hands",
    "leg armor":"Legs", legs:"Legs", greaves:"Legs",
    boots:"Boots", sabatons:"Boots", amulet:"Amulet", ring:"Ring", shield:"Shield",
  };

  const GEAR_ITEM_TYPES = new Set(Object.keys(ITEM_TYPE_TO_SLOT));

  const STR_WEAPONS = new Set(["sword","axe","mace","dagger","spear","bow","crossbow"]);

  // Base attack interval in seconds per weapon type (adjusted by atkSpeed% gear stat)
  const WEAPON_BASE_SPEED = {
    sword:2.0, axe:2.5, mace:2.8, dagger:1.5, spear:2.2,
    bow:3.0, crossbow:3.5, harp:2.0, fan:1.8,
    staff:2.0, wand:1.8, scepter:2.2, scythe:2.5,
  };

  const ITEM_ICONS = {
    bow:"🏹", crossbow:"🏹",
    sword:"⚔️", axe:"🪓", mace:"🔨", dagger:"🗡️", spear:"🗡️",
    staff:"🪄", wand:"🪄", scepter:"🪄", scythe:"🪄",
    harp:"🎵", fan:"🪭",
    helmet:"⛑️", helm:"⛑️",
    shoulders:"🛡️", chest:"🧥", robe:"🧥", vestment:"🧥",
    hands:"🧤", gauntlets:"🧤", gloves:"🧤",
    "leg armor":"👖", legs:"👖", greaves:"👖",
    boots:"👢", sabatons:"👢",
    shield:"🛡️", amulet:"📿", ring:"💍",
  };

  const GEAR_SLOT_ORDER = [
    "Weapon","Helmet","Shoulders","Chest","Hands","Legs","Boots","Amulet","Ring","Shield",
  ];

  // Weapon types that share a usable family (equipping one → only those are upgrades)
  const WEAPON_FAMILIES = {
    bow:      new Set(["bow","crossbow"]),
    crossbow: new Set(["bow","crossbow"]),
    sword:    new Set(["sword","axe","mace","dagger","spear"]),
    axe:      new Set(["sword","axe","mace","dagger","spear"]),
    mace:     new Set(["sword","axe","mace","dagger","spear"]),
    dagger:   new Set(["sword","axe","mace","dagger","spear"]),
    spear:    new Set(["sword","axe","mace","dagger","spear"]),
    staff:    new Set(["staff","wand","scepter","scythe"]),
    wand:     new Set(["staff","wand","scepter","scythe"]),
    scepter:  new Set(["staff","wand","scepter","scythe"]),
    scythe:   new Set(["staff","wand","scepter","scythe"]),
    harp:     new Set(["harp"]),
    fan:      new Set(["fan"]),
  };
  // Weapon families that cannot equip a shield
  const NO_SHIELD_WEAPONS    = new Set(["bow","crossbow","harp","fan","staff","wand","scepter","scythe"]);
  const CAN_WEAR_HEAVY_ARMOR = new Set(["spear"]);

  const CATEGORIES = [
    { key:"top",  label:"✅ Top Pick", cls:"rec-top"  },
    { key:"up",   label:"👍 Interesting",  cls:"rec-up"   },
    { key:"neu",  label:"↔ Neutral",   cls:"rec-neu"  },
    { key:"sal",  label:"💾 Salvage",  cls:"rec-sal"  },
  ];

  const STAT_DEFS = [
    { key:"atk",        label:"ATK"        },
    { key:"atkSpeed",   label:"Atk Speed"  },
    { key:"critChance", label:"Crit%"      },
    { key:"critDmg",    label:"Crit DMG"   },
    { key:"def",        label:"DEF"        },
    { key:"hp",         label:"HP"         },
    { key:"mana",       label:"Mana"       },
    { key:"manaRegen",  label:"Mana Regen" },
    { key:"cdr",        label:"CDR"        },
    { key:"healPower",  label:"Heal Power" },
    { key:"dropRate",   label:"Drop Rate"  },
    { key:"allStats",   label:"All Stats"  },
  ];

  // Maps uppercase tooltip stat labels → internal stat keys
  const TOOLTIP_STAT_MAP = {
    "ATK":         "atk",
    "DEF":         "def",
    "HP":          "hp",
    "MANA":        "mana",
    "CDR":         "cdr",
    "HEAL":        "healPower",
    "DROPRATE":    "dropRate",
    "DROP RATE":   "dropRate",
    "ALL STATS":   "allStats",
    "ALLSTATS":    "allStats",
    "ATK SPEED":   "atkSpeed",
    "ATKSPEED":    "atkSpeed",
    "CRIT":        "critChance",
    "CRIT CHANCE": "critChance",
    "CRIT DMG":    "critDmg",
    "MANA REGEN":  "manaRegen",
    "MANAREGEN":   "manaRegen",
  };

  const FILTER_PRESETS = {
    "🏹 Bow":   ["atk","atkSpeed","critChance","critDmg","allStats"],
    "⚔️ Sword": ["atk","atkSpeed","critChance","critDmg","allStats"],
    "🛡 Tank":  ["def","hp","healPower","manaRegen","allStats"],
    "🔮 Mage":  ["mana","cdr","healPower","manaRegen","atkSpeed","allStats"],
    "🎲 Loot":  ["dropRate","allStats"],
  };

  /**************************************************************************
   * FILTER STORAGE
   **************************************************************************/

  function mkFC(stats, enabled=true, multiBonus={}, preferredStats=[], mode="defensive") {
    return { stats: new Set(stats), enabled, multiBonus, preferredStats: new Set(preferredStats), mode };
  }

  function loadFilters() {
    try {
      const raw = JSON.parse(localStorage.getItem("sgFilters") || "null");
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        const map = new Map();
        for (const [k, v] of Object.entries(raw)) {
          if (Array.isArray(v)) {
            // migrate old format
            map.set(k, mkFC(v));
          } else if (v && typeof v === "object") {
            map.set(k, mkFC(v.stats ?? [], v.enabled !== false, v.multiBonus ?? {}, v.preferredStats ?? [], v.mode ?? "defensive"));
          }
        }
        if (map.size > 0) return map;
      }
    } catch {}
    const map = new Map();
    let firstPreset = true;
    for (const [name, keys] of Object.entries(FILTER_PRESETS)) {
      map.set(name, mkFC(keys, firstPreset));  // only first preset enabled for new users
      firstPreset = false;
    }
    return map;
  }

  function saveFilters() {
    const out = {};
    for (const [k, fc] of state.filters) {
      out[k] = { stats:[...fc.stats], enabled:fc.enabled, multiBonus:fc.multiBonus, preferredStats:[...fc.preferredStats], mode: fc.mode ?? "defensive" };
    }
    localStorage.setItem("sgFilters", JSON.stringify(out));
  }

  /**************************************************************************
   * STATS PERSISTENCE
   **************************************************************************/

  const STATS_KEY = "sgStats";
  const STATS_FIELDS = [
    "charName","str","strDerived","int","intDerived",
    "atkPhys","atkMag","critChance","critDmg","hitChance","atkSpeed",
    "def","maxHpStat","maxManaStat","healPower","lifesteal","manaRegen",
    "xpBonus","goldBonus","dropRate","allStats",
    "kills","zonesVisited",
  ];

  function saveStats() {
    const out = {};
    for (const k of STATS_FIELDS) out[k] = state[k];
    try { localStorage.setItem(STATS_KEY, JSON.stringify(out)); } catch {}
  }

  function loadStats() {
    try {
      const raw = JSON.parse(localStorage.getItem(STATS_KEY) || "null");
      if (raw && typeof raw === "object") {
        for (const k of STATS_FIELDS) {
          if (raw[k] != null) state[k] = raw[k];
        }
      }
    } catch {}
  }

  /**************************************************************************
   * TEAM PROFILES
   **************************************************************************/

  const TEAM_KEY = "sgTeamProfiles";
  const teamProfiles = (() => {
    try { return JSON.parse(localStorage.getItem(TEAM_KEY) || "{}"); } catch { return {}; }
  })();
  function saveTeamProfiles() {
    try { localStorage.setItem(TEAM_KEY, JSON.stringify(teamProfiles)); } catch {}
  }

  // Pending inspect data keyed by playerId (captured from fetch intercept)
  const pendingInspect = {};

  // Hook fetch to capture /api/player/{id}/inspect responses
  (function hookInspectFetch() {
    const _orig = window.fetch;
    window.fetch = async function(...args) {
      const url = typeof args[0] === "string" ? args[0] : (args[0]?.url ?? "");
      const res = await _orig.apply(this, args);
      const m = url.match(/\/api\/player\/([^/?]+)\/inspect/);
      if (m) {
        res.clone().json().then(data => {
          if (Array.isArray(data.equipped)) {
            pendingInspect[m[1]] = data;
          }
        }).catch(() => {});
      }
      return res;
    };
  })();

  function parseInspectCharStats(data) {
    const src = (data.stats && typeof data.stats === "object") ? data.stats : data;
    function pick(...keys) {
      for (const k of keys) if (src[k] != null) return Number(src[k]);
      return null;
    }
    return {
      atkPhys:     pick("atkPhys",    "physicalAttack", "physAtk"),
      atkSpeed:    pick("atkSpeed",   "attackSpeed",    "speed"),
      critChance:  pick("critChance", "crit",           "critRate"),
      critDmg:     pick("critDmg",    "critDamage"),
      hitChance:   pick("hitChance",  "hit"),
      maxHpStat:   pick("maxHpStat",  "maxHp",          "hp"),
      def:         pick("def",        "defense",        "defence"),
      allStats:    pick("allStats",   "allStat"),
      maxManaStat: pick("maxManaStat","maxMana",         "mana"),
      manaRegen:   pick("manaRegen"),
    };
  }

  function deriveCharStatsFromProfile(profile) {
    const eqMap = profile.equippedMap ?? {};
    const items = Object.values(eqMap);

    // Parse level from e.g. "Level 42" or "Lv 42"
    const levelMatch = (profile.levelText ?? "").match(/\d+/);
    const level = levelMatch ? parseInt(levelMatch[0], 10) : 1;

    // Weapon type determines strength vs magic class
    const weapon = items.find(i => ITEM_TYPE_TO_SLOT[i.type] === "Weapon");
    const wtype  = (weapon?.type ?? "").toLowerCase();
    const isStr  = STR_WEAPONS.has(wtype);

    // Naked stats from level (3 attribute points per level)
    const pts      = level * 3;
    const nakedAtk  = pts * 1.5;
    const nakedHp   = isStr ? pts * 5   : 0;
    const nakedDef  = isStr ? pts * 0.3 : 0;
    const nakedMana = isStr ? 0 : pts * 4;

    // Sum total item stats (includes forge bonuses) across all equipped slots
    let gearAtk = 0, gearHp = 0, gearDef = 0, gearAllStats = 0;
    let gearAtkSpeed = 0, gearCrit = 0, gearCritDmg = 0, gearHit = 0;
    let gearMana = 0, gearMRegen = 0;

    for (const item of items) {
      const src = item.totalStats ?? item.stats ?? {};
      for (const [k, v] of Object.entries(src)) {
        if (k === "_qualities") continue;
        const nk = normStatKey(k);
        if (nk === "atk")        gearAtk      += v;
        if (nk === "hp")         gearHp       += v;
        if (nk === "def")        gearDef      += v;
        if (nk === "allStats")   gearAllStats += v;
        if (nk === "atkSpeed")   gearAtkSpeed += v;
        if (nk === "critChance") gearCrit     += v;
        if (nk === "critDmg")    gearCritDmg  += v;
        if (nk === "hitChance")  gearHit      += v;
        if (nk === "mana")       gearMana     += v;
        if (nk === "manaRegen")  gearMRegen   += v;
      }
    }

    const mult      = 1 + gearAllStats / 100;
    const baseSpeed = WEAPON_BASE_SPEED[wtype] ?? 2.0;
    const atkSpeed  = gearAtkSpeed > 0 ? baseSpeed / (1 + gearAtkSpeed / 100) : baseSpeed;

    return {
      atkPhys:     (nakedAtk + gearAtk) * mult,
      atkSpeed,
      critChance:  gearCrit,
      critDmg:     150 + gearCritDmg,
      hitChance:   95 + gearHit,
      maxHpStat:   (nakedHp + gearHp) * mult,
      def:         (nakedDef + gearDef) * mult,
      allStats:    gearAllStats,
      maxManaStat: (nakedMana + gearMana) * mult,
      manaRegen:   gearMRegen * mult,
    };
  }

  function selfCtx() {
    if (state.atkPhys != null && state.atkSpeed != null) return state;
    if (!Object.keys(state.equipped).length) return state;
    return deriveCharStatsFromProfile({ equippedMap: state.equipped, levelText: String(state.level ?? "") });
  }

  function marketCtx() {
    if (!state.marketCtxPlayerId) return selfCtx();
    const profile = teamProfiles[state.marketCtxPlayerId];
    if (!profile) return selfCtx();
    return deriveCharStatsFromProfile(profile);
  }

  function marketCtxFilterKey() {
    if (!state.marketCtxPlayerId) return state.activeFilterKey;
    const profile = teamProfiles[state.marketCtxPlayerId];
    return profile?.filterKey ?? state.activeFilterKey;
  }

  function rebuildMarketItems() {
    if (!state.marketRawData.length) { state.marketItems = []; return; }

    let equippedMap, filterKey;
    if (state.marketCtxPlayerId && teamProfiles[state.marketCtxPlayerId]) {
      const profile = teamProfiles[state.marketCtxPlayerId];
      equippedMap = profile.equippedMap;
      filterKey   = profile.filterKey ?? state.activeFilterKey;
    } else {
      state.marketCtxPlayerId = null;   // reset if profile was deleted
      equippedMap = state.equipped;
      filterKey   = state.activeFilterKey;
    }

    state.marketItems = state.marketRawData.map(r =>
      ({ ..._buildBagItem(r.item, equippedMap, filterKey),
         listingId: r.listingId, price: r.price,
         sellerName: r.sellerName, itemTier: r.itemTier, isFutureTier: r.isFutureTier })
    );
  }

  function buildEquippedMap(equippedArray) {
    const map = {};
    for (const item of (equippedArray || [])) {
      if (!item.equippedSlot) continue;
      const raw  = item.equippedSlot;
      const slot = raw === "ring1" ? "Ring 1"
                 : raw === "ring2" ? "Ring 2"
                 : raw.charAt(0).toUpperCase() + raw.slice(1);
      map[slot] = item;
    }
    return map;
  }

  /**************************************************************************
   * STATE
   **************************************************************************/

  const _filters = loadFilters();
  const _storedKey = localStorage.getItem("sgActiveFilter") || "";

  const state = {
    filters:         _filters,
    activeFilterKey: _filters.has(_storedKey) ? _storedKey : (_filters.keys().next().value ?? ""),
    filterEdit:      null,
    activeTab:       "stats",
    gearMode:        "slot",

    level:null, hp:null, maxHp:null, mana:null, maxMana:null,
    xpPct:null, xpCurrent:null, xpTotal:null, xphr:null, zone:null,

    charViewOpen:false, charName:null,
    str:null, strDerived:null, int:null, intDerived:null,
    atkPhys:null, atkMag:null, critChance:null, critDmg:null,
    hitChance:null, atkSpeed:null, def:null, maxHpStat:null, maxManaStat:null,
    healPower:null, lifesteal:null, manaRegen:null,
    xpBonus:null, goldBonus:null, dropRate:null, allStats:null,
    kills:null, zonesVisited:null,

    equipped:{}, equippedCachedAt:null,
    bagItems:[], bagItemsRaw:[], bagVisible:false,
    catOpen:{ top:true, up:true, neu:false, sal:false },
    highlightCats: new Set(),
    marketItems: [], marketRawData: [], marketVisible: false, marketHideFuture: false,
    marketCtxPlayerId: null,
  };

  /**************************************************************************
   * HELPERS
   **************************************************************************/

  function parseNum(raw) {
    if (raw == null) return NaN;
    let s = String(raw).trim(), mult = 1;
    if (/k$/i.test(s)) { mult = 1_000;     s = s.slice(0,-1); }
    if (/m$/i.test(s)) { mult = 1_000_000; s = s.slice(0,-1); }
    s = s.replace(/[^0-9.,\-]/g,"");
    if (!s) return NaN;
    if (s.includes(",")) s = s.replace(/\./g,"").replace(",",".");
    else                 s = s.replace(/\.(\d{3})(?=\.|$)/g,"$1");
    return (parseFloat(s) || 0) * mult;
  }

  function txt(sel, root) {
    return (root || document).querySelector(sel)?.textContent?.trim() ?? "";
  }

  function fmt(n) {
    n = Number(n);
    if (!isFinite(n)) return "—";
    if (n >= 1_000_000) return (n/1_000_000).toFixed(1)+"M";
    if (n >= 1_000)     return (n/1_000).toFixed(1)+"K";
    return String(Math.round(n));
  }

  function fmtDec(n, d=1) { n=Number(n); return isFinite(n)?n.toFixed(d):"—"; }

  function esc(v) {
    return String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  }

  function barHtml(val, max, color) {
    const p = max>0 ? Math.min(100,(val/max)*100) : 0;
    return `<div style="height:5px;background:#1e293b;border-radius:3px;overflow:hidden;margin-top:2px;">
      <div style="width:${p.toFixed(1)}%;height:100%;background:${color};border-radius:3px;"></div></div>`;
  }

  function rarityColor(r) { return RARITY_COLOR[String(r).toUpperCase()] ?? "#7A6E62"; }

  function normStatKey(k) { return STAT_KEY_MAP[k] ?? k; }
  function normForge(ft)  { return FORGE_TIER_SYMBOL[ft] ?? ""; }

  function calcMedian(vals) {
    if (!vals.length) return 1;
    const s = [...vals].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m-1] + s[m]) / 2;
  }

  function fmtDelta(delta) {
    const sign = delta > 0 ? "+" : "";
    const abs  = Math.abs(delta);
    if (abs >= 10 || delta === Math.round(delta)) return sign + Math.round(delta);
    return sign + delta.toFixed(1);
  }

  // DOM category label → set of item types the game puts in that group
  const DOM_CAT_TYPES = {
    "Weapons":     new Set(["bow","sword","spear","staff","harp","fan","axe","dagger","mace","wand","scepter","scythe","crossbow"]),
    "Armor":       new Set(["helmet","helm","shoulders","chest","robe","vestment","hands","gauntlets","gloves","legs","leg armor","greaves","boots","sabatons","shield"]),
    "Accessories": new Set(["amulet","ring"]),
  };

  // Uppercase item-type → slot name, built from existing ITEM_TYPE_TO_SLOT
  const TOOLTIP_TYPE_TO_SLOT = Object.fromEntries(
    Object.entries(ITEM_TYPE_TO_SLOT).map(([k, v]) => [k.toUpperCase(), v])
  );

  function parseChatTooltip(el) {
    // .tt-sub direct text node: "MYTHIC · AMULET" (tier is in a child <span>)
    const subEl = el.querySelector(".tt-sub");
    let subText = "";
    if (subEl) {
      for (const node of subEl.childNodes) {
        if (node.nodeType === 3) subText += node.textContent;
      }
    }
    subText = subText.trim();
    const parts   = subText.split("·").map(s => s.trim());
    const rarity   = parts[0] ?? "";
    const typePart = parts[1] ?? "";
    const slot     = TOOLTIP_TYPE_TO_SLOT[typePart] ?? null;

    const ttStats     = {};
    const ttQualities = {};
    el.querySelectorAll(".tt-stat-row").forEach(row => {
      const label   = row.querySelector(".tt-stat-label")?.textContent?.trim()?.toUpperCase();
      const valueEl = row.querySelector(".tt-stat-value");
      if (!label || !valueEl) return;
      // Grab only direct text nodes to skip the quality % span
      const rawText = [...valueEl.childNodes]
        .filter(n => n.nodeType === 3).map(n => n.textContent).join("").trim();
      const value = parseFloat(rawText.replace(/[+%,\s]/g, ""));
      const key   = TOOLTIP_STAT_MAP[label];
      if (key && !isNaN(value)) {
        ttStats[key] = value;
        const qMatch = row.querySelector(".tt-stat-quality")?.textContent?.match(/(\d+)/);
        if (qMatch) ttQualities[key] = parseInt(qMatch[1]) / 100;
      }
    });

    // Read armorWeight from any element containing "Light Armor" or "Heavy Armor"
    let armorWeight = null;
    const allText = el.textContent ?? "";
    if (/heavy\s*armor/i.test(allText)) armorWeight = "heavy";
    else if (/light\s*armor/i.test(allText)) armorWeight = "light";

    return { rarity, slot, typePart, stats: ttStats, qualities: ttQualities, armorWeight };
  }

  function injectChatComparison(el) {
    if (el.querySelector(".sg-chat-compare")) return;

    const { rarity, slot, typePart, stats: ttStats, qualities: ttQualities, armorWeight } = parseChatTooltip(el);
    const div = document.createElement("div");
    div.className = "sg-chat-compare";

    const equippedItem = slot
      ? (state.equipped[slot] ?? state.equipped[slot + " 1"] ?? null)
      : null;

    if (!slot || !equippedItem) {
      div.innerHTML = `<div class="sg-chat-compare-hint">${
        !slot
          ? "Slot not recognized — stat labels may need updating."
          : "No cached equipped " + esc(slot) + ". Open inventory first."
      }</div>`;
      el.appendChild(div);
      return;
    }

    // Equipped item base stats (no forge/rune inflation)
    const eqBaseStats = {};
    for (const [k, v] of Object.entries(equippedItem.stats)) {
      if (k === "_qualities") continue;
      eqBaseStats[normStatKey(k)] = v;
    }

    // Diffs: tooltip stats vs equipped base
    const allKeys = new Set([...Object.keys(ttStats), ...Object.keys(eqBaseStats)]);
    const diffs   = [];
    for (const sk of allKeys) {
      const delta = (ttStats[sk] ?? 0) - (eqBaseStats[sk] ?? 0);
      if (Math.abs(delta) < 0.001) continue;
      const label = STAT_DEFS.find(d => d.key === sk)?.label ?? sk;
      diffs.push({ text:`${label} ${fmtDelta(delta)}`, stat:sk, isUp:delta>0, isDown:delta<0 });
    }

    // Score + recommendation using active filter
    const activeFC      = state.filters.get(state.activeFilterKey) ?? mkFC([]);
    const itemStatKeys  = new Set(Object.keys(ttStats));
    const maxSlots      = RARITY_STAT_SLOTS[rarity.toUpperCase()] ?? 4;
    const multiRollCount = Math.max(0, maxSlots - itemStatKeys.size);
    const priorityUps   = diffs.filter(d => d.isUp && activeFC.stats.has(d.stat)).length;
    const hasPriorityMR = multiRollCount > 0 && [...itemStatKeys].some(s => activeFC.stats.has(s));
    const score = calcPrefScore(diffs, activeFC, multiRollCount, itemStatKeys);
    let { rec, cat: chatCat } = applyQualityCap(
      recommendation(score, priorityUps, hasPriorityMR, activeFC),
      categoryOf(score, priorityUps, hasPriorityMR, activeFC),
      ttQualities, multiRollCount, slot
    );
    const hasChatPrefMR = multiRollCount > 0 && [...itemStatKeys].some(s => activeFC.preferredStats.has(s));
    if (hasChatPrefMR && (chatCat === "neu" || chatCat === "sal")) {
      rec = { label:"👍 Interesting", cls:"rec-up" }; chatCat = "up";
    }
    // Flat-upgrade exception: if every filter stat present on this item beats equipped base → at least Upgrade
    {
      const filterStatsOnItem = [...activeFC.stats, ...activeFC.preferredStats].filter(s => itemStatKeys.has(s));
      if (filterStatsOnItem.length > 0 && filterStatsOnItem.every(s => diffs.some(d => d.stat === s && d.isUp))) {
        if (chatCat === "neu" || chatCat === "sal") {
          rec = { label:"👍 Interesting", cls:"rec-up" }; chatCat = "up";
        }
      }
    }
    // Class restriction cap for chat tooltips
    const chatItemType = typePart.toLowerCase();
    const chatEqWeapon = state.equipped["Weapon"];
    if (chatEqWeapon) {
      let chatRestricted = false;
      if (slot === "Weapon") {
        const allowed = WEAPON_FAMILIES[chatEqWeapon.type] ?? new Set([chatEqWeapon.type]);
        if (!allowed.has(chatItemType)) chatRestricted = true;
      } else if (slot === "Shield" && NO_SHIELD_WEAPONS.has(chatEqWeapon.type)) {
        chatRestricted = true;
      } else if (armorWeight === "heavy" && !CAN_WEAR_HEAVY_ARMOR.has(chatEqWeapon.type)) {
        chatRestricted = true;
      }
      if (chatRestricted && (chatCat === "top" || chatCat === "up")) {
        rec = { label:"↔ Neutral", cls:"rec-neu" };
      }
    }

    const eqForge = normForge(equippedItem.forgeTier);
    const eqLabel = `${eqForge ? eqForge + " " : ""}${equippedItem.name}${equippedItem.plus_level > 0 ? " +" + equippedItem.plus_level : ""}`;

    const diffsHtml = diffs.map(d => {
      const isPref  = activeFC.stats.has(d.stat);
      const isStar  = activeFC.preferredStats.has(d.stat);
      return `<span class="sg-diff ${d.isUp?"sg-diff-up":"sg-diff-down"}${isStar?" pref-star":isPref?" pref":""}">${esc(d.text)}</span>`;
    }).join("");

    // DPS delta: simulate swapping this item in
    let dpsDeltaHtml = "";
    if (state.atkPhys != null && state.atkSpeed != null && state.atkSpeed > 0) {
      const curDPS         = calcDPS();
      const curAllStats    = state.allStats ?? 0;
      const atkDelta       = (ttStats.atk       ?? 0) - (eqBaseStats.atk       ?? 0);
      const allStatsDelta  = (ttStats.allStats   ?? 0) - (eqBaseStats.allStats  ?? 0);
      const eqSpdPct       = eqBaseStats.atkSpeed ?? 0;
      const newSpdPct      = ttStats.atkSpeed    ?? 0;
      // allStats multiplies all ATK sources, so back-compute baseATK then re-apply new multiplier
      const baseATK        = state.atkPhys / (1 + curAllStats / 100);
      const newAtk         = (baseATK + atkDelta) * (1 + (curAllStats + allStatsDelta) / 100);
      // atkSpeed stat is a % bonus that shortens the attack interval
      const newSpd         = state.atkSpeed * (1 + eqSpdPct / 100) / (1 + newSpdPct / 100);
      const newCrit        = (state.critChance ?? 0) + (ttStats.critChance ?? 0) - (eqBaseStats.critChance ?? 0);
      const newCritD       = (state.critDmg    ?? 0) + (ttStats.critDmg    ?? 0) - (eqBaseStats.critDmg    ?? 0);
      if (curDPS != null && newAtk > 0 && newSpd > 0) {
        const hitRate = (state.hitChance ?? 95) / 100;
        const newDPS  = (newAtk / newSpd) * hitRate * (1 + (newCrit / 100) * ((newCritD / 100) - 1));
        const delta   = newDPS - curDPS;
        const pct     = (delta / curDPS) * 100;
        const sign    = delta >= 0 ? "+" : "";
        const col     = delta > 1 ? "#4ade80" : delta < -1 ? "#f87171" : "#94a3b8";
        dpsDeltaHtml  = `<div class="sg-row" style="padding:3px 0;border-top:1px solid rgba(255,255,255,.06);margin-top:4px"><span class="sg-key">∆ DPS</span><span style="color:${col};font-weight:700">${sign}${Math.round(delta)} <span style="opacity:.55;font-weight:400">(${sign}${pct.toFixed(1)}%)</span></span></div>`;
      }
    }

    // EHP delta
    let survDeltaHtml = "";
    {
      const curSurv = calcSurvivability(state.maxHpStat, state.def ?? 0);
      if (curSurv) {
        const curAllStats   = state.allStats ?? 0;
        const allStatsDelta = (ttStats.allStats ?? 0) - (eqBaseStats.allStats ?? 0);
        const hpDelta       = (ttStats.hp  ?? 0) - (eqBaseStats.hp  ?? 0);
        const defDelta      = (ttStats.def ?? 0) - (eqBaseStats.def ?? 0);
        const baseHP  = state.maxHpStat / (1 + curAllStats / 100);
        const baseDEF = (state.def ?? 0) / (1 + curAllStats / 100);
        const newHP   = (baseHP  + hpDelta)  * (1 + (curAllStats + allStatsDelta) / 100);
        const newDEF  = (baseDEF + defDelta) * (1 + (curAllStats + allStatsDelta) / 100);
        const newSurv = calcSurvivability(newHP, newDEF);
        if (newSurv != null) {
          const delta = newSurv - curSurv;
          if (Math.abs(delta) >= 1) {
            const pct  = (delta / curSurv) * 100;
            const sign = delta >= 0 ? "+" : "";
            const col  = delta > 0 ? "#60a5fa" : "#f87171";
            survDeltaHtml = `<div class="sg-row" style="padding:3px 0;border-top:1px solid rgba(255,255,255,.06);margin-top:4px"><span class="sg-key">∆ EHP</span><span style="color:${col};font-weight:700">${sign}${Math.round(delta)} <span style="opacity:.55;font-weight:400">(${sign}${pct.toFixed(1)}%)</span></span></div>`;
          }
        }
      }
    }

    // Combined mana score: pool + regen × 30
    let manaDeltaHtml = "";
    {
      const curAllStats   = state.allStats ?? 0;
      const allStatsDelta = (ttStats.allStats  ?? 0) - (eqBaseStats.allStats  ?? 0);
      const manaDelta     = (ttStats.mana      ?? 0) - (eqBaseStats.mana      ?? 0);
      const mregenDelta   = (ttStats.manaRegen ?? 0) - (eqBaseStats.manaRegen ?? 0);
      if (manaDelta !== 0 || mregenDelta !== 0 || allStatsDelta !== 0) {
        const baseMana   = (state.maxManaStat ?? 0) / (1 + curAllStats / 100);
        const baseMRegen = (state.manaRegen  ?? 0)  / (1 + curAllStats / 100);
        const newMana    = (baseMana   + manaDelta)   * (1 + (curAllStats + allStatsDelta) / 100);
        const newMRegen  = (baseMRegen + mregenDelta) * (1 + (curAllStats + allStatsDelta) / 100);
        const score = (newMana - (state.maxManaStat ?? 0)) + (newMRegen - (state.manaRegen ?? 0)) * 3;
        if (Math.abs(score) >= 1) {
          const sign = score >= 0 ? "+" : "";
          const col  = score > 0 ? "#60a5fa" : "#f87171";
          const SEP  = `style="padding:3px 0;border-top:1px solid rgba(255,255,255,.06);margin-top:4px"`;
          manaDeltaHtml = `<div class="sg-row" ${SEP} title="Mana Score = ΔPool + ΔRegen×3"><span class="sg-key">∆ Mana</span><span style="color:${col};font-weight:700">${sign}${Math.round(score)}</span></div>`;
        }
      }
    }

    div.innerHTML = `
      <div class="sg-chat-compare-head">
        <span class="sg-badge ${rec.cls}">${esc(rec.label)}</span>
        <span class="sg-chat-compare-vs">vs ${esc(eqLabel)}</span>
      </div>
      <div class="sg-diffs">${diffsHtml || '<span style="color:#4b5563;font-size:10px;">No stat differences</span>'}</div>
      ${dpsDeltaHtml}${survDeltaHtml}${manaDeltaHtml}
    `;

    // Position to the right of the tooltip (or left if no room)
    const rect = el.getBoundingClientRect();
    const panelW = 171;
    const left = (rect.right + 6 + panelW <= window.innerWidth)
      ? rect.right + 6
      : rect.left - panelW - 6;
    div.style.left = left + "px";
    div.style.top  = Math.max(4, rect.top) + "px";
    document.body.appendChild(div);

    // Remove when tooltip is removed from DOM
    new MutationObserver((_, obs) => {
      if (!document.body.contains(el)) { div.remove(); obs.disconnect(); }
    }).observe(document.body, { childList: true, subtree: true });
  }

  function setupTooltipObserver() {
    new MutationObserver(muts => {
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (n.nodeType === 1 && n.classList?.contains("chat-item-tooltip")) {
            injectChatComparison(n);
          }
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  const CAT_HL_CLASS = { top:"sg-hl-top", up:"sg-hl-up", neu:"sg-hl-neu", sal:"sg-hl-sal" };

  function applyBagHighlights() {
    Object.values(CAT_HL_CLASS).forEach(cls =>
      document.querySelectorAll("."+cls).forEach(el => el.classList.remove(cls))
    );
    if (!state.highlightCats.size || !state.bagItems.length) return;

    const hlMap = new Map();
    for (const item of state.bagItems) {
      const cls = state.highlightCats.has(item.cat) ? CAT_HL_CLASS[item.cat] : null;
      if (cls) hlMap.set(item.id, cls);
    }
    if (!hlMap.size) return;

    const invPanel = document.querySelector(".inv-panel");
    if (!invPanel) return;
    const fkey = Object.keys(invPanel).find(k => k.startsWith("__reactFiber"));
    if (!fkey) return;
    let fiber = invPanel[fkey];
    while (fiber) {
      if (fiber.memoizedProps?.inventory) {
        _applyHighlightByPosition(fiber.memoizedProps.inventory, hlMap);
        return;
      }
      fiber = fiber.return;
    }
  }

  function _applyHighlightByPosition(inventory, hlMap) {
    const bagByCat = {};
    for (const [catLabel, types] of Object.entries(DOM_CAT_TYPES)) {
      bagByCat[catLabel] = inventory.filter(i => !i.equippedSlot && types.has(i.type));
    }

    document.querySelectorAll(".inv-panel .bag-category").forEach(catEl => {
      const label = catEl.querySelector(".bag-cat-label")?.textContent?.trim();
      const items  = bagByCat[label];
      if (!items?.length) return;
      catEl.querySelectorAll(".item-slot").forEach((slot, i) => {
        const cls = items[i] && hlMap.get(items[i].id);
        if (cls) slot.classList.add(cls);
      });
    });
  }

  /**************************************************************************
   * LOOT LOGIC
   **************************************************************************/

  function calcPrefScore(diffs, fc, multiRollCount, itemStatKeys) {
    let score = 0;
    for (const d of diffs) {
      const dir = d.isUp ? 1 : -1;
      if (fc.preferredStats.has(d.stat))      score += dir * 4;
      else if (fc.stats.has(d.stat))          score += dir * 2;
      else                                    score += dir * 0.5;
    }
    if (multiRollCount > 0) {
      for (const [stat, bonus] of Object.entries(fc.multiBonus ?? {})) {
        if (bonus > 0 && itemStatKeys.has(stat)) score += bonus;
      }
    }
    return score;
  }

  // qualifies = 3+ priority stats improved (scales down for small filters) OR a priority stat multi-rolled
  function _qualifies(priorityUps, hasPriorityMultiRoll, fc) {
    const total = (fc?.stats.size ?? 0) + (fc?.preferredStats.size ?? 0);
    if (!fc || total === 0) return false;
    const needed = Math.min(2, total);
    return priorityUps >= needed || hasPriorityMultiRoll;
  }

  function recommendation(score, priorityUps, hasPriorityMultiRoll, fc) {
    const q = _qualifies(priorityUps, hasPriorityMultiRoll, fc);
    if (score >= 4  && q) return { label:"✅ Top Pick", cls:"rec-top"  };
    if (score >= 1  && q) return { label:"👍 Interesting",  cls:"rec-up"   };
    if (score >= -1)      return { label:"↔ Neutral",   cls:"rec-neu"  };
    return                       { label:"💾 Salvage",  cls:"rec-sal"  };
  }

  function categoryOf(score, priorityUps, hasPriorityMultiRoll, fc) {
    const q = _qualifies(priorityUps, hasPriorityMultiRoll, fc);
    if (score >= 4  && q) return "top";
    if (score >= 1  && q) return "up";
    if (score >= -1)      return "neu";
    return "sal";
  }

  // Caps recommendation based on roll quality — diffs and scores are not affected
  function applyQualityCap(rec, cat, rollQualities, multiRollCount, slotType) {
    const qVals = Object.values(rollQualities);
    if (!qVals.length) return { rec, cat };

    const median      = calcMedian(qVals);
    const hasAllStats = "allStats" in rollQualities;

    // Weapon rule: ATK quality < 75% with no multi-roll → cap at Skip
    if (slotType === "Weapon" && !hasAllStats) {
      const atkQ = rollQualities["atk"] ?? null;
      if (atkQ !== null && atkQ < 0.75 && multiRollCount === 0) {
        if (cat === "top" || cat === "up" || cat === "neu") {
          return { rec:{ label:"💾 Salvage", cls:"rec-sal" }, cat:"sal" };
        }
      }
    }

    // Median quality < 75%: cap at Neutral
    if (median < 0.75) {
      if (hasAllStats) {
        // allStats exception: force exactly Neutral — allStats has inherent value so prevent Salvage/Skip too
        return { rec:{ label:"↔ Neutral", cls:"rec-neu" }, cat:"neu" };
      }
      // Normal case: block Upgrade and Top Pick only
      if (cat === "top" || cat === "up") {
        return { rec:{ label:"↔ Neutral", cls:"rec-neu" }, cat:"neu" };
      }
    }

    return { rec, cat };
  }

  /**************************************************************************
   * DOM READERS
   **************************************************************************/

  function readPlayerBar() {
    const bar = document.querySelector(".player-bar");
    if (!bar) return;
    state.level = parseNum(txt(".pb-level", bar));
    const vitals = bar.querySelectorAll(".pb-vitals .pb-bar-group");
    if (vitals[0]) { const [h,mh] = txt(".pb-bar-text",vitals[0]).split("/").map(parseNum); state.hp=h; state.maxHp=mh; }
    if (vitals[1]) { const [m,mm] = txt(".pb-bar-text",vitals[1]).split("/").map(parseNum); state.mana=m; state.maxMana=mm; }
    state.xpPct = parseNum(txt(".pb-bar-text strong", bar));
    const xpM = txt(".pb-xp-raw", bar).match(/([\d.,]+)\s*\/\s*([\d.,]+)/);
    if (xpM) { state.xpCurrent=parseNum(xpM[1]); state.xpTotal=parseNum(xpM[2]); }
    state.xphr = txt(".pb-xphr-val", bar);
    state.zone  = txt(".pb-zone", bar);
  }

  function readCharView() {
    const cv = document.querySelector(".char-view");
    state.charViewOpen = !!cv;
    if (!cv) return;
    state.charName = txt(".cv-portrait-name", cv);
    cv.querySelectorAll(".cv-stat-row").forEach((row) => {
      const name = txt(".cv-stat-name", row);
      const val  = parseNum(txt(".cv-stat-value", row));
      const der  = row.nextElementSibling?.classList.contains("cv-stat-derived")
        ? row.nextElementSibling.textContent.trim() : "";
      if (name==="STR") { state.str=val; state.strDerived=der; }
      if (name==="INT") { state.int=val; state.intDerived=der; }
    });
    cv.querySelectorAll(".sb-stat-header").forEach((btn) => {
      const name = txt(".sb-stat-name", btn);
      const val  = parseNum(txt(".sb-stat-total", btn));
      switch (name) {
        case "Physical Attack": state.atkPhys    = val; break;
        case "Crit Chance":     state.critChance = val; break;
        case "Crit Damage":     state.critDmg    = val; break;
        case "Hit Chance":      state.hitChance  = val; break;
        case "Attack Speed":    state.atkSpeed   = val; break;
        case "Defense":         state.def        = val; break;
        case "Max HP":          state.maxHpStat  = val; break;
        case "Max Mana":        state.maxManaStat= val; break;
        case "Healing Power":   state.healPower  = val; break;
        case "Lifesteal":       state.lifesteal  = val; break;
        case "Mana Regen":      state.manaRegen  = val; break;
        case "XP Bonus":        state.xpBonus    = val; break;
        case "Gold Bonus":      state.goldBonus  = val; break;
        case "Drop Rate":       state.dropRate   = val; break;
        case "All Stats":       state.allStats   = val; break;
      }
    });
    const splitRow = cv.querySelector(".sb-phys-mag-row");
    if (splitRow) {
      splitRow.querySelectorAll(".sb-pm-val").forEach((v) => {
        const m = v.textContent.match(/Magical:\s*([\d.,]+)/);
        if (m) state.atkMag = parseNum(m[1]);
      });
    }
    cv.querySelectorAll(".char-stat-row").forEach((row) => {
      const label = txt(".char-stat-label", row);
      const val   = txt(".char-stat-value",  row);
      if (label==="Total Kills")   state.kills        = parseNum(val);
      if (label==="Zones Visited") state.zonesVisited = val;
    });
    saveStats();
  }

  // Reads the full inventory from React state. Keeps cached data when panel is closed.
  function readInventoryState() {
    const invPanel = document.querySelector(".inv-panel");
    state.bagVisible = !!invPanel;
    if (!invPanel) return;

    const fkey = Object.keys(invPanel).find(k => k.startsWith("__reactFiber"));
    if (!fkey) return;
    let fiber = invPanel[fkey];
    while (fiber) {
      if (fiber.memoizedProps?.inventory) {
        _processInventory(fiber.memoizedProps.inventory);
        return;
      }
      fiber = fiber.return;
    }
  }

  function _processInventory(inventory) {
    const equippedMap = {};

    for (const item of inventory) {
      if (!item.equippedSlot || !GEAR_ITEM_TYPES.has(item.type)) continue;
      const raw  = item.equippedSlot;
      const slot = raw === "ring1" ? "Ring 1"
                 : raw === "ring2" ? "Ring 2"
                 : raw.charAt(0).toUpperCase() + raw.slice(1);
      equippedMap[slot] = item;
    }

    state.equipped        = equippedMap;
    state.equippedCachedAt = Date.now();

    state.bagItemsRaw = inventory.filter(item => !item.equippedSlot && GEAR_ITEM_TYPES.has(item.type));
    state.bagItems    = state.bagItemsRaw.map(item => _buildBagItem(item, equippedMap));
  }

  function _buildBagItem(item, equippedMap, filterKeyOverride = null) {
    const slotType   = ITEM_TYPE_TO_SLOT[item.type] ?? item.type;
    const rarity     = item.rarity.toUpperCase();
    const forge      = normForge(item.forgeTier);
    const forgeLevel = item.plus_level > 0 ? String(item.plus_level) : "";

    // totalStats = base rolls + forge/plus bonuses + runes — used for display only
    const ownStats = {};
    for (const [k, v] of Object.entries(item.totalStats ?? item.stats ?? {})) {
      if (k === "_qualities") continue;
      ownStats[normStatKey(k)] = v;
    }

    // Base stats (raw rolls, no forge/rune inflation) — used for fair comparison
    const ownBaseStats = {};
    for (const [k, v] of Object.entries(item.stats)) {
      if (k === "_qualities") continue;
      ownBaseStats[normStatKey(k)] = v;
    }

    // Roll quality already provided as 0–100; convert to 0–1
    const rollQualities = {};
    for (const [k, v] of Object.entries(item.stats._qualities ?? {})) {
      rollQualities[normStatKey(k)] = v / 100;
    }

    // Equipped item for same slot — compare base-to-base so forge upgrades don't skew scoring
    const eqKey        = slotType === "Ring" ? (equippedMap["Ring 1"] ? "Ring 1" : "Ring 2") : slotType;
    const equippedItem = equippedMap[eqKey] ?? null;
    const eqBaseStats  = {};
    if (equippedItem) {
      for (const [k, v] of Object.entries(equippedItem.stats)) {
        if (k === "_qualities") continue;
        eqBaseStats[normStatKey(k)] = v;
      }
    }

    // Diffs use base stats on both sides for a fair apples-to-apples comparison
    const allKeys = new Set([...Object.keys(ownBaseStats), ...Object.keys(eqBaseStats)]);
    const diffs   = [];
    for (const sk of allKeys) {
      const delta = (ownBaseStats[sk] ?? 0) - (eqBaseStats[sk] ?? 0);
      if (Math.abs(delta) < 0.001) continue;
      const label = STAT_DEFS.find(d => d.key === sk)?.label ?? sk;
      diffs.push({ text:`${label} ${fmtDelta(delta)}`, stat:sk, isUp:delta>0, isDown:delta<0 });
    }

    // Multi-roll detection: item.stats has exactly the rolled stat count (no rune extras)
    const rawStatCount   = Object.keys(item.stats).filter(k => k !== "_qualities").length;
    const maxSlots       = RARITY_STAT_SLOTS[rarity] ?? 4;
    const multiRollCount = Math.max(0, maxSlots - rawStatCount);
    const itemStatKeys   = new Set(Object.keys(ownBaseStats));

    // Score + qualification data per filter
    const filterScores          = {};
    const filterPriorityUps     = {};
    const filterHasPriorityMR   = {};
    const filterHasPrefMR       = {};
    for (const [key, fc] of state.filters) {
      filterScores[key]        = calcPrefScore(diffs, fc, multiRollCount, itemStatKeys);
      filterPriorityUps[key]   = diffs.filter(d => d.isUp && (fc.stats.has(d.stat) || fc.preferredStats.has(d.stat))).length;
      filterHasPriorityMR[key] = multiRollCount > 0 && [...itemStatKeys].some(s => fc.stats.has(s) || fc.preferredStats.has(s));
      filterHasPrefMR[key]     = multiRollCount > 0 && [...itemStatKeys].some(s => fc.preferredStats.has(s));
    }

    const activeKey     = filterKeyOverride ?? state.activeFilterKey;
    const activeFC      = state.filters.get(activeKey);
    const prefScore     = filterScores[activeKey]        ?? 0;
    const activePriUps  = filterPriorityUps[activeKey]   ?? 0;
    const activePriMR   = filterHasPriorityMR[activeKey] ?? false;
    const activePrefMR  = filterHasPrefMR[activeKey]     ?? false;

    let bestFilter = null, bestFilterScore = -Infinity;
    for (const [key, score] of Object.entries(filterScores)) {
      const fc = state.filters.get(key);
      if (key !== activeKey && fc?.enabled && score > bestFilterScore &&
          _qualifies(filterPriorityUps[key] ?? 0, filterHasPriorityMR[key] ?? false, fc)) {
        bestFilterScore = score; bestFilter = key;
      }
    }

    let { rec, cat } = applyQualityCap(
      recommendation(prefScore, activePriUps, activePriMR, activeFC),
      categoryOf(prefScore, activePriUps, activePriMR, activeFC),
      rollQualities, multiRollCount, slotType
    );

    // Multi-roll floors (applied after quality cap):
    // • Double roll (any quality)       → at least Interesting (up)
    // • Triple+ roll, quality ≥ 75%    → at least Interesting (up)
    // • Triple+ roll, quality < 75%    → at least Neutral + "Interesting" flag
    const mrMedianQuality = multiRollCount > 0 ? calcMedian(Object.values(rollQualities)) : 1;
    let mrInteresting = false;
    if (multiRollCount >= 1) {
      if (multiRollCount === 1 || mrMedianQuality >= 0.75) {
        if (cat === "neu" || cat === "sal") {
          rec = { label:"🎲 Interesting", cls:"rec-up" }; cat = "up";
        }
      } else {
        if (cat === "sal") {
          rec = { label:"↔ Neutral", cls:"rec-neu" }; cat = "neu";
        }
        mrInteresting = true;
      }
    }

    // Preferred stat + any multi-roll → always at least Upgrade (overrides "interesting")
    if (activePrefMR && (cat === "neu" || cat === "sal")) {
      rec = { label:"👍 Interesting", cls:"rec-up" }; cat = "up";
      mrInteresting = false;
    }

    // Flat-upgrade exception: if every filter stat present on this item beats equipped base → at least Upgrade
    // Bypasses quality cap penalties — a bad roll on a strictly better item is still an upgrade
    if (equippedItem) {
      const filterStatsOnItem = [...activeFC.stats, ...activeFC.preferredStats].filter(s => itemStatKeys.has(s));
      if (filterStatsOnItem.length > 0 && filterStatsOnItem.every(s => diffs.some(d => d.stat === s && d.isUp))) {
        if (cat === "neu" || cat === "sal") {
          rec = { label:"👍 Interesting", cls:"rec-up" }; cat = "up";
          mrInteresting = false;
        }
      }
    }

    // Class usability restriction — unusable item types are capped at Neutral regardless
    let classRestricted = false;
    const eqWeapon = equippedMap["Weapon"];
    if (eqWeapon) {
      if (slotType === "Weapon") {
        const allowed = WEAPON_FAMILIES[eqWeapon.type] ?? new Set([eqWeapon.type]);
        if (!allowed.has(item.type)) classRestricted = true;
      } else if (slotType === "Shield" && NO_SHIELD_WEAPONS.has(eqWeapon.type)) {
        classRestricted = true;
      } else if (item.armorWeight === "heavy" && !CAN_WEAR_HEAVY_ARMOR.has(eqWeapon.type)) {
        classRestricted = true;
      }
    }
    if (classRestricted && (cat === "top" || cat === "up")) {
      rec = { label:"↔ Neutral", cls:"rec-neu" }; cat = "neu";
    }

    return {
      id: item.id,
      name: item.name, slotType, weaponSubType: item.type,
      typeText: item.type.charAt(0).toUpperCase() + item.type.slice(1),
      rarity, forgeLevel, forge,
      diffs,
      ownBaseStats, eqBaseStats,
      parsedStats: Object.entries(ownStats).map(([stat, value]) => ({ stat, value })),
      rollQualities,
      multiRollCount, mrMedianQuality, mrInteresting, activePrefMR, classRestricted,
      shards: item.sellPrice,
      filterScores, filterPriorityUps, filterHasPriorityMR, filterHasPrefMR,
      prefScore, bestFilter, bestFilterScore,
      rec, cat,
      isLegacyStar: item.forgeTier === "starforged",
    };
  }

  function readMarketListings() {
    const mpPanel = document.querySelector(".mp-panel");
    state.marketVisible = !!mpPanel;
    if (!mpPanel) { state.marketRawData = []; state.marketItems = []; return; }

    const mwt  = Math.floor((state.level ?? 0) / 10) + 1;
    const raws = [];

    mpPanel.querySelectorAll(".mp-listing").forEach(el => {
      const fkey = Object.keys(el).find(k => k.startsWith("__reactFiber"));
      if (!fkey) return;
      const listingProps = el[fkey]?.return?.memoizedProps;
      if (!listingProps?.l?.item) return;
      const listing = listingProps.l;
      const raw     = listing.item;

      const item = {
        ...raw,
        id:           listing.id,
        forgeTier:    raw.forge_tier ?? raw.forgeTier ?? "",
        equippedSlot: null,
        sellPrice:    listing.price,
      };

      const itemTier     = raw.itemTier ?? 1;
      const isFutureTier = (itemTier - mwt) > 1;
      raws.push({ item, listingId: listing.id, price: listing.price,
                  sellerName: listing.sellerName, itemTier, isFutureTier });
    });

    state.marketRawData = raws;
    rebuildMarketItems();
  }

  function applyMarketBadges() {
    if (!state.marketVisible) {
      document.querySelectorAll(".sg-mp-badge").forEach(el => el.remove());
      return;
    }
    const byId = new Map(state.marketItems.map(i => [i.listingId, i]));

    document.querySelectorAll(".mp-listing").forEach(el => {
      const fkey = Object.keys(el).find(k => k.startsWith("__reactFiber"));
      if (!fkey) return;
      const lid = el[fkey]?.return?.memoizedProps?.l?.id;
      if (!lid) return;

      const item     = byId.get(lid);
      const existing = el.querySelector(".sg-mp-badge");

      let wantCls = null, wantText = null;
      if (item?.isFutureTier) {
        wantCls  = `sg-mp-badge sg-badge sg-badge-future`;
        wantText = `🔒 T${item.itemTier}`;
      } else if (item?.cat === "top" || item?.cat === "up") {
        wantCls  = `sg-mp-badge sg-badge ${item.rec.cls}`;
        wantText = item.rec.label;
      }

      if (!wantCls) { existing?.remove(); return; }

      if (existing) {
        if (existing.className !== wantCls) existing.className = wantCls;
        if (existing.textContent !== wantText) existing.textContent = wantText;
      } else {
        const badge = document.createElement("span");
        badge.className   = wantCls;
        badge.textContent = wantText;
        el.style.position = "relative";
        el.appendChild(badge);
      }
    });

    document.querySelectorAll(".sg-mp-badge").forEach(b => {
      if (!b.closest(".mp-listing")) b.remove();
    });
  }

  /**************************************************************************
   * CALCULATIONS
   **************************************************************************/

  function calcDPS(ctx = state) {
    if (!ctx.atkPhys || !ctx.atkSpeed || ctx.atkSpeed <= 0) return null;
    const hitRate  = (ctx.hitChance  ?? 95)  / 100;
    const critRate = (ctx.critChance ?? 0)   / 100;
    const critMult = (ctx.critDmg    ?? 150) / 100;
    return (ctx.atkPhys / ctx.atkSpeed) * hitRate * (1 + critRate * (critMult - 1));
  }

  /**************************************************************************
   * CSS
   **************************************************************************/

  const CSS = `
    #sgPanel {
      position:fixed; z-index:2147483647;
      left:16px; top:50%; transform:translateY(-50%);
      width:300px; background:#060912; color:#e8eefc;
      border:1px solid rgba(255,255,255,.16); border-radius:12px;
      box-shadow:0 18px 60px rgba(0,0,0,.65);
      font:12px/1.4 Inter,ui-sans-serif,system-ui,sans-serif;
      overflow:hidden; display:flex; flex-direction:column;
      max-height:calc(100vh - 32px); transition:width .2s ease;
    }
    #sgPanel.sg-wide { width:480px; }
    #sgPanel.sg-hidden { display:none; }

    .sg-drag {
      display:flex; align-items:center; justify-content:space-between;
      padding:8px 10px;
      background:linear-gradient(180deg,#172033,#0d1321);
      border-bottom:1px solid rgba(255,255,255,.1);
      cursor:move; user-select:none; flex-shrink:0;
    }
    .sg-title { font-weight:900; font-size:13px; }
    .sg-btn {
      background:#141d30; color:#e8eefc;
      border:1px solid rgba(255,255,255,.16);
      border-radius:6px; padding:3px 8px;
      font:inherit; cursor:pointer; font-size:11px;
    }
    .sg-btn:hover { background:#1e2d45; }

    .sg-tabs {
      display:flex; background:#080f1c;
      border-bottom:1px solid rgba(255,255,255,.08); flex-shrink:0;
    }
    .sg-tab {
      flex:1; padding:7px 4px; background:none; color:#64748b;
      border:none; font:inherit; font-size:11px; cursor:pointer;
      border-bottom:2px solid transparent; transition:all .15s;
    }
    .sg-tab.active { color:#e8eefc; border-bottom-color:#3b82f6; }
    .sg-tab:hover:not(.active) { color:#94a3b8; }

    .sg-body { flex:1; overflow-y:auto; padding:8px 0; }
    .sg-body::-webkit-scrollbar { width:4px; }
    .sg-body::-webkit-scrollbar-track { background:transparent; }
    .sg-body::-webkit-scrollbar-thumb { background:#1e293b; border-radius:2px; }

    .sg-sec { padding:6px 10px; border-bottom:1px solid rgba(255,255,255,.05); }
    .sg-lbl { font-weight:700; font-size:10px; color:#3b82f6; text-transform:uppercase; letter-spacing:.06em; margin-bottom:4px; }
    .sg-row { display:flex; justify-content:space-between; align-items:baseline; margin:2px 0; }
    .sg-key { color:#64748b; font-size:11px; }
    .sg-val { font-size:11px; font-weight:600; }
    .sg-derived { color:#4b5563; font-size:10px; padding-left:8px; margin-top:-1px; }

    .sg-dps-box { background:#0f172a; border-radius:8px; padding:8px; margin:4px 0; text-align:center; }
    .sg-dps-num { font-size:22px; font-weight:900; color:#f97316; }
    .sg-dps-calc { color:#64748b; font-size:10px; line-height:1.6; margin-top:4px; }

    .sg-gear-toolbar {
      display:flex; align-items:center; justify-content:space-between;
      padding:6px 10px; border-bottom:1px solid rgba(255,255,255,.06);
      flex-shrink:0; background:#080f1c;
    }
    .sg-hl-toolbar {
      display:flex; align-items:center; gap:4px; flex-wrap:wrap;
      padding:4px 10px; border-bottom:1px solid rgba(255,255,255,.06);
      flex-shrink:0; background:#080f1c;
    }
    .sg-hl-label { color:#4b5563; font-size:10px; flex-shrink:0; margin-right:2px; }
    .sg-mode-btn {
      background:#141d30; color:#64748b;
      border:1px solid rgba(255,255,255,.1);
      border-radius:5px; padding:3px 8px;
      font:inherit; font-size:11px; cursor:pointer;
    }
    .sg-mode-btn.active { color:#e8eefc; border-color:#3b82f6; }
    .sg-cache-hint { color:#374151; font-size:10px; }

    .sg-item {
      background:#0c1526; border:1px solid rgba(255,255,255,.06);
      border-left:3px solid #333; border-radius:7px;
      padding:7px 9px; margin:4px 0;
    }
    .sg-item-head { display:flex; align-items:center; gap:5px; margin-bottom:2px; }
    .sg-item-deltas {
      display:flex; flex-direction:column; align-items:flex-end;
      gap:2px; flex-shrink:0; font-size:10px; padding-top:1px; min-width:80px;
    }
    .sg-item-name { font-weight:700; font-size:11px; }
    .sg-item-meta { color:#4b5563; font-size:10px; margin-bottom:3px; }
    .sg-badges { display:flex; flex-wrap:wrap; gap:3px; margin-bottom:4px; }

    .sg-badge {
      font-size:10px; padding:1px 5px; border-radius:4px;
      border:1px solid; white-space:nowrap;
    }
    .rec-top  { color:#86efac; border-color:#166534; background:rgba(134,239,172,.1); }
    .rec-up   { color:#93c5fd; border-color:#1d4ed8; background:rgba(147,197,253,.1); }
    .rec-neu  { color:#94a3b8; border-color:#334155; background:rgba(148,163,184,.06); }
    .rec-sal  { color:#fca5a5; border-color:#7f1d1d; background:rgba(252,165,165,.1); }
    .sg-badge-shard  { color:#a78bfa; border-color:#4c1d95; background:rgba(167,139,250,.1); }
    .sg-badge-legacy { color:#fbbf24; border-color:#78350f; background:rgba(251,191,36,.1); }
    .sg-badge-multi      { color:#c084fc; border-color:#581c87; background:rgba(192,132,252,.1); }
    .sg-badge-future     { color:#6b7280; border-color:#374151; background:rgba(107,114,128,.08); }
    .sg-badge-restricted { color:#6b7280; border-color:#374151; background:rgba(107,114,128,.06); }

    .sg-filter-row.disabled { opacity:.45; }
    .sg-toggle-btn { font-size:13px; line-height:1; padding:1px 4px; }
    .sg-toggle-btn.off { color:#374151; }
    .sg-mode-btn { font-size:11px; line-height:1; padding:1px 5px; }
    .sg-mode-btn.aggressive { color:#f97316; }
    .sg-mode-btn.defensive  { color:#374151; }

    .sg-mb-grid { display:flex; flex-wrap:wrap; gap:4px; margin:4px 0; }
    .sg-mb-chip {
      background:#141d30; color:#64748b;
      border:1px solid rgba(255,255,255,.1);
      border-radius:5px; padding:3px 7px;
      font:inherit; font-size:11px; cursor:pointer;
    }
    .sg-mb-chip.active { color:#c084fc; border-color:rgba(192,132,252,.5); background:rgba(192,132,252,.1); }

    .sg-diffs { display:flex; flex-wrap:wrap; gap:3px; margin-top:3px; }
    .sg-diff {
      font-size:10px; padding:1px 5px; border-radius:4px;
      border:1px solid rgba(255,255,255,.08); white-space:nowrap;
    }
    .sg-diff-up   { color:#86efac; }
    .sg-diff-down { color:#fca5a5; }
    .sg-diff.pref { border-color:rgba(59,130,246,.5); }

    .sg-diff-row { display:flex; align-items:center; gap:5px; margin:1px 0; flex-wrap:wrap; }
    .sg-qual-badge {
      font-size:10px; font-weight:700; padding:1px 5px; border-radius:4px;
      border:1px solid; white-space:nowrap;
    }
    .sg-type-icon { font-size:11px; line-height:1; }

    .sg-multi {
      font-size:9px; padding:0 4px; border-radius:3px;
      background:rgba(251,191,36,.15); color:#fbbf24;
      border:1px solid rgba(251,191,36,.3);
    }

    .sg-filter-tags { display:flex; flex-wrap:wrap; gap:3px; margin-top:3px; }
    .sg-filter-tag {
      font-size:9px; padding:1px 4px; border-radius:3px;
      background:rgba(59,130,246,.1); color:#60a5fa;
      border:1px solid rgba(59,130,246,.25);
    }

    .sg-eq-label { color:#4b5563; font-size:10px; margin-bottom:4px; }

    .sg-cat-section { border-bottom:1px solid rgba(255,255,255,.05); }
    .sg-cat-header {
      display:flex; align-items:center; justify-content:space-between;
      padding:7px 10px; cursor:pointer; user-select:none;
    }
    .sg-cat-header:hover { background:rgba(255,255,255,.02); }
    .sg-cat-title { display:flex; align-items:center; gap:6px; }
    .sg-cat-count { color:#4b5563; font-size:10px; }
    .sg-cat-toggle { color:#4b5563; font-size:11px; }
    .sg-cat-body.collapsed { display:none; }

    .sg-cat-item {
      display:flex; align-items:flex-start; gap:8px;
      margin:3px 10px; padding:6px 8px;
      background:#0c1526; border:1px solid rgba(255,255,255,.07);
      border-left:3px solid #333; border-radius:7px;
    }
    .sg-cat-item-left { flex:1; min-width:0; }
    .sg-cat-item-name {
      font-weight:700; font-size:11px;
      white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-bottom:2px;
    }
    .sg-cat-item-sub { color:#4b5563; font-size:10px; margin-bottom:3px; }
    .sg-cat-item-right { display:flex; flex-direction:column; align-items:flex-end; gap:3px; flex-shrink:0; }
    .sg-slot-pill {
      background:rgba(148,163,184,.1); border:1px solid rgba(148,163,184,.15);
      border-radius:4px; padding:1px 5px; font-size:10px; color:#64748b;
    }

    .sg-filter-list { display:flex; flex-direction:column; gap:4px; }
    .sg-filter-row {
      display:flex; align-items:center; gap:6px;
      padding:5px 8px; border-radius:6px;
      border:1px solid rgba(255,255,255,.07);
      background:#0c1526; cursor:pointer;
    }
    .sg-filter-row.active { border-color:rgba(59,130,246,.4); background:rgba(59,130,246,.08); }
    .sg-filter-dot { width:7px; height:7px; border-radius:50%; background:#334155; flex-shrink:0; }
    .sg-filter-row.active .sg-filter-dot { background:#3b82f6; }
    .sg-filter-name { flex:1; font-size:11px; font-weight:600; }
    .sg-filter-statcount { color:#4b5563; font-size:10px; }
    .sg-icon-btn {
      background:none; border:none; color:#4b5563;
      cursor:pointer; padding:2px 4px; border-radius:4px; font-size:11px;
    }
    .sg-icon-btn:hover { color:#e8eefc; background:rgba(255,255,255,.06); }

    .sg-help-box {
      border:1px solid rgba(255,255,255,.07); border-radius:6px;
      margin-bottom:8px; background:rgba(255,255,255,.02);
    }
    .sg-help-summary {
      cursor:pointer; padding:5px 8px; font-size:11px; color:#64748b;
      list-style:none; user-select:none; outline:none;
    }
    .sg-help-summary::-webkit-details-marker { display:none; }
    .sg-help-body { padding:4px 10px 8px; font-size:10px; color:#6b7280; line-height:1.6; }
    .sg-help-body b { color:#94a3b8; }
    .sg-help-body table { border-collapse:collapse; width:100%; margin:3px 0; }
    .sg-help-body td { padding:1px 6px 1px 0; vertical-align:top; }
    .sg-help-body td:first-child { white-space:nowrap; color:#94a3b8; font-weight:600; }
    .sg-filter-edit {
      background:#0a1220; border:1px solid rgba(59,130,246,.3);
      border-radius:8px; padding:8px; margin-top:6px;
    }
    .sg-filter-edit-row { display:flex; gap:5px; align-items:center; margin-bottom:6px; }
    .sg-filter-input {
      flex:1; background:#141d30; color:#e8eefc;
      border:1px solid rgba(255,255,255,.15); border-radius:5px;
      padding:4px 7px; font:inherit; font-size:11px;
    }
    .sg-pref-grid { display:flex; flex-wrap:wrap; gap:4px; margin:5px 0; }
    .sg-pref-chip {
      background:#141d30; color:#64748b;
      border:1px solid rgba(255,255,255,.1);
      border-radius:5px; padding:3px 8px;
      font:inherit; font-size:11px; cursor:pointer;
    }
    .sg-pref-chip.active { color:#93c5fd; border-color:rgba(59,130,246,.5); background:rgba(59,130,246,.12); }
    .sg-pref-chip.preferred { color:#fbbf24; border-color:rgba(251,191,36,.5); background:rgba(251,191,36,.12); }
    .sg-diff.pref-star { border-color:rgba(251,191,36,.55); }
    .sg-add-btn {
      width:100%; background:#0c1526; color:#4b5563;
      border:1px dashed rgba(255,255,255,.1); border-radius:6px;
      padding:6px; font:inherit; font-size:11px; cursor:pointer; margin-top:4px;
    }
    .sg-add-btn:hover { color:#94a3b8; border-color:rgba(255,255,255,.2); }
    .sg-preset-row { display:flex; flex-wrap:wrap; gap:4px; margin-bottom:4px; }

    .sg-hint { color:#4b5563; font-size:11px; text-align:center; padding:14px 10px; }
    .c-green{color:#86efac;} .c-blue{color:#93c5fd;} .c-gold{color:#fde68a;}
    .c-orange{color:#fb923c;} .c-red{color:#fca5a5;} .c-purple{color:#c084fc;} .c-muted{color:#64748b;}

    .sg-inspect-save {
      position:absolute; top:10px; right:40px;
      background:#172554; color:#93c5fd;
      border:1px solid rgba(59,130,246,.4); border-radius:6px;
      padding:4px 10px; font:11px Inter,sans-serif; cursor:pointer; z-index:10;
    }
    .sg-inspect-save:hover { background:#1e3a8a; }
    .sg-team-header {
      display:flex; align-items:center; justify-content:space-between;
      padding:8px 10px; cursor:pointer; user-select:none;
      border-bottom:1px solid rgba(255,255,255,.05);
    }
    .sg-team-header:hover { background:rgba(255,255,255,.02); }
    .sg-team-body.collapsed { display:none; }

    .sg-footer {
      text-align:center; font-size:9px; color:#1e293b;
      padding:5px 10px; border-top:1px solid rgba(255,255,255,.05);
      flex-shrink:0; transition:color .2s;
    }
    .sg-footer:hover { color:#475569; }
    .sg-footer-name { color:#1d3461; font-weight:700; transition:color .2s; }
    .sg-footer:hover .sg-footer-name { color:#3b82f6; }

    .sg-chat-compare {
      position:fixed; z-index:2147483647;
      width:165px; background:#060912;
      border:1px solid rgba(255,255,255,.16); border-radius:8px;
      padding:8px;
      font:11px/1.4 Inter,ui-sans-serif,system-ui,sans-serif;
    }
    .sg-chat-compare-head {
      display:flex; align-items:center; gap:6px; margin-bottom:5px; flex-wrap:wrap;
    }
    .sg-chat-compare-vs { color:#4b5563; font-size:10px; }
    .sg-chat-compare-hint { color:#4b5563; font-size:10px; font-style:italic; }

    #sgToggle {
      position:fixed; z-index:2147483647;
      left:16px; top:50%; transform:translateY(-50%);
      background:#172554; color:white;
      border:1px solid rgba(255,255,255,.22); border-radius:999px;
      padding:7px 12px; font-weight:900; font-size:12px;
      cursor:pointer; box-shadow:0 8px 24px rgba(0,0,0,.4);
    }
  `;

  /**************************************************************************
   * UI SETUP
   **************************************************************************/

  let panelEl        = null;
  let _moduleApp     = null;
  let filterHelpOpen = false;

  function _panelShellHtml() {
    return `
      <div class="sg-tabs">
        <button class="sg-tab active" data-tab="stats">📊 Stats</button>
        <button class="sg-tab"        data-tab="gear">🎒 Gear</button>
        <button class="sg-tab"        data-tab="filters">⚙️ Filters</button>
        <button class="sg-tab"        data-tab="market">🏪 Market</button>
        <button class="sg-tab"        data-tab="team">👥 Team</button>
      </div>
      <div class="sg-body" id="sgBody"><div class="sg-hint">Waiting for data…</div></div>
    `;
  }

  function _attachTabListeners(container) {
    container.querySelectorAll(".sg-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        container.querySelectorAll(".sg-tab").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        state.activeTab = btn.dataset.tab;
        const isWide = state.activeTab === "gear" || state.activeTab === "market" || state.activeTab === "team";
        if (_moduleApp) {
          panelEl.style.width = isWide ? "480px" : "310px";
        } else {
          panelEl.classList.toggle("sg-wide", isWide);
        }
        render();
      });
    });
  }

  function installUI() {
    const style = document.createElement("style");
    style.textContent = CSS;
    document.documentElement.appendChild(style);

    const hlStyle = document.createElement("style");
    hlStyle.textContent = `
      .sg-mp-badge {
        position:absolute !important; top:5px !important; right:5px !important;
        font:700 10px/1.4 Inter,sans-serif !important;
        padding:2px 7px !important; border-radius:4px !important;
        border:1px solid !important; z-index:10 !important; pointer-events:none !important;
      }
      .sg-hl-top  { outline:3px solid #22c55e !important; box-shadow:0 0 16px 4px rgba(34,197,94,.75) !important; border-radius:4px; }
      .sg-hl-up   { outline:3px solid #3b82f6 !important; box-shadow:0 0 16px 4px rgba(59,130,246,.75) !important; border-radius:4px; }
      .sg-hl-neu  { outline:3px solid #94a3b8 !important; box-shadow:0 0 16px 4px rgba(148,163,184,.65) !important; border-radius:4px; }
      .sg-hl-sal  { outline:3px solid #ef4444 !important; box-shadow:0 0 16px 4px rgba(239,68,68,.75) !important; border-radius:4px; }
    `;
    document.documentElement.appendChild(hlStyle);

    if (_moduleApp) {
      // Module mode: register with loader's WindowManager — tray button + managed panel
      _moduleApp.ui.registerPanel({
        id:     "loot-helper",
        title:  "Loot Helper",
        icon:   "⚡",
        render: _panelShellHtml,
        width:  310,
        height: 580,
        footer: "Produced, maintained & improved by teCsor",
      });
      panelEl = _moduleApp.ui.getPanel("loot-helper");
      if (panelEl) _attachTabListeners(panelEl);
    } else {
      // Standalone mode: create own fixed panel
      panelEl = document.createElement("div");
      panelEl.id = "sgPanel";
      panelEl.innerHTML = `
        <div class="sg-drag" id="sgDrag">
          <span class="sg-title">⚡ Loot Helper <span style="font-size:10px;font-weight:400;color:#4b5563;">v8.24.0</span></span>
          <button class="sg-btn" id="sgHide">Hide</button>
        </div>
        ${_panelShellHtml()}
        <div class="sg-footer">Produced, maintained &amp; improved by <span class="sg-footer-name">teCsor</span></div>
      `;

      const toggleEl = document.createElement("button");
      toggleEl.id = "sgToggle";
      toggleEl.textContent = "⚡ Loot";
      toggleEl.style.display = "none";

      document.documentElement.appendChild(panelEl);
      document.documentElement.appendChild(toggleEl);

      document.getElementById("sgHide").addEventListener("click", () => {
        panelEl.classList.add("sg-hidden"); toggleEl.style.display = "block";
      });
      toggleEl.addEventListener("click", () => {
        panelEl.classList.remove("sg-hidden"); toggleEl.style.display = "none";
      });

      _attachTabListeners(panelEl);
      makeDraggable(panelEl, document.getElementById("sgDrag"));
    }
  }

  function makeDraggable(panel, handle) {
    let drag=false, ox=0, oy=0, ol=0, ot=0;
    handle.addEventListener("mousedown", (e) => {
      if (e.target.closest("button")) return;
      const r = panel.getBoundingClientRect();
      panel.style.transform = "none";
      panel.style.left = r.left+"px"; panel.style.top = r.top+"px";
      drag=true; ox=e.clientX; oy=e.clientY; ol=r.left; ot=r.top;
      e.preventDefault();
    });
    window.addEventListener("mousemove", (e) => {
      if (!drag) return;
      panel.style.left = Math.max(0, ol+e.clientX-ox)+"px";
      panel.style.top  = Math.max(0, ot+e.clientY-oy)+"px";
    });
    window.addEventListener("mouseup", () => { drag=false; });
  }

  /**************************************************************************
   * RENDER — Stats Tab
   **************************************************************************/

  function renderStats() {
    const hp=state.hp??0, maxHp=state.maxHp??0;
    const mana=state.mana??0, maxMana=state.maxMana??0;
    const hpRatio = maxHp>0 ? hp/maxHp : 0;
    const hpColor = hpRatio>0.6?"#4ade80":hpRatio>0.3?"#fde68a":"#f87171";
    const dps = calcDPS();
    const rawZone = (state.zone||"").replace(/^Party in /i,"").trim();
    const zoneTier = ZONE_TIERS[rawZone] ? `T${ZONE_TIERS[rawZone]}` : "";

    let html = `<div class="sg-sec">
      <div class="sg-lbl">Character</div>
      <div class="sg-row">
        <span class="sg-key">Name / Level</span>
        <span class="sg-val">${esc(state.charName||"—")} <span class="c-muted">Lv${state.level??"—"}</span></span>
      </div>
      <div class="sg-row">
        <span class="sg-key">Zone</span>
        <span class="sg-val c-muted" style="font-size:10px;max-width:175px;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
          ${esc(state.zone||"—")}${zoneTier?` <b>(${zoneTier})</b>`:""}
        </span>
      </div>
    </div>
    <div class="sg-sec">
      <div class="sg-lbl">Vitals</div>
      <div class="sg-row"><span class="sg-key">HP</span><span class="sg-val c-green">${fmt(hp)} / ${fmt(maxHp)}</span></div>
      ${barHtml(hp,maxHp,hpColor)}
      <div class="sg-row" style="margin-top:5px;"><span class="sg-key">Mana</span><span class="sg-val c-blue">${fmt(mana)} / ${fmt(maxMana)}</span></div>
      ${barHtml(mana,maxMana,"#60a5fa")}
      <div class="sg-row" style="margin-top:5px;"><span class="sg-key">XP</span>
        <span class="sg-val">${fmtDec(state.xpPct)}%${state.xphr?` <span class="c-gold" style="font-size:10px;">(${esc(state.xphr)})</span>`:""}</span></div>
      ${barHtml(state.xpPct??0,100,"#facc15")}
    </div>`;

    if (dps !== null) {
      const hitsPerSec = 1/state.atkSpeed;
      const critBonus  = (state.critChance/100)*((state.critDmg/100)-1);
      html += `<div class="sg-sec">
        <div class="sg-lbl">Theoretical DPS</div>
        <div class="sg-dps-box">
          <div class="sg-dps-num">${Math.round(dps).toLocaleString("en")}</div>
          <div class="sg-dps-calc">
            <b>${state.atkPhys} ATK</b> × <b>${fmtDec(hitsPerSec,2)}/s</b> (${state.atkSpeed}s)<br>
            × <b>${state.hitChance}%</b> Hit × <b>${fmtDec((1+critBonus)*100,1)}%</b> Avg DMG
            (${state.critChance}% Crit @ ${state.critDmg}%)
          </div>
        </div>
      </div>`;
    }

    const surv = calcSurvivability(state.maxHpStat, state.def);
    if (surv !== null) {
      const defMult = 1 + (state.def ?? 0) / 1000;
      html += `<div class="sg-sec">
        <div class="sg-lbl">Survivability</div>
        <div class="sg-dps-box" style="background:#0b1a24;">
          <div class="sg-dps-num" style="color:#4ade80;">${Math.round(surv).toLocaleString("en")}</div>
          <div class="sg-dps-calc">
            EHP = <b>${fmt(state.maxHpStat)} HP</b> × <b>${defMult.toFixed(2)}×</b> DEF factor<br>
            (1 + ${state.def} DEF / 1000)${state.allStats ? ` · <b>${state.allStats}%</b> All Stats` : ""}
          </div>
        </div>
        ${state.manaRegen != null ? `<div class="sg-row" style="margin-top:4px;"><span class="sg-key">Mana / tick</span><span class="sg-val c-blue">${fmtDec(state.manaRegen)}</span></div>` : ""}
        ${state.maxManaStat != null ? `<div class="sg-row"><span class="sg-key">Max Mana</span><span class="sg-val c-blue">${fmt(state.maxManaStat)}</span></div>` : ""}
      </div>`;
    }

    if (state.charViewOpen) {
      html += `
      <div class="sg-sec">
        <div class="sg-lbl">Attack</div>
        <div class="sg-row"><span class="sg-key">Phys. ATK</span>   <span class="sg-val c-red">${state.atkPhys??"—"}</span></div>
        <div class="sg-row"><span class="sg-key">Magic. ATK</span>  <span class="sg-val c-purple">${state.atkMag??"—"}</span></div>
        <div class="sg-row"><span class="sg-key">Attack Speed</span><span class="sg-val">${state.atkSpeed??"—"}s</span></div>
        <div class="sg-row"><span class="sg-key">Hit Chance</span>  <span class="sg-val">${state.hitChance??"—"}%</span></div>
        <div class="sg-row"><span class="sg-key">Crit Chance</span> <span class="sg-val c-orange">${state.critChance??"—"}%</span></div>
        <div class="sg-row"><span class="sg-key">Crit Damage</span> <span class="sg-val c-orange">${state.critDmg??"—"}%</span></div>
        <div class="sg-row"><span class="sg-key">Lifesteal</span>   <span class="sg-val c-green">${state.lifesteal??"—"}%</span></div>
      </div>
      <div class="sg-sec">
        <div class="sg-lbl">Defense</div>
        <div class="sg-row"><span class="sg-key">DEF</span>        <span class="sg-val c-blue">${state.def??"—"}</span></div>
        <div class="sg-row"><span class="sg-key">Max HP</span>     <span class="sg-val c-green">${fmt(state.maxHpStat)}</span></div>
        <div class="sg-row"><span class="sg-key">Max Mana</span>   <span class="sg-val c-blue">${state.maxManaStat??"—"}</span></div>
        <div class="sg-row"><span class="sg-key">Heal Power</span> <span class="sg-val c-green">${state.healPower??"—"}</span></div>
        <div class="sg-row"><span class="sg-key">Mana Regen</span> <span class="sg-val c-blue">${state.manaRegen??"—"}</span></div>
      </div>
      <div class="sg-sec">
        <div class="sg-lbl">Base Stats</div>
        <div class="sg-row"><span class="sg-key">STR</span><span class="sg-val">${state.str??"—"}</span></div>
        ${state.strDerived?`<div class="sg-derived">${esc(state.strDerived)}</div>`:""}
        <div class="sg-row"><span class="sg-key">INT</span><span class="sg-val">${state.int??"—"}</span></div>
        ${state.intDerived?`<div class="sg-derived">${esc(state.intDerived)}</div>`:""}
      </div>
      <div class="sg-sec">
        <div class="sg-lbl">Bonuses</div>
        <div class="sg-row"><span class="sg-key">XP Bonus</span>   <span class="sg-val c-gold">+${state.xpBonus??"—"}%</span></div>
        <div class="sg-row"><span class="sg-key">Gold Bonus</span> <span class="sg-val c-gold">+${state.goldBonus??"—"}%</span></div>
        <div class="sg-row"><span class="sg-key">Drop Rate</span>  <span class="sg-val c-gold">+${state.dropRate??"—"}%</span></div>
        <div class="sg-row"><span class="sg-key">All Stats</span>  <span class="sg-val c-gold">+${state.allStats??"—"}%</span></div>
      </div>`;
      if (state.kills !== null) {
        html += `<div class="sg-sec">
          <div class="sg-lbl">Progress</div>
          <div class="sg-row"><span class="sg-key">Total Kills</span><span class="sg-val">${fmt(state.kills)}</span></div>
          ${state.zonesVisited?`<div class="sg-row"><span class="sg-key">Zones</span><span class="sg-val">${esc(state.zonesVisited)}</span></div>`:""}
        </div>`;
      }
    } else {
      html += `<div class="sg-hint">Open <strong>Character Screen</strong><br>for full stats.</div>`;
    }
    return html;
  }

  /**************************************************************************
   * RENDER — Filters Tab
   **************************************************************************/

  function renderFilters() {
    const fe = state.filterEdit;
    let html = `<div class="sg-sec">
      <div class="sg-lbl">Filters</div>
      <details class="sg-help-box"${filterHelpOpen ? " open" : ""}>
        <summary class="sg-help-summary">ℹ️ How filters work</summary>
        <div class="sg-help-body">
          <b>What is a filter?</b> A filter scores every bag item by comparing its base stats to your currently equipped item in the same slot. The active filter (blue dot) drives all item labels and highlights.<br><br>
          <b>Stat tiers — per changed stat:</b>
          <table>
            <tr><td>★ Preferred</td><td>+4 / −4 per stat</td></tr>
            <tr><td>♥ Liked</td><td>+2 / −2 per stat</td></tr>
            <tr><td>(untracked)</td><td>+0.5 / −0.5 per stat</td></tr>
          </table>
          <b>Result labels</b> (Top/Interesting also require ≥ 2 tracked stats improved, OR a tracked stat was multi-rolled):
          <table>
            <tr><td>✅ Top Pick</td><td>score ≥ 4</td></tr>
            <tr><td>👍 Interesting</td><td>score ≥ 1</td></tr>
            <tr><td>↔ Neutral</td><td>score ≥ −1</td></tr>
            <tr><td>💾 Salvage</td><td>score &lt; −1</td></tr>
          </table>
          <b>Mode (🗡 / 🛡)</b> adjusts the score by the item's DPS (Aggressive) or EHP (Defensive) change vs. your equipped item: &gt;5% → ±2, 2–5% → ±1.<br><br>
          <b>Multi-roll bonus</b> adds a flat score when a multi-rolled item has a specific stat — set per stat in the ✏ edit panel.<br><br>
          <b>Roll quality cap</b>: items with median roll quality &lt; 75% are capped at Neutral; weapons with ATK quality &lt; 75% are capped at Salvage.
        </div>
      </details>
      <div class="sg-filter-list">`;

    for (const [key, fc] of state.filters) {
      const isActive  = key === state.activeFilterKey;
      const isEditing = fe?.key === key;
      html += `<div class="sg-filter-row${isActive?" active":""}${fc.enabled?"":" disabled"}" data-fkey="${esc(key)}" title="${isActive?"Active filter — click another row to switch":"Click to set as active filter"}">
        <div class="sg-filter-dot"></div>
        <span class="sg-filter-name">${esc(key)}</span>
        <span class="sg-filter-statcount">${fc.stats.size + fc.preferredStats.size} stats${fc.preferredStats.size ? ` · ★${fc.preferredStats.size}` : ""}</span>
        <button class="sg-icon-btn sg-toggle-btn${fc.enabled?"":" off"}" data-ftoggle="${esc(key)}" title="${fc.enabled?"Disable filter (items won't be scored by this filter)":"Enable filter"}">${fc.enabled?"●":"○"}</button>
        <button class="sg-icon-btn sg-mode-btn ${fc.mode==="aggressive"?"aggressive":"defensive"}" data-fmode="${esc(key)}" title="${fc.mode==="aggressive"?"🗡 Aggressive mode — DPS change adjusts item score (click to switch to 🛡 Defensive)":"🛡 Defensive mode — EHP change adjusts item score (click to switch to 🗡 Aggressive)"}">${fc.mode==="aggressive"?"🗡":"🛡"}</button>
        <button class="sg-icon-btn" data-edit="${esc(key)}" title="Edit filter: choose which stats are Liked (♥ ±2) or Preferred (★ ±4)">✏</button>
        ${state.filters.size>1?`<button class="sg-icon-btn" data-del="${esc(key)}" title="Delete this filter">✗</button>`:""}
      </div>`;
      if (isEditing) {
        html += `<div class="sg-filter-edit">
          <div class="sg-filter-edit-row">
            <input class="sg-filter-input" id="sgFeName" value="${esc(fe.name)}" placeholder="Filter name">
            <button class="sg-btn" id="sgFeSave">Save</button>
            <button class="sg-btn" id="sgFeCancel">✗</button>
          </div>
          <div style="font-size:10px;color:#64748b;margin:2px 0 4px;">Click to cycle: off → ♥ Liked (score ±2) → ★ Preferred (score ±4) → off · ★ on a double-rolled stat = always Interesting</div>
          <div class="sg-pref-grid">`;
        for (const def of STAT_DEFS) {
          const isPref  = fe.preferredStats.has(def.key);
          const isLiked = fe.stats.has(def.key);
          const cls     = isPref ? "sg-pref-chip preferred" : isLiked ? "sg-pref-chip active" : "sg-pref-chip";
          const lbl     = isPref ? `★ ${def.label}` : isLiked ? `♥ ${def.label}` : def.label;
          html += `<button class="${cls}" data-estat="${esc(def.key)}" title="${isPref?`★ Preferred — scores ±4 per change`:isLiked?`♥ Liked — scores ±2 per change`:`Click to mark as Liked (♥)`}">${esc(lbl)}</button>`;
        }
        html += `</div>
          <div style="font-size:10px;color:#64748b;margin:8px 0 4px;">Multi-roll bonus — adds flat score when a multi-rolled item has this stat (click to cycle +0 → +1 → +2 → +3):</div>
          <div class="sg-mb-grid">`;
        for (const def of STAT_DEFS) {
          const val = fe.multiBonus[def.key] ?? 0;
          html += `<button class="sg-mb-chip${val>0?" active":""}" data-mbstat="${esc(def.key)}">${esc(def.label)}${val>0?" +"+val:""}</button>`;
        }
        html += `</div></div>`;
      }
    }

    html += `</div>
      <button class="sg-add-btn" id="sgFeAdd">+ New Filter</button>
    </div>`;

    if (!fe) {
      html += `<div class="sg-sec">
        <div class="sg-lbl">Init from Preset</div>
        <div class="sg-preset-row">`;
      for (const [name, keys] of Object.entries(FILTER_PRESETS)) {
        html += `<button class="sg-btn" data-preset="${esc(name)}" title="Create a new filter from the ${name} preset&#10;Stats: ${keys.join(', ')}">${esc(name)}</button>`;
      }
      html += `</div></div>`;

      const activeFC = state.filters.get(state.activeFilterKey) ?? mkFC([]);
      html += `<div class="sg-sec">
        <div class="sg-lbl">Stats — ${esc(state.activeFilterKey)}</div>
        <div style="font-size:10px;color:#4b5563;margin-bottom:4px;">Click to cycle: off → ♥ Liked (score ±2) → ★ Preferred (score ±4) → off · ★ on a double-rolled stat = always Interesting</div>
        <div class="sg-pref-grid">`;
      for (const def of STAT_DEFS) {
        const isPref  = activeFC.preferredStats.has(def.key);
        const isLiked = activeFC.stats.has(def.key);
        const cls     = isPref ? "sg-pref-chip preferred" : isLiked ? "sg-pref-chip active" : "sg-pref-chip";
        const lbl     = isPref ? `★ ${def.label}` : isLiked ? `♥ ${def.label}` : def.label;
        html += `<button class="${cls}" data-qstat="${esc(def.key)}" title="${isPref?`★ Preferred — scores ±4 per change`:isLiked?`♥ Liked — scores ±2 per change`:`Click to mark as Liked (♥)`}">${esc(lbl)}</button>`;
      }
      html += `</div></div>`;
    }

    return html;
  }

  /**************************************************************************
   * RENDER — Gear Tab
   **************************************************************************/

  function renderGear() {
    const cacheAge = state.equippedCachedAt
      ? Math.floor((Date.now()-state.equippedCachedAt)/1000) : null;
    const statusText = state.bagVisible
      ? `${state.bagItems.length} items (live)`
      : state.bagItems.length
        ? `${state.bagItems.length} cached`
        : "open inventory";

    const CAT_HL_STYLE = {
      top:  "color:#86efac;border-color:#22c55e;",
      up:   "color:#93c5fd;border-color:#3b82f6;",
      neu:  "color:#94a3b8;border-color:#64748b;",
      sal:  "color:#fca5a5;border-color:#ef4444;",
    };
    const CAT_HL_EMOJI = { top:"✅", up:"👍", neu:"↔", sal:"💾" };

    let html = `<div class="sg-gear-toolbar">
      <div style="display:flex;gap:5px;">
        <button class="sg-mode-btn${state.gearMode==="slot"?" active":""}" id="sgModeSlot">📦 Slot</button>
        <button class="sg-mode-btn${state.gearMode==="category"?" active":""}" id="sgModeCat">🏷 Category</button>
      </div>
      <span class="sg-cache-hint">
        ${esc(statusText)}
        ${cacheAge!==null?` · ${cacheAge}s ago`:""}
        · <span style="color:#3b82f6;">${esc(state.activeFilterKey||"—")}</span>
      </span>
    </div>
    <div class="sg-hl-toolbar">
      <span class="sg-hl-label">Highlight:</span>
      <button class="sg-mode-btn${state.highlightCats.size===CATEGORIES.length?" active":""}" id="sgHlAll"
        style="${state.highlightCats.size===CATEGORIES.length?"color:#e8eefc;border-color:#3b82f6;":""}"
        title="Toggle all highlights">All</button>
      ${CATEGORIES.map(cat => {
        const active = state.highlightCats.has(cat.key);
        const count  = state.bagItems.filter(i => i.cat === cat.key).length;
        return `<button class="sg-mode-btn${active?" active":""}" data-hlcat="${esc(cat.key)}"
          style="${active ? CAT_HL_STYLE[cat.key] : ""}"
          title="${esc(cat.label)}">${CAT_HL_EMOJI[cat.key]} ${count}</button>`;
      }).join("")}
    </div>`;

    if (!state.bagItems.length) {
      html += `<div class="sg-hint">Open <strong>Inventory</strong><br>to load items.</div>`;
      return html;
    }
    if (!Object.keys(state.equipped).length) {
      html += `<div class="sg-hint" style="padding:6px 10px;">No equipped gear cached — diffs unavailable.</div>`;
    }
    html += state.gearMode==="category" ? renderGearByCategory() : renderGearBySlot();
    return html;
  }

  function renderGearBySlot() {
    const bySlot = {};
    for (const item of state.bagItems) {
      const slot = (item.slotType==="Ring 1"||item.slotType==="Ring 2") ? "Ring" : item.slotType;
      (bySlot[slot] ??= []).push({ ...item, slotType:slot });
    }
    for (const items of Object.values(bySlot)) items.sort((a,b) => b.prefScore-a.prefScore);

    let html="", hasAny=false;
    for (const slot of GEAR_SLOT_ORDER) {
      const items = bySlot[slot];
      if (!items?.length) continue;
      hasAny = true;
      const eq      = state.equipped[slot] ?? state.equipped[slot+" 1"] ?? null;
      const eqColor = eq ? rarityColor(eq.rarity) : "#4b5563";
      const eqForge = eq ? normForge(eq.forgeTier) : "";
      const eqText  = eq
        ? `<span style="color:${eqColor};">${eqForge?esc(eqForge)+" ":""}${esc(eq.name)}${eq.plus_level>0?" +"+eq.plus_level:""}</span>`
        : `<span class="c-muted">— not cached</span>`;
      html += `<div class="sg-sec">
        <div class="sg-lbl">${esc(slot)}</div>
        <div class="sg-eq-label">Equipped: ${eqText}</div>
        ${items.map(item => renderItemCard(item, selfCtx())).join("")}
      </div>`;
    }
    if (!hasAny) html += `<div class="sg-hint">No gear items in bag.</div>`;
    return html;
  }

  function renderGearByCategory() {
    const bycat = {};
    for (const cat of CATEGORIES) bycat[cat.key] = [];
    for (const item of state.bagItems) bycat[item.cat]?.push(item);
    for (const list of Object.values(bycat)) list.sort((a,b) => b.prefScore-a.prefScore);

    let html = "";
    for (const cat of CATEGORIES) {
      const items   = bycat[cat.key];
      const defOpen = state.catOpen[cat.key] ?? (cat.key==="top"||cat.key==="up");
      html += `<div class="sg-cat-section" data-cat="${esc(cat.key)}">
        <div class="sg-cat-header">
          <span class="sg-cat-title">
            <span class="sg-badge ${cat.cls}">${esc(cat.label)}</span>
            <span class="sg-cat-count">${items.length}</span>
          </span>
          <span class="sg-cat-toggle">${defOpen?"▾":"▸"}</span>
        </div>
        <div class="sg-cat-body${defOpen?"":" collapsed"}">
          ${items.length ? items.map(renderCatItem).join("") : `<div style="padding:6px 10px;color:#4b5563;font-size:10px;">—</div>`}
        </div>
      </div>`;
    }
    return html;
  }

  /**************************************************************************
   * RENDER — Market Tab
   **************************************************************************/

  function renderMarket() {
    if (!state.marketVisible) {
      return `<div class="sg-hint">Open the <strong>Market</strong><br>to scan listings.</div>`;
    }
    if (!state.marketItems.length) {
      return `<div class="sg-hint">No gear listings visible.<br>Switch to Weapons / Armor / Jewelry.</div>`;
    }
    if (!Object.keys(state.equipped).length) {
      return `<div class="sg-hint" style="padding:6px 10px;">No equipped gear cached — open inventory first for diffs.</div>`;
    }

    const mwt         = Math.floor((state.level ?? 0) / 10) + 1;
    const nowItems    = state.marketItems.filter(i => !i.isFutureTier);
    const futureItems = state.marketItems.filter(i =>  i.isFutureTier);
    const topItems    = nowItems.filter(i => i.cat === "top");
    const upItems     = nowItems.filter(i => i.cat === "up");
    const neuItems    = nowItems.filter(i => i.cat === "neu");

    let html = `<div class="sg-gear-toolbar">
      <div style="display:flex;gap:6px;align-items:center;">
        <span style="color:#e8eefc;font-size:11px;font-weight:600;">${state.marketItems.length} listings</span>
        <span style="color:#4b5563;font-size:10px;">max T${mwt} (Lv${state.level??0})</span>
      </div>
      <div style="display:flex;gap:5px;align-items:center;">
        ${futureItems.length ? `<button class="sg-mode-btn${state.marketHideFuture?" active":""}" id="sgMktHideFuture"
          style="${state.marketHideFuture?"color:#6b7280;border-color:#374151;":""}"
          title="${state.marketHideFuture?"Show":"Hide"} future tier items">🔒 ${futureItems.length}</button>` : ""}
        <span class="sg-cache-hint">· <span style="color:#3b82f6;">${esc(state.activeFilterKey||"—")}</span></span>
      </div>
    </div>`;

    if (!topItems.length && !upItems.length) {
      html += `<div class="sg-hint">No Top Picks or Interesting items<br>in current tier range.</div>`;
    }

    const groups = [
      { cls:"rec-top", label:"✅ Top Pick", items: topItems },
      { cls:"rec-up",  label:"👍 Interesting",  items: upItems  },
      { cls:"rec-neu", label:"↔ Neutral",   items: neuItems },
    ].filter(g => g.items.length);

    for (const g of groups) {
      g.items.sort((a, b) => b.prefScore - a.prefScore);
      html += `<div class="sg-sec">
        <div class="sg-lbl">
          <span class="sg-badge ${g.cls}">${esc(g.label)}</span>
          <span class="sg-cat-count" style="margin-left:5px;">${g.items.length}</span>
        </div>
        ${g.items.map(renderMarketItem).join("")}
      </div>`;
    }

    if (futureItems.length && !state.marketHideFuture) {
      const fs = [...futureItems].sort((a, b) => a.itemTier - b.itemTier || b.prefScore - a.prefScore);
      html += `<div class="sg-sec" style="opacity:.5;">
        <div class="sg-lbl">
          <span class="sg-badge sg-badge-future">🔒 Future — T${mwt+2}+</span>
          <span class="sg-cat-count" style="margin-left:5px;">${futureItems.length}</span>
        </div>
        ${fs.slice(0, 6).map(renderMarketItem).join("")}
        ${futureItems.length > 6 ? `<div style="color:#374151;font-size:10px;padding:4px 10px;">+${futureItems.length-6} more…</div>` : ""}
      </div>`;
    }

    return html;
  }

  function renderMarketItem(item) {
    const color    = rarityColor(item.rarity);
    const activeFC = state.filters.get(marketCtxFilterKey()) ?? mkFC([]);
    const forgeStr = item.forgeLevel ? `+${item.forgeLevel}` : "";
    const priceStr = item.price >= 1_000_000 ? (item.price/1_000_000).toFixed(1)+"M"
                   : item.price >= 1_000     ? Math.round(item.price/1_000)+"K"
                   : String(item.price);
    const mrRaw    = {1:"Double",2:"Triple",3:"Quad"}[item.multiRollCount];
    const mrQPct   = item.multiRollCount ? Math.round((item.mrMedianQuality??1)*100) : 0;
    const mrQCol   = mrQPct>=80?"#4ade80":mrQPct>=60?"#fde68a":"#f87171";
    const mrLabel  = mrRaw ? `${mrRaw} Roll <span style="color:${mrQCol}">${mrQPct}%</span>${item.mrInteresting?" 🎲 Interesting":""}` : null;

    const chips = item.diffs.slice(0, 4).map(d => {
      const isPref  = d.stat && activeFC.stats.has(d.stat);
      const isStar  = d.stat && activeFC.preferredStats.has(d.stat);
      return `<span class="sg-diff ${d.isUp?"sg-diff-up":"sg-diff-down"}${isStar?" pref-star":isPref?" pref":""}">${esc(d.text)}</span>`;
    }).join("");

    return `<div class="sg-cat-item" style="border-left-color:${color};">
      <div class="sg-cat-item-left">
        <div class="sg-cat-item-name" style="color:${color};">
          ${ITEM_ICONS[item.weaponSubType]?`<span class="sg-type-icon">${ITEM_ICONS[item.weaponSubType]}</span> `:""}${item.forge?`<span style="color:#facc15;">${esc(item.forge)}</span> `:""}${esc(item.name)}${forgeStr?` <span style="color:#64748b;">${esc(forgeStr)}</span>`:""}
        </div>
        <div class="sg-cat-item-sub">${esc(item.rarity)} · T${item.itemTier??"?"} ${mrLabel?"· "+mrLabel+" ":""} · ${esc(item.sellerName)}</div>
        <div class="sg-diffs">${chips||'<span style="color:#4b5563;font-size:10px;">No diffs vs equipped</span>'}</div>
      </div>
      <div class="sg-cat-item-right">
        ${_itemDeltasCornerHtml(item, marketCtx())}
        <span class="sg-slot-pill">${esc(item.slotType)}</span>
        <span class="sg-badge sg-badge-shard" style="color:#fde68a;border-color:#78350f;background:rgba(253,230,138,.1);">💰 ${priceStr}</span>
      </div>
    </div>`;
  }

  /**************************************************************************
   * RENDER — Item Cards
   **************************************************************************/

  function qualityBadge(q) {
    if (q === null || q === undefined) return "";
    const pct = Math.round(q * 100);
    const [color, bg, border] =
      q >= 0.8 ? ["#4ade80","rgba(134,239,172,.15)","rgba(134,239,172,.35)"] :
      q >= 0.5 ? ["#fde68a","rgba(253,230,138,.15)","rgba(253,230,138,.35)"] :
                 ["#f87171","rgba(252,165,165,.15)","rgba(252,165,165,.35)"];
    return `<span class="sg-qual-badge" style="color:${color};background:${bg};border-color:${border};">${pct}%</span>`;
  }

  function filterTagsHtml(item) {
    const tags = Object.entries(item.filterScores)
      .filter(([k, s]) => {
        if (k === state.activeFilterKey) return false;
        const fc = state.filters.get(k);
        if (!fc?.enabled || s < 1) return false;
        return _qualifies(item.filterPriorityUps?.[k] ?? 0, item.filterHasPriorityMR?.[k] ?? false, fc);
      })
      .sort(([,a],[,b]) => b-a)
      .map(([k]) => `<span class="sg-filter-tag">${esc(k)}</span>`);
    return tags.length ? `<div class="sg-filter-tags">${tags.join("")}</div>` : "";
  }

  function multiHtml(item) {
    if (!item.multiRollCount) return "";
    const label  = {1:"Double",2:"Triple",3:"Quad"}[item.multiRollCount] ?? `×${item.multiRollCount+1}`;
    const qPct   = Math.round((item.mrMedianQuality ?? 1) * 100);
    const qColor = qPct >= 80 ? "#4ade80" : qPct >= 60 ? "#fde68a" : "#f87171";
    const note   = item.mrInteresting ? ` · <span style="color:#a78bfa;">🎲 Interesting</span>` : "";
    return `<span class="sg-badge sg-badge-multi">${label} Roll <span style="color:${qColor};font-weight:700;">${qPct}%</span>${note}</span>`;
  }

  // Returns score bump based on DPS% change: >5%→+2, >2%→+1, <-2%→-1, <-5%→-2
  function _dpsScoreBump(item, ctx) {
    const c      = ctx ?? selfCtx();
    const delta  = calcItemDpsDelta(item, c);
    const curDPS = calcDPS(c);
    if (delta == null || !curDPS) return 0;
    const pct = (delta / curDPS) * 100;
    if (pct >  5) return  2;
    if (pct >  2) return  1;
    if (pct < -5) return -2;
    if (pct < -2) return -1;
    return 0;
  }

  // Returns score bump based on EHP% change: >5%→+2, >2%→+1, <-2%→-1, <-5%→-2
  function _ehpScoreBump(item, ctx) {
    const c       = ctx ?? selfCtx();
    const curSurv = calcSurvivability(c.maxHpStat, c.def ?? 0);
    if (!curSurv) return 0;
    const delta = calcItemSurvDelta(item, c);
    if (delta == null) return 0;
    const pct = (delta / curSurv) * 100;
    if (pct >  5) return  2;
    if (pct >  2) return  1;
    if (pct < -5) return -2;
    if (pct < -2) return -1;
    return 0;
  }

  // Returns { rec, cat, bump, mode } override when filter mode affects scoring, else null
  function adjustedRec(item, fc, activeKey, ctx) {
    const c = ctx ?? selfCtx();
    if (!fc || fc.mode === "defensive" && !calcSurvivability(c.maxHpStat, c.def ?? 0)) return null;
    const bump = fc.mode === "aggressive" ? _dpsScoreBump(item, c)
               : fc.mode === "defensive"  ? _ehpScoreBump(item, c)
               : 0;
    if (bump === 0) return null;
    const baseScore   = item.filterScores?.[activeKey] ?? item.prefScore ?? 0;
    const priorityUps = item.filterPriorityUps?.[activeKey] ?? 0;
    const hasPriMR    = item.filterHasPriorityMR?.[activeKey] ?? false;
    const adjScore    = baseScore + bump;
    return {
      rec:  recommendation(adjScore, priorityUps, hasPriMR, fc),
      cat:  categoryOf(adjScore, priorityUps, hasPriMR, fc),
      bump,
      mode: fc.mode,
    };
  }

  function calcItemDpsDelta(item, ctx = state) {
    if (!ctx.atkPhys || !ctx.atkSpeed || ctx.atkSpeed <= 0) return null;
    if (!item.eqBaseStats || !item.ownBaseStats) return null;
    const curDPS        = calcDPS(ctx);
    if (!curDPS) return null;
    const curAllStats   = ctx.allStats ?? 0;
    const atkDelta      = (item.ownBaseStats.atk      ?? 0) - (item.eqBaseStats.atk      ?? 0);
    const allStatsDelta = (item.ownBaseStats.allStats  ?? 0) - (item.eqBaseStats.allStats ?? 0);
    const eqSpdPct      = item.eqBaseStats.atkSpeed   ?? 0;
    const newSpdPct     = item.ownBaseStats.atkSpeed   ?? 0;
    const baseATK       = ctx.atkPhys / (1 + curAllStats / 100);
    const newAtk        = (baseATK + atkDelta) * (1 + (curAllStats + allStatsDelta) / 100);
    const newSpd        = ctx.atkSpeed * (1 + eqSpdPct / 100) / (1 + newSpdPct / 100);
    const newCrit       = (ctx.critChance ?? 0) + (item.ownBaseStats.critChance ?? 0) - (item.eqBaseStats.critChance ?? 0);
    const newCritD      = (ctx.critDmg    ?? 0) + (item.ownBaseStats.critDmg    ?? 0) - (item.eqBaseStats.critDmg    ?? 0);
    if (newAtk <= 0 || newSpd <= 0) return null;
    const hitRate = (ctx.hitChance ?? 95) / 100;
    const newDPS  = (newAtk / newSpd) * hitRate * (1 + (newCrit / 100) * ((newCritD / 100) - 1));
    return newDPS - curDPS;
  }

  function _dpsDeltaHtml(item) {
    const delta  = calcItemDpsDelta(item);
    const curDPS = calcDPS();
    if (delta == null || !curDPS) return "";
    const pct  = (delta / curDPS) * 100;
    const sign = delta >= 0 ? "+" : "";
    const col  = delta > 1 ? "#4ade80" : delta < -1 ? "#f87171" : "#94a3b8";
    return `<div class="sg-row" style="padding:2px 0;border-top:1px solid rgba(255,255,255,.06);margin-top:3px">
      <span class="sg-key">∆ DPS</span>
      <span style="color:${col};font-weight:700">${sign}${Math.round(delta)} <span style="opacity:.55;font-weight:400">(${sign}${pct.toFixed(1)}%)</span></span>
    </div>`;
  }

  // EHP = HP × (1 + DEF/1000) — relative survivability index
  function calcSurvivability(hp, def) {
    if (!hp || hp <= 0) return null;
    return hp * (1 + (def ?? 0) / 1000);
  }

  function calcItemSurvDelta(item, ctx = state) {
    if (!ctx.maxHpStat || !item.eqBaseStats || !item.ownBaseStats) return null;
    const curSurv = calcSurvivability(ctx.maxHpStat, ctx.def ?? 0);
    if (!curSurv) return null;
    const curAllStats   = ctx.allStats ?? 0;
    const allStatsDelta = (item.ownBaseStats.allStats ?? 0) - (item.eqBaseStats.allStats ?? 0);
    const hpDelta       = (item.ownBaseStats.hp  ?? 0) - (item.eqBaseStats.hp  ?? 0);
    const defDelta      = (item.ownBaseStats.def ?? 0) - (item.eqBaseStats.def ?? 0);
    const baseHP  = ctx.maxHpStat / (1 + curAllStats / 100);
    const baseDEF = (ctx.def ?? 0) / (1 + curAllStats / 100);
    const newHP   = (baseHP  + hpDelta)  * (1 + (curAllStats + allStatsDelta) / 100);
    const newDEF  = (baseDEF + defDelta) * (1 + (curAllStats + allStatsDelta) / 100);
    const newSurv = calcSurvivability(newHP, newDEF);
    if (newSurv == null) return null;
    return newSurv - curSurv;
  }

  function _survDeltaHtml(item) {
    const curSurv = calcSurvivability(state.maxHpStat, state.def ?? 0);
    if (!curSurv) return "";
    const delta = calcItemSurvDelta(item);
    if (delta == null || Math.abs(delta) < 1) return "";
    const pct  = (delta / curSurv) * 100;
    const sign = delta >= 0 ? "+" : "";
    const col  = delta > 0 ? "#60a5fa" : "#f87171";
    return `<div class="sg-row" style="padding:2px 0;border-top:1px solid rgba(255,255,255,.06);margin-top:3px">
      <span class="sg-key">∆ EHP</span>
      <span style="color:${col};font-weight:700">${sign}${Math.round(delta)} <span style="opacity:.55;font-weight:400">(${sign}${pct.toFixed(1)}%)</span></span>
    </div>`;
  }

  function calcItemManaDelta(item, ctx = state) {
    if (!item.eqBaseStats || !item.ownBaseStats) return null;
    const curAllStats   = ctx.allStats ?? 0;
    const allStatsDelta = (item.ownBaseStats.allStats  ?? 0) - (item.eqBaseStats.allStats  ?? 0);
    const manaDelta     = (item.ownBaseStats.mana      ?? 0) - (item.eqBaseStats.mana      ?? 0);
    const mregenDelta   = (item.ownBaseStats.manaRegen ?? 0) - (item.eqBaseStats.manaRegen ?? 0);
    if (manaDelta === 0 && mregenDelta === 0 && allStatsDelta === 0) return null;
    const baseMana   = (ctx.maxManaStat ?? 0) / (1 + curAllStats / 100);
    const baseMRegen = (ctx.manaRegen  ?? 0)  / (1 + curAllStats / 100);
    const newMana    = (baseMana   + manaDelta)   * (1 + (curAllStats + allStatsDelta) / 100);
    const newMRegen  = (baseMRegen + mregenDelta) * (1 + (curAllStats + allStatsDelta) / 100);
    const dMana   = newMana   - (ctx.maxManaStat ?? 0);
    const dMRegen = newMRegen - (ctx.manaRegen   ?? 0);
    if (Math.abs(dMana) < 0.5 && Math.abs(dMRegen) < 0.05) return null;
    return { dMana, dMRegen };
  }

  function _manaDeltaHtml(item) {
    const res = calcItemManaDelta(item);
    if (!res) return "";
    const { dMana, dMRegen } = res;
    const SEP = `style="padding:2px 0;border-top:1px solid rgba(255,255,255,.06);margin-top:3px"`;
    let html = "";
    if (Math.abs(dMana) >= 1) {
      const sign = dMana >= 0 ? "+" : "";
      const col  = dMana > 0 ? "#60a5fa" : "#f87171";
      html += `<div class="sg-row" ${SEP}><span class="sg-key">∆ Mana</span><span style="color:${col};font-weight:700">${sign}${Math.round(dMana)}</span></div>`;
    }
    if (Math.abs(dMRegen) >= 0.05) {
      const sign = dMRegen >= 0 ? "+" : "";
      const col  = dMRegen > 0 ? "#60a5fa" : "#f87171";
      html += `<div class="sg-row" ${SEP}><span class="sg-key">∆ Mana/t</span><span style="color:${col};font-weight:700">${sign}${dMRegen.toFixed(1)}</span></div>`;
    }
    return html;
  }

  // Compact top-right corner: DPS, EHP, combined Mana score (pool + regen × 3)
  function _itemDeltasCornerHtml(item, ctx = state) {
    const lines = [];

    const dpsDelta = calcItemDpsDelta(item, ctx);
    const curDPS   = calcDPS(ctx);
    if (dpsDelta != null && curDPS) {
      const pct  = (dpsDelta / curDPS) * 100;
      const sign = dpsDelta >= 0 ? "+" : "";
      const col  = dpsDelta > 1 ? "#4ade80" : dpsDelta < -1 ? "#f87171" : "#94a3b8";
      lines.push(`<span style="color:${col};white-space:nowrap;">DPS ${sign}${Math.round(dpsDelta)} <span style="opacity:.55;font-size:9px;">(${sign}${pct.toFixed(1)}%)</span></span>`);
    }

    const survDelta = calcItemSurvDelta(item, ctx);
    const curSurv   = calcSurvivability(ctx.maxHpStat, ctx.def ?? 0);
    if (survDelta != null && curSurv && Math.abs(survDelta) >= 1) {
      const pct  = (survDelta / curSurv) * 100;
      const sign = survDelta >= 0 ? "+" : "";
      const col  = survDelta > 0 ? "#4ade80" : "#f87171";
      lines.push(`<span style="color:${col};white-space:nowrap;">EHP ${sign}${Math.round(survDelta)} <span style="opacity:.55;font-size:9px;">(${sign}${pct.toFixed(1)}%)</span></span>`);
    }

    const manaRes = calcItemManaDelta(item, ctx);
    if (manaRes) {
      const score = manaRes.dMana + manaRes.dMRegen * 3;
      if (Math.abs(score) >= 1) {
        const sign = score >= 0 ? "+" : "";
        const col  = score > 0 ? "#60a5fa" : "#f87171";
        lines.push(`<span style="color:${col};white-space:nowrap;" title="Mana Score = ΔPool + ΔRegen×3 (regen ticks every 10s)">Mana ${sign}${Math.round(score)}</span>`);
      }
    }

    if (!lines.length) return "";
    return `<div class="sg-item-deltas">${lines.join("")}</div>`;
  }

  function renderItemCard(item, ctx = state) {
    const color     = rarityColor(item.rarity);
    const forgeStr  = item.forgeLevel ? `+${item.forgeLevel}` : "";
    const activeFC  = state.filters.get(state.activeFilterKey) ?? mkFC([]);
    const adjResult = adjustedRec(item, activeFC, state.activeFilterKey, ctx);
    const dispRec   = adjResult?.rec ?? item.rec;
    const bumpIcon  = adjResult?.mode === "defensive" ? "🛡" : "🗡";
    const bumpCol   = adjResult?.mode === "defensive" ? "#60a5fa" : "#f97316";
    const bumpLabel = adjResult?.mode === "defensive" ? "EHP" : "DPS";
    const bumpNote  = adjResult ? `<span title="${bumpLabel}-Anpassung aktiv (${adjResult.bump>0?"+":""}${adjResult.bump} Score)" style="color:${bumpCol};font-size:9px;margin-left:2px;">${bumpIcon}</span>` : "";
    const badges    = [
      `<span class="sg-badge ${dispRec.cls}">${esc(dispRec.label)}</span>${bumpNote}`,
      `<span class="sg-badge sg-badge-shard">💎 ${item.shards}</span>`,
      item.isLegacyStar ? `<span class="sg-badge sg-badge-legacy">★ Legacy</span>` : "",
      multiHtml(item),
      item.classRestricted ? `<span class="sg-badge sg-badge-restricted">🔒 Wrong type</span>` : "",
    ].filter(Boolean).join("");

    const icon = ITEM_ICONS[item.weaponSubType] ?? "";
    const diffsHtml = item.diffs.map(d => {
      const isPref  = d.stat && activeFC.stats.has(d.stat);
      const isStar  = d.stat && activeFC.preferredStats.has(d.stat);
      const q = d.stat ? (item.rollQualities[d.stat] ?? null) : null;
      return `<div class="sg-diff-row">
        <span class="sg-diff ${d.isUp?"sg-diff-up":"sg-diff-down"}${isStar?" pref-star":isPref?" pref":""}">${esc(d.text)}</span>
        ${qualityBadge(q)}
      </div>`;
    }).join("");

    return `<div class="sg-item" style="border-left-color:${color};">
      <div style="display:flex;gap:6px;align-items:flex-start;">
        <div style="flex:1;min-width:0;">
          <div class="sg-item-head">
            ${icon?`<span class="sg-type-icon">${icon}</span>`:""}
            ${item.forge?`<span style="color:#facc15;font-size:11px;">${esc(item.forge)}</span>`:""}
            <span class="sg-item-name" style="color:${color};">${esc(item.name)}${forgeStr?` <span style="color:#64748b;font-weight:400;">${esc(forgeStr)}</span>`:""}</span>
          </div>
          <div class="sg-item-meta">${esc(item.typeText)} · ${esc(item.rarity)}</div>
          <div class="sg-badges">${badges}</div>
          ${item.diffs.length ? `<div style="margin-top:3px;">${diffsHtml}</div>` : ""}
        </div>
        ${_itemDeltasCornerHtml(item, ctx)}
      </div>
      ${filterTagsHtml(item)}
    </div>`;
  }

  function renderCatItem(item) {
    const color     = rarityColor(item.rarity);
    const forgeStr  = item.forgeLevel ? `+${item.forgeLevel}` : "";
    const activeFC  = state.filters.get(state.activeFilterKey) ?? mkFC([]);
    const adjResult = adjustedRec(item, activeFC, state.activeFilterKey, selfCtx());
    const _btIcon  = adjResult?.mode === "defensive" ? "🛡" : "🗡";
    const _btCol   = adjResult ? (adjResult.bump > 0 ? (adjResult.mode === "defensive" ? "#60a5fa" : "#f97316") : "#94a3b8") : "";
    const _btLabel = adjResult?.mode === "defensive" ? "EHP" : "DPS";
    const bumpTag  = adjResult
      ? `<span style="color:${_btCol};font-size:10px;" title="${_btLabel}-Anpassung: ${adjResult.bump>0?"+":""}${adjResult.bump} Score → ${adjResult.rec.label}"> ${_btIcon}${adjResult.rec.label}</span>`
      : "";
    const sortedDiffs = [...item.diffs].sort((a,b) => {
      const wa = activeFC.preferredStats.has(a.stat) ? 2 : activeFC.stats.has(a.stat) ? 1 : 0;
      const wb = activeFC.preferredStats.has(b.stat) ? 2 : activeFC.stats.has(b.stat) ? 1 : 0;
      return wb - wa;
    });

    const chips = sortedDiffs.slice(0,4).map(d => {
      const isPref  = d.stat && activeFC.stats.has(d.stat);
      const isStar  = d.stat && activeFC.preferredStats.has(d.stat);
      return `<span class="sg-diff ${d.isUp?"sg-diff-up":"sg-diff-down"}${isStar?" pref-star":isPref?" pref":""}">${esc(d.text)}</span>`;
    }).join("");

    return `<div class="sg-cat-item" style="border-left-color:${color};">
      <div class="sg-cat-item-left">
        <div class="sg-cat-item-name" style="color:${color};">
          ${ITEM_ICONS[item.weaponSubType]?`<span class="sg-type-icon">${ITEM_ICONS[item.weaponSubType]}</span> `:""}${item.forge?`<span style="color:#facc15;">${esc(item.forge)}</span> `:""}${esc(item.name)}${forgeStr?` <span style="color:#64748b;font-weight:400;">${esc(forgeStr)}</span>`:""}
        </div>
        <div class="sg-cat-item-sub">${esc(item.rarity)}${item.isLegacyStar?" · ★ Legacy":""}${item.multiRollCount>0?(() => {
          const lbl   = {1:"Double",2:"Triple",3:"Quad"}[item.multiRollCount] ?? "×"+(item.multiRollCount+1);
          const qPct  = Math.round((item.mrMedianQuality??1)*100);
          const qCol  = qPct>=80?"#4ade80":qPct>=60?"#fde68a":"#f87171";
          const iNote = item.mrInteresting ? " 🎲 Interesting" : "";
          return ` · ${lbl} Roll <span style="color:${qCol}">${qPct}%</span>${iNote}`;
        })():""}${item.classRestricted?" · 🔒 Wrong type":""}${bumpTag}</div>
        <div class="sg-diffs">${chips}</div>
        ${filterTagsHtml(item)}
      </div>
      <div class="sg-cat-item-right">
        ${_itemDeltasCornerHtml(item, selfCtx())}
        <span class="sg-slot-pill">${esc(item.slotType)}</span>
        <span class="sg-badge sg-badge-shard">💎 ${item.shards}</span>
      </div>
    </div>`;
  }

  /**************************************************************************
   * RENDER — Team Tab
   **************************************************************************/

  const teamOpen = {};   // profileId → bool (section expanded state)

  function renderTeam() {
    const profiles = Object.values(teamProfiles).sort((a, b) => b.savedAt - a.savedAt);

    if (!profiles.length) {
      return `<div class="sg-hint">No profiles saved yet.<br>Click <b>Inspect</b> on a player<br>then hit <b>💾 Save Profile</b>.</div>`;
    }
    if (!state.bagItemsRaw.length) {
      return `<div class="sg-hint">Open <strong>Inventory</strong><br>to load your bag items first.</div>`;
    }

    const filterKeys = [...state.filters.keys()];

    let html = "";
    for (const profile of profiles) {
      const eqMap      = profile.equippedMap;
      const eqWeapon   = Object.values(eqMap).find(i => ITEM_TYPE_TO_SLOT[i.type] === "Weapon");
      const icon       = eqWeapon ? (ITEM_ICONS[eqWeapon.type] ?? "⚔️") : "❓";
      const wtype      = eqWeapon ? eqWeapon.type : "unknown";
      const profFilter = profile.filterKey ?? state.activeFilterKey;

      // Evaluate every bag item against this teammate's gear using their assigned filter
      const topItems = [];
      for (const raw of state.bagItemsRaw) {
        const ev = _buildBagItem(raw, eqMap, profFilter);
        if (ev.cat === "top") topItems.push(ev);
      }
      topItems.sort((a, b) => b.prefScore - a.prefScore);

      const isOpen = teamOpen[profile.playerId] !== false;  // default open
      const d = new Date(profile.savedAt);
      const ts = `${d.getDate().toString().padStart(2,"0")}.${(d.getMonth()+1).toString().padStart(2,"0")} ${d.getHours().toString().padStart(2,"0")}:${d.getMinutes().toString().padStart(2,"0")}`;

      const filterChips = filterKeys.map(k => {
        const active = k === profFilter;
        return `<button class="sg-btn sg-team-fchip${active?" sg-team-fchip-on":""}" data-team-fset="${esc(profile.playerId)}" data-fkey="${esc(k)}" style="padding:1px 6px;font-size:9px;${active?"border-color:rgba(59,130,246,.5);background:rgba(59,130,246,.18);color:#93c5fd;":""}">${esc(k)}</button>`;
      }).join("");

      html += `<div class="sg-cat-section" data-team-pid="${esc(profile.playerId)}">
        <div class="sg-team-header">
          <span class="sg-cat-title" style="gap:6px;">
            <span style="font-size:13px;">${icon}</span>
            <b style="font-size:12px;color:#e8eefc;">${esc(profile.username)}</b>
            <span style="color:#4b5563;font-size:10px;">${esc(profile.levelText)} · ${esc(wtype)}</span>
            ${topItems.length
              ? `<span class="sg-badge rec-top" style="margin-left:4px;">${topItems.length} Top</span>`
              : `<span style="color:#374151;font-size:10px;">(no top picks)</span>`}
          </span>
          <span style="display:flex;gap:4px;align-items:center;">
            <span style="color:#1e293b;font-size:9px;">${ts}</span>
            <button class="sg-icon-btn sg-team-del" data-team-del="${esc(profile.playerId)}" title="Remove">✗</button>
            <span class="sg-cat-toggle">${isOpen ? "▾" : "▸"}</span>
          </span>
        </div>
        <div style="padding:2px 8px 4px;display:flex;gap:3px;flex-wrap:wrap;border-bottom:1px solid rgba(255,255,255,.04);">
          <span style="color:#4b5563;font-size:9px;line-height:20px;margin-right:2px;">Filter:</span>
          ${filterChips}
        </div>
        <div class="sg-cat-body${isOpen ? "" : " collapsed"}">
          ${topItems.length
            ? topItems.map(item => renderItemCard(item, deriveCharStatsFromProfile(profile))).join("")
            : `<div style="color:#374151;font-size:10px;padding:8px 12px;">Nothing in your bag is a Top Pick for ${esc(profile.username)} right now.</div>`}
        </div>
      </div>`;
    }
    return html;
  }

  /**************************************************************************
   * INSPECT MODAL — Save Button
   **************************************************************************/

  function injectInspectSaveBtn(modal) {
    // Walk React fiber to find the playerId prop
    const fkey = Object.keys(modal).find(k => k.startsWith("__reactFiber"));
    let playerId = null;
    if (fkey) {
      let fiber = modal[fkey]; let depth = 0;
      while (fiber && depth < 12) {
        if (fiber.memoizedProps?.playerId) { playerId = fiber.memoizedProps.playerId; break; }
        fiber = fiber.return; depth++;
      }
    }
    if (!playerId) return;

    function tryInject() {
      if (modal.querySelector(".sg-inspect-save")) return;  // already injected
      const usernameEl = modal.querySelector(".inspect-username");
      if (!usernameEl) return;  // async content not yet loaded

      const username  = usernameEl.textContent.trim() || "Unknown";
      const levelText = modal.querySelector(".inspect-level")?.textContent?.trim() ?? "";

      const alreadySaved = !!teamProfiles[playerId];

      const wrap = document.createElement("div");
      wrap.className = "sg-inspect-save";
      wrap.style.cssText = "display:flex;gap:4px;margin-top:6px;flex-wrap:wrap;";

      const saveBtn = document.createElement("button");
      saveBtn.className = "sg-btn";
      saveBtn.textContent = alreadySaved ? "🔄 Update Profile" : "💾 Save Profile";

      const removeBtn = document.createElement("button");
      removeBtn.className = "sg-btn";
      removeBtn.style.cssText = "color:#f87171;border-color:rgba(248,113,113,.3);display:" + (alreadySaved ? "inline-block" : "none") + ";";
      removeBtn.textContent = "✗ Remove";

      saveBtn.addEventListener("click", () => {
        const data = pendingInspect[playerId];
        if (!data) { saveBtn.textContent = "⚠ No data yet…"; setTimeout(() => { saveBtn.textContent = "🔄 Update Profile"; }, 2000); return; }
        teamProfiles[playerId] = {
          playerId, username, levelText,
          equippedMap: buildEquippedMap(data.equipped),
          charStats:   parseInspectCharStats(data),
          filterKey: teamProfiles[playerId]?.filterKey ?? state.activeFilterKey,
          savedAt: Date.now(),
        };
        saveTeamProfiles();
        saveBtn.textContent = "✓ Saved!";
        saveBtn.style.color = "#4ade80";
        removeBtn.style.display = "inline-block";
        setTimeout(() => { saveBtn.textContent = "🔄 Update Profile"; saveBtn.style.color = ""; }, 2000);
      });

      removeBtn.addEventListener("click", () => {
        delete teamProfiles[playerId];
        saveTeamProfiles();
        saveBtn.textContent = "💾 Save Profile";
        removeBtn.style.display = "none";
      });

      wrap.appendChild(saveBtn);
      wrap.appendChild(removeBtn);
      modal.style.position = "relative";
      modal.appendChild(wrap);
    }

    tryInject();
    if (!modal.querySelector(".sg-inspect-save")) {
      // Inspect modal loads async — watch for username to appear
      const obs = new MutationObserver(() => {
        tryInject();
        if (modal.querySelector(".sg-inspect-save")) obs.disconnect();
      });
      obs.observe(modal, { childList: true, subtree: true });
    }
  }

  function setupInspectObserver() {
    new MutationObserver(muts => {
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (n.nodeType !== 1) continue;
          if (n.classList?.contains("inspect-modal")) { injectInspectSaveBtn(n); continue; }
          const inner = n.querySelector?.(".inspect-modal");
          if (inner) injectInspectSaveBtn(inner);
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  /**************************************************************************
   * RENDER — Dispatcher + Events
   **************************************************************************/

  function render() {
    const body = document.getElementById("sgBody");
    if (!body) return;

    if (state.activeTab==="filters" && state.filterEdit &&
        document.activeElement?.classList.contains("sg-filter-input")) return;

    if      (state.activeTab==="gear")    body.innerHTML = renderGear();
    else if (state.activeTab==="filters") body.innerHTML = renderFilters();
    else if (state.activeTab==="market")  body.innerHTML = renderMarket();
    else if (state.activeTab==="team")    body.innerHTML = renderTeam();
    else                                  body.innerHTML = renderStats();

    if (state.activeTab==="filters") {
      body.querySelector(".sg-help-box")?.addEventListener("toggle", e => { filterHelpOpen = e.target.open; });
      body.querySelectorAll(".sg-filter-row").forEach((row) => {
        row.addEventListener("click", (e) => {
          if (e.target.closest("button")) return;
          state.activeFilterKey = row.dataset.fkey;
          localStorage.setItem("sgActiveFilter", state.activeFilterKey);
          state.filterEdit = null;
          render();
        });
      });
      body.querySelectorAll("[data-ftoggle]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const fc = state.filters.get(btn.dataset.ftoggle);
          if (fc) { fc.enabled = !fc.enabled; saveFilters(); render(); }
        });
      });
      body.querySelectorAll("[data-fmode]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const fc = state.filters.get(btn.dataset.fmode);
          if (fc) { fc.mode = fc.mode === "aggressive" ? "defensive" : "aggressive"; saveFilters(); render(); }
        });
      });
      body.querySelectorAll("[data-edit]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const key = btn.dataset.edit;
          const fc  = state.filters.get(key);
          state.filterEdit = { key, name:key, stats:new Set(fc?.stats), preferredStats:new Set(fc?.preferredStats), multiBonus:{...fc?.multiBonus} };
          render();
        });
      });
      body.querySelectorAll("[data-del]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const key = btn.dataset.del;
          state.filters.delete(key);
          if (state.activeFilterKey===key) {
            state.activeFilterKey = state.filters.keys().next().value ?? "";
            localStorage.setItem("sgActiveFilter", state.activeFilterKey);
          }
          saveFilters(); render();
        });
      });
      document.getElementById("sgFeSave")?.addEventListener("click", () => {
        const fe = state.filterEdit; if (!fe) return;
        const newName = (document.getElementById("sgFeName")?.value||fe.key).trim();
        const oldFC   = state.filters.get(fe.key);
        if (newName!==fe.key) state.filters.delete(fe.key);
        state.filters.set(newName, mkFC([...fe.stats], oldFC?.enabled ?? true, fe.multiBonus, [...(fe.preferredStats ?? [])], oldFC?.mode ?? "defensive"));
        if (state.activeFilterKey===fe.key) {
          state.activeFilterKey = newName;
          localStorage.setItem("sgActiveFilter", newName);
        }
        state.filterEdit = null; saveFilters(); render();
      });
      document.getElementById("sgFeCancel")?.addEventListener("click", () => {
        state.filterEdit = null; render();
      });
      body.querySelectorAll("[data-estat]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const nameEl = document.getElementById("sgFeName");
          if (nameEl && state.filterEdit) state.filterEdit.name = nameEl.value;
          const stat = btn.dataset.estat; if (!state.filterEdit) return;
          const fe = state.filterEdit;
          if (fe.preferredStats.has(stat)) {
            fe.preferredStats.delete(stat); fe.stats.delete(stat); // preferred → off
          } else if (fe.stats.has(stat)) {
            fe.stats.delete(stat); fe.preferredStats.add(stat);    // liked → preferred
          } else {
            fe.stats.add(stat);                                     // off → liked
          }
          render();
        });
      });
      body.querySelectorAll("[data-qstat]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const fc = state.filters.get(state.activeFilterKey); if (!fc) return;
          const stat = btn.dataset.qstat;
          if (fc.preferredStats.has(stat)) {
            fc.preferredStats.delete(stat); fc.stats.delete(stat); // preferred → off
          } else if (fc.stats.has(stat)) {
            fc.stats.delete(stat); fc.preferredStats.add(stat);    // liked → preferred
          } else {
            fc.stats.add(stat);                                     // off → liked
          }
          saveFilters(); render();
        });
      });
      body.querySelectorAll("[data-mbstat]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const stat = btn.dataset.mbstat; if (!state.filterEdit) return;
          const nameEl = document.getElementById("sgFeName");
          if (nameEl) state.filterEdit.name = nameEl.value;
          const cur  = state.filterEdit.multiBonus[stat] ?? 0;
          const next = (cur + 1) % 4;
          if (next === 0) delete state.filterEdit.multiBonus[stat];
          else state.filterEdit.multiBonus[stat] = next;
          render();
        });
      });
      document.getElementById("sgFeAdd")?.addEventListener("click", () => {
        const name = `Filter ${state.filters.size+1}`;
        state.filters.set(name, mkFC([]));
        state.filterEdit = { key:name, name, stats:new Set(), preferredStats:new Set(), multiBonus:{} };
        saveFilters(); render();
      });
      body.querySelectorAll("[data-preset]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const fc = state.filters.get(state.activeFilterKey); if (!fc) return;
          const keys = FILTER_PRESETS[btn.dataset.preset] ?? [];
          fc.stats.clear(); keys.forEach(k=>fc.stats.add(k));
          saveFilters(); render();
        });
      });
    }

    if (state.activeTab==="gear") {
      body.querySelector("#sgModeSlot")?.addEventListener("click", () => { state.gearMode="slot"; render(); });
      body.querySelector("#sgModeCat")?.addEventListener("click",  () => { state.gearMode="category"; render(); });
      body.querySelector("#sgHlAll")?.addEventListener("click", () => {
        const allCats = CATEGORIES.map(c => c.key);
        if (allCats.every(k => state.highlightCats.has(k))) state.highlightCats.clear();
        else allCats.forEach(k => state.highlightCats.add(k));
        applyBagHighlights(); render();
      });
      body.querySelectorAll("[data-hlcat]").forEach(btn => {
        btn.addEventListener("click", () => {
          const cat = btn.dataset.hlcat;
          if (state.highlightCats.has(cat)) state.highlightCats.delete(cat);
          else state.highlightCats.add(cat);
          applyBagHighlights();
          render();
        });
      });
      body.querySelectorAll(".sg-cat-header").forEach((header) => {
        header.addEventListener("click", () => {
          const catKey  = header.closest(".sg-cat-section")?.dataset.cat;
          const catBody = header.nextElementSibling;
          const toggle  = header.querySelector(".sg-cat-toggle");
          const nowCollapsed = catBody.classList.toggle("collapsed");
          if (toggle) toggle.textContent = nowCollapsed ? "▸" : "▾";
          if (catKey) state.catOpen[catKey] = !nowCollapsed;
        });
      });
    }

    if (state.activeTab==="market") {
      body.querySelector("#sgMktHideFuture")?.addEventListener("click", () => {
        state.marketHideFuture = !state.marketHideFuture;
        render();
      });
    }

    if (state.activeTab==="team") {
      body.querySelectorAll(".sg-team-header").forEach(header => {
        header.addEventListener("click", e => {
          if (e.target.closest(".sg-team-del")) return;
          const pid     = header.closest("[data-team-pid]")?.dataset.teamPid;
          const body_   = header.nextElementSibling;
          const toggle  = header.querySelector(".sg-cat-toggle");
          const nowOpen = body_.classList.toggle("collapsed") === false;
          if (toggle) toggle.textContent = nowOpen ? "▾" : "▸";
          if (pid) teamOpen[pid] = nowOpen;
        });
      });
      body.querySelectorAll(".sg-team-del").forEach(btn => {
        btn.addEventListener("click", e => {
          e.stopPropagation();
          const pid = btn.dataset.teamDel;
          if (pid) { delete teamProfiles[pid]; saveTeamProfiles(); render(); }
        });
      });
      body.querySelectorAll(".sg-team-fchip").forEach(btn => {
        btn.addEventListener("click", e => {
          e.stopPropagation();
          const pid  = btn.dataset.teamFset;
          const fkey = btn.dataset.fkey;
          if (pid && fkey && teamProfiles[pid]) {
            teamProfiles[pid].filterKey = fkey;
            saveTeamProfiles();
            render();
          }
        });
      });
    }
  }

  /**************************************************************************
   * TICK & BOOT
   **************************************************************************/

  function tick() {
    readPlayerBar();
    readCharView();
    readInventoryState();
    readMarketListings();
    applyBagHighlights();
    applyMarketBadges();
    render();
  }

  function setupCharViewObserver() {
    new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.classList?.contains("char-view") || node.querySelector?.(".char-view")) {
            readCharView();
            render();
            return;
          }
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  function boot() { loadStats(); installUI(); setupTooltipObserver(); setupInspectObserver(); setupCharViewObserver(); tick(); setInterval(tick, 1000); }
    return {
      ...definition,
      init(app) { _moduleApp = app; boot(); },
      render() {}
    };
  }

  window.VoidIdleModules = window.VoidIdleModules || {};
  window.VoidIdleModules['loot-helper'] = createLootHelperModule({
    id:          'loot-helper',
    name:        '⚡ Loot Helper',
    icon:        '⚡',
    description: 'Stats, DPS, EHP, gear comparison, roll quality, and multi-filter scoring.',
    version:     '8.24.0',
    category:    'fighter',
  });
})();