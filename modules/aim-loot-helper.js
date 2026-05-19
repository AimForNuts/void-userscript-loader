(function () {
  'use strict';

  function createAimLootHelperModule(definition) {

  let _tickInterval = null;
  let _tooltipObs   = null;
  let _inspectObs   = null;
  let _charViewObs  = null;
  let _cssStyleEl   = null;
  let _hlStyleEl    = null;
  let _hlFadeTimer  = null;
  let _hlFadeEls    = [];

  /**************************************************************************
   * CONSTANTS
   **************************************************************************/

  const MODULE_VERSION = '8.65.0';

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
  const RARITY_STAT_SLOTS        = { COMMON:1, RARE:2, EPIC:3, LEGENDARY:4, MYTHIC:5 };
  // Weapons have 1 fewer slot per rarity (no 4th/5th bonus slot)
  const WEAPON_RARITY_STAT_SLOTS = { COMMON:1, RARE:1, EPIC:2, LEGENDARY:3, MYTHIC:4 };

  // Primary stat multiplier by rarity (applied on top of base × tier)
  const RARITY_MULT = { COMMON:1.00, RARE:1.10, EPIC:1.25, LEGENDARY:1.40, MYTHIC:1.85 };

  // Forge multipliers on primary stat only
  const FORGE_MULT = { moonforged:1.20, sunforged:1.50 };

  // Primary stat for each slot — quality% on primary = rolled / (subTierAdjustedMax × rarity_mult × forge_mult)
  // Note: heavy armor Hands primary is DEF (3–4 at T1), not ATK. Light Hands keeps ATK.
  const SLOT_PRIMARY_STAT = {
    Weapon:"atk", Hands:"atk",  // heavy Hands → "def" (see PRIMARY_BASE_RANGES_LIGHT["Heavy Hands (DEF)"])
    Shield:"def", Chest:"def", Helmet:"def", Shoulders:"def", Legs:"def", Boots:"def",
    Amulet:"hp",
    Ring:null,  // random: atk / def / hp
  };

  // Primary base ranges — Sub II anchor values per tier (redesign 2026-05-03).
  // Sub I = ÷1.08, Sub III = ×1.08. Roll range: 80–100% of base, then × rarity_mult × forge_mult.
  // Heavy armor shown; light armor is ~25-33% lower on DEF slots (see PRIMARY_BASE_RANGES_LIGHT).
  const PRIMARY_BASE_RANGES = {
    "Sword/Bow/Spear": [[10,13],[15,20],[24,29],[34,46],[52,69],[81,105],[122,159],[184,241],[282,366]],
    "Staff/Harp":      [[ 8,10],[12,15],[19,24],[28,34],[43,52],[ 64, 81],[ 97,122],[147,184],[225,282]],
    "Fan":             [[ 9,11],[14,16],[21,26],[32,38],[48,58],[ 72, 88],[110,135],[167,204],[253,309]],
    "Hands/Ring(ATK)": [[ 2, 3],[ 3, 4],[ 5, 7],[ 6,10],[11,17],[ 16, 24],[ 24, 37],[ 37, 56],[ 57, 84]],
    "Shield/Heavy Chest":  [[ 6, 8],[ 9,12],[14,19],[20,28],[32,43],[ 48, 64],[ 73, 97],[111,148],[170,225]],
    "Heavy Helmet/Shoulders/Legs/Boots/Ring(DEF)":
                       [[ 4, 5],[ 7, 8],[ 9,12],[14,18],[21,26],[ 33, 40],[ 49, 62],[ 74, 93],[112,141]],
    "Amulet/Ring(HP)": [[10,13],[15,20],[24,29],[34,46],[52,69],[81,105],[122,159],[184,241],[282,366]],
  };

  // Light armor DEF primary is ~20-33% lower than heavy. T1 values from doc; T2-T9 scale similarly.
  const PRIMARY_BASE_RANGES_LIGHT = {
    "Light Chest":                    [[ 4, 6],[ 6, 9],[10,13],[14,20],[23,30],[34,45],[52,69],[ 79,105],[120,159]],
    "Light Helmet/Shoulders/Legs/Boots": [[ 3, 4],[ 5, 6],[ 7, 9],[11,14],[16,20],[26,31],[38,48],[ 58, 72],[ 87,110]],
    "Heavy Hands (DEF)":              [[ 3, 4],[ 3, 4],[ 5, 7],[ 6,10],[11,17],[ 16, 24],[ 24, 37],[ 37, 56],[ 57, 84]],
  };

  // Sub-tier gear-req level breakpoints (redesign 2026-05-03).
  // Quality = rolled / (subTierAdjustedMax × rarity_mult × forge_mult)
  // Sub I = anchor ÷ 1.08, Sub II = anchor (table values), Sub III = anchor × 1.08
  const SUB_TIER_BREAKPOINTS = [
    // [tier, subI_gearReqLv, subII_gearReqLv, subIII_gearReqLv]
    [1,   1,   8,  13],
    [2,   7,  12,  17],
    [3,  21,  27,  33],
    [4,  37,  44,  51],
    [5,  55,  63,  71],
    [6,  75,  83,  91],
    [7,  95, 103, 111],
    [8, 115, 125, 135],
    [9, 139, 151, 163],
  ];

  // Returns { tier, sub (1/2/3), factor (÷1.08 / ×1 / ×1.08) } from a gear-req level.
  function subTierFromGearReq(gearReq) {
    for (let i = SUB_TIER_BREAKPOINTS.length - 1; i >= 0; i--) {
      const [tier, s1, s2, s3] = SUB_TIER_BREAKPOINTS[i];
      if (gearReq >= s3) return { tier, sub: 3, factor: 1.08 };
      if (gearReq >= s2) return { tier, sub: 2, factor: 1.00 };
      if (gearReq >= s1) return { tier, sub: 1, factor: 1 / 1.08 };
    }
    return { tier: 1, sub: 1, factor: 1 / 1.08 };
  }

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
    goldFind:   { min:8,   max:10,  step:1   },
    hpOnKill:   { min:4,   max:6,   step:1   },
    manaOnKill: { min:3,   max:5,   step:1   },
    execute:    { min:5,   max:7,   step:1   },
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
    bow:2.0, crossbow:3.5, harp:2.0, fan:1.8,
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
  // Weapon types that cannot equip a shield (offhand) — spear and fan can
  const NO_SHIELD_WEAPONS    = new Set(["bow","crossbow","harp","staff","wand","scepter","scythe","sword","axe","mace","dagger"]);
  // Weapon types that can wear heavy armor — spear and fan only; all others light only
  const CAN_WEAR_HEAVY_ARMOR = new Set(["spear","fan"]);

  const CATEGORIES = [
    { key:"bis",  label:"BiS"     },
    { key:"top",  label:"Top"     },
    { key:"good", label:"Good"    },
    { key:"sal",  label:"Salvage" },
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
    { key:"goldFind",   label:"Gold"       },
    { key:"hpOnKill",   label:"HP/k"       },
    { key:"manaOnKill", label:"Mana/k"     },
    { key:"execute",    label:"Exec."      },
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
    "CRIT%":       "critChance",
    "CRIT DMG":    "critDmg",
    "MANA REGEN":  "manaRegen",
    "MANAREGEN":   "manaRegen",
    "GOLD FIND":   "goldFind",
    "GOLDFIND":    "goldFind",
    "HP ON KILL":  "hpOnKill",
    "HPONKILL":    "hpOnKill",
    "LIFE ON KILL":"hpOnKill",
    "MANA ON KILL":"manaOnKill",
    "MAONKILL":    "manaOnKill",
    "EXECUTE":     "execute",
    "EXEC":        "execute",
    "EXECUTE DMG": "execute",
  };

  const DEFAULT_FILTERS = [
    { name:"Bow",   mustHave:["atk"],       preferred:["atkSpeed","critChance"], optional:["allStats"],   avoid:["def","healPower"] },
    { name:"Harp",  mustHave:["atk"],       preferred:["cdr","allStats"],        optional:["critChance"], avoid:["def"] },
    { name:"Spear", mustHave:["def"],       preferred:["manaRegen"],             optional:[],             avoid:["healPower"] },
    { name:"Staff", mustHave:["cdr"],       preferred:["critChance","manaRegen"],optional:[],             avoid:["def","healPower"] },
    { name:"Loot",  mustHave:["dropRate"],  preferred:[],                        optional:["allStats"],   avoid:[] },
  ];

  const SLOT_STAT_POOLS = {
    // Weapons (primary = atk)
    "sword":   new Set(["atk","critChance","critDmg","hp","def","atkSpeed","allStats","hpOnKill","manaOnKill","execute"]),
    "spear":   new Set(["atk","critChance","critDmg","hp","def","atkSpeed","allStats","hpOnKill","manaOnKill","execute"]),
    "bow":     new Set(["atk","critChance","critDmg","hp","atkSpeed","allStats","hpOnKill","manaOnKill","execute"]),
    "staff":   new Set(["atk","mana","healPower","cdr","hp","atkSpeed","allStats","hpOnKill","manaOnKill","execute"]),
    "harp":    new Set(["atk","mana","healPower","cdr","hp","atkSpeed","allStats","hpOnKill","manaOnKill","execute"]),
    "fan":     new Set(["atk","mana","critChance","critDmg","cdr","atkSpeed","allStats","hpOnKill","manaOnKill","execute"]),
    // Light armor
    "helmet:light":    new Set(["def","mana","cdr","critChance","atkSpeed","manaRegen","allStats","hpOnKill","manaOnKill"]),
    "shoulders:light": new Set(["def","cdr","critChance","atkSpeed","manaRegen","allStats","hpOnKill","execute"]),
    "chest:light":     new Set(["def","mana","cdr","critChance","critDmg","atkSpeed","manaRegen","dropRate","allStats","hpOnKill"]),
    "hands:light":     new Set(["atk","critChance","critDmg","cdr","atkSpeed","manaRegen","allStats","hpOnKill","goldFind","execute"]),
    "legs:light":      new Set(["def","mana","cdr","critDmg","atkSpeed","manaRegen","allStats","hpOnKill","manaOnKill"]),
    "boots:light":     new Set(["def","mana","cdr","atkSpeed","critChance","manaRegen","allStats","hpOnKill","goldFind"]),
    "shield":          new Set(["def","mana","cdr","manaRegen","allStats"]),
    // Heavy armor (Spear only)
    "helmet:heavy":    new Set(["def","hp","healPower","manaRegen","allStats","hpOnKill","manaOnKill"]),
    "shoulders:heavy": new Set(["def","hp","healPower","manaRegen","allStats","hpOnKill","execute"]),
    "chest:heavy":     new Set(["def","hp","healPower","manaRegen","allStats","hpOnKill"]),
    "hands:heavy":     new Set(["def","hp","healPower","manaRegen","allStats","hpOnKill","goldFind","execute"]),
    "legs:heavy":      new Set(["def","hp","healPower","manaRegen","allStats","hpOnKill","manaOnKill"]),
    "boots:heavy":     new Set(["def","hp","healPower","manaRegen","allStats","hpOnKill","goldFind"]),
    // Accessories
    "amulet": new Set(["mana","healPower","cdr","critChance","atkSpeed","dropRate","manaRegen","allStats","goldFind","hpOnKill","manaOnKill","execute"]),
    "ring":   new Set(["critChance","critDmg","mana","healPower","cdr","hp","atkSpeed","dropRate","manaRegen","allStats","goldFind","hpOnKill","manaOnKill","execute"]),
  };

  function eligibleStatsForItem(item) {
    const slot   = (item.slotType     ?? "").toLowerCase();
    const sub    = (item.weaponSubType ?? "").toLowerCase();
    const weight = (item.armorWeight  ?? "light").toLowerCase();
    if (slot === "weapon")                    return SLOT_STAT_POOLS[sub]              ?? null;
    if (slot === "amulet" || slot === "ring") return SLOT_STAT_POOLS[slot]             ?? null;
    if (slot === "shield")                    return SLOT_STAT_POOLS["shield"]         ?? null;
    return SLOT_STAT_POOLS[`${slot}:${weight}`] ?? null;
  }

  const SCORE_CONFIG = {
    mustHaveMissingPenalty:          -100,
    mustHavePresentBonus:              25,
    mustHavePowerWeight:              100,
    preferredPowerWeight:              35,
    neutralPowerWeight:                10,
    optionalPowerWeight:                3,
    preferredNegativeCapRatio:        0.4,
    preferredPositiveCapRatio:        0.6,
    preferredFallbackNegativeCap:      20,
    preferredFallbackPositiveCap:      20,
    avoidBasePenalty:                 -20,
    avoidMultiplierCompleteItem:        0,
    avoidMultiplierPreferredMissing:  0.5,
    avoidMultiplierMustHaveMissing:     1,
    bisThreshold:                       50,
    topThreshold:                       25,
    goodThreshold:                       0,
  };

  const V9_CONFIG = {
    // Gear Quality
    qualityAverageWeight: 0.70,
    qualityMedianWeight:  0.30,
    qualityStatWeights: {
      primary: 1.25,
      bonus:   1.00,
    },

    // Build Fit
    coverageWeights: {
      mustHave:  60,
      preferred: 25,
      optional:  10,
      neutral:    5,
    },
    slotEfficiencyMax:   15,
    avoidPenaltyPerStat: 20,

    // Upgrade Score
    roleWeights: {
      mustHave:  100,
      preferred:  45,
      optional:   12,
      neutral:     5,
    },
    avoidNewStatPenalty:   20,
    coverageBonusMax:      20,
    mustHaveGainedBonus:   15,
    mustHaveLostPenalty:   35,
    statFloorQuality:      50,

    // Tier thresholds
    tiers: {
      quality:  { perfect: 95, excellent: 85, good: 70, usable: 50 },
      fit:      { perfect: 95, strong: 80, partial: 60, weak: 30 },
      upgrade: {
        major: 60,
        upgrade: 25,
        minor: 10,
        sidegradeMin: -9,
        minorDowngradeStart: -10, // top of Minor Downgrade band; equals sidegradeMin - 1
        downgrade: -25,           // floor: scores <= this are Downgrade (Minor Downgrade covers > downgrade)
      },
    },

    // Migration flag
    SCORING_MODEL: 'v9',
  };

  /**************************************************************************
   * FILTER STORAGE
   **************************************************************************/

  function mkFC(stats, enabled=true, multiBonus={}, preferredStats=[], optional=[], avoid=[], requireEnlightened=false) {
    return { stats: new Set(stats), enabled, multiBonus, preferredStats: new Set(preferredStats), optional: new Set(optional), avoid: new Set(avoid), requireEnlightened };
  }

  function loadFilters() {
    try {
      const raw = JSON.parse(localStorage.getItem("aim_sgFilters") || "null");
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        const map = new Map();
        for (const [k, v] of Object.entries(raw)) {
          if (Array.isArray(v)) {
            // migrate old format
            map.set(k, mkFC(v));
          } else if (v && typeof v === "object") {
            map.set(k, mkFC(v.stats ?? [], v.enabled !== false, v.multiBonus ?? {}, v.preferredStats ?? [], v.optional ?? [], v.avoid ?? [], v.requireEnlightened ?? false));
          }
        }
        if (map.size > 0) return map;
      }
    } catch {}
    const map = new Map();
    let firstFilter = true;
    for (const f of DEFAULT_FILTERS) {
      map.set(f.name, mkFC(f.preferred, firstFilter, {}, f.mustHave, f.optional, f.avoid));
      firstFilter = false;
    }
    return map;
  }

  function saveFilters() {
    const out = {};
    for (const [k, fc] of state.filters) {
      out[k] = { stats:[...fc.stats], enabled:fc.enabled, multiBonus:fc.multiBonus, preferredStats:[...fc.preferredStats], optional:[...(fc.optional ?? [])], avoid:[...(fc.avoid ?? [])], requireEnlightened: fc.requireEnlightened ?? false };
    }
    localStorage.setItem("aim_sgFilters", JSON.stringify(out));
  }

  /**************************************************************************
   * STATS PERSISTENCE
   **************************************************************************/

  const STATS_KEY = "aim_sgStats";
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

  // Key used with _moduleApp.storage (loader adds "voididle.module.aim-loot-helper." prefix → GM storage)
  const TRACKED_KEY = "aim_sgTrackedProfiles";
  let trackedProfiles = {}; // populated by loadTrackedProfiles() during boot()

  function loadTrackedProfiles() {
    let stored = {};
    if (_moduleApp) {
      // Primary: loader's GM-backed storage
      stored = _moduleApp.storage.get(TRACKED_KEY) ?? {};
      // One-time migration: promote old direct localStorage key into GM storage
      if (!Object.keys(stored).length) {
        try {
          const legacy = JSON.parse(localStorage.getItem("aim_sgTrackedProfiles") || "{}");
          if (Object.keys(legacy).length) {
            stored = legacy;
            _moduleApp.storage.set(TRACKED_KEY, stored);
            localStorage.removeItem("aim_sgTrackedProfiles");
          }
        } catch {}
      }
    } else {
      // Standalone mode (no loader): fall back to localStorage
      try { stored = JSON.parse(localStorage.getItem("aim_sgTrackedProfiles") || "{}"); } catch {}
    }

    // Migrate old sgTeamProfiles format
    const old = (() => { try { return JSON.parse(localStorage.getItem("aim_sgTeamProfiles") || "{}"); } catch { return {}; } })();
    for (const [pid, p] of Object.entries(old)) {
      if (!stored[pid] && p.equippedMap) {
        stored[pid] = {
          playerId: pid, username: p.username,
          active: true, filterKey: p.filterKey ?? "",
          snapshots: [{ ts: p.savedAt ?? Date.now(), levelText: p.levelText ?? "", equippedMap: p.equippedMap, charStats: p.charStats ?? {} }],
        };
      }
    }
    for (const p of Object.values(stored)) {
      if (p.teamMember === undefined) p.teamMember = true;
    }

    Object.assign(trackedProfiles, stored);
    storageUsedKB = estimateStorageKB(); // refresh after any migration cleared localStorage
  }

  const STORAGE_WARN_KB  = 4000;
  const STORAGE_LIMIT_KB = 5120;
  const MAX_SNAPSHOTS    = 50;

  function estimateStorageKB() {
    let total = 0;
    try { for (const k of Object.keys(localStorage)) total += (localStorage.getItem(k)?.length ?? 0) * 2; } catch {}
    return Math.round(total / 1024);
  }
  let storageUsedKB = estimateStorageKB();

  function saveTrackedProfiles() {
    try {
      if (_moduleApp) {
        _moduleApp.storage.set(TRACKED_KEY, trackedProfiles);
      } else {
        localStorage.setItem("aim_sgTrackedProfiles", JSON.stringify(trackedProfiles));
      }
    } catch {}
    storageUsedKB = estimateStorageKB();
  }

  // Pending modal info keyed by playerId (for auto-save when DOM loads before API response)
  const pendingModalInfo = {};

  function latestSnap(tp) {
    return tp?.snapshots?.[tp.snapshots.length - 1] ?? null;
  }

  function recordSnapshot(playerId, username, levelText, data) {
    const equippedMap = buildEquippedMap(data.equipped);
    const charStats   = parseInspectCharStats(data);
    if (!trackedProfiles[playerId]) {
      trackedProfiles[playerId] = { playerId, username, active: true, teamMember: true, filterKey: "", snapshots: [] };
    }
    const tp = trackedProfiles[playerId];
    tp.username = username;
    tp.snapshots.push({ ts: Date.now(), levelText, equippedMap, charStats });
    if (tp.snapshots.length > MAX_SNAPSHOTS) tp.snapshots.shift();
    saveTrackedProfiles();
    if (state.activeTab === "team") render();
  }

  // Pending inspect data keyed by playerId (captured from fetch intercept)
  const pendingInspect = {};

  // Hook fetch to capture inspect responses, auth headers, mail/salvage endpoints.
  // Re-entrant: safe to call again if the game overwrites window.fetch after us.
  function installFetchHook() {
    if (window.fetch?._aimHooked) return; // already our hook on top
    const _orig = window.fetch;
    const hook = async function(...args) {
      const url = typeof args[0] === "string" ? args[0] : (args[0]?.url ?? "");
      if (/\/api\//i.test(url)) rememberApiAuthFromFetchArgs(args);
      const res = await _orig.apply(this, args);
      const method = String(args[1]?.method || args[0]?.method || "GET").toUpperCase();
      if (/\/api\/mail/i.test(url) && ["POST","PUT","PATCH"].includes(method)) {
        let parsed = null;
        try {
          const body = args[1]?.body || args[0]?.body || "";
          parsed = typeof body === "string" ? JSON.parse(body || "{}") : null;
        } catch {}
        rememberMailEndpoint(url, parsed, method);
      }
      if (/salvage/i.test(url) && ["POST","PUT","PATCH","DELETE"].includes(method)) {
        let parsed = null;
        try {
          const body = args[1]?.body || args[0]?.body || "";
          parsed = typeof body === "string" ? JSON.parse(body || "{}") : null;
        } catch {}
        rememberSalvageEndpoint(url, parsed, method);
      }
      const m = url.match(/\/api\/player\/([^/?]+)\/inspect/);
      if (m) {
        res.clone().json().then(data => {
          const equipped = Array.isArray(data.equipped) ? data.equipped
                         : Array.isArray(data.equippedItems) ? data.equippedItems
                         : Array.isArray(data.items) ? data.items : null;
          if (equipped) {
            const payload = { ...data, equipped };
            const urlId = (data.id || m[1]).toLowerCase();
            pendingInspect[urlId] = payload;
            const infoKey = Object.keys(pendingModalInfo).find(k => k.toLowerCase() === urlId);
            const info = infoKey ? pendingModalInfo[infoKey] : null;
            if (info) {
              recordSnapshot(urlId, info.username, info.levelText, payload);
              info.refreshBadge?.();
            }
          }
        }).catch(() => {});
      }
      return res;
    };
    hook._aimHooked = true;
    window.fetch = hook;
  }
  installFetchHook();
  // Reinstall after game finishes its own async setup (which may overwrite window.fetch)
  setTimeout(installFetchHook, 1500);
  setTimeout(installFetchHook, 4000);

  const API_AUTH_HEADERS_KEY = "voididle.aim.apiAuthHeaders.v1";

  // document.defaultView is always the real page Window, bypassing the Tampermonkey
  // sandbox window proxy. Use it for localStorage and fetch so we access the same
  // storage and fetch interceptors as the game itself.
  const _pageLS    = document.defaultView?.localStorage ?? localStorage;
  const _pageFetch = document.defaultView?.fetch?.bind(document.defaultView) ?? fetch;

  function headersToPlainObject(headersLike) {
    const out = {};
    if (!headersLike) return out;
    if (typeof headersLike.entries === "function") {
      for (const [k, v] of headersLike.entries()) out[k.toLowerCase()] = v;
    } else if (typeof headersLike === "object") {
      for (const [k, v] of Object.entries(headersLike)) out[String(k).toLowerCase()] = v;
    }
    return out;
  }

  function rememberApiAuthHeaders(headersLike) {
    const h = headersToPlainObject(headersLike);
    const auth = h.authorization || h["x-auth-token"] || h["x-access-token"] || h["x-supabase-auth"] || h["apikey"];
    if (!auth) return;
    const keep = {};
    for (const key of ["authorization","x-auth-token","x-access-token","x-supabase-auth","apikey","x-csrf-token","x-xsrf-token"]) {
      if (h[key]) keep[key] = h[key];
    }
    try { _pageLS.setItem(API_AUTH_HEADERS_KEY, JSON.stringify({ headers: keep, savedAt: Date.now() })); } catch {}
  }

  function rememberApiAuthFromFetchArgs(args) {
    try {
      const initHeaders = args?.[1]?.headers;
      const requestHeaders = args?.[0]?.headers;
      rememberApiAuthHeaders(initHeaders || requestHeaders);
    } catch {}
  }

  function getApiAuthHeaders() {
    // Try previously sniffed headers first
    try {
      const saved = JSON.parse(_pageLS.getItem(API_AUTH_HEADERS_KEY) || "null");
      if (saved?.headers && typeof saved.headers === "object") {
        const out = {};
        for (const [key, value] of Object.entries(saved.headers)) out[key] = value;
        if (Object.keys(out).length) return out;
      }
    } catch {}
    // Scan all localStorage entries for any JWT — bare string or nested object
    try {
      for (let i = 0; i < _pageLS.length; i++) {
        const key = _pageLS.key(i);
        if (!key) continue;
        const raw = _pageLS.getItem(key);
        if (!raw) continue;
        // Bare JWT string (e.g. localStorage key "authToken")
        if (raw.startsWith("eyJ")) return { authorization: `Bearer ${raw}` };
        // JSON object containing access_token / token / nested session
        let val;
        try { val = JSON.parse(raw); } catch { continue; }
        if (!val || typeof val !== "object") continue;
        const token =
          val.access_token                 ||
          val.token                        ||
          val.currentSession?.access_token ||
          val.session?.access_token;
        if (token && typeof token === "string" && token.startsWith("eyJ")) {
          return { authorization: `Bearer ${token}` };
        }
      }
    } catch {}
    return {};
  }

  async function postJson(url, body, method = "POST") {
    const authHeaders = getApiAuthHeaders();
    const res = await _pageFetch(url, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify(body),
    });
    const text = await res.text().catch(() => "");
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch {}
    if (!res.ok || json?.ok === false || json?.success === false) {
      const msg = json?.error || json?.message || text || `${res.status} ${res.statusText}`;
      throw new Error(msg);
    }
    return json ?? { ok: true, raw: text };
  }

  function compactItemLabel(item) {
    if (!item) return "Unknown item";
    const forge = item.forge ? `${item.forge} ` : "";
    const plus  = item.forgeLevel ? ` +${item.forgeLevel}` : "";
    return `${forge}${item.name}${plus}`.trim();
  }

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

  // Fraction of max mana regenerated per 10s via pool-based sources (ability tree %, auras, etc.)
  // Derived by subtracting direct gear regen from the char-screen total, then dividing by max mana.
  function poolRegenFraction() {
    if (!state.maxManaStat || !state.manaRegen) return 0;
    let gearDirect = 0;
    for (const item of Object.values(state.equipped)) {
      const src = item.stats ?? {};
      for (const [k, v] of Object.entries(src)) {
        if (k === "_qualities") continue;
        if (normStatKey(k) === "manaRegen") gearDirect += v;
      }
    }
    return Math.max(0, state.manaRegen - gearDirect) / state.maxManaStat;
  }

  function selfCtx() {
    if (state.atkPhys != null && state.atkSpeed != null) return state;
    if (!Object.keys(state.equipped).length) return state;
    return deriveCharStatsFromProfile({ equippedMap: state.equipped, levelText: String(state.level ?? "") });
  }

  function marketCtx() {
    if (!state.marketCtxPlayerId) return selfCtx();
    const tp   = trackedProfiles[state.marketCtxPlayerId];
    const snap = latestSnap(tp);
    if (!snap) return selfCtx();
    return deriveCharStatsFromProfile({ equippedMap: snap.equippedMap, levelText: snap.levelText });
  }

  function marketCtxFilterKey() {
    if (!state.marketCtxPlayerId) return state.activeFilterKey;
    const tp = trackedProfiles[state.marketCtxPlayerId];
    return tp?.filterKey ?? state.activeFilterKey;
  }

  function rebuildMarketItems() {
    if (!state.marketRawData.length) { state.marketItems = []; return; }

    let equippedMap, filterKey, ctxLevel;
    if (state.marketCtxPlayerId && trackedProfiles[state.marketCtxPlayerId]) {
      const tp   = trackedProfiles[state.marketCtxPlayerId];
      const snap = latestSnap(tp);
      equippedMap = snap?.equippedMap ?? {};
      filterKey   = tp.filterKey ?? state.activeFilterKey;
      ctxLevel    = parseInt((snap?.levelText ?? "").replace(/\D/g, ""), 10) || 0;
    } else {
      state.marketCtxPlayerId = null;
      equippedMap = state.equipped;
      filterKey   = state.activeFilterKey;
      ctxLevel    = state.level ?? 0;
    }

    const mwt = Math.floor(ctxLevel / 10) + 1;
    state.marketItems = state.marketRawData.map(r => {
      const isFutureTier = r.gearReqLevel != null
        ? r.gearReqLevel > ctxLevel          // sub-tier-aware: gear-req level exceeds player level
        : (r.itemTier - mwt) > 1;            // fallback: tier proxy until server exposes gearReqLevel
      return { ..._buildBagItem(r.item, equippedMap, filterKey),
               listingId: r.listingId, price: r.price,
               sellerName: r.sellerName, itemTier: r.itemTier, isFutureTier };
    });
    state.marketCtxMwt = mwt;
  }

  function buildEquippedMap(equippedArray) {
    const map = {};
    for (const item of (equippedArray || [])) {
      if (!item.equippedSlot) continue;
      const raw  = item.equippedSlot;
      const slot = raw === "ring1"   ? "Ring 1"
                 : raw === "ring2"   ? "Ring 2"
                 : raw === "offhand" ? "Shield"
                 : raw.charAt(0).toUpperCase() + raw.slice(1);
      map[slot] = item;
    }
    return map;
  }

  /**************************************************************************
   * STATE
   **************************************************************************/

  const _filters = loadFilters();
  const _storedKey = localStorage.getItem("aim_sgActiveFilter") || "";

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
    healPower:null, lifesteal:null, manaRegen:null, cdr:null,
    xpBonus:null, goldBonus:null, dropRate:null, allStats:null,
    kills:null, zonesVisited:null,
    skills:[],

    equipped:{}, equippedCachedAt:null,
    bagItems:[], bagItemsRaw:[], bagVisible:false,
    catOpen:{ top:true, up:true, neu:false, sal:false },
    highlightCats: new Set(),
    highlightGrades: new Set(),
    marketItems: [], marketRawData: [], marketVisible: false, marketHideFuture: false,
    marketCtxPlayerId: null,
    marketCtxMwt: 1,
    teamSendStatus: "", teamSendBusy: false, teamSendIncludeTop: false,
    salvageStatus: "", salvageBusy: false, salvageSelectedIds: new Set(), salvageExcludeSTier: false,
    teamManage: false,
    pinnedItemId: null,
    debugExpandedItems: new Set(),
  };

  /**************************************************************************
   * HELPERS
   **************************************************************************/

  function parseNum(raw) {
    if (raw == null) return NaN;
    let s = String(raw).trim(), mult = 1;
    if (/k$/i.test(s)) { mult = 1_000;     s = s.slice(0,-1); }
    if (/m$/i.test(s)) { mult = 1_000_000; s = s.slice(0,-1); }
    // Strip suffixes like "/ 10s" before chars collapse numbers together ("33.7 / 10s" → "33.7")
    s = s.replace(/^([+\-]?[\d.,]+)[^0-9.,].*$/, "$1");
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

  function statChipInfo(stat, fc) {
    if (fc.preferredStats?.has(stat)) return { cls:"sg-pref-chip must-have",  prefix:"★ " };
    if (fc.stats?.has(stat))          return { cls:"sg-pref-chip preferred",  prefix:"♥ " };
    if (fc.optional?.has(stat))       return { cls:"sg-pref-chip optional",   prefix:"◎ " };
    if (fc.avoid?.has(stat))          return { cls:"sg-pref-chip avoid",      prefix:"✗ " };
    return                                   { cls:"sg-pref-chip",             prefix:""  };
  }

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
    // .tt-sub direct text node: "MYTHIC · AMULET" or "MYTHIC MOONFORGED · SWORD"
    const subEl = el.querySelector(".tt-sub");
    let subText = "";
    if (subEl) {
      for (const node of subEl.childNodes) {
        if (node.nodeType === 3) subText += node.textContent;
      }
    }
    subText = subText.trim();
    const parts    = subText.split("·").map(s => s.trim());
    const rarity   = (parts[0] ?? "").replace(/\b(?:moon|sun|star)forged\b/gi, "").trim();
    const typePart = parts[1] ?? "";
    const slot     = TOOLTIP_TYPE_TO_SLOT[typePart] ?? null;

    const ttStats      = {};  // base roll values (pre-enhancement)
    const ttTotalStats = {};  // displayed total values (post-enhancement/forge)
    const ttQualities  = {};
    el.querySelectorAll(".tt-stat-row").forEach(row => {
      const label   = row.querySelector(".tt-stat-label")?.textContent?.trim()?.toUpperCase();
      const valueEl = row.querySelector(".tt-stat-value");
      if (!label || !valueEl) return;
      // Direct text nodes of value element → displayed total (skips quality/base child spans)
      const rawText    = [...valueEl.childNodes]
        .filter(n => n.nodeType === 3).map(n => n.textContent).join("").trim();
      const valText    = valueEl.textContent ?? "";
      const totalMatch = rawText.match(/[+-]?[0-9]+\.?[0-9]*/) ?? valText.match(/[+-]?[0-9]+\.?[0-9]*/);
      const totalValue = totalMatch ? parseFloat(totalMatch[0]) : NaN;
      // Base value: two-group format "(65%)(51)" → base=51; fallback single-group "(4)" → base=4
      const rowText    = row.textContent ?? "";
      const baseMatch  = rowText.match(/\([^)]+\)\s*\(([0-9.]+%?)\)/)
                      ?? rowText.match(/\(([0-9]+(?:\.[0-9]+)?)%?\)/);
      const baseValue  = baseMatch ? parseFloat(baseMatch[1]) : totalValue;
      const key = TOOLTIP_STAT_MAP[label];
      if (key && !isNaN(totalValue)) {
        ttStats[key]      = baseValue;
        ttTotalStats[key] = totalValue;
        const qMatch = row.querySelector(".tt-stat-quality")?.textContent?.match(/(\d+)/);
        if (qMatch) ttQualities[key] = parseInt(qMatch[1]) / 100;
      }
    });

    const allText = el.textContent ?? "";

    // Forge tier — check sub text and full text (sub may read "MYTHIC MOONFORGED · SWORD")
    let forgeTier = null;
    if (/sunforged/i.test(allText))  forgeTier = "sunforged";
    else if (/moonforged/i.test(allText)) forgeTier = "moonforged";
    else if (/starforged/i.test(allText)) forgeTier = "starforged";

    // Enhancement level (+1–+20) — find "+N" in tooltip header before any stat rows
    // Strip stat-row text so we don't confuse "+11 ATK" with a +11 enhancement
    let plusLevel = 0;
    const firstStatRow = el.querySelector(".tt-stat-row");
    const headerText = firstStatRow
      ? allText.substring(0, allText.indexOf(firstStatRow.textContent.trim())).trim()
      : allText;
    const plusMatch = headerText.match(/\+(\d{1,2})(?!\d)/);
    if (plusMatch) plusLevel = parseInt(plusMatch[1]);

    // Armor weight
    let armorWeight = null;
    if (/heavy\s*armor/i.test(allText)) armorWeight = "heavy";
    else if (/light\s*armor/i.test(allText)) armorWeight = "light";

    return { rarity, slot, typePart, stats: ttStats, totalStats: ttTotalStats,
             qualities: ttQualities, forgeTier, plusLevel, armorWeight };
  }

  // Enhancement stat multiplier for +1–+20 enhancement levels
  function calcEnhMult(n) {
    if (n <= 0)  return 1;
    if (n <= 5)  return 1 + n * 0.05;
    if (n <= 10) return 1.25 + (n - 5)  * 0.08;
    if (n <= 15) return 1.65 + (n - 10) * 0.12;
    return                2.25 + (n - 15) * 0.18;
  }

  // Primary stat key for a given slot (forge mult only applies to primary)
  function primaryStatForSlot(slot, armorWeight) {
    if (slot === "Weapon") return "atk";
    if (slot === "Hands")  return armorWeight === "heavy" ? "def" : "atk";
    if (slot === "Amulet") return "hp";
    if (slot === "Ring")   return null;
    return "def"; // Shield, Chest, Helmet, Shoulders, Legs, Boots
  }

  function injectChatComparison(el) {
    if (el.querySelector(".sg-chat-compare")) return;

    const { rarity, slot, typePart, stats: ttStats, qualities: ttQualities,
            armorWeight } = parseChatTooltip(el);
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

    // Equipped base stats (raw rolls) — used for all comparisons
    const eqBaseStats = {};
    for (const [k, v] of Object.entries(equippedItem.stats)) {
      if (k === "_qualities") continue;
      eqBaseStats[normStatKey(k)] = v;
    }

    // Diffs: chat item base stats vs equipped base stats
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
    const chatSlotTable = slot === "Weapon" ? WEAPON_RARITY_STAT_SLOTS : RARITY_STAT_SLOTS;
    const maxSlots      = chatSlotTable[rarity.toUpperCase()] ?? 4;
    const multiRollCount = Math.max(0, maxSlots - itemStatKeys.size);
    const priorityUps   = diffs.filter(d => d.isUp && activeFC.stats.has(d.stat)).length;
    const hasPriorityMR = multiRollCount > 0 && [...itemStatKeys].some(s => activeFC.stats.has(s));
    const chatEligibleStats = eligibleStatsForItem({ slotType: slot, weaponSubType: typePart?.toLowerCase(), armorWeight });
    const chatBd = calcFilterScore(ttStats, eqBaseStats, activeFC, multiRollCount, itemStatKeys, chatEligibleStats);
    const score = chatBd.finalScore;
    let { rec, cat: chatCat } = applyQualityCap(
      recommendation(score, chatBd.mustHaveMissingCount),
      categoryOf(score, chatBd.mustHaveMissingCount),
      ttQualities, multiRollCount, slot
    );
    const hasChatPrefMR = multiRollCount > 0 && [...itemStatKeys].some(s => activeFC.preferredStats.has(s));
    if (hasChatPrefMR && chatCat === "sal") {
      rec = { label:"👍 Good", cls:"rec-good" }; chatCat = "good";
    }
    // Flat-upgrade exception: if every filter stat present on this item beats equipped base → at least Good
    {
      const filterStatsOnItem = [...activeFC.stats, ...activeFC.preferredStats].filter(s => itemStatKeys.has(s));
      if (filterStatsOnItem.length > 0 && filterStatsOnItem.every(s => diffs.some(d => d.stat === s && d.isUp))) {
        if (chatCat === "sal") {
          rec = { label:"👍 Good", cls:"rec-good" }; chatCat = "good";
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
      if (chatRestricted) {
        rec = { label:"💾 Salvage", cls:"rec-sal" };
      }
    }

    const eqForge = normForge(equippedItem.forgeTier);
    const eqLabel = `${eqForge ? eqForge + " " : ""}${equippedItem.name}${equippedItem.plus_level > 0 ? " +" + equippedItem.plus_level : ""}`;

    const diffsHtml = diffs.map(d => {
      const isPref  = activeFC.stats.has(d.stat);
      const isStar  = activeFC.preferredStats.has(d.stat);
      return `<span class="sg-diff ${d.isUp?"sg-diff-up":"sg-diff-down"}${isStar?" pref-star":isPref?" pref":""}">${esc(d.text)}</span>`;
    }).join("");

    // DPS / EHP / Mana deltas — use selfCtx() so derived gear stats work even without char-screen open
    const sc = selfCtx();
    let dpsDeltaHtml = "";
    if (sc.atkPhys != null && sc.atkSpeed != null && sc.atkSpeed > 0) {
      const curDPS         = calcDPS(sc);
      const curAllStats    = sc.allStats ?? 0;
      const atkDelta       = (ttStats.atk       ?? 0) - (eqBaseStats.atk       ?? 0);
      const allStatsDelta  = (ttStats.allStats   ?? 0) - (eqBaseStats.allStats  ?? 0);
      const eqSpdPct       = eqBaseStats.atkSpeed ?? 0;
      const newSpdPct      = ttStats.atkSpeed    ?? 0;
      const baseATK        = sc.atkPhys / (1 + curAllStats / 100);
      const newAtk         = (baseATK + atkDelta) * (1 + (curAllStats + allStatsDelta) / 100);
      const _wBase         = WEAPON_BASE_SPEED[(state.equipped?.["Weapon"]?.type ?? "").toLowerCase()] ?? sc.atkSpeed;
      const _totSpd        = (_wBase / sc.atkSpeed - 1) * 100;
      const newSpd         = _wBase / (1 + (_totSpd - eqSpdPct + newSpdPct) / 100);
      const newCrit        = (sc.critChance ?? 0) + (ttStats.critChance ?? 0) - (eqBaseStats.critChance ?? 0);
      const newCritD       = (sc.critDmg    ?? 0) + (ttStats.critDmg    ?? 0) - (eqBaseStats.critDmg    ?? 0);
      if (curDPS != null && newAtk > 0 && newSpd > 0) {
        const hitRate = (sc.hitChance ?? 95) / 100;
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
      const curSurv = calcSurvivability(sc.maxHpStat, sc.def ?? 0);
      if (curSurv) {
        const curAllStats   = sc.allStats ?? 0;
        const allStatsDelta = (ttStats.allStats ?? 0) - (eqBaseStats.allStats ?? 0);
        const hpDelta       = (ttStats.hp  ?? 0) - (eqBaseStats.hp  ?? 0);
        const defDelta      = (ttStats.def ?? 0) - (eqBaseStats.def ?? 0);
        const baseHP  = sc.maxHpStat / (1 + curAllStats / 100);
        const baseDEF = (sc.def ?? 0) / (1 + curAllStats / 100);
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

    // ∆ Sustainability — shared formula with bag panel
    let manaDeltaHtml = "";
    {
      const manaDelta   = (ttStats.mana      ?? 0) - (eqBaseStats.mana      ?? 0);
      const mregenDelta = (ttStats.manaRegen ?? 0) - (eqBaseStats.manaRegen ?? 0);
      const cdrDelta    = (ttStats.cdr       ?? 0) - (eqBaseStats.cdr       ?? 0);
      const score = calcSustainScore(manaDelta, mregenDelta, cdrDelta);
      if (Math.abs(score) >= 1) {
        const sign = score >= 0 ? "+" : "";
        const col  = score > 0 ? "#60a5fa" : "#f87171";
        const SEP  = `style="padding:3px 0;border-top:1px solid rgba(255,255,255,.06);margin-top:4px"`;
        manaDeltaHtml = `<div class="sg-row" ${SEP} title="∆ MSM = (ΔRegen + ΔPool×poolFrac)×6 − CDR consumption (MP/min)"><span class="sg-key">∆ MSM</span><span style="color:${col};font-weight:700">${sign}${Math.round(score)}</span></div>`;
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
    _tooltipObs = new MutationObserver(muts => {
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (n.nodeType === 1 && n.classList?.contains("chat-item-tooltip")) {
            injectChatComparison(n);
          }
        }
      }
    });
    _tooltipObs.observe(document.body, { childList: true, subtree: true });
  }

  const CAT_HL_CLASS   = { bis:"sg-hl-bis", top:"sg-hl-top", good:"sg-hl-good", sal:"sg-hl-sal" };
  const GRADE_HL_CLASS = { S:"sg-hl-grade-s", A:"sg-hl-grade-a", B:"sg-hl-grade-b", C:"sg-hl-grade-c" };

  function applyBagHighlights() {
    [...Object.values(CAT_HL_CLASS), ...Object.values(GRADE_HL_CLASS), "sg-hl-pin"].forEach(cls =>
      document.querySelectorAll("."+cls).forEach(el => el.classList.remove(cls))
    );

    const hlMap = new Map();
    for (const item of state.bagItems) {
      const catCls   = state.highlightCats.has(item.cat) ? CAT_HL_CLASS[item.cat] : null;
      let gradeCls = null;
      if (state.highlightGrades.size) {
        const g = calcItemIntrinsicGrade(item);
        if (g && state.highlightGrades.has(g.grade)) gradeCls = GRADE_HL_CLASS[g.grade];
      }
      const cls = gradeCls ?? catCls ?? null;
      if (cls) hlMap.set(item.id, cls);
    }
    if (state.pinnedItemId != null) hlMap.set(state.pinnedItemId, "sg-hl-pin");
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

  function fadeApplyBagHighlights() {
    if (_hlFadeTimer) {
      clearTimeout(_hlFadeTimer);
      _hlFadeTimer = null;
      _hlFadeEls.forEach(el => {
        el.style.removeProperty("transition");
        el.style.removeProperty("outline-color");
        el.style.removeProperty("box-shadow");
      });
      _hlFadeEls = [];
    }

    const allHlClasses = [...Object.values(CAT_HL_CLASS), ...Object.values(GRADE_HL_CLASS), "sg-hl-pin"];
    const sel = allHlClasses.map(c => "."+c).join(",");
    const currentEls = [...document.querySelectorAll(sel)];

    if (!currentEls.length) {
      applyBagHighlights();
      return;
    }

    // Fade out current highlights
    currentEls.forEach(el =>
      el.style.setProperty("transition", "outline-color 0.25s ease, box-shadow 0.25s ease", "important")
    );
    _hlFadeEls = currentEls;

    requestAnimationFrame(() => {
      currentEls.forEach(el => {
        el.style.setProperty("outline-color", "transparent", "important");
        el.style.setProperty("box-shadow", "none", "important");
      });

      _hlFadeTimer = setTimeout(() => {
        currentEls.forEach(el => {
          allHlClasses.forEach(c => el.classList.remove(c));
          el.style.removeProperty("transition");
          el.style.removeProperty("outline-color");
          el.style.removeProperty("box-shadow");
        });

        applyBagHighlights();
        const newEls = [...document.querySelectorAll(sel)];
        _hlFadeEls = newEls;

        if (!newEls.length) {
          _hlFadeTimer = null;
          _hlFadeEls = [];
          return;
        }

        // Start from transparent so we can fade in
        newEls.forEach(el => {
          el.style.setProperty("outline-color", "transparent", "important");
          el.style.setProperty("box-shadow", "none", "important");
        });

        requestAnimationFrame(() => {
          newEls.forEach(el => {
            el.style.setProperty("transition", "outline-color 0.25s ease, box-shadow 0.25s ease", "important");
            el.style.removeProperty("outline-color");
            el.style.removeProperty("box-shadow");
          });

          _hlFadeTimer = setTimeout(() => {
            newEls.forEach(el => el.style.removeProperty("transition"));
            _hlFadeTimer = null;
            _hlFadeEls = [];
          }, 280);
        });
      }, 280);
    });
  }

  /**************************************************************************
   * LOOT LOGIC
   **************************************************************************/

  function calcFilterScore(ownBaseStats, eqBaseStats, fc, multiRollCount, itemStatKeys, eligibleStats = null, hasEnlightened = false) {
    const cfg = SCORE_CONFIG;

    function isEligible(stat) { return eligibleStats == null || eligibleStats.has(stat); }

    function normDelta(stat) {
      const candVal = ownBaseStats[stat] ?? 0;
      const curVal  = eqBaseStats[stat]  ?? 0;
      if (curVal === 0 && candVal === 0) return 0;
      if (curVal === 0) return candVal > 0 ? 1 : 0;
      return (candVal - curVal) / curVal;
    }

    // Must-have coverage + power (fc.preferredStats = "must-have" tier)
    let mustHaveCoverageScore = 0;
    let mustHavePowerScore    = 0;
    let mustHaveMissingCount  = 0;
    const reasons = [];

    for (const stat of fc.preferredStats ?? []) {
      if (!isEligible(stat)) { reasons.push({ stat, tier:"ineligible", contribution:0 }); continue; }
      const candVal = ownBaseStats[stat] ?? 0;
      if (candVal === 0) {
        mustHaveCoverageScore += cfg.mustHaveMissingPenalty;
        mustHaveMissingCount++;
        reasons.push({ stat, tier:"mustHave", type:"missing", contribution: cfg.mustHaveMissingPenalty });
      } else {
        mustHaveCoverageScore += cfg.mustHavePresentBonus;
        const delta  = normDelta(stat);
        const power  = delta * cfg.mustHavePowerWeight;
        mustHavePowerScore += power;
        reasons.push({ stat, tier:"mustHave", type:"present", candVal, curVal: eqBaseStats[stat] ?? 0, delta, contribution: cfg.mustHavePresentBonus + power });
      }
    }

    if (fc.requireEnlightened && !hasEnlightened) {
      mustHaveCoverageScore += cfg.mustHaveMissingPenalty;
      mustHaveMissingCount++;
      reasons.push({ stat: "enlightened", tier: "mustHave", type: "missing", contribution: cfg.mustHaveMissingPenalty });
    }

    // Preferred power (fc.stats = "preferred" tier)
    let rawPreferredScore    = 0;
    let preferredMissingCount = 0;

    for (const stat of fc.stats ?? []) {
      if (!isEligible(stat)) { reasons.push({ stat, tier:"ineligible", contribution:0 }); continue; }
      const candVal = ownBaseStats[stat] ?? 0;
      if (candVal === 0) preferredMissingCount++;
      const delta = normDelta(stat);
      const power = delta * cfg.preferredPowerWeight;
      rawPreferredScore += power;
      reasons.push({ stat, tier:"preferred", type: candVal === 0 ? "missing" : "present", candVal, curVal: eqBaseStats[stat] ?? 0, delta, contribution: power });
    }

    // Cap preferred so it cannot erase a strong must-have result
    const mustHaveMagnitude = Math.abs(mustHavePowerScore);
    const negCap = mustHaveMagnitude > 1
      ? mustHaveMagnitude * cfg.preferredNegativeCapRatio
      : cfg.preferredFallbackNegativeCap;
    const posCap = mustHaveMagnitude > 1
      ? mustHaveMagnitude * cfg.preferredPositiveCapRatio
      : cfg.preferredFallbackPositiveCap;
    const cappedPreferredScore = Math.max(-negCap, Math.min(posCap, rawPreferredScore));

    // Avoid — opportunity cost only if candidate actually has the avoided stat
    let avoidOpportunityCost = 0;
    for (const stat of fc.avoid ?? []) {
      if (!isEligible(stat)) { reasons.push({ stat, tier:"ineligible", contribution:0 }); continue; }
      if (itemStatKeys.has(stat)) {
        const mult = mustHaveMissingCount > 0   ? cfg.avoidMultiplierMustHaveMissing
                   : preferredMissingCount > 0  ? cfg.avoidMultiplierPreferredMissing
                   :                              cfg.avoidMultiplierCompleteItem;
        const cost = cfg.avoidBasePenalty * mult;
        avoidOpportunityCost += cost;
        reasons.push({ stat, tier:"avoid", type:"present", contribution: cost });
      }
    }

    // Optional
    let optionalScore = 0;
    for (const stat of fc.optional ?? []) {
      if (!isEligible(stat)) { reasons.push({ stat, tier:"ineligible", contribution:0 }); continue; }
      const delta = normDelta(stat);
      const power = delta * cfg.optionalPowerWeight;
      optionalScore += power;
      reasons.push({ stat, tier:"optional", candVal: ownBaseStats[stat] ?? 0, curVal: eqBaseStats[stat] ?? 0, delta, contribution: power });
    }

    // Neutral — stats not tracked in any set
    const allTracked = new Set([
      ...(fc.preferredStats ?? []),
      ...(fc.stats          ?? []),
      ...(fc.optional       ?? []),
      ...(fc.avoid          ?? []),
    ]);
    let neutralScore = 0;
    const neutralKeys = new Set([...Object.keys(ownBaseStats), ...Object.keys(eqBaseStats)]);
    for (const stat of neutralKeys) {
      if (!allTracked.has(stat) && isEligible(stat)) {
        const delta = normDelta(stat);
        neutralScore += delta * cfg.neutralPowerWeight;
      }
    }

    // Multi-roll bonus (preserved from prior system)
    let multiRollBonus = 0;
    if (multiRollCount > 0) {
      for (const [stat, bonus] of Object.entries(fc.multiBonus ?? {})) {
        if (bonus > 0 && itemStatKeys.has(stat)) multiRollBonus += bonus;
      }
    }

    const finalScore =
      mustHaveCoverageScore +
      mustHavePowerScore    +
      cappedPreferredScore  +
      avoidOpportunityCost  +
      neutralScore          +
      optionalScore         +
      multiRollBonus;

    return {
      finalScore,
      mustHaveCoverageScore,
      mustHavePowerScore,
      rawPreferredScore,
      cappedPreferredScore,
      avoidOpportunityCost,
      neutralScore,
      optionalScore,
      multiRollBonus,
      mustHaveMissingCount,
      preferredMissingCount,
      reasons,
    };
  }

  function recommendation(score, mustHaveMissingCount = 0) {
    const cfg = SCORE_CONFIG;
    if (mustHaveMissingCount === 0 && score >= cfg.bisThreshold) return { label:"⭐ BiS",     cls:"rec-bis"  };
    if (score >= cfg.topThreshold)                               return { label:"✅ Top",     cls:"rec-top"  };
    if (score >= cfg.goodThreshold)                              return { label:"👍 Good",    cls:"rec-good" };
    return                                                              { label:"💾 Salvage", cls:"rec-sal"  };
  }

  function categoryOf(score, mustHaveMissingCount = 0) {
    const cfg = SCORE_CONFIG;
    if (mustHaveMissingCount === 0 && score >= cfg.bisThreshold) return "bis";
    if (score >= cfg.topThreshold)                               return "top";
    if (score >= cfg.goodThreshold)                              return "good";
    return "sal";
  }

  // Caps recommendation based on roll quality — diffs and scores are not affected
  function applyQualityCap(rec, cat, rollQualities, multiRollCount, slotType) {
    rec.qualityCapReason = null;

    const qVals = Object.values(rollQualities);
    if (!qVals.length) return { rec, cat };

    const median      = calcMedian(qVals);
    const hasAllStats = "allStats" in rollQualities;

    // Weapon rule: ATK quality < 75% with no multi-roll → cap at Skip
    if (slotType === "Weapon" && !hasAllStats) {
      const atkQ = rollQualities["atk"] ?? null;
      if (atkQ !== null && atkQ < 0.75 && multiRollCount === 0) {
        if (cat === "bis" || cat === "top" || cat === "good") {
          return {
            rec: { label:"💾 Salvage", cls:"rec-sal", qualityCapReason:`ATK roll quality ${Math.round(atkQ * 100)}% is below the 75% threshold` },
            cat: "sal",
          };
        }
      }
    }

    // Median quality < 75%: cap at Good
    if (median < 0.75) {
      if (hasAllStats) {
        // allStats exception: force exactly Good — allStats has inherent value so prevent Salvage too
        return {
          rec: { label:"👍 Good", cls:"rec-good", qualityCapReason:`Median roll quality ${Math.round(median * 100)}% is below the 75% threshold (allStats item forced to Good)` },
          cat: "good",
        };
      }
      // Normal case: block BiS and Top only
      if (cat === "bis" || cat === "top") {
        return {
          rec: { label:"👍 Good", cls:"rec-good", qualityCapReason:`Median roll quality ${Math.round(median * 100)}% is below the 75% threshold` },
          cat: "good",
        };
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

  function readSkills() {
    // Format: "COST MP · COOLDOWN_SECONDS · CURRENT_TIMER" — only cost + cooldown matter
    const re = /(\d+)\s*MP\s*[·•]\s*([\d.]+)s/;
    const skills = [];
    const seen = new Set();
    document.querySelectorAll('button').forEach(btn => {
      if (!/^\s*(ON|OFF)\s*$/.test(btn.textContent)) return;
      let el = btn.parentElement;
      for (let i = 0; i < 6 && el; i++) {
        if (re.test(el.textContent)) break;
        el = el.parentElement;
      }
      if (!el || seen.has(el)) return;
      seen.add(el);
      const m = el.textContent.match(re);
      if (!m) return;
      const enabled = /^\s*ON\s*$/.test(btn.textContent);
      // Find skill name: first leaf text with actual letters (skips emoji-only nodes)
      let name = '?';
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = w.nextNode())) {
        const t = node.textContent.trim();
        if (t && /\p{L}/u.test(t) && !/MP/i.test(t) && !/^\s*(ON|OFF)\s*$/.test(t)) {
          name = t; break;
        }
      }
      skills.push({ name, cost: +m[1], intervalS: +m[2], enabled });
    });
    state.skills = skills;
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
        case "Mana Regen":             state.manaRegen  = val; break;
        case "Cooldown Reduction":     state.cdr        = val; break;
        case "XP Bonus":               state.xpBonus    = val; break;
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
      const slot = raw === "ring1"   ? "Ring 1"
                 : raw === "ring2"   ? "Ring 2"
                 : raw === "offhand" ? "Shield"
                 : raw.charAt(0).toUpperCase() + raw.slice(1);
      equippedMap[slot] = item;
    }

    state.equipped        = equippedMap;
    state.equippedCachedAt = Date.now();

    state.bagItemsRaw = inventory.filter(item => !item.equippedSlot && GEAR_ITEM_TYPES.has(item.type));
    state.bagItems    = state.bagItemsRaw.map(item => _buildBagItem(item, equippedMap));
  }

  function _gearQualityLabel(score) {
    const t = V9_CONFIG.tiers.quality;
    if (score >= t.perfect)   return 'Perfect';
    if (score >= t.excellent) return 'Excellent';
    if (score >= t.good)      return 'Good';
    if (score >= t.usable)    return 'Usable';
    return 'Poor';
  }

  function computeGearQuality(item) {
    const qualities = item.stats?._qualities ?? {};
    const statKeys = Object.keys(qualities);

    if (statKeys.length === 0) {
      return { score: 0, label: 'Poor', weightedAverage: 0, medianQuality: 0, stats: [] };
    }

    const statResults = statKeys.map((key, idx) => {
      const qualityPct = qualities[key] ?? 0;
      const quality = Math.min(Math.max(qualityPct / 100, 0), 1);
      const weight = idx === 0
        ? V9_CONFIG.qualityStatWeights.primary
        : V9_CONFIG.qualityStatWeights.bonus;
      const isMultiRoll = (item.prefixes ?? []).filter(p => p.type === key).length > 1;
      return { stat: key, quality, weight, isMultiRoll };
    });

    const totalWeight = statResults.reduce((s, r) => s + r.weight, 0);
    const weightedAverage = statResults.reduce((s, r) => s + r.quality * r.weight, 0) / totalWeight;

    const sorted = [...statResults].map(r => r.quality).sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const medianQuality = sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];

    const score = Math.round(
      V9_CONFIG.qualityAverageWeight * weightedAverage * 100 +
      V9_CONFIG.qualityMedianWeight  * medianQuality  * 100
    );

    return {
      score,
      label: _gearQualityLabel(score),
      weightedAverage,
      medianQuality,
      stats: statResults,
    };
  }

  function runV9ScoringTests() {
    console.group('V9 Scoring Tests');
    let passed = 0; let failed = 0;

    function assert(label, actual, expected, tolerance) {
      tolerance = tolerance ?? 0;
      const ok = typeof expected === 'boolean'
        ? actual === expected
        : Math.abs(actual - expected) <= tolerance;
      if (ok) { console.log(`✓ ${label}`); passed++; }
      else     { console.error(`✗ ${label}: expected ${expected}, got ${actual}`); failed++; }
    }
    function assertEq(label, actual, expected) {
      if (actual === expected) { console.log(`✓ ${label}`); passed++; }
      else { console.error(`✗ ${label}: expected "${expected}", got "${actual}"`); failed++; }
    }

    // --- computeGearQuality ---
    console.group('computeGearQuality');

    // Sovereign Grips: ATK=92%, Crit%=38%
    const sovereignGrips = {
      stats: { atk: 19, critChance: 2.3, _qualities: { atk: 92, critChance: 38 } },
      prefixes: [],
    };
    const gqSovereign = computeGearQuality(sovereignGrips);
    // weightedAvg = (0.92×1.25 + 0.38×1.00) / 2.25 = 1.53/2.25 = 0.6800
    // median = (0.38+0.92)/2 = 0.65
    // score = round(0.70×68.0 + 0.30×65.0) = round(47.6+19.5) = 67
    assert('Sovereign Grips score ≈ 67', gqSovereign.score, 67, 1);
    assertEq('Sovereign Grips label', gqSovereign.label, 'Usable');

    // Immortal Gauntlets: ATK=96%, AllStats=84%
    const immortalGauntlets = {
      stats: { atk: 23, allStats: 2.0, _qualities: { atk: 96, allStats: 84 } },
      prefixes: [],
    };
    const gqImmortal = computeGearQuality(immortalGauntlets);
    // weightedAvg = (0.96×1.25 + 0.84×1.00) / 2.25 = 2.04/2.25 = 0.9067
    // median = (0.84+0.96)/2 = 0.90
    // score = round(0.70×90.67 + 0.30×90.0) = round(63.47+27.0) = 90
    assert('Immortal Gauntlets score ≈ 90', gqImmortal.score, 90, 2);
    assertEq('Immortal Gauntlets label', gqImmortal.label, 'Excellent');

    // Empty item (no qualities)
    const emptyItem = { stats: { _qualities: {} }, prefixes: [] };
    const gqEmpty = computeGearQuality(emptyItem);
    assert('Empty item score = 0', gqEmpty.score, 0);
    assertEq('Empty item label', gqEmpty.label, 'Poor');

    // Perfect item: both stats at 100%
    const perfectItem = {
      stats: { atk: 30, critChance: 5.0, _qualities: { atk: 100, critChance: 100 } },
      prefixes: [],
    };
    const gqPerfect = computeGearQuality(perfectItem);
    assert('Perfect item score = 100', gqPerfect.score, 100, 0);
    assertEq('Perfect item label', gqPerfect.label, 'Perfect');

    console.groupEnd(); // computeGearQuality

    // --- computeBuildFit ---
    console.group('computeBuildFit');

    const bowFilter = {
      preferredStats: new Set(['atk']),
      stats: new Set(['atkSpeed', 'critChance']),
      optional: new Set(['allStats']),
      avoid: new Set(),
    };

    // Test 1: Sovereign Grips — ATK ✓, Crit% ✓, AtkSpeed ✗, AllStats ✗
    const sgItem = {
      stats: { atk: 19, critChance: 2.3, _qualities: { atk: 92, critChance: 38 } },
      prefixes: [],
    };
    const bfSovereign = computeBuildFit(sgItem, bowFilter);
    // Coverage: 60×(1/1) + 25×(1/2) + 10×(0/1) + 5×(0/2) = 60+12.5+0+0 = 72.5
    // SlotEff: 2 useful (atk+crit) / 2 total slots × 15 = 15
    // Score = round(clamp(72.5+15, 0, 100)) = 88
    assert('Sovereign Grips BuildFit ≈ 88', bfSovereign.score, 88, 1);
    assertEq('Sovereign Grips fit label', bfSovereign.label, 'Strong Fit');
    assert('mustHavePresent = 1', bfSovereign.mustHavePresent, 1);
    assert('preferredPresent = 1', bfSovereign.preferredPresent, 1);

    // Test 2: Immortal Gauntlets — ATK ✓, Crit% ✗, AtkSpeed ✗, AllStats ✓
    const igItem = {
      stats: { atk: 23, allStats: 2.0, _qualities: { atk: 96, allStats: 84 } },
      prefixes: [],
    };
    const bfImmortal = computeBuildFit(igItem, bowFilter);
    // Coverage: 60×(1/1) + 25×(0/2) + 10×(1/1) + 5×(0/2) = 60+0+10+0 = 70
    // SlotEff: 2 useful / 2 slots × 15 = 15
    // Score = round(clamp(70+15, 0, 100)) = 85
    assert('Immortal Gauntlets BuildFit ≈ 85', bfImmortal.score, 85, 1);
    assertEq('Immortal Gauntlets fit label', bfImmortal.label, 'Strong Fit');
    assert('preferredPresent = 0', bfImmortal.preferredPresent, 0);

    // Test 3: Off-build — only DEF stat (neutral, not in filter)
    const offBuildItem = {
      stats: { def: 50, _qualities: { def: 90 } },
      prefixes: [],
    };
    const bfOff = computeBuildFit(offBuildItem, bowFilter);
    // Coverage: mustHave=0, preferred=0, optional=0, neutral: 1 neutral-useful / 1 slot × 5 = 5
    // SlotEff: 0 useful desired / 1 slot × 15 = 0
    // Score = round(clamp(5, 0, 100)) = 5
    assert('Off-build BuildFit ≤ 10', bfOff.score, 5, 5);
    assertEq('Off-build label', bfOff.label, 'Off-build');

    console.groupEnd(); // computeBuildFit

    console.group('Delta transform helpers');

    // statFloor: candidateValue=19, quality=92 → 19*(50/92) ≈ 10.326
    assert('_computeStatFloor(19, 92) ≈ 10.33', _computeStatFloor(19, 92), 10.326, 0.05);

    // statFloor: quality=0 → clamped to 1 → 19*50 = 950
    assert('_computeStatFloor handles quality=0', _computeStatFloor(19, 0), 950, 1);

    // valueGain: +100% → log2(2) = 1.00
    assert('_computeValueGain +100% = 1.00', _computeValueGain(20, 10, 5), 1.00, 0.01);

    // valueGain: +5% → log2(1.05) ≈ 0.0703
    assert('_computeValueGain +5% ≈ 0.07', _computeValueGain(10.5, 10, 5), 0.0703, 0.005);

    // valueGain: -5% → negative
    assert('_computeValueGain -5% ≈ -0.07', _computeValueGain(9.5, 10, 5), -0.0703, 0.005);

    // newly gained stat (equippedValue=0)
    const gainedFloor = _computeStatFloor(19, 92); // ≈ 10.326
    assert('Newly gained stat has positive valueGain', _computeValueGain(19, 0, gainedFloor) > 0, true);

    console.groupEnd();

    console.group('computeUpgradeScore');

    // Build a minimal fc-like object that mimics the Set-based structure
    const upgradeBowFilter = {
      preferredStats: new Set(['atk']),
      stats: new Set(['atkSpeed', 'critChance']),
      optional: new Set(['allStats']),
      avoid: new Set([]),
    };

    // Test A: +100% ATK (Item A from spec worked example)
    const ownA = { atk: 20 };
    const eqA  = { atk: 10 };
    const quA  = { atk: 80 };
    const upA  = computeUpgradeScore(ownA, eqA, upgradeBowFilter, quA);
    // floor = 20*(50/80) = 12.5; denom = max(10, 12.5) = 12.5
    // delta = (20-10)/12.5 = 0.8; valueGain = log2(1.8) ≈ 0.848
    // ATK contribution = 100 × 0.848 = 84.8
    // coverage: 1 eligible (atk has eq>0 or cand>0), 1 improved → ratio=1/1=1 → bonus = 20×1=20
    // score ≈ round(84.8 + 20) = 105
    assert('Item A (big ATK) score ≥ 60 (Major Upgrade)', upA.score >= 60, true);
    assertEq('Item A label = Major Upgrade', upA.label, 'Major Upgrade');

    // Test B: +5% everywhere (Item B from spec worked example)
    const ownB = { atk: 10.5, critChance: 2.1, atkSpeed: 1.05, allStats: 1.05 };
    const eqB  = { atk: 10,   critChance: 2.0, atkSpeed: 1.00, allStats: 1.00 };
    const quB  = { atk: 80, critChance: 80, atkSpeed: 80, allStats: 80 };
    const upB  = computeUpgradeScore(ownB, eqB, upgradeBowFilter, quB);
    // All +5%: each log2(1.05) ≈ 0.0703
    // ATK: 100×0.07=7; Crit%: 45×0.07=3.15; AtkSpeed: 45×0.07=3.15; AllStats: 12×0.07=0.84
    // magnitude ≈ 14.14; coverage: 4/4 improved → bonus = 20×1=20
    // score ≈ round(34.14) = 34
    assert('Item B (+5% all) score ≈ 34', upB.score, 34, 5);
    assert('Item A beats Item B decisively', upA.score > upB.score, true);

    // Test: Lost must-have
    const ownLost = {};
    const eqLost  = { atk: 14 };
    const quLost  = {};
    const upLost  = computeUpgradeScore(ownLost, eqLost, upgradeBowFilter, quLost);
    assert('Lost must-have adjustment = -35', upLost.mustHaveAdjustment, -35, 0);

    console.groupEnd();
    console.group('requireEnlightened persistence');

    const fcNoEnl = mkFC(["atk"], true, {}, [], [], [], false);
    assert('requireEnlightened defaults false', fcNoEnl.requireEnlightened, false);

    const fcWithEnl = mkFC(["atk"], true, {}, [], [], [], true);
    assert('requireEnlightened set true', fcWithEnl.requireEnlightened, true);

    // Round-trip: simulate save → load
    const saved = { stats:["atk"], enabled:true, multiBonus:{}, preferredStats:[], optional:[], avoid:[], requireEnlightened:true };
    const loaded = mkFC(saved.stats, saved.enabled !== false, saved.multiBonus ?? {}, saved.preferredStats ?? [], saved.optional ?? [], saved.avoid ?? [], saved.requireEnlightened ?? false);
    assert('requireEnlightened survives round-trip', loaded.requireEnlightened, true);

    const savedOld = { stats:["atk"], enabled:true, multiBonus:{}, preferredStats:[], optional:[], avoid:[] };
    const loadedOld = mkFC(savedOld.stats, savedOld.enabled !== false, savedOld.multiBonus ?? {}, savedOld.preferredStats ?? [], savedOld.optional ?? [], savedOld.avoid ?? [], savedOld.requireEnlightened ?? false);
    assert('old saved filters default requireEnlightened to false', loadedOld.requireEnlightened, false);

    console.groupEnd();
    console.group('calcFilterScore — requireEnlightened');

    const enlFC = mkFC([], true, {}, ["atk"], [], [], true); // requireEnlightened ON
    const baseStats   = { atk: 20 };
    const equippedStats = { atk: 15 };
    const statKeys    = new Set(["atk"]);

    // Item without Enlightened → mustHaveMissingCount includes enlightened penalty
    const bdNoEnl = calcFilterScore(baseStats, equippedStats, enlFC, 0, statKeys, null, false);
    assert('no-enl: mustHaveMissingCount includes enlightened', bdNoEnl.mustHaveMissingCount, 1);
    assert('no-enl: reasons includes enlightened missing', bdNoEnl.reasons.some(r => r.stat === 'enlightened' && r.type === 'missing'), true);

    // Item with Enlightened → no extra penalty
    const fcOff = mkFC([], true, {}, ["atk"], [], [], false);
    const bdEnl  = calcFilterScore(baseStats, equippedStats, enlFC, 0, statKeys, null, true);
    const bdOff  = calcFilterScore(baseStats, equippedStats, fcOff,  0, statKeys, null, false);
    assert('with-enl: mustHaveMissingCount same as without flag', bdEnl.mustHaveMissingCount, bdOff.mustHaveMissingCount);
    assert('with-enl: finalScore same as without flag', bdEnl.finalScore, bdOff.finalScore);

    // requireEnlightened OFF → no penalty even without enlightened
    const bdOff2 = calcFilterScore(baseStats, equippedStats, fcOff, 0, statKeys, null, false);
    assert('flag off: no penalty even without enlightened', bdOff2.mustHaveMissingCount, 0);

    console.groupEnd();

    console.log(`\nTotal: ${passed} passed, ${failed} failed`);
    console.groupEnd(); // V9 Scoring Tests
  }
  window.runV9ScoringTests = runV9ScoringTests;

  function _buildFitLabel(score) {
    const t = V9_CONFIG.tiers.fit;
    if (score >= t.perfect)  return 'Perfect Fit';
    if (score >= t.strong)   return 'Strong Fit';
    if (score >= t.partial)  return 'Partial Fit';
    if (score >= t.weak)     return 'Weak Fit';
    return 'Off-build';
  }

  function computeBuildFit(item, fc, eligibleStats = null) {
    const itemStatKeys = new Set(Object.keys(item.stats ?? {}).filter(k => k !== '_qualities'));
    const isEligible = key => !eligibleStats || eligibleStats.has(key);

    // fc.preferredStats = must-have tier; fc.stats = preferred tier
    const mustHave    = [...(fc.preferredStats ?? [])].filter(isEligible);
    const mustPresent = mustHave.filter(k => itemStatKeys.has(k));

    const preferred   = [...(fc.stats ?? [])].filter(isEligible);
    const prefPresent = preferred.filter(k => itemStatKeys.has(k));

    const optional    = [...(fc.optional ?? [])].filter(isEligible);
    const optPresent  = optional.filter(k => itemStatKeys.has(k));

    const avoided      = [...(fc.avoid ?? [])];
    const avoidPresent = avoided.filter(k => itemStatKeys.has(k));

    const filterKeys = new Set([...mustHave, ...preferred, ...optional, ...avoided]);
    const neutralUseful = [...itemStatKeys].filter(k => !filterKeys.has(k) && (item.stats[k] ?? 0) > 0);

    const totalSlots    = itemStatKeys.size;
    const usefulDesired = mustPresent.length + prefPresent.length + optPresent.length;

    const cw = V9_CONFIG.coverageWeights;
    const coverageScore =
      (mustHave.length  > 0 ? cw.mustHave  * (mustPresent.length / mustHave.length)  : 0) +
      (preferred.length > 0 ? cw.preferred * (prefPresent.length / preferred.length) : 0) +
      (optional.length  > 0 ? cw.optional  * (optPresent.length  / optional.length)  : 0) +
      (totalSlots       > 0 ? cw.neutral   * (neutralUseful.length / totalSlots)      : 0);

    const slotEfficiency      = totalSlots > 0 ? usefulDesired / totalSlots : 0;
    const slotEfficiencyScore = V9_CONFIG.slotEfficiencyMax * slotEfficiency;

    const avoidPenalty = totalSlots > 0
      ? -V9_CONFIG.avoidPenaltyPerStat * (avoidPresent.length / totalSlots)
      : 0;

    const raw   = coverageScore + slotEfficiencyScore + avoidPenalty;
    const score = Math.round(Math.min(Math.max(raw, 0), 100));

    return {
      score,
      label: _buildFitLabel(score),
      mustHavePresent:   mustPresent.length,
      mustHaveEligible:  mustHave.length,
      preferredPresent:  prefPresent.length,
      preferredEligible: preferred.length,
      optionalPresent:   optPresent.length,
      optionalEligible:  optional.length,
      slotEfficiency,
      avoidStatsPresent: avoidPresent,
    };
  }

  // -----------------------------------------------------------------------
  // Delta transform helpers (Task 10)
  // -----------------------------------------------------------------------

  function _computeStatFloor(candidateValue, qualityPercent) {
    const safeQuality = Math.max(qualityPercent, 1);
    return Math.abs(candidateValue) * (V9_CONFIG.statFloorQuality / safeQuality);
  }

  function _computeValueGain(candidateValue, equippedValue, statFloor) {
    const denominator = Math.max(Math.abs(equippedValue), statFloor, 0.0001);
    const relativeDelta = (candidateValue - equippedValue) / denominator;
    return Math.sign(relativeDelta) * Math.log2(1 + Math.abs(relativeDelta));
  }

  // -----------------------------------------------------------------------
  // Upgrade scoring (Task 11)
  // -----------------------------------------------------------------------

  function _upgradeLabel(score) {
    const t = V9_CONFIG.tiers.upgrade;
    if (score >= t.major)          return 'Major Upgrade';
    if (score >= t.upgrade)        return 'Upgrade';
    if (score >= t.minor)          return 'Minor Upgrade';
    if (score >= t.sidegradeMin)   return 'Sidegrade';
    // Note: uses t.downgrade (not t.minorDowngradeStart) because the Minor Downgrade
    // band spans -24 to -10; checking >= t.minorDowngradeStart (-10) would only catch
    // exactly -10 and leave -11 to -24 mislabeled as Downgrade.
    if (score > t.downgrade) return 'Minor Downgrade';
    return 'Downgrade';
  }

  function computeUpgradeScore(ownBaseStats, eqBaseStats, fc, rollQualities, eligibleStats = null) {
    const isEligible = key => !eligibleStats || eligibleStats.has(key);

    // Build role map: statKey → role string
    const roleMap = {};
    [...(fc.preferredStats ?? [])].forEach(k => { roleMap[k] = 'mustHave'; });
    [...(fc.stats ?? [])].forEach(k => { if (!roleMap[k]) roleMap[k] = 'preferred'; });
    [...(fc.optional ?? [])].forEach(k => { if (!roleMap[k]) roleMap[k] = 'optional'; });
    [...(fc.avoid ?? [])].forEach(k => { if (!roleMap[k]) roleMap[k] = 'avoid'; });

    // Union of all stat keys from candidate and equipped (minus _qualities)
    const allKeys = new Set([
      ...Object.keys(ownBaseStats ?? {}),
      ...Object.keys(eqBaseStats ?? {}),
    ]);
    allKeys.delete('_qualities');

    const roleWeights = V9_CONFIG.roleWeights;
    const statResults = [];
    let magnitudeScore = 0;
    let mustHaveAdjustment = 0;
    let desiredImproved = 0;
    let desiredEligible = 0;

    for (const key of allKeys) {
      if (!isEligible(key)) continue;

      const candidateVal = ownBaseStats[key] ?? 0;
      const equippedVal  = eqBaseStats[key]  ?? 0;
      const qualityPct   = rollQualities[key] ?? V9_CONFIG.statFloorQuality;
      const role         = roleMap[key] ?? 'neutral';

      if (role === 'avoid') {
        const contribution = (candidateVal > 0 && equippedVal === 0)
          ? -V9_CONFIG.avoidNewStatPenalty
          : 0;
        magnitudeScore += contribution;
        statResults.push({
          stat: key, role,
          equippedValue: equippedVal, candidateValue: candidateVal,
          statFloor: 0, relativeDelta: 0, valueGain: 0, weight: 0, contribution,
          isMultiRoll: false, multiRollCount: 1,
        });
        continue;
      }

      const statFloor = _computeStatFloor(candidateVal || equippedVal, qualityPct);
      const valueGain = _computeValueGain(candidateVal, equippedVal, statFloor);
      const weight    = roleWeights[role] ?? roleWeights.neutral;
      const contribution = weight * valueGain;

      // Must-have presence adjustment
      if (role === 'mustHave') {
        if (candidateVal > 0 && equippedVal === 0) mustHaveAdjustment += V9_CONFIG.mustHaveGainedBonus;
        if (candidateVal === 0 && equippedVal > 0) mustHaveAdjustment -= V9_CONFIG.mustHaveLostPenalty;
      }

      // Coverage: desired = mustHave + preferred + optional
      if (role === 'mustHave' || role === 'preferred' || role === 'optional') {
        if (candidateVal > 0 || equippedVal > 0) {
          desiredEligible++;
          if (valueGain > 0) desiredImproved++;
        }
      }

      magnitudeScore += contribution;

      const denominator = Math.max(Math.abs(equippedVal), statFloor, 0.0001);
      statResults.push({
        stat: key, role,
        equippedValue: equippedVal,
        candidateValue: candidateVal,
        statFloor,
        relativeDelta: (candidateVal - equippedVal) / denominator,
        valueGain,
        weight,
        contribution,
        isMultiRoll: false,
        multiRollCount: 1,
      });
    }

    const coverageRatio = desiredEligible > 0 ? desiredImproved / desiredEligible : 0;
    const coverageBonus = V9_CONFIG.coverageBonusMax * coverageRatio * coverageRatio;

    const rawScore = magnitudeScore + coverageBonus + mustHaveAdjustment;
    const score    = Math.round(rawScore);

    return {
      score,
      label: _upgradeLabel(score),
      magnitudeScore,
      coverageBonus,
      mustHaveAdjustment,
      neutralContribution: statResults
        .filter(r => r.role === 'neutral')
        .reduce((s, r) => s + r.contribution, 0),
      stats: statResults,
      desiredStatsImproved: desiredImproved,
      desiredStatsEligible: desiredEligible,
    };
  }

  // -----------------------------------------------------------------------
  // Recommendation (Task 13)
  // -----------------------------------------------------------------------

  function _topContributingStat(upgrade) {
    const top = [...upgrade.stats]
      .filter(r => r.role !== 'avoid')
      .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))[0];
    return top
      ? `${top.stat} (${top.contribution > 0 ? '+' : ''}${top.contribution.toFixed(1)})`
      : 'stat gains';
  }

  function computeRecommendation(gearQuality, buildFit, upgrade) {
    const primary = upgrade.label;

    let overlay = null;
    const gq = gearQuality.score;
    const bf = buildFit.score;
    const up = upgrade.score;

    if (bf >= 95 && gq >= 85) {
      overlay = 'Best-in-Slot Candidate';
    } else if (gq >= 95) {
      overlay = 'Perfect Roll';
    } else if (up >= 10 && bf < 60) {
      overlay = 'Temporary Upgrade';
    } else if (gq >= 85 && bf < 60) {
      overlay = 'Keep — High Quality';
    } else if (up >= 10 && gq < 50) {
      overlay = 'Low-quality Upgrade';
    }

    const parts = [];
    if (up >= 10)  parts.push(`${upgrade.label.toLowerCase()} due to ${_topContributingStat(upgrade)}`);
    if (gq >= 85)  parts.push('well-rolled item');
    if (bf < 60)   parts.push('poor build fit');
    if (up < -9)   parts.push('worse than equipped across key stats');
    const summary = parts.length > 0 ? parts.join('; ') + '.' : 'No significant change.';

    return { primary, overlay, summary };
  }

  // Map v9 upgrade score to existing legacy `cls` strings used by render functions
  // (the legacy CSS only defines rec-bis / rec-top / rec-good / rec-sal — no rec-neutral)
  function _v9RecClass(score) {
    const t = V9_CONFIG.tiers.upgrade;
    if (score >= t.major)        return 'rec-bis';
    if (score >= t.upgrade)      return 'rec-top';
    if (score >= t.minor)        return 'rec-good';
    if (score >= t.sidegradeMin) return 'rec-sal';
    return 'rec-sal';
  }

  // Map v9 upgrade score to the legacy `cat` keys that the UI groups items by
  // (CATEGORIES is fixed: bis / top / good / sal — anything else would break grouping)
  function _v9Cat(score) {
    const t = V9_CONFIG.tiers.upgrade;
    if (score >= t.major)        return 'bis';
    if (score >= t.upgrade)      return 'top';
    if (score >= t.minor)        return 'good';
    return 'sal';
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

    // Equipped item for same slot — for rings, pick whichever slot this item upgrades more
    let equippedItem = null;
    if (slotType === "Ring") {
      const r1 = equippedMap["Ring 1"] ?? null;
      const r2 = equippedMap["Ring 2"] ?? null;
      if (r1 && r2) {
        const fc = state.filters.get(filterKeyOverride ?? state.activeFilterKey) ?? mkFC([]);
        const ringEligibleStats = eligibleStatsForItem({ slotType, weaponSubType: item.type, armorWeight: item.armorWeight });
        const scoreVs = (eq) => {
          const eqS = {};
          for (const [k, v] of Object.entries(eq.stats)) { if (k !== "_qualities") eqS[normStatKey(k)] = v; }
          return calcFilterScore(ownBaseStats, eqS, fc, 0, new Set(Object.keys(ownBaseStats)), ringEligibleStats).finalScore;
        };
        equippedItem = scoreVs(r1) >= scoreVs(r2) ? r1 : r2;
      } else {
        equippedItem = r1 ?? r2;
      }
    } else {
      equippedItem = equippedMap[slotType] ?? null;
    }
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
    const slotTable      = slotType === "Weapon" ? WEAPON_RARITY_STAT_SLOTS : RARITY_STAT_SLOTS;
    const maxSlots       = slotTable[rarity] ?? 4;
    const multiRollCount = Math.max(0, maxSlots - rawStatCount);
    const itemStatKeys   = new Set(Object.keys(ownBaseStats));

    // Score + qualification data per filter
    const eligibleStats = eligibleStatsForItem({ slotType, weaponSubType: item.type, armorWeight: item.armorWeight });
    const filterScores      = {};
    const filterBreakdowns  = {};
    const filterHasPriorityMR = {};
    const filterHasPrefMR     = {};
    for (const [key, fc] of state.filters) {
      const bd = calcFilterScore(ownBaseStats, eqBaseStats, fc, multiRollCount, itemStatKeys, eligibleStats);
      filterScores[key]         = bd.finalScore;
      filterBreakdowns[key]     = bd;
      filterHasPriorityMR[key]  = multiRollCount > 0 && [...itemStatKeys].some(s => fc.stats.has(s) || fc.preferredStats.has(s));
      filterHasPrefMR[key]      = multiRollCount > 0 && [...itemStatKeys].some(s => fc.preferredStats.has(s));
    }

    const activeKey     = filterKeyOverride || state.activeFilterKey;
    const activeFC      = state.filters.get(activeKey) ?? mkFC([]);
    const prefScore     = filterScores[activeKey]        ?? 0;
    const activePriMR   = filterHasPriorityMR[activeKey] ?? false;
    const activePrefMR  = filterHasPrefMR[activeKey]     ?? false;

    let bestFilter = null, bestFilterScore = -Infinity;
    for (const [key, score] of Object.entries(filterScores)) {
      const fc = state.filters.get(key);
      if (key !== activeKey && fc?.enabled && score > bestFilterScore && score >= SCORE_CONFIG.goodThreshold) {
        bestFilterScore = score; bestFilter = key;
      }
    }

    const activeBd = filterBreakdowns[activeKey];
    const preCapRec = recommendation(prefScore, activeBd?.mustHaveMissingCount ?? 0);
    const rawRec = { ...preCapRec }; // snapshot BEFORE applyQualityCap mutates preCapRec in-place
    let { rec, cat } = applyQualityCap(
      preCapRec,
      categoryOf(prefScore, activeBd?.mustHaveMissingCount ?? 0),
      rollQualities, multiRollCount, slotType
    );

    // Multi-roll floors (applied after quality cap):
    // • Double roll (any quality)       → at least Good
    // • Triple+ roll, quality ≥ 75%    → at least Good
    // • Triple+ roll, quality < 75%    → at least Good + "Interesting" flag
    const mrMedianQuality = multiRollCount > 0 ? calcMedian(Object.values(rollQualities)) : 1;
    let mrInteresting = false;
    if (multiRollCount >= 1) {
      if (multiRollCount === 1 || mrMedianQuality >= 0.75) {
        if (cat === "sal") {
          rec = { label:"🎲 Good", cls:"rec-good", qualityCapReason: rec.qualityCapReason ?? null }; cat = "good";
        }
      } else {
        if (cat === "sal") {
          rec = { label:"👍 Good", cls:"rec-good", qualityCapReason: rec.qualityCapReason ?? null }; cat = "good";
        }
        mrInteresting = true;
      }
    }

    // Preferred stat + any multi-roll → always at least Good (overrides "interesting")
    if (activePrefMR && cat === "sal") {
      rec = { label:"👍 Good", cls:"rec-good", qualityCapReason: rec.qualityCapReason ?? null }; cat = "good";
      mrInteresting = false;
    }

    // Flat-upgrade exception: if every filter stat present on this item beats equipped base → at least Good
    // Bypasses quality cap penalties — a bad roll on a strictly better item is still an upgrade
    if (equippedItem) {
      const filterStatsOnItem = [...activeFC.stats, ...activeFC.preferredStats].filter(s => itemStatKeys.has(s));
      if (filterStatsOnItem.length > 0 && filterStatsOnItem.every(s => diffs.some(d => d.stat === s && d.isUp))) {
        if (cat === "sal") {
          rec = { label:"👍 Good", cls:"rec-good", qualityCapReason: rec.qualityCapReason ?? null }; cat = "good";
          mrInteresting = false;
        }
      }
    }

    const v9GearQuality    = computeGearQuality(item);
    const v9BuildFit       = computeBuildFit(item, activeFC, eligibleStats);
    const v9Upgrade        = computeUpgradeScore(
      ownBaseStats,
      eqBaseStats,
      activeFC,
      item.stats._qualities ?? {},
      eligibleStats
    );
    const v9Recommendation = computeRecommendation(v9GearQuality, v9BuildFit, v9Upgrade);

    // v9 primary verdict: when enabled, replace legacy `rec` with one derived from the v9 upgrade score.
    // `cat` is mapped onto the existing bis/top/good/sal keys so all downstream UI (grouping, highlights,
    // CATEGORIES iteration, team-send filtering) keeps working unchanged.
    if (V9_CONFIG.SCORING_MODEL === 'v9' && v9Upgrade) {
      const v9Label = v9Recommendation.overlay ?? v9Recommendation.primary;
      rec = {
        label: v9Label,
        cls: _v9RecClass(v9Upgrade.score),
        qualityCapReason: null, // no post-hoc caps in v9
      };
      cat = _v9Cat(v9Upgrade.score);
    }

    // Class usability restriction — unusable item types are capped at Good regardless
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
    if (classRestricted) {
      rec = { label:"💾 Salvage", cls:"rec-sal", qualityCapReason: rec.qualityCapReason ?? null }; cat = "sal";
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
      filterScores, filterBreakdowns, filterHasPriorityMR, filterHasPrefMR,
      prefScore, bestFilter, bestFilterScore,
      rec, cat, rawRec,
      isLegacyStar: item.forgeTier === "starforged",
      v9GearQuality, v9BuildFit, v9Upgrade, v9Recommendation,
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
      // Try API field names for gear-req level (set by server with sub-tier system)
      const gearReqLevel = raw.gearReqLevel ?? raw.gear_req_level ?? raw.reqLevel ?? raw.level_req ?? raw.itemLevelReq ?? null;
      raws.push({ item, listingId: listing.id, price: listing.price,
                  sellerName: listing.sellerName, itemTier, gearReqLevel });
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
      } else if (item?.cat === "bis" || item?.cat === "top" || item?.cat === "good") {
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
    #aimSgPanel {
      position:fixed; z-index:2147483647;
      left:16px; top:50%; transform:translateY(-50%);
      width:300px; background:#060912; color:#e8eefc;
      border:1px solid rgba(255,255,255,.16); border-radius:12px;
      box-shadow:0 18px 60px rgba(0,0,0,.65);
      font:12px/1.4 Inter,ui-sans-serif,system-ui,sans-serif;
      overflow:hidden; display:flex; flex-direction:column;
      height:min(560px, calc(100vh - 32px)); transition:width .2s ease;
    }
    #aimSgPanel.sg-wide { width:480px; }
    #aimSgPanel.sg-hidden { display:none; }

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
    .rec-bis  { color:#facc15; border-color:rgba(250,204,21,.5);  background:rgba(250,204,21,.12); }
    .rec-top  { color:#4ade80; border-color:rgba(74,222,128,.5);  background:rgba(74,222,128,.10); }
    .rec-good { color:#60a5fa; border-color:rgba(96,165,250,.5);  background:rgba(96,165,250,.10); }
    .rec-sal  { color:#94a3b8; border-color:rgba(148,163,184,.2); background:transparent; }
    .sg-badge-shard  { color:#a78bfa; border-color:#4c1d95; background:rgba(167,139,250,.1); }
    .sg-badge-legacy { color:#fbbf24; border-color:#78350f; background:rgba(251,191,36,.1); }
    .sg-badge-multi      { color:#c084fc; border-color:#581c87; background:rgba(192,132,252,.1); }
    .sg-badge-future     { color:#6b7280; border-color:#374151; background:rgba(107,114,128,.08); }
    .sg-badge-restricted { color:#6b7280; border-color:#374151; background:rgba(107,114,128,.06); }

    .sg-ir-badge { display:inline-block; font-weight:700; font-size:10px; padding:1px 5px; border-radius:4px; border:1px solid; }
    .sg-ir-s { color:#facc15; border-color:#92400e; background:rgba(250,204,21,.12); }
    .sg-ir-a { color:#4ade80; border-color:#14532d; background:rgba(74,222,128,.10); }
    .sg-ir-b { color:#60a5fa; border-color:#1e3a5f; background:rgba(96,165,250,.10); }
    .sg-ir-c { color:#94a3b8; border-color:#374151; background:rgba(148,163,184,.07); }

    .sg-filter-row.disabled { opacity:.45; }
    .sg-toggle-btn { font-size:13px; line-height:1; padding:1px 4px; }
    .sg-toggle-btn.off { color:#374151; }

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
    .sg-filter-edit-row { display:flex; gap:5px; align-items:center; margin-top:5px; }
    .sg-filter-input {
      width:100%; box-sizing:border-box; background:#141d30; color:#e8eefc;
      border:1px solid rgba(255,255,255,.15); border-radius:5px;
      padding:5px 8px; font:inherit; font-size:13px; font-weight:600;
    }
    .sg-pref-grid { display:flex; flex-wrap:wrap; gap:4px; margin:5px 0; }
    .sg-pref-chip {
      background:#141d30; color:#64748b;
      border:1px solid rgba(255,255,255,.1);
      border-radius:5px; padding:3px 8px;
      font:inherit; font-size:11px; cursor:pointer;
    }
    .sg-pref-chip.must-have { color:#facc15; border-color:rgba(250,204,21,.55); background:rgba(250,204,21,.10); }
    .sg-pref-chip.preferred { color:#4ade80; border-color:rgba(74,222,128,.5);  background:rgba(74,222,128,.10); }
    .sg-pref-chip.optional  { color:#60a5fa; border-color:rgba(96,165,250,.5);  background:rgba(96,165,250,.10); }
    .sg-pref-chip.avoid     { color:#f87171; border-color:rgba(239,68,68,.5);   background:rgba(239,68,68,.10);  }
    .sg-diff.pref-star { border-color:rgba(251,191,36,.55); }
    .sg-add-btn {
      width:100%; background:#0c1526; color:#4b5563;
      border:1px dashed rgba(255,255,255,.1); border-radius:6px;
      padding:6px; font:inherit; font-size:11px; cursor:pointer; margin-top:4px;
    }
    .sg-add-btn:hover { color:#94a3b8; border-color:rgba(255,255,255,.2); }

    .sg-hint { color:#4b5563; font-size:11px; text-align:center; padding:14px 10px; }
    .c-green{color:#86efac;} .c-blue{color:#93c5fd;} .c-gold{color:#fde68a;}
    .c-orange{color:#fb923c;} .c-red{color:#fca5a5;} .c-purple{color:#c084fc;} .c-muted{color:#64748b;}

    .sg-inspect-badge {
      position:absolute; top:10px; right:40px;
      background:#0c1526; border-radius:6px;
      padding:3px 8px; font:11px Inter,sans-serif; z-index:10;
      display:flex; align-items:center; gap:6px;
      border:1px solid rgba(74,222,128,.3);
    }
    .sg-inspect-badge-label { color:#4ade80; }
    .sg-inspect-badge-btn {
      font-size:9px; padding:1px 6px; border-radius:4px; cursor:pointer;
      background:#0a1220; border:1px solid rgba(255,255,255,.15); color:#94a3b8;
      font-family:inherit;
    }
    .sg-inspect-badge-btn.remove { color:#fca5a5; border-color:rgba(239,68,68,.3); }
    .sg-inspect-badge-btn.add    { color:#86efac; border-color:rgba(74,222,128,.3); }
    .sg-team-header {
      display:flex; align-items:center; justify-content:space-between;
      padding:8px 10px; cursor:pointer; user-select:none;
      border-bottom:1px solid rgba(255,255,255,.05);
    }
    .sg-team-header:hover { background:rgba(255,255,255,.02); }
    .sg-team-body.collapsed { display:none; }
    .sg-team-toggle {
      width:30px; height:16px; border-radius:8px; border:none; cursor:pointer;
      background:#1e293b; position:relative; flex-shrink:0; transition:background .2s;
    }
    .sg-team-toggle.on { background:rgba(59,130,246,.6); }
    .sg-team-toggle::after {
      content:""; position:absolute; top:2px; left:2px;
      width:12px; height:12px; border-radius:50%; background:#94a3b8; transition:left .15s;
    }
    .sg-team-toggle.on::after { left:16px; background:#e0f2fe; }
    .sg-storage-warn {
      margin:6px 8px 2px; padding:5px 8px; border-radius:5px; font-size:10px;
      background:rgba(251,191,36,.08); border:1px solid rgba(251,191,36,.25); color:#fbbf24;
    }
    .sg-storage-warn.crit {
      background:rgba(248,113,113,.1); border-color:rgba(248,113,113,.3); color:#f87171;
    }
    .sg-hist-player-btn {
      display:block; width:100%; text-align:left; padding:6px 10px;
      background:none; border:none; border-bottom:1px solid rgba(255,255,255,.04);
      color:#94a3b8; font:11px Inter,sans-serif; cursor:pointer;
    }
    .sg-hist-player-btn:hover { background:rgba(255,255,255,.03); color:#e2e8f0; }
    .sg-hist-player-btn.active { color:#93c5fd; background:rgba(59,130,246,.1); }
    .sg-hist-slot { display:flex; gap:6px; align-items:baseline; padding:2px 0; font-size:10px; }
    .sg-hist-slot-name { color:#4b5563; min-width:62px; }
    .sg-hist-stat-row { display:flex; justify-content:space-between; padding:2px 0; font-size:10px; }
    .sg-hist-stat-lbl { color:#4b5563; }
    .sg-hist-up { color:#4ade80; }
    .sg-hist-dn { color:#f87171; }
    .sg-hist-same { color:#64748b; }

    .sg-debug-list { display:flex; flex-direction:column; gap:2px; padding:4px 6px; }
    .sg-debug-item { border-radius:6px; overflow:hidden; border:1px solid rgba(255,255,255,.06); }
    .sg-debug-header { display:flex; align-items:center; gap:6px; padding:5px 8px; cursor:pointer; background:#0c1526; }
    .sg-debug-header:hover { background:#111e35; }
    .sg-debug-toggle { color:#4b5563; font-size:10px; flex-shrink:0; }
    .sg-debug-name { flex:1; font-size:11px; font-weight:600; color:#e8eefc; }
    .sg-debug-slot { font-size:10px; }
    .sg-debug-score { font-size:12px; flex-shrink:0; }
    .sg-debug-body { background:#080f1c; padding:6px 8px; }
    .sg-debug-table { width:100%; border-collapse:collapse; font-size:10px; }
    .sg-debug-table th { color:#4b5563; font-weight:600; padding:2px 6px 4px; text-align:left; }
    .sg-debug-table td { padding:2px 6px; vertical-align:middle; }
    .sg-debug-table tr:hover td { background:rgba(255,255,255,.03); }
    .sg-debug-summary { display:flex; flex-wrap:wrap; gap:6px; padding:6px 4px 2px; font-size:10px; color:#64748b; border-top:1px solid rgba(255,255,255,.05); margin-top:4px; }
    .debug-cap-warning { color:#f0a030; font-size:0.85em; margin-top:2px; padding:2px 8px; }
    .debug-v9-section   { margin-top: 8px; border-top: 1px solid #333; padding-top: 6px; font-size: 0.85em; padding: 6px 8px 4px; }
    .debug-v9-header    { color: #888; margin-bottom: 4px; }
    .debug-v9-row { font-size: 0.85em; color: #aaa; margin-top: 2px; padding: 2px 8px; }
    .debug-v9-breakdown { margin-left: 12px; color: #999; }
    .debug-v9-summary   { font-style: italic; margin-top: 4px; }
    .debug-v9-label { min-width: 80px; display: inline-block; }

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

    #aimSgToggle {
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
        <button class="sg-tab"        data-tab="debug">🐛 Debug</button>
      </div>
      <div class="sg-body" id="aimSgBody"><div class="sg-hint">Waiting for data…</div></div>
    `;
  }

  function _attachTabListeners(container) {
    container.querySelectorAll(".sg-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        container.querySelectorAll(".sg-tab").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        state.activeTab = btn.dataset.tab;
        if (state.activeTab !== "gear" && state.activeTab !== "team") {
          state.pinnedItemId = null;
        }
        fadeApplyBagHighlights();
        const isWide = state.activeTab === "gear" || state.activeTab === "market" || state.activeTab === "team" || state.activeTab === "debug";
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
    _cssStyleEl = document.createElement("style");
    _cssStyleEl.textContent = CSS;
    document.documentElement.appendChild(_cssStyleEl);

    _hlStyleEl = document.createElement("style");
    _hlStyleEl.textContent = `
      .sg-mp-badge {
        position:absolute !important; top:5px !important; right:5px !important;
        font:700 10px/1.4 Inter,sans-serif !important;
        padding:2px 7px !important; border-radius:4px !important;
        border:1px solid !important; z-index:10 !important; pointer-events:none !important;
      }
      .sg-hl-bis  { outline:2px solid #facc15; }
      .sg-hl-top  { outline:2px solid #4ade80; }
      .sg-hl-good { outline:2px solid #60a5fa; }
      .sg-hl-sal  { outline:2px solid #94a3b8; }
      .sg-hl-pin      { outline:3px solid #f59e0b !important; box-shadow:0 0 20px 6px rgba(245,158,11,.90) !important; border-radius:4px; }
      .sg-hl-grade-s  { outline:3px solid #facc15 !important; box-shadow:0 0 16px 4px rgba(250,204,21,.80) !important; border-radius:4px; }
      .sg-hl-grade-a  { outline:3px solid #4ade80 !important; box-shadow:0 0 16px 4px rgba(74,222,128,.75) !important; border-radius:4px; }
      .sg-hl-grade-b  { outline:3px solid #60a5fa !important; box-shadow:0 0 16px 4px rgba(96,165,250,.75) !important; border-radius:4px; }
      .sg-hl-grade-c  { outline:3px solid #94a3b8 !important; box-shadow:0 0 16px 4px rgba(148,163,184,.65) !important; border-radius:4px; }
    `;
    document.documentElement.appendChild(_hlStyleEl);

    if (_moduleApp) {
      // Module mode: register with loader's WindowManager — tray button + managed panel
      _moduleApp.ui.registerPanel({
        id:     "aim-loot-helper",
        title:  "Aim Loot Helper",
        icon:   "⚡",
        render: _panelShellHtml,
        width:  310,
        height: 580,
        footer: `v${MODULE_VERSION} · Produced & maintained by AimForNuts`,
      });
      panelEl = _moduleApp.ui.getPanel("aim-loot-helper");
      if (panelEl) _attachTabListeners(panelEl);
    } else {
      // Standalone mode: create own fixed panel
      panelEl = document.createElement("div");
      panelEl.id = "sgPanel";
      panelEl.innerHTML = `
        <div class="sg-drag" id="aimSgDrag">
          <span class="sg-title">Aim Loot Helper <span style="font-size:10px;font-weight:400;color:#4b5563;">v8.46.0</span></span>
          <button class="sg-btn" id="aimSgHide">Hide</button>
        </div>
        ${_panelShellHtml()}
        <div class="sg-footer">v${MODULE_VERSION} · Produced &amp; maintained by <span class="sg-footer-name">AimForNuts</span></div>
      `;

      const toggleEl = document.createElement("button");
      toggleEl.id = "sgToggle";
      toggleEl.textContent = "⚡ Loot";
      toggleEl.style.display = "none";

      document.documentElement.appendChild(panelEl);
      document.documentElement.appendChild(toggleEl);

      document.getElementById("aimSgHide").addEventListener("click", () => {
        panelEl.classList.add("sg-hidden"); toggleEl.style.display = "block";
      });
      toggleEl.addEventListener("click", () => {
        panelEl.classList.remove("sg-hidden"); toggleEl.style.display = "none";
      });

      _attachTabListeners(panelEl);
      makeDraggable(panelEl, document.getElementById("aimSgDrag"));
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
   * RENDER — Debug Tab
   **************************************************************************/

  function renderDebug() {
    const items = state.bagItems;
    if (!items || !items.length) {
      return `<div class="sg-hint">No bag items found.<br>Open your inventory first.</div>`;
    }
    const filterKey = state.activeFilterKey;
    const fc = state.filters.get(filterKey);
    if (!fc) return `<div class="sg-hint">No active filter.</div>`;

    // Filter header chips
    const chipSummary = () => {
      const parts = [];
      if (fc.preferredStats?.size) parts.push([...fc.preferredStats].map(s => `<span class="sg-pref-chip must-have">★ ${esc(STAT_DEFS.find(d=>d.key===s)?.label??s)}</span>`).join(""));
      if (fc.stats?.size)          parts.push([...fc.stats].map(s => `<span class="sg-pref-chip preferred">♥ ${esc(STAT_DEFS.find(d=>d.key===s)?.label??s)}</span>`).join(""));
      if (fc.optional?.size)       parts.push([...fc.optional].map(s => `<span class="sg-pref-chip optional">◎ ${esc(STAT_DEFS.find(d=>d.key===s)?.label??s)}</span>`).join(""));
      if (fc.avoid?.size)          parts.push([...fc.avoid].map(s => `<span class="sg-pref-chip avoid">✗ ${esc(STAT_DEFS.find(d=>d.key===s)?.label??s)}</span>`).join(""));
      return parts.join(" &nbsp; ");
    };

    const scored = items
      .filter(item => item.filterBreakdowns?.[filterKey])
      .sort((a, b) => (b.filterBreakdowns[filterKey].finalScore) - (a.filterBreakdowns[filterKey].finalScore));

    if (!scored.length) return `<div class="sg-hint">No scored items found.</div>`;

    const fmtVal = v => v == null || v === 0 ? "—" : (Number.isInteger(v) ? String(v) : v.toFixed(1));
    const fmtPct = v => v == null ? "" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(0)}%`;
    const fmtScore = v => `${v >= 0 ? "+" : ""}${v.toFixed(1)}`;
    const tierColor = { mustHave:"#facc15", preferred:"#4ade80", optional:"#60a5fa", avoid:"#f87171", neutral:"#64748b", ineligible:"#374151" };
    const tierLabel = { mustHave:"★", preferred:"♥", optional:"◎", avoid:"✗", neutral:"·", ineligible:"—" };

    let html = `<div style="padding:6px 10px 4px;">
    <div style="font-size:10px;color:#64748b;margin-bottom:4px;">Active filter: <b style="color:#e8eefc">${esc(filterKey)}</b></div>
    <div style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:8px;">${chipSummary()}</div>
  </div>
  <div class="sg-debug-list">`;

    for (const item of scored) {
      const bd      = item.filterBreakdowns[filterKey];
      const color   = rarityColor(item.rarity);
      const rec     = item.rec ?? { label:"—", cls:"" };
      const isOpen  = state.debugExpandedItems.has(item.id);
      const slotLbl = item.slotType ?? "";

      html += `<div class="sg-debug-item${isOpen?" open":""}" data-debug-id="${esc(String(item.id))}">
      <div class="sg-debug-header" style="border-left:3px solid ${color};">
        <span class="sg-debug-toggle">${isOpen?"▾":"▸"}</span>
        <span class="sg-debug-name">${esc(item.name)}</span>
        <span class="sg-debug-slot" style="color:#4b5563;">${esc(slotLbl)}</span>
        <span class="sg-badge ${rec.cls}" style="font-size:9px;">${esc(rec.label)}</span>
        <span class="sg-debug-score" style="color:${bd.finalScore>=0?"#4ade80":"#f87171"};font-weight:700;">${bd.finalScore.toFixed(1)}</span>
      </div>
      ${rec.qualityCapReason ? `<div class="debug-cap-warning">Score verdict: ${esc(item.rawRec?.label ?? '?')} → overridden to: ${esc(rec.label)}</div>` : ""}
      ${rec.qualityCapReason ? `<div class="debug-cap-warning">⚠ Reason: ${esc(rec.qualityCapReason)}</div>` : ""}`;

      if (item.v9Upgrade) {
        const up  = item.v9Upgrade;
        const gq  = item.v9GearQuality;
        const bf  = item.v9BuildFit;
        const rec9 = item.v9Recommendation;

        html += `<div class="debug-v9-section">`;
        html += `<div class="debug-v9-header">── v9 Scoring ──</div>`;
        html += `<div class="debug-v9-row"><b>Upgrade:</b> ${up.label}&nbsp;&nbsp;${up.score >= 0 ? '+' : ''}${up.score}</div>`;
        html += `<div class="debug-v9-row"><b>Quality:</b> ${gq.score}/100 — ${gq.label}</div>`;
        html += `<div class="debug-v9-row"><b>Fit:</b> ${bf.score}/100 — ${bf.label}</div>`;
        // Active-filter legacy score (matches the value shown in the header). Best-other-filter
        // score (`bestFilterScore`) is -Infinity when no other filter qualifies, so we use
        // `prefScore` here — that's the legacy score for the currently active filter.
        const legacyScore = typeof item.prefScore === 'number' ? item.prefScore : (typeof item.bestFilterScore === 'number' && isFinite(item.bestFilterScore) ? item.bestFilterScore : null);
        html += `<div class="debug-v9-row" style="color:#555">Legacy score: ${legacyScore != null ? legacyScore.toFixed(1) : '—'}</div>`;
        if (rec9 && rec9.overlay) {
          html += `<div class="debug-v9-row"><b>Overlay:</b> ${rec9.overlay}</div>`;
        }
        if (rec9) {
          html += `<div class="debug-v9-row debug-v9-summary">${rec9.summary}</div>`;
        }
        html += `<div class="debug-v9-breakdown">`;
        html += `<div>Must-have adjustment: ${up.mustHaveAdjustment >= 0 ? '+' : ''}${up.mustHaveAdjustment.toFixed(1)}</div>`;
        html += `<div>Coverage bonus: +${up.coverageBonus.toFixed(2)} (${up.desiredStatsImproved}/${up.desiredStatsEligible} desired stats improved)</div>`;
        html += `<div>Neutral gain: ${up.neutralContribution >= 0 ? '+' : ''}${up.neutralContribution.toFixed(1)}</div>`;
        html += `<div>Stat magnitude: ${up.magnitudeScore >= 0 ? '+' : ''}${up.magnitudeScore.toFixed(1)}</div>`;
        html += `</div>`;
        html += `</div>`;
      }

      if (isOpen) {
        html += `<div class="sg-debug-body">
        <table class="sg-debug-table">
          <thead><tr>
            <th>Stat</th><th>Equipped</th><th>Item</th><th>Δ</th><th>Score</th>
          </tr></thead><tbody>`;

        for (const r of bd.reasons) {
          const label = STAT_DEFS.find(d => d.key === r.stat)?.label ?? r.stat;
          const col   = tierColor[r.tier] ?? "#64748b";
          const icon  = tierLabel[r.tier] ?? "·";
          const dimmed = r.tier === "ineligible";
          html += `<tr style="${dimmed?"opacity:.4;":""}">
          <td><span style="color:${col};font-size:10px;">${icon} ${esc(label)}</span></td>
          <td style="color:#94a3b8;">${fmtVal(r.curVal)}</td>
          <td style="color:#e8eefc;">${dimmed ? "<i>N/A</i>" : fmtVal(r.candVal)}</td>
          <td style="color:#94a3b8;">${dimmed ? "<i>ineligible</i>" : (r.delta != null ? fmtPct(r.delta) : "")}</td>
          <td style="color:${(r.contribution??0)>=0?"#4ade80":"#f87171"};font-weight:600;">${dimmed ? "" : fmtScore(r.contribution??0)}</td>
        </tr>`;
        }

        html += `</tbody></table>
        <div class="sg-debug-summary">
          <span>Must-have presence <b>${bd.mustHaveCoverageScore.toFixed(1)}</b></span>
          <span>Must-have stat gain <b>${bd.mustHavePowerScore.toFixed(1)}</b></span>
          <span>Preferred stat gain <b>${bd.cappedPreferredScore.toFixed(1)}</b>${bd.rawPreferredScore !== bd.cappedPreferredScore ? ` <span style="color:#4b5563;">(Before cap ${bd.rawPreferredScore.toFixed(1)})</span>` : ""}</span>
          ${bd.avoidOpportunityCost ? `<span>avoid <b style="color:#f87171;">${bd.avoidOpportunityCost.toFixed(1)}</b></span>` : ""}
          ${bd.neutralScore ? `<span>Neutral stat gain <b>${bd.neutralScore.toFixed(1)}</b></span>` : ""}
          ${bd.optionalScore ? `<span>Optional stat gain <b>${bd.optionalScore.toFixed(1)}</b></span>` : ""}
          ${bd.multiRollBonus ? `<span>multi <b>${bd.multiRollBonus.toFixed(1)}</b></span>` : ""}
          <span style="color:#e8eefc;font-weight:700;">= ${bd.finalScore.toFixed(1)}</span>
        </div>
      </div>`;
      }

      html += `</div>`;
    }

    html += `</div>`;
    return html;
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
      </div>`;
    }

    {
      const enabledSkills = state.skills.filter(s => s.enabled);
      if (enabledSkills.length > 0 && state.manaRegen != null) {
        const cdr        = state.cdr ?? 0;
        const cdrMult    = 1 / Math.max(0.01, 1 - cdr / 100);
        const totalMpMin = enabledSkills.reduce((sum, sk) => sum + sk.cost * 60 / sk.intervalS * cdrMult, 0);
        const regenMpMin = state.manaRegen * 6;
        const surplus    = regenMpMin - totalMpMin;
        const col        = surplus >= 0 ? "#60a5fa" : "#f87171";
        const sign       = surplus >= 0 ? "+" : "";
        html += `<div class="sg-sec">
          <div class="sg-lbl">MSM (Mana Sustain/min)</div>
          <div class="sg-dps-box" style="background:#0d1a2e;">
            <div class="sg-dps-num" style="color:${col};">${sign}${Math.round(surplus)}</div>
            <div class="sg-dps-calc">
              MP/min surplus · <b>${Math.round(regenMpMin)}</b> regen − <b>${Math.round(totalMpMin)}</b> skills${cdr > 0 ? ` (${cdr}% CDR)` : ""}
            </div>
          </div>
        </div>`;
      }
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
        <div class="sg-row"><span class="sg-key">Mana Regen</span> <span class="sg-val c-blue">${state.manaRegen??"—"}/10s</span></div>
      </div>
      ${(() => {
        const enabledSkills = state.skills.filter(s => s.enabled);
        if (!enabledSkills.length) return '';
        const cdr        = state.cdr ?? 0;
        const cdrMult    = 1 / Math.max(0.01, 1 - cdr / 100);
        const totalMpMin = enabledSkills.reduce((s, sk) => s + sk.cost * 60 / sk.intervalS * cdrMult, 0);
        const regenMpMin = (state.manaRegen ?? 0) * 6;
        return `<div class="sg-sec">
          <div class="sg-lbl">Mana Use${cdr > 0 ? ` (${cdr}% CDR)` : ""}</div>
          ${enabledSkills.map(sk => {
            const mpm = Math.round(sk.cost * 60 / sk.intervalS * cdrMult);
            return `<div class="sg-row"><span class="sg-key">${esc(sk.name)}</span><span class="sg-val c-blue">${mpm}/min</span></div>`;
          }).join('')}
          <div class="sg-row" style="border-top:1px solid rgba(255,255,255,.06);margin-top:4px;padding-top:4px">
            <span class="sg-key">Total needed</span><span class="sg-val">${Math.round(totalMpMin)} MP/min</span>
          </div>
          <div class="sg-row">
            <span class="sg-key">Regen (6t/min)</span><span class="sg-val c-blue">${Math.round(regenMpMin)} MP/min</span>
          </div>
        </div>`;
      })()}
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
            <tr><td>★ Must have</td><td>normalized delta × 100, +25 if present, −100 if missing</td></tr>
            <tr><td>♥ Preferred</td><td>normalized delta × 35 (capped vs must-have power)</td></tr>
            <tr><td>◎ Optional</td><td>normalized delta × 3</td></tr>
            <tr><td>✗ Avoid</td><td>−20 opportunity cost if stat is on item (scales with coverage)</td></tr>
            <tr><td>(untracked)</td><td>normalized delta × 10</td></tr>
          </table>
          <b>Result labels:</b>
          <table>
            <tr><td>⭐ BiS</td><td>all must-haves present · score ≥ 50</td></tr>
            <tr><td>✅ Top</td><td>score ≥ 25</td></tr>
            <tr><td>👍 Good</td><td>score ≥ 0</td></tr>
            <tr><td>💾 Salvage</td><td>score &lt; 0</td></tr>
          </table>
          <b>Multi-roll bonus</b> adds a flat score when a multi-rolled item has a specific stat — set per stat in the ✏ edit panel.<br><br>
          <b>Roll quality cap</b>: items with median roll quality &lt; 75% are capped at Good; weapons with ATK quality &lt; 75% are capped at Salvage.
        </div>
      </details>
      <div class="sg-filter-list">`;

    for (const [key, fc] of state.filters) {
      const isActive  = key === state.activeFilterKey;
      const isEditing = fe?.key === key;
      html += `<div class="sg-filter-row${isActive?" active":""}${fc.enabled?"":" disabled"}" data-fkey="${esc(key)}" title="${isActive?"Active filter — click another row to switch":"Click to set as active filter"}">
        <div class="sg-filter-dot"></div>
        <span class="sg-filter-name">${esc(key)}</span>
        <button class="sg-icon-btn sg-toggle-btn${fc.enabled?"":" off"}" data-ftoggle="${esc(key)}" title="${fc.enabled?"Disable filter":"Enable filter"}">${fc.enabled?"●":"○"}</button>
        <button class="sg-icon-btn" data-dup="${esc(key)}" title="Duplicate as ${esc(key)}_Copy">⎘</button>
        <button class="sg-icon-btn" data-edit="${esc(key)}" title="Edit filter stats">✏</button>
        ${state.filters.size>1?`<button class="sg-icon-btn" data-del="${esc(key)}" title="Delete this filter">✗</button>`:""}
      </div>`;
      if (isEditing) {
        html += `<div class="sg-filter-edit">
          <input class="sg-filter-input" id="aimSgFeName" value="${esc(fe.name)}" placeholder="Filter name">
          <div class="sg-filter-edit-row">
            <button class="sg-btn" id="aimSgFeSave">Save</button>
            <button class="sg-btn" id="aimSgFeClean" title="Clear all stat selections for this filter">Clean</button>
            <button class="sg-btn" id="aimSgFeCancel">✗</button>
          </div>
          <div style="font-size:10px;color:#64748b;margin:2px 0 4px;">Click to cycle: Neutral → ★ Must have (±4) → ♥ Preferred (±2) → ◎ Optional → ✗ Avoid → Neutral</div>
          <div class="sg-pref-grid">`;
        for (const def of STAT_DEFS) {
          const { cls, prefix } = statChipInfo(def.key, fe);
          html += `<button class="${cls}" data-estat="${esc(def.key)}">${esc(prefix + def.label)}</button>`;
        }
        html += `</div>
          <div style="font-size:10px;color:#64748b;margin:8px 0 4px;">Items with the corresponding multi roll on ALL stats selected above will be highly bumped</div>
          <div class="sg-mb-grid">`;
        for (const def of STAT_DEFS) {
          const val = fe.multiBonus[def.key] ?? 0;
          html += `<button class="sg-mb-chip${val>0?" active":""}" data-mbstat="${esc(def.key)}">${esc(def.label)}${val>0?" +"+val:""}</button>`;
        }
        html += `</div></div>`;
      }
    }

    html += `</div>
      <button class="sg-add-btn" id="aimSgFeAdd">+ New Filter</button>
    </div>`;

    if (!fe) {
      const activeFC = state.filters.get(state.activeFilterKey) ?? mkFC([]);
      html += `<div class="sg-sec">
        <div class="sg-lbl">Stats — ${esc(state.activeFilterKey)}</div>
        <div style="font-size:10px;color:#4b5563;margin-bottom:4px;">Click to cycle: Neutral → ★ Must have (±4) → ♥ Preferred (±2) → ◎ Optional → ✗ Avoid → Neutral</div>
        <div class="sg-pref-grid">`;
      for (const def of STAT_DEFS) {
        const { cls, prefix } = statChipInfo(def.key, activeFC);
        html += `<button class="${cls}" data-qstat="${esc(def.key)}">${esc(prefix + def.label)}</button>`;
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
      bis:  "color:#facc15;border-color:#facc15;",
      top:  "color:#4ade80;border-color:#4ade80;",
      good: "color:#60a5fa;border-color:#60a5fa;",
      sal:  "color:#94a3b8;border-color:#374151;",
    };
    const CAT_HL_EMOJI = { bis:"⭐", top:"✅", good:"👍", sal:"💾" };

    let html = `<div class="sg-gear-toolbar">
      <div style="display:flex;gap:5px;">
        <button class="sg-mode-btn${state.gearMode==="slot"?" active":""}" id="aimSgModeSlot">📦 Slot</button>
        <button class="sg-mode-btn${state.gearMode==="category"?" active":""}" id="aimSgModeCat">🏷 Category</button>
      </div>
      <span class="sg-cache-hint">
        ${esc(statusText)}
        ${cacheAge!==null?` · ${cacheAge}s ago`:""}
        · <span style="color:#3b82f6;">${esc(state.activeFilterKey||"—")}</span>
      </span>
    </div>
    <div class="sg-hl-toolbar">
      <span class="sg-hl-label">Highlight:</span>
      <button class="sg-mode-btn${state.highlightCats.size===CATEGORIES.length?" active":""}" id="aimSgHlAll"
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

    {
      const checkedSalvageCount    = getSelectedSalvageItems().length;
      const highlightedSalvageCount = getHighlightedSalvageItems().length;
      const selectedSalvageCount   = getSalvageTargetItems().length;
      const salvageRecCount        = state.bagItems.filter(i => i.cat === "sal").length;
      html += `<div class="sg-hl-toolbar" style="border-top:1px solid rgba(255,255,255,.04);padding-top:5px;align-items:center;">
        <span class="sg-hl-label">Salvage:</span>
        <button class="sg-mode-btn" data-sg-select-salvage ${(!salvageRecCount || state.salvageBusy) ? "disabled" : ""}
          style="${(!salvageRecCount || state.salvageBusy) ? "opacity:.45;cursor:not-allowed;" : "color:#fca5a5;border-color:#ef4444;"}"
          title="Highlight the Salvage recommendation category">Highlight Salvage (${salvageRecCount})</button>
        <button class="sg-mode-btn" data-sg-clear-salvage ${((!checkedSalvageCount && !highlightedSalvageCount) || state.salvageBusy) ? "disabled" : ""}
          style="${((!checkedSalvageCount && !highlightedSalvageCount) || state.salvageBusy) ? "opacity:.45;cursor:not-allowed;" : ""}">Clear</button>
        <button class="sg-mode-btn" data-sg-salvage-selected ${(!selectedSalvageCount || state.salvageBusy) ? "disabled" : ""}
          style="${(!selectedSalvageCount || state.salvageBusy) ? "opacity:.45;cursor:not-allowed;" : "color:#fca5a5;border-color:#ef4444;background:rgba(239,68,68,.08);"}"
          title="Salvage gear items selected by the Highlight buttons, plus any checked items">💾 ${state.salvageBusy ? "Salvaging…" : `Salvage Highlighted (${selectedSalvageCount})`}</button>
        <label style="display:inline-flex;align-items:center;gap:4px;font-size:10px;color:#64748b;cursor:pointer;margin-left:4px;" title="Skip S-rated items when salvaging">
          <input type="checkbox" id="aimSgSalvageExcludeS" ${state.salvageExcludeSTier ? "checked" : ""} style="width:11px;height:11px;accent-color:#facc15;cursor:pointer;">
          Skip S
        </label>
        ${state.salvageStatus ? `<span style="font-size:10px;line-height:1.25;color:${state.salvageStatus.startsWith("Salvaged") ? "#4ade80" : state.salvageStatus.startsWith("Salvaging") ? "#93c5fd" : "#fca5a5"};">${esc(state.salvageStatus)}</span>` : ""}
      </div>`;
    }

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
      const defOpen = state.catOpen[cat.key] ?? (cat.key==="bis"||cat.key==="top"||cat.key==="good");
      html += `<div class="sg-cat-section" data-cat="${esc(cat.key)}">
        <div class="sg-cat-header">
          <span class="sg-cat-title">
            <span class="sg-badge rec-${cat.key}">${esc(cat.label)}</span>
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

  function _marketCtxSelectorHtml() {
    const tracked = Object.values(trackedProfiles)
      .filter(tp => tp.snapshots.length > 0)
      .sort((a, b) => (latestSnap(b)?.ts ?? 0) - (latestSnap(a)?.ts ?? 0));
    if (!tracked.length) return "";
    const opts = tracked.map(tp => {
      const snap     = latestSnap(tp);
      const eqWeapon = snap ? Object.values(snap.equippedMap).find(i => ITEM_TYPE_TO_SLOT[i.type] === "Weapon") : null;
      const icon     = eqWeapon ? (ITEM_ICONS[eqWeapon.type] ?? "⚔️") : "👤";
      const sel      = state.marketCtxPlayerId === tp.playerId ? " selected" : "";
      return `<option value="${esc(tp.playerId)}"${sel}>${icon} ${esc(tp.username)}</option>`;
    }).join("");
    return `<select id="aimSgMktCtx" style="font-size:10px;background:#0f172a;color:#e8eefc;border:1px solid #1e293b;border-radius:4px;padding:1px 4px;cursor:pointer;">
      <option value=""${!state.marketCtxPlayerId ? " selected" : ""}>👤 Me</option>
      ${opts}
    </select>`;
  }

  function renderMarket() {
    if (!state.marketVisible) {
      return `<div class="sg-hint">Open the <strong>Market</strong><br>to scan listings.</div>`;
    }
    if (!state.marketItems.length) {
      return `<div class="sg-hint">No gear listings visible.<br>Switch to Weapons / Armor / Jewelry.</div>`;
    }
    const ctxProfile = state.marketCtxPlayerId ? trackedProfiles[state.marketCtxPlayerId] : null;
    if (!ctxProfile && !Object.keys(state.equipped).length) {
      return `<div class="sg-hint" style="padding:6px 10px;">No equipped gear cached — open inventory first for diffs.</div>`;
    }

    const mwt         = state.marketCtxMwt;
    const nowItems    = state.marketItems.filter(i => !i.isFutureTier);
    const futureItems = state.marketItems.filter(i =>  i.isFutureTier);
    const bisItems    = nowItems.filter(i => i.cat === "bis");
    const topItems    = nowItems.filter(i => i.cat === "top");
    const goodItems   = nowItems.filter(i => i.cat === "good");

    const ctxSelector = _marketCtxSelectorHtml();
    let html = `<div class="sg-gear-toolbar">
      <div style="display:flex;gap:6px;align-items:center;">
        <span style="color:#e8eefc;font-size:11px;font-weight:600;">${state.marketItems.length} listings</span>
        <span style="color:#4b5563;font-size:10px;">max T${mwt} (Lv${state.level??0})</span>
        ${ctxSelector}
      </div>
      <div style="display:flex;gap:5px;align-items:center;">
        ${futureItems.length ? `<button class="sg-mode-btn${state.marketHideFuture?" active":""}" id="aimSgMktHideFuture"
          style="${state.marketHideFuture?"color:#6b7280;border-color:#374151;":""}"
          title="${state.marketHideFuture?"Show":"Hide"} future tier items">🔒 ${futureItems.length}</button>` : ""}
        <span class="sg-cache-hint">· <span style="color:#3b82f6;">${esc(marketCtxFilterKey()||"—")}</span></span>
      </div>
    </div>`;

    if (!bisItems.length && !topItems.length && !goodItems.length) {
      html += `<div class="sg-hint">No BiS, Top, or Good items<br>in current tier range.</div>`;
    }

    const groups = [
      { cls:"rec-bis",  label:"⭐ BiS",  items: bisItems  },
      { cls:"rec-top",  label:"✅ Top",  items: topItems  },
      { cls:"rec-good", label:"👍 Good", items: goodItems },
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
    const mrLabel  = mrRaw ? `${mrRaw} Roll <span style="color:${mrQCol}">${mrQPct}%</span>${item.mrInteresting?" 🎲 Multi-Roll":""}` : null;

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
        if (!fc?.enabled) return false;
        return s >= SCORE_CONFIG.goodThreshold;
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
    const note   = item.mrInteresting ? ` · <span style="color:#a78bfa;">🎲 Multi-Roll</span>` : "";
    return `<span class="sg-badge sg-badge-multi">${label} Roll <span style="color:${qColor};font-weight:700;">${qPct}%</span>${note}</span>`;
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
    const _wBase        = WEAPON_BASE_SPEED[(state.equipped?.["Weapon"]?.type ?? "").toLowerCase()] ?? ctx.atkSpeed;
    const _totSpd       = (_wBase / ctx.atkSpeed - 1) * 100;
    const newSpd        = _wBase / (1 + (_totSpd - eqSpdPct + newSpdPct) / 100);
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

  function calcItemManaDelta(item) {
    if (!item.eqBaseStats || !item.ownBaseStats) return null;
    const manaDelta   = (item.ownBaseStats.mana      ?? 0) - (item.eqBaseStats.mana      ?? 0);
    const mregenDelta = (item.ownBaseStats.manaRegen ?? 0) - (item.eqBaseStats.manaRegen ?? 0);
    const cdrDelta    = (item.ownBaseStats.cdr       ?? 0) - (item.eqBaseStats.cdr       ?? 0);
    if (manaDelta === 0 && mregenDelta === 0 && cdrDelta === 0) return null;
    return { manaDelta, mregenDelta, cdrDelta };
  }

  // Shared sustainability score: (ΔRegen + ΔPool×poolFrac)×6 − CDR-driven consumption change
  function calcSustainScore(manaDelta, mregenDelta, cdrDelta) {
    const poolFrac = poolRegenFraction();
    const effectiveMregenDelta = mregenDelta + manaDelta * poolFrac;
    let deltaMpMin = 0;
    const enabledSkills = state.skills.filter(s => s.enabled);
    if (cdrDelta !== 0 && enabledSkills.length > 0) {
      const cur    = state.cdr ?? 0;
      const oldMult = 1 / Math.max(0.01, 1 - cur / 100);
      const newMult = 1 / Math.max(0.01, 1 - (cur + cdrDelta) / 100);
      const oldTotal = enabledSkills.reduce((s, sk) => s + sk.cost * 60 / sk.intervalS * oldMult, 0);
      const newTotal = enabledSkills.reduce((s, sk) => s + sk.cost * 60 / sk.intervalS * newMult, 0);
      deltaMpMin = newTotal - oldTotal;
    }
    return effectiveMregenDelta * 6 - deltaMpMin;
  }

  function _manaDeltaHtml(item) {
    const res = calcItemManaDelta(item);
    if (!res) return "";
    const { manaDelta, mregenDelta, cdrDelta } = res;
    const SEP = `style="padding:2px 0;border-top:1px solid rgba(255,255,255,.06);margin-top:3px"`;
    let html = "";
    if (Math.abs(manaDelta) >= 1) {
      const sign = manaDelta >= 0 ? "+" : "";
      const col  = manaDelta > 0 ? "#60a5fa" : "#f87171";
      html += `<div class="sg-row" ${SEP}><span class="sg-key">∆ Mana</span><span style="color:${col};font-weight:700">${sign}${Math.round(manaDelta)}</span></div>`;
    }
    if (Math.abs(mregenDelta) >= 0.05) {
      const sign = mregenDelta >= 0 ? "+" : "";
      const col  = mregenDelta > 0 ? "#60a5fa" : "#f87171";
      html += `<div class="sg-row" ${SEP}><span class="sg-key">∆ Mana/10s</span><span style="color:${col};font-weight:700">${sign}${mregenDelta.toFixed(1)}</span></div>`;
    }
    const sustain = calcSustainScore(manaDelta, mregenDelta, cdrDelta);
    if (Math.abs(sustain) >= 1) {
      const sign = sustain >= 0 ? "+" : "";
      const col  = sustain > 0 ? "#60a5fa" : "#f87171";
      html += `<div class="sg-row" ${SEP}><span class="sg-key">∆ MSM</span><span style="color:${col};font-weight:700">${sign}${Math.round(sustain)}</span></div>`;
    }
    return html;
  }

  const ARCHETYPES = [
    { id:"dps",  label:"DPS",  stats:new Set(["atk","atkSpeed","critChance","critDmg"]) },
    { id:"tank", label:"Tank", stats:new Set(["def","hp","healPower","lifesteal"]) },
    { id:"mana", label:"Mana", stats:new Set(["cdr","mana","manaRegen"]) },
    { id:"loot", label:"Loot", stats:new Set(["dropRate"]) },
  ];

  function calcItemIntrinsicGrade(item) {
    const qualities = item.rollQualities ?? {};
    const baseStats = item.ownBaseStats ?? {};

    const qVals = Object.values(qualities);
    if (!qVals.length) return null;
    const rollScore = qVals.reduce((s, v) => s + v * 100, 0) / qVals.length;

    const statKeys = Object.keys(baseStats).filter(k => k !== "allStats");
    const allStatsCount = "allStats" in baseStats ? 1 : 0;

    const archHits = {};
    for (const arch of ARCHETYPES) {
      archHits[arch.id] = statKeys.filter(k => arch.stats.has(k)).length;
    }
    const bestArch = ARCHETYPES.reduce((a, b) => archHits[a.id] >= archHits[b.id] ? a : b);
    const coreCount = archHits[bestArch.id];
    const totalNonAllStats = statKeys.length;

    const rawCoherence = totalNonAllStats > 0 ? (coreCount / totalNonAllStats) * 100 : 0;
    const coherenceScore = Math.min(100, rawCoherence + allStatsCount * 5);

    const statCountBonus = coreCount >= 3 ? 20 : coreCount >= 2 ? 10 : 0;

    const raw = rollScore * 0.5 + coherenceScore * 0.4 + statCountBonus;
    const score = Math.min(100, raw);
    const grade = score >= 85 ? "S" : score >= 70 ? "A" : score >= 55 ? "B" : "C";

    return { grade, score, archetype: bestArch.label, rollScore, coherenceScore, statCountBonus, coreCount, allStatsCount };
  }

  function intrinsicGradeBadgeHtml(item) {
    const g = calcItemIntrinsicGrade(item);
    if (!g) return "";
    const cls = `sg-ir-${g.grade.toLowerCase()}`;
    return `<span class="sg-ir-badge ${cls}" title="Item Rating: ${g.grade} (${g.score.toFixed(0)}) · ${g.archetype} archetype · Roll ${g.rollScore.toFixed(0)}% · Coherence ${g.coherenceScore.toFixed(0)}%">${g.grade}</span>`;
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

    const manaRes = calcItemManaDelta(item);
    if (manaRes) {
      const score = calcSustainScore(manaRes.manaDelta, manaRes.mregenDelta, manaRes.cdrDelta);
      if (Math.abs(score) >= 1) {
        const sign = score >= 0 ? "+" : "";
        const col  = score > 0 ? "#60a5fa" : "#f87171";
        lines.push(`<span style="color:${col};white-space:nowrap;" title="∆ MSM = Mana Sustain/min change">MSM ${sign}${Math.round(score)}</span>`);
      }
    }

    if (!lines.length) return "";
    return `<div class="sg-item-deltas">${lines.join("")}</div>`;
  }

  function renderItemCard(item, ctx = state, opts = {}) {
    const color     = rarityColor(item.rarity);
    const forgeStr  = item.forgeLevel ? `+${item.forgeLevel}` : "";
    const activeFC  = state.filters.get(state.activeFilterKey) ?? mkFC([]);
    const dispRec   = item.rec;
    const teamSendButton = opts.teamSendProfileId
      ? `<button type="button" class="sg-btn" data-sg-team-send-one="${esc(opts.teamSendProfileId)}" data-item-id="${esc(item.id)}" ${state.teamSendBusy ? "disabled" : ""} style="padding:1px 6px;font-size:9px;margin-left:4px;${state.teamSendBusy ? "opacity:.45;cursor:not-allowed;" : "border-color:rgba(74,222,128,.35);color:#86efac;"}" title="Send only this item to this teammate through Mail">📬 Send this</button>`
      : "";
    const isPinned   = state.pinnedItemId === String(item.id);
    const pinButton  = `<button type="button" class="sg-btn" data-sg-pin-item="${esc(item.id)}" style="padding:1px 6px;font-size:9px;margin-left:4px;${isPinned?"border-color:#f59e0b;color:#fcd34d;":"border-color:rgba(245,158,11,.25);color:#6b5a2a;"}" title="${isPinned?"Remove bag highlight":"Highlight this item in bag"}">📌${isPinned?" Pinned":""}</button>`;
    const badges    = [
      `<span class="sg-badge ${dispRec.cls}">${esc(dispRec.label)}</span>`,
      `<span class="sg-badge sg-badge-shard">💎 ${item.shards}</span>`,
      item.isLegacyStar ? `<span class="sg-badge sg-badge-legacy">★ Legacy</span>` : "",
      multiHtml(item),
      item.classRestricted ? `<span class="sg-badge sg-badge-restricted">🔒 Wrong type</span>` : "",
      intrinsicGradeBadgeHtml(item),
      teamSendButton,
      pinButton,
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
            ${!opts.teamSendProfileId ? `<label title="Select for salvage" style="display:inline-flex;align-items:center;margin-right:3px;cursor:pointer;"><input type="checkbox" data-sg-salvage-check="${esc(item.id)}" ${state.salvageSelectedIds.has(String(item.id)) ? "checked" : ""} style="width:12px;height:12px;accent-color:#ef4444;cursor:pointer;"></label>` : ""}
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
          const iNote = item.mrInteresting ? " 🎲 Multi-Roll" : "";
          return ` · ${lbl} Roll <span style="color:${qCol}">${qPct}%</span>${iNote}`;
        })():""}${item.classRestricted?" · 🔒 Wrong type":""}</div>
        <div class="sg-diffs">${chips}</div>
        ${filterTagsHtml(item)}
      </div>
      <div class="sg-cat-item-right">
        ${_itemDeltasCornerHtml(item, selfCtx())}
        <span class="sg-slot-pill">${esc(item.slotType)}</span>
        <span class="sg-badge sg-badge-shard">💎 ${item.shards}</span>
        ${intrinsicGradeBadgeHtml(item)}
        <button type="button" class="sg-btn" data-sg-pin-item="${esc(item.id)}" style="padding:1px 5px;font-size:10px;margin-top:2px;${state.pinnedItemId===String(item.id)?"border-color:#f59e0b;color:#fcd34d;":"border-color:rgba(245,158,11,.25);color:#6b5a2a;"}" title="${state.pinnedItemId===String(item.id)?"Remove bag highlight":"Highlight this item in bag"}">📌</button>
      </div>
    </div>`;
  }

  /**************************************************************************
   * SALVAGE
   **************************************************************************/

  const SALVAGE_STORAGE_KEY          = "aim_sgSalvageLearnedEndpoint";
  const SALVAGE_TEMPLATE_STORAGE_KEY = "aim_sgSalvageLearnedTemplateV1";

  function getSelectedSalvageItems() {
    const liveIds = new Set(state.bagItems.map(i => String(i.id)));
    for (const id of [...state.salvageSelectedIds]) {
      if (!liveIds.has(String(id))) state.salvageSelectedIds.delete(id);
    }
    return state.bagItems.filter(item => state.salvageSelectedIds.has(String(item.id)));
  }

  function getHighlightedSalvageItems() {
    if (!state.highlightCats.size) return [];
    return state.bagItems.filter(item => item && item.id && state.highlightCats.has(item.cat));
  }

  function getSalvageTargetItems() {
    const byId = new Map();
    for (const item of getHighlightedSalvageItems()) byId.set(String(item.id), item);
    for (const item of getSelectedSalvageItems())    byId.set(String(item.id), item);
    let result = [...byId.values()];
    if (state.salvageExcludeSTier) {
      result = result.filter(item => {
        const g = calcItemIntrinsicGrade(item);
        return !g || g.grade !== "S";
      });
    }
    return result;
  }

  function rememberSalvageEndpoint(url, bodyOrKeys = null, method = "POST") {
    try {
      const keys = Array.isArray(bodyOrKeys)
        ? bodyOrKeys
        : (bodyOrKeys && typeof bodyOrKeys === "object" ? Object.keys(bodyOrKeys) : []);
      localStorage.setItem(SALVAGE_STORAGE_KEY, JSON.stringify({ url, method, bodyKeys: keys, savedAt: Date.now() }));
      if (bodyOrKeys && typeof bodyOrKeys === "object") {
        localStorage.setItem(SALVAGE_TEMPLATE_STORAGE_KEY, JSON.stringify({ url, method, body: bodyOrKeys, savedAt: Date.now() }));
      }
    } catch {}
  }

  function getStoredSalvageTemplate() {
    try { return JSON.parse(localStorage.getItem(SALVAGE_TEMPLATE_STORAGE_KEY) || "null"); } catch { return null; }
  }

  function _cloneJson(x) {
    try { return JSON.parse(JSON.stringify(x)); } catch { return x; }
  }

  function _rewriteLearnedSalvagePayload(templateBody, item) {
    const itemId = item.id;
    const rewrite = (value, key = "") => {
      const k = String(key || "");
      if (/^(itemid|iteminstanceid|inventoryitemid|id)$/i.test(k)) return itemId;
      if (/^(itemids|iteminstanceids|inventoryitemids|ids)$/i.test(k)) return [itemId];
      if (/^(quantity|qty|amount|count)$/i.test(k)) return 1;
      if (Array.isArray(value)) {
        if (/^(items|itemids|inventoryitems|salvageitems)$/i.test(k)) {
          const first = value[0];
          if (first && typeof first === "object") return [rewrite(first, k)];
          return [itemId];
        }
        return value.map(v => rewrite(v, k));
      }
      if (value && typeof value === "object") {
        const out = {};
        for (const [childKey, childVal] of Object.entries(value)) out[childKey] = rewrite(childVal, childKey);
        if (/^(items|inventoryitems|salvageitems)$/i.test(k) && !Object.keys(out).some(x => /item|id/i.test(x))) {
          out.itemId = itemId;
          out.quantity = 1;
        }
        return out;
      }
      return value;
    };
    return rewrite(_cloneJson(templateBody));
  }

  function addSalvageAttempt(attempts, url, payload, method = "POST", learned = false) {
    if (!url || attempts.some(a => a.url === url && JSON.stringify(a.body) === JSON.stringify(payload))) return;
    attempts.push({ url, method, body: payload, learned });
  }

  function buildSalvageAttempts(item) {
    const itemId = item.id;
    const attempts = [];
    const learnedTemplate = getStoredSalvageTemplate();
    if (learnedTemplate?.url && learnedTemplate?.body) {
      addSalvageAttempt(attempts, learnedTemplate.url, _rewriteLearnedSalvagePayload(learnedTemplate.body, item), learnedTemplate.method || "POST", true);
    }
    [
      ["/api/inventory/salvage-selected", { itemIds: [itemId] }],
      ["/api/inventory/salvage",          { itemId, quantity: 1 }],
      ["/api/inventory/salvage",          { itemIds: [itemId] }],
      ["/api/inventory/salvage-item",     { itemId, quantity: 1 }],
      ["/api/inventory/salvageItem",      { itemId, quantity: 1 }],
      ["/api/item/salvage",               { itemId, quantity: 1 }],
      ["/api/items/salvage",              { itemIds: [itemId] }],
      ["/api/equipment/salvage",          { inventoryItemId: itemId, quantity: 1 }],
      ["/api/inventory/sell",             { itemId, quantity: 1 }],
    ].forEach(([url, body]) => addSalvageAttempt(attempts, url, body));
    return attempts;
  }

  async function salvageItemsBatch(items) {
    const itemIds = items.map(item => String(item.id)).filter(Boolean);
    if (!itemIds.length) return { ok: true };
    return postJson("/api/inventory/salvage-selected", { itemIds });
  }

  async function salvageOneItem(item) {
    const attempts = buildSalvageAttempts(item);
    let lastError = null;
    for (const attempt of attempts) {
      try {
        const result = await postJson(attempt.url, attempt.body, attempt.method || "POST");
        if (attempt.learned) rememberSalvageEndpoint(attempt.url, attempt.body, attempt.method || "POST");
        return result;
      } catch (err) { lastError = err; continue; }
    }
    throw lastError || new Error("No salvage endpoint accepted the request. Manually salvage one cheap item once while the script is active so it can learn the real endpoint.");
  }

  async function salvageSelectedItems() {
    if (state.salvageBusy) return;
    const items = getSalvageTargetItems();
    if (!items.length) {
      state.salvageStatus = "No highlighted/checked items to salvage.";
      render();
      return;
    }
    const preview = items.slice(0, 20).map(item => `${item.rec?.label || ""} ${compactItemLabel(item)} · ${item.rarity} · ${item.slotType}`).join("\n");
    const more = items.length > 20 ? `\n…plus ${items.length - 20} more` : "";
    const ok = window.confirm(`Salvage ${items.length} highlighted/checked item(s)?\n\n${preview}${more}`);
    if (!ok) return;

    state.salvageBusy = true;
    state.salvageStatus = `Salvaging ${items.length} item(s)…`;
    render();

    const salvaged = [];

    const result = await salvageItemsBatch(items);
    salvaged.push(...items);
    for (const item of items) state.salvageSelectedIds.delete(String(item.id));

    const goldGained = Number(result?.goldGained || result?.gold || 0);
    const matsGained = result?.materialsGained || result?.materials || null;
    let extra = goldGained ? ` · +${fmt(goldGained)}g` : "";
    if (matsGained && typeof matsGained === "object") {
      const mats = Object.entries(matsGained).map(([k, v]) => `${v} ${k}`).join(", ");
      if (mats) extra += ` · ${mats}`;
    }
    state.salvageStatus = `Salvaged ${salvaged.length} item(s)${extra}.`;

    if (salvaged.length) {
      const done = new Set(salvaged.map(item => String(item.id)));
      state.bagItems    = state.bagItems.filter(item => !done.has(String(item.id)));
      state.bagItemsRaw = state.bagItemsRaw.filter(item => !done.has(String(item.id)));
      applyBagHighlights();
    }

    state.salvageBusy = false;
    render();
  }

  /**************************************************************************
   * MAIL SEND TO PARTY
   **************************************************************************/

  const TEAM_SEND_STORAGE_KEY          = "aim_sgMailSendLearnedEndpoint";
  const TEAM_SEND_TEMPLATE_STORAGE_KEY = "aim_sgMailSendLearnedItemTemplateV2";

  function getRawItemById(itemId) {
    return state.bagItemsRaw.find(raw => String(raw.id) === String(itemId)) || null;
  }

  function buildTeamSendPlan() {
    const candidates = [];
    for (const tp of Object.values(trackedProfiles)) {
      if (!tp.active || tp.teamMember === false) continue;
      const snap       = latestSnap(tp);
      const eqMap      = snap?.equippedMap || {};
      const profFilter = tp.filterKey || state.activeFilterKey;
      // Expose a profile-shaped object for mail functions that expect .username/.playerId
      const profile = { playerId: tp.playerId, username: tp.username, equippedMap: eqMap, filterKey: tp.filterKey };
      for (const raw of state.bagItemsRaw) {
        const ev = _buildBagItem(raw, eqMap, profFilter);
        if (ev.cat !== "bis" && !(state.teamSendIncludeTop && ev.cat === "top")) continue;
        if (!ev.id) continue;
        candidates.push({ profile, item: ev, raw, score: Number(ev.prefScore || 0) });
      }
    }

    candidates.sort((a, b) =>
      b.score - a.score ||
      (b.item.mrMedianQuality || 0) - (a.item.mrMedianQuality || 0) ||
      String(a.profile.username || "").localeCompare(String(b.profile.username || ""))
    );

    const usedItems = new Set();
    const plan = [];
    for (const candidate of candidates) {
      const itemKey = String(candidate.item.id);
      if (usedItems.has(itemKey)) continue;
      usedItems.add(itemKey);
      plan.push(candidate);
    }

    plan.sort((a, b) =>
      String(a.profile.username || "").localeCompare(String(b.profile.username || "")) || b.score - a.score
    );
    return plan;
  }

  function buildMailMessage(profile, item) {
    const diffs = (item.diffs || [])
      .filter(d => d.isUp)
      .slice(0, 5)
      .map(d => d.text)
      .join(", ");
    const why = diffs ? `Upgrade stats: ${diffs}` : "Loot Helper marked this as BiS or Top.";
    return `Sent by Loot Helper. ${why}`;
  }

  function buildMailMessageForItems(profile, items) {
    const list = (Array.isArray(items) ? items : [items]).filter(Boolean);
    if (list.length <= 1) return buildMailMessage(profile, list[0]);
    const names = list.slice(0, 12).map(item => compactItemLabel(item)).join(", ");
    const more  = list.length > 12 ? `, +${list.length - 12} more` : "";
    return `Sent by Loot Helper. BiS/Top upgrades for ${profile?.username || "teammate"}: ${names}${more}`.slice(0, 500);
  }

  function getStoredMailTemplate() {
    try { return JSON.parse(localStorage.getItem(TEAM_SEND_TEMPLATE_STORAGE_KEY) || "null"); } catch { return null; }
  }

  function _objHasItemishKey(obj) {
    let found = false;
    const walk = (v, key = "") => {
      if (found || v == null) return;
      if (/item|inventory|attachment/i.test(String(key))) found = true;
      if (Array.isArray(v)) return v.slice(0, 3).forEach(x => walk(x, key));
      if (typeof v === "object") Object.entries(v).forEach(([k, val]) => walk(val, k));
    };
    walk(obj);
    return found;
  }

  function rememberMailEndpoint(url, bodyOrKeys = null, method = "POST") {
    try {
      const keys = Array.isArray(bodyOrKeys)
        ? bodyOrKeys
        : (bodyOrKeys && typeof bodyOrKeys === "object" ? Object.keys(bodyOrKeys) : []);
      localStorage.setItem(TEAM_SEND_STORAGE_KEY, JSON.stringify({ url, method, bodyKeys: keys, savedAt: Date.now() }));
      if (bodyOrKeys && typeof bodyOrKeys === "object" && _objHasItemishKey(bodyOrKeys)) {
        localStorage.setItem(TEAM_SEND_TEMPLATE_STORAGE_KEY, JSON.stringify({ url, method, body: bodyOrKeys, savedAt: Date.now() }));
      }
    } catch {}
  }

  function addMailEndpointToAttempts(attempts, url, payload, method = "POST", learned = false) {
    if (!url || attempts.some(a => a.url === url && JSON.stringify(a.body) === JSON.stringify(payload))) return;
    attempts.push({ url, method, body: payload, learned });
  }

  function _rewriteLearnedMailPayload(templateBody, profile, item, subject, message) {
    const recipientId   = profile.playerId;
    const recipientName = profile.username;
    const itemId        = item.id;

    const rewrite = (value, key = "") => {
      const k = String(key || "");
      if (/^(recipientid|toplayerid|targetplayerid|receiverid|receiverplayerid|playerid|toid|userid)$/i.test(k)) return recipientId;
      if (/^(recipientname|tousername|targetusername|receivername|toname|to)$/i.test(k)) return recipientName;
      if (/^(itemid|iteminstanceid|inventoryitemid|attachmentitemid|attacheditemid)$/i.test(k)) return itemId;
      if (/^(itemids|iteminstanceids|inventoryitemids)$/i.test(k)) return [itemId];
      if (/^(quantity|qty|amount|count)$/i.test(k)) return 1;
      if (/^(subject|title)$/i.test(k)) return subject;
      if (/^(message|body|text|content)$/i.test(k)) return message;
      if (Array.isArray(value)) {
        if (/^(items|attachments|attacheditems|mailitems)$/i.test(k)) {
          const first = value[0];
          if (first && typeof first === "object") return [rewrite(first, k)];
          return [itemId];
        }
        return value.map(v => rewrite(v, k));
      }
      if (value && typeof value === "object") {
        const out = {};
        for (const [childKey, childVal] of Object.entries(value)) out[childKey] = rewrite(childVal, childKey);
        if (/^(items|attachments|attacheditems|mailitems)$/i.test(k) && !Object.keys(out).some(x => /item/i.test(x))) {
          out.itemId   = itemId;
          out.quantity = 1;
        }
        return out;
      }
      return value;
    };
    return rewrite(_cloneJson(templateBody));
  }

  function buildMailAttempts(profile, item) {
    const subject       = `Gear upgrade: ${compactItemLabel(item)}`.slice(0, 80);
    const message       = buildMailMessage(profile, item);
    const recipientId   = profile.playerId;
    const recipientName = profile.username;
    const itemId        = item.id;
    const attempts      = [];

    const learnedTemplate = getStoredMailTemplate();
    if (learnedTemplate?.url && learnedTemplate?.body) {
      addMailEndpointToAttempts(attempts, learnedTemplate.url, _rewriteLearnedMailPayload(learnedTemplate.body, profile, item, subject, message), learnedTemplate.method || "POST", true);
    }

    [
      ["/api/mail/send-item",  { recipientId, itemId, quantity: 1, subject, message }],
      ["/api/mail/send-item",  { recipientName, itemId, quantity: 1, subject, message }],
      ["/api/mail/sendItem",   { recipientId, itemId, quantity: 1, subject, message }],
      ["/api/mail/item",       { toPlayerId: recipientId, itemId, quantity: 1, subject, message }],
      ["/api/mail/items/send", { toPlayerId: recipientId, itemId, quantity: 1, subject, message }],
      ["/api/mail/send",       { recipientId, subject, message, itemId, quantity: 1 }],
      ["/api/mail/send",       { recipientId, subject, message, itemInstanceId: itemId, quantity: 1 }],
      ["/api/mail/send",       { toPlayerId: recipientId, subject, body: message, itemId, quantity: 1 }],
      ["/api/mail/send",       { toUsername: recipientName, subject, body: message, itemId, quantity: 1 }],
      ["/api/mail/send",       { recipientId, subject, message, attachments: [{ itemId, quantity: 1 }] }],
      ["/api/mail/send",       { toUsername: recipientName, subject, body: message, items: [{ itemId, quantity: 1 }] }],
    ].forEach(([url, body]) => addMailEndpointToAttempts(attempts, url, body));

    return attempts;
  }

  // ── DOM automation helpers ────────────────────────────────────────────────

  function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  async function waitForSelector(selector, timeoutMs = 5000, root = document) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const el = root.querySelector(selector);
      if (el) return el;
      await sleep(75);
    }
    throw new Error(`Timed out waiting for ${selector}`);
  }

  function clickDom(el) {
    if (!el) throw new Error("Missing clickable element");
    try { el.scrollIntoView({ block: "center", inline: "center" }); } catch {}
    const view = document.defaultView;
    el.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, view }));
    el.dispatchEvent(new MouseEvent("mousedown",   { bubbles: true, cancelable: true, view }));
    el.dispatchEvent(new MouseEvent("pointerup",   { bubbles: true, cancelable: true, view }));
    el.dispatchEvent(new MouseEvent("mouseup",     { bubbles: true, cancelable: true, view }));
    el.click();
  }

  function setReactValue(el, value) {
    if (!el) throw new Error("Missing input element");
    const proto  = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, String(value ?? ""));
    else el.value = String(value ?? "");
    try {
      el.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, inputType: "insertText", data: String(value ?? "") }));
    } catch {
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function findButtonByText(selector, text) {
    const want = String(text || "").trim().toLowerCase();
    return [...document.querySelectorAll(selector)].find(btn => String(btn.textContent || "").trim().toLowerCase() === want) || null;
  }

  async function waitUntil(predicate, timeout = 5000, interval = 80, label = "condition") {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      let ok = false;
      try { ok = !!predicate(); } catch {}
      if (ok) return true;
      await sleep(interval);
    }
    throw new Error(`Timed out waiting for ${label}`);
  }

  function isDisabledLike(el) {
    if (!el) return true;
    return !!(el.disabled || el.getAttribute("aria-disabled") === "true" || /disabled/i.test(String(el.className || "")));
  }

  function isElementVisible(el) {
    if (!el || !el.isConnected) return false;
    const r  = el.getBoundingClientRect?.();
    const st = getComputedStyle(el);
    return !!r && r.width > 0 && r.height > 0 && st.display !== "none" && st.visibility !== "hidden" && st.opacity !== "0";
  }

  function normRecipientName(v) {
    return String(v || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function getVisibleMailRecipientText(compose) {
    const picker = compose?.querySelector?.(".mail-recipient-picker");
    if (!picker) return "";
    const input = picker.querySelector("input");
    const clone = picker.cloneNode(true);
    clone.querySelectorAll("input,textarea,button").forEach(n => n.remove());
    return String(input?.value || clone.textContent || "").trim();
  }

  function getMailDropdownOptions(compose) {
    const roots = [
      ...(compose ? [...compose.querySelectorAll(".mail-dropdown")] : []),
      ...document.querySelectorAll(".mail-dropdown"),
      ...document.querySelectorAll('[role="listbox"], [role="menu"]'),
    ].filter(Boolean);

    const candidates = [];
    for (const root of roots) {
      const directItems = [...root.querySelectorAll(".mail-dropdown-item, button, [role='option'], [role='menuitem'], li")];
      if (root.matches?.(".mail-dropdown-item, button, [role='option'], [role='menuitem'], li")) directItems.unshift(root);
      if (directItems.length) candidates.push(...directItems);
      else candidates.push(...root.querySelectorAll("div, span"));
    }

    return [...new Set(candidates)]
      .filter(el => isElementVisible(el))
      .map(el => {
        const rawText      = String(el.textContent || el.getAttribute("title") || el.getAttribute("aria-label") || "").trim();
        const text         = normRecipientName(rawText);
        const usernameText = normRecipientName(rawText.replace(/\s+Lv\s*\d+\s*$/i, ""));
        return { el, text, usernameText, rawText };
      })
      .filter(x => x.text);
  }

  function recipientAlreadySet(compose, recipientName) {
    const want = normRecipientName(recipientName);
    if (!want) return false;
    const visibleDropdown = getMailDropdownOptions(compose).length > 0;
    if (visibleDropdown) return false;
    const got = normRecipientName(getVisibleMailRecipientText(compose));
    return !!got && (got === want || got.startsWith(`${want} lv`) || got.startsWith(`${want} `));
  }

  function findRecipientDropdownOption(recipientName, compose) {
    const want   = normRecipientName(recipientName);
    const usable = getMailDropdownOptions(compose);
    return (usable.find(x => x.usernameText === want)
      || usable.find(x => x.text === want)
      || usable.find(x => x.text === `${want} lv`)
      || usable.find(x => x.text.startsWith(`${want} lv`))
      || usable.find(x => x.text.startsWith(`${want} `)))?.el || null;
  }

  async function pickMailRecipientFromDropdown(compose, recipientName) {
    const input = compose.querySelector('.mail-recipient-picker input, input[placeholder*="Recipient"], input');
    if (!input) throw new Error("Could not find Recipient input.");
    const want = String(recipientName || "").trim();
    if (!want) throw new Error("Missing recipient name.");
    if (recipientAlreadySet(compose, want)) return;

    setReactValue(input, "");
    input.focus();
    await sleep(80);

    setReactValue(input, want);
    input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: want.slice(-1) || " ", code: "KeyA" }));
    input.dispatchEvent(new KeyboardEvent("keyup",   { bubbles: true, key: want.slice(-1) || " ", code: "KeyA" }));
    await sleep(120);

    let option = null;
    const started = Date.now();
    while (Date.now() - started < 6000) {
      option = findRecipientDropdownOption(want, compose);
      if (option) break;
      await sleep(100);
    }

    if (!option) {
      const options = getMailDropdownOptions(compose).map(o => o.rawText).join(" | ");
      throw new Error(`Could not select recipient from dropdown: ${want}${options ? `. Options: ${options}` : ""}`);
    }

    clickDom(option);

    await waitUntil(() => {
      const hasDropdown = getMailDropdownOptions(compose).length > 0;
      const inputText   = normRecipientName(input.value || getVisibleMailRecipientText(compose));
      return !hasDropdown && (inputText === normRecipientName(want) || inputText.startsWith(`${normRecipientName(want)} lv`));
    }, 5000, 80, `recipient ${want} dropdown selection`);
    await sleep(150);
  }

  function getMailSlotOrderItems() {
    const weaponTypes    = new Set(["sword","bow","spear","fan","harp","staff","wand","dagger","axe","mace"]);
    const accessoryTypes = new Set(["ring","amulet"]);
    const raw = (state.bagItemsRaw || []).filter(item => item && item.id && !item.equippedSlot && !item.is_locked && String(item.type || "").toLowerCase() !== "rune");
    return [
      ...raw.filter(item =>  weaponTypes.has(String(item.type || "").toLowerCase())),
      ...raw.filter(item => !weaponTypes.has(String(item.type || "").toLowerCase()) && !accessoryTypes.has(String(item.type || "").toLowerCase())),
      ...raw.filter(item =>  accessoryTypes.has(String(item.type || "").toLowerCase())),
    ];
  }

  function findMailPickerSlotForItem(item) {
    const picker = document.querySelector(".mail-picker");
    if (!picker) throw new Error("Mail item picker did not open.");
    const name = String(item?.name || "").trim();
    const titleMatches = [...picker.querySelectorAll('.item-slot[title]')].filter(slot => String(slot.getAttribute("title") || "").trim() === name);
    if (!titleMatches.length) throw new Error(`Could not find item in mail picker: ${name}`);
    const ordered = getMailSlotOrderItems();
    let targetOccurrence = 0;
    for (const raw of ordered) {
      if (String(raw.name || "").trim() === name) {
        if (String(raw.id) === String(item.id)) break;
        targetOccurrence++;
      }
    }
    return titleMatches[Math.min(targetOccurrence, titleMatches.length - 1)] || titleMatches[0];
  }

  async function ensureMailComposeOpen() {
    let modal = document.querySelector(".mail-modal");
    if (!modal) {
      const mailBtn = document.querySelector('button.sb-item[title="Mail"]')
        || [...document.querySelectorAll("button")].find(btn => /(^|\s)Mail(\s|$)/i.test(String(btn.textContent || "")) && /✉|Mail/i.test(String(btn.textContent || "")));
      if (!mailBtn) throw new Error("Could not find the Mail sidebar button.");
      clickDom(mailBtn);
      modal = await waitForSelector(".mail-modal", 6000);
    }
    const newMailTab = [...modal.querySelectorAll(".mail-tab")].find(tab => String(tab.textContent || "").trim().toLowerCase() === "new mail");
    if (!newMailTab) throw new Error("Could not find the New Mail tab.");
    if (!newMailTab.classList.contains("active")) {
      clickDom(newMailTab);
      await waitForSelector(".mail-compose", 5000, modal);
    }
    return document.querySelector(".mail-modal .mail-compose");
  }

  async function attachOneItemToCurrentMail(item) {
    const compose   = await ensureMailComposeOpen();
    const attachBtn = compose.querySelector(".mail-btn-attach") || findButtonByText("button", "Attach Items");
    if (!attachBtn) throw new Error("Could not find Attach Items button.");

    clickDom(attachBtn);
    await waitForSelector(".mail-picker", 6000);
    await sleep(150);

    const slot = findMailPickerSlotForItem(item);
    clickDom(slot);

    const confirmAttachBtn = await waitForSelector(
      ".mail-picker .mail-card-confirm, .mail-item-card .mail-card-confirm",
      6000
    );
    await waitUntil(() => !isDisabledLike(confirmAttachBtn), 4000, 80, "mail item Attach button to become enabled");
    clickDom(confirmAttachBtn);

    await sleep(250);
    await waitUntil(() => {
      const cardBtn = document.querySelector(".mail-picker .mail-card-confirm, .mail-item-card .mail-card-confirm");
      return !cardBtn || !document.body.contains(cardBtn);
    }, 4000, 80, "mail item card to close after Attach").catch(() => {});

    const picker = document.querySelector(".mail-picker");
    if (picker) {
      const close = picker.querySelector(".mail-close") || picker.querySelector("button");
      if (close) clickDom(close);
      await sleep(150);
    }
  }

  async function clickSendCurrentMail() {
    const sendBtn = document.querySelector(".mail-modal .mail-btn-send") || findButtonByText("button", "Send Mail");
    if (!sendBtn) throw new Error("Could not find Send Mail button.");
    await waitUntil(() => !isDisabledLike(sendBtn), 5000, 80, "Send Mail button to become enabled");
    clickDom(sendBtn);
    await sleep(900);
  }

  async function sendTeamMailViaDom(profile, items) {
    const list          = (Array.isArray(items) ? items : [items]).filter(Boolean);
    const recipientName = String(profile?.username || "").trim();
    if (!list.length)    throw new Error("No items to attach.");
    if (!recipientName)  throw new Error("Missing teammate username.");

    const compose = await ensureMailComposeOpen();
    await pickMailRecipientFromDropdown(compose, recipientName);

    const msgBox = compose.querySelector("textarea.mail-compose-msg, textarea");
    if (msgBox) setReactValue(msgBox, buildMailMessageForItems(profile, list));

    for (const item of list) {
      await attachOneItemToCurrentMail(item);
    }
    await clickSendCurrentMail();
    return { ok: true, via: "dom-mail-compose", count: list.length };
  }

  async function sendOneTeamMail(profile, item) {
    try {
      return await sendTeamMailViaDom(profile, [item]);
    } catch (domErr) {
      console.warn("[Loot Helper] DOM mail send failed, trying learned/API endpoints", domErr);
    }

    const attempts = buildMailAttempts(profile, item);
    let lastError  = null;
    for (const attempt of attempts) {
      try {
        const result = await postJson(attempt.url, attempt.body, attempt.method || "POST");
        if (attempt.learned) rememberMailEndpoint(attempt.url, attempt.body, attempt.method || "POST");
        return result;
      } catch (err) { lastError = err; continue; }
    }
    throw lastError || new Error("No item-mail endpoint accepted the request.");
  }

  async function sendSingleTeamTopPick(profileId, itemId) {
    if (state.teamSendBusy) return;

    const tp = trackedProfiles[profileId];
    if (!tp) {
      state.teamSendStatus = "Could not find that teammate profile.";
      render();
      return;
    }
    const snap   = latestSnap(tp);
    const profile = { playerId: tp.playerId, username: tp.username, equippedMap: snap?.equippedMap ?? {}, filterKey: tp.filterKey };

    const eqMap      = profile.equippedMap;
    const profFilter = profile.filterKey ?? state.activeFilterKey;
    const raw        = state.bagItemsRaw.find(i => String(i.id) === String(itemId));
    if (!raw) {
      state.teamSendStatus = "Could not find that item in your current bag snapshot.";
      render();
      return;
    }

    const item = _buildBagItem(raw, eqMap, profFilter);
    const ok   = window.confirm(`Send this item through mail?\n\n${profile.username}: ${compactItemLabel(item)}`);
    if (!ok) return;

    state.teamSendBusy   = true;
    state.teamSendStatus = `Sending ${compactItemLabel(item)} to ${profile.username}…`;
    render();

    try {
      await sendOneTeamMail(profile, item);
      state.teamSendStatus = `Sent ${compactItemLabel(item)} to ${profile.username}.`;
    } catch (err) {
      state.teamSendStatus = `Failed sending to ${profile.username}: ${err?.message || String(err)}`;
      console.warn("[Loot Helper] Single team mail send failed", { profile, item, err });
    } finally {
      state.teamSendBusy = false;
      render();
    }
  }

  async function sendTeamTopPicks() {
    if (state.teamSendBusy) return;

    const plan = buildTeamSendPlan();
    if (!plan.length) {
      state.teamSendStatus = "No BiS or Top items to send.";
      render();
      return;
    }

    const preview = plan.slice(0, 20).map(({ profile, item }) => `${profile.username}: ${compactItemLabel(item)}`).join("\n");
    const more    = plan.length > 20 ? `\n…plus ${plan.length - 20} more` : "";
    const tierLabel = state.teamSendIncludeTop ? "BiS+Top" : "BiS";
    const ok      = window.confirm(`Send ${plan.length} ${tierLabel} item(s) through mail?\n\n${preview}${more}`);
    if (!ok) return;

    state.teamSendBusy   = true;
    state.teamSendStatus = `Sending ${plan.length} item(s)…`;
    render();

    const sent   = [];
    const failed = [];
    const groups = new Map();
    for (const entry of plan) {
      const key = String(entry.profile?.playerId || entry.profile?.username || "unknown");
      if (!groups.has(key)) groups.set(key, { profile: entry.profile, entries: [] });
      groups.get(key).entries.push(entry);
    }

    try {
      for (const group of groups.values()) {
        try {
          state.teamSendStatus = `Attaching ${group.entries.length} item(s) for ${group.profile.username}…`;
          render();
          await sendTeamMailViaDom(group.profile, group.entries.map(e => e.item));
          sent.push(...group.entries);
        } catch (err) {
          console.warn("[Loot Helper] Grouped team mail send failed; falling back to one item per mail", { group, err });
          for (const entry of group.entries) {
            try {
              await sendOneTeamMail(entry.profile, entry.item);
              sent.push(entry);
            } catch (oneErr) {
              failed.push({ ...entry, error: oneErr?.message || String(oneErr) });
            }
          }
        }
      }

      state.teamSendStatus = failed.length
        ? `Sent ${sent.length}/${plan.length}. Failed: ${failed.slice(0, 3).map(f => `${f.profile.username} (${f.error})`).join("; ")}${failed.length > 3 ? "…" : ""}`
        : `Sent ${sent.length} item(s).`;

      if (failed.length) console.warn("[Loot Helper] Team mail send failures", failed);
    } finally {
      state.teamSendBusy = false;
      render();
    }
  }

  window.LH_MAIL_DEBUG = window.LH_MAIL_DEBUG || {
    dump: () => {
      const compose  = document.querySelector(".mail-compose");
      const picker   = document.querySelector(".mail-picker");
      const input    = compose?.querySelector?.('.mail-recipient-picker input, input[placeholder*="Recipient"], input') || null;
      const dropdown = document.querySelector(".mail-dropdown") || compose?.querySelector?.(".mail-dropdown") || null;
      const info = {
        inputValue:           input?.value || "",
        recipientPickerHtml:  compose?.querySelector?.(".mail-recipient-picker")?.outerHTML || "",
        dropdownHtml:         dropdown?.outerHTML || "",
        dropdownOptions:      getMailDropdownOptions(compose).map(o => o.rawText),
        firstPickerSlotHtml:  picker?.querySelector?.(".item-slot")?.outerHTML || "",
        selectedCardHtml:     document.querySelector(".mail-item-card")?.outerHTML || "",
      };
      console.log("[Loot Helper Mail Debug]", info);
      return info;
    },
    copy: async () => {
      const text = JSON.stringify(window.LH_MAIL_DEBUG.dump(), null, 2);
      try { await navigator.clipboard.writeText(text); } catch {}
      return text;
    },
  };

  /**************************************************************************
   * RENDER — Team Tab
   **************************************************************************/

  const teamOpen = {};   // profileId → bool (section expanded state)

  function storageWarningBanner() {
    if (storageUsedKB < STORAGE_WARN_KB) return "";
    const pct  = Math.round(storageUsedKB / STORAGE_LIMIT_KB * 100);
    const crit = storageUsedKB >= STORAGE_LIMIT_KB * 0.95;
    // Profiles are in GM storage (separate quota); this warning is for the game's localStorage only
    return `<div class="sg-storage-warn${crit?" crit":""}">
      ⚠ Game localStorage ${pct}% full (${storageUsedKB} / ${STORAGE_LIMIT_KB} KB).
      ${crit ? "Game data may fail to save!" : "Profiles are in extension storage — this is the game's own storage."}
    </div>`;
  }

  function renderTeam() {
    const all = Object.values(trackedProfiles).sort((a, b) =>
      (latestSnap(b)?.ts ?? 0) - (latestSnap(a)?.ts ?? 0));

    if (!all.length) {
      return `<div class="sg-hint">No players tracked yet.<br>Inspect someone to start tracking.</div>`;
    }

    const filterKeys  = [...state.filters.keys()];
    const hasBag      = state.bagItemsRaw.length > 0;
    const sendPlan    = buildTeamSendPlan();
    const teamMembers = all.filter(tp => tp.teamMember !== false);
    const nonMembers  = all.filter(tp => tp.teamMember === false);

    const sendStatusColor = state.teamSendStatus.startsWith("Sent") ? "#4ade80"
      : (state.teamSendStatus.startsWith("Sending") || state.teamSendStatus.startsWith("Attaching")) ? "#93c5fd" : "#fca5a5";

    const topToggleActive = state.teamSendIncludeTop;
    let html = storageWarningBanner() + `<div class="sg-gear-toolbar" style="gap:8px;align-items:flex-start;flex-wrap:wrap;">
      <div style="display:flex;flex-direction:column;gap:2px;min-width:0;flex:1;">
        <span style="color:#e8eefc;font-size:11px;font-weight:700;">Team BiS${topToggleActive ? " &amp; Top" : ""}</span>
        <span style="color:#4b5563;font-size:10px;">${sendPlan.length} item(s) ready to mail · toggle active to include</span>
        ${state.teamSendStatus ? `<span style="color:${sendStatusColor};font-size:10px;line-height:1.25;">${esc(state.teamSendStatus)}</span>` : ""}
      </div>
      <div style="display:flex;gap:4px;align-items:center;flex-shrink:0;">
        <button class="sg-btn" data-sg-team-toggle-top style="white-space:nowrap;padding:2px 7px;font-size:10px;${topToggleActive ? "border-color:rgba(74,222,128,.5);background:rgba(74,222,128,.12);color:#86efac;" : "border-color:rgba(255,255,255,.12);color:#64748b;"}" title="${topToggleActive ? "Also sending ✅ Top items — click to send BiS only" : "Currently sending ⭐ BiS only — click to also include ✅ Top"}">
          +Top${topToggleActive ? " ✓" : ""}
        </button>
        <button class="sg-btn" data-sg-team-send-top ${(!sendPlan.length || state.teamSendBusy) ? "disabled" : ""} style="white-space:nowrap;${(!sendPlan.length || state.teamSendBusy) ? "opacity:.45;cursor:not-allowed;" : "border-color:rgba(74,222,128,.35);color:#86efac;"}" title="Send ${topToggleActive ? "BiS and Top" : "BiS only"} items via mail to active teammates">
          📬 ${state.teamSendBusy ? "Sending…" : `Send BiS${topToggleActive ? "+Top" : ""}`}
        </button>
        <button class="sg-btn" data-sg-team-manage style="white-space:nowrap;${state.teamManage ? "border-color:rgba(59,130,246,.5);background:rgba(59,130,246,.12);color:#93c5fd;" : ""}" title="${state.teamManage ? "Close member management" : "Add or remove team members"}">
          ${state.teamManage ? "✓ Done" : `⚙ Members${nonMembers.length ? ` (+${nonMembers.length})` : ""}`}
        </button>
      </div>
    </div>`;

    if (state.teamManage) {
      html += `<div style="background:#080f1c;border-bottom:1px solid rgba(255,255,255,.08);padding:6px 10px;">
        <div style="color:#93c5fd;font-size:10px;font-weight:600;margin-bottom:5px;">All Tracked Players</div>
        ${all.map(tp => {
          const snap   = latestSnap(tp);
          const inTeam = tp.teamMember !== false;
          const d = snap ? new Date(snap.ts) : null;
          const ts = d ? `${d.getDate().toString().padStart(2,"0")}.${(d.getMonth()+1).toString().padStart(2,"0")}` : "";
          return `<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.03);">
            <button class="sg-btn sg-team-member-btn" data-team-member="${esc(tp.playerId)}"
              style="padding:1px 7px;font-size:9px;min-width:64px;${inTeam
                ? "border-color:rgba(74,222,128,.4);color:#86efac;"
                : "border-color:rgba(255,255,255,.12);color:#64748b;"}">
              ${inTeam ? "✓ In Team" : "+ Add"}
            </button>
            <span style="color:${inTeam?"#e8eefc":"#4b5563"};font-size:11px;">${esc(tp.username)}</span>
            <span style="color:#374151;font-size:9px;">${snap ? esc(snap.levelText) : ""}${ts ? ` · ${ts}` : ""}</span>
          </div>`;
        }).join("")}
      </div>`;
    }

    if (!teamMembers.length) {
      html += `<div class="sg-hint">No team members yet.<br>Use ⚙ Members to add tracked players.</div>`;
      return html;
    }

    for (const tp of teamMembers) {
      const snap = latestSnap(tp);
      if (!snap) continue;
      const eqMap      = snap.equippedMap;
      const eqWeapon   = Object.values(eqMap).find(i => ITEM_TYPE_TO_SLOT[i.type] === "Weapon");
      const icon       = eqWeapon ? (ITEM_ICONS[eqWeapon.type] ?? "⚔️") : "❓";
      const wtype      = eqWeapon ? eqWeapon.type : "unknown";
      const profFilter = tp.filterKey || state.activeFilterKey;
      const isActive   = tp.active !== false;
      const isOpen     = teamOpen[tp.playerId] !== false;
      const d  = new Date(snap.ts);
      const ts = `${d.getDate().toString().padStart(2,"0")}.${(d.getMonth()+1).toString().padStart(2,"0")} ${d.getHours().toString().padStart(2,"0")}:${d.getMinutes().toString().padStart(2,"0")}`;

      let topItemsHtml = "";
      if (isActive && hasBag) {
        const topItems = [];
        for (const raw of state.bagItemsRaw) {
          const ev = _buildBagItem(raw, eqMap, profFilter);
          if (ev.cat === "bis" || ev.cat === "top") topItems.push(ev);
        }
        topItems.sort((a, b) => b.prefScore - a.prefScore);
        topItemsHtml = topItems.length
          ? topItems.map(item => renderItemCard(item, deriveCharStatsFromProfile({ equippedMap: eqMap, levelText: snap.levelText }), { teamSendProfileId: tp.playerId })).join("")
          : `<div style="color:#374151;font-size:10px;padding:8px 12px;">Nothing in your bag is BiS or Top for ${esc(tp.username)} right now.</div>`;
      } else if (isActive) {
        topItemsHtml = `<div class="sg-hint">Open Inventory to load bag items.</div>`;
      } else {
        topItemsHtml = `<div style="color:#374151;font-size:10px;padding:8px 12px;font-style:italic;">Inactive — toggle on to see top picks.</div>`;
      }

      const filterChips = filterKeys.map(k => {
        const active = k === profFilter;
        return `<button class="sg-btn sg-team-fchip${active?" sg-team-fchip-on":""}" data-team-fset="${esc(tp.playerId)}" data-fkey="${esc(k)}" style="padding:1px 6px;font-size:9px;${active?"border-color:rgba(59,130,246,.5);background:rgba(59,130,246,.18);color:#93c5fd;":""}">${esc(k)}</button>`;
      }).join("");

      html += `<div class="sg-cat-section" data-team-pid="${esc(tp.playerId)}">
        <div class="sg-team-header">
          <span class="sg-cat-title" style="gap:6px;">
            <button class="sg-team-toggle${isActive?" on":""}" data-team-active="${esc(tp.playerId)}" title="${isActive?"Deactivate":"Activate"}"></button>
            <span style="font-size:13px;">${icon}</span>
            <b style="font-size:12px;color:${isActive?"#e8eefc":"#4b5563"};">${esc(tp.username)}</b>
            <span style="color:#4b5563;font-size:10px;">${esc(snap.levelText)} · ${esc(wtype)}</span>
            <span style="color:#374151;font-size:9px;">${esc(String(tp.snapshots.length))} snap</span>
          </span>
          <span style="display:flex;gap:4px;align-items:center;">
            <span style="color:#1e293b;font-size:9px;">${ts}</span>
            <button class="sg-icon-btn sg-team-del" data-team-del="${esc(tp.playerId)}" title="Remove">✗</button>
            <span class="sg-cat-toggle">${isOpen ? "▾" : "▸"}</span>
          </span>
        </div>
        <div style="padding:2px 8px 4px;display:flex;gap:3px;flex-wrap:wrap;border-bottom:1px solid rgba(255,255,255,.04);">
          <span style="color:#4b5563;font-size:9px;line-height:20px;margin-right:2px;">Filter:</span>
          ${filterChips}
        </div>
        <div class="sg-cat-body${isOpen ? "" : " collapsed"}">
          ${topItemsHtml}
        </div>
      </div>`;
    }
    return html;
  }

  const STAT_LABELS = {
    atkPhys: "Atk (Phys)", atkSpeed: "Atk Speed", critChance: "Crit %",
    critDmg: "Crit Dmg %", hitChance: "Hit %", maxHpStat: "Max HP",
    def: "Defense", allStats: "All Stats", maxManaStat: "Max Mana", manaRegen: "Mana Regen",
  };

  /**************************************************************************
   * INSPECT MODAL — Auto-track badge
   **************************************************************************/

  function injectInspectBadge(modal) {
    const fkey = Object.keys(modal).find(k => k.startsWith("__reactFiber"));
    let playerId = null;
    let dataFiber = null;
    if (fkey) {
      let fiber = modal[fkey]; let depth = 0;
      while (fiber && depth < 20) {
        const p = fiber.memoizedProps;
        if (p) {
          const raw = p.playerId ?? p.targetPlayerId ?? p.inspectPlayerId ?? p.userId ?? p.id ?? null;
          if (raw && typeof raw === "string" && raw.length > 8) {
            playerId = raw.toLowerCase();
            dataFiber = fiber;
            break;
          }
        }
        fiber = fiber.return; depth++;
      }
    }
    if (!playerId) return;

    // Read equipped items from React hook 0 state on the same fiber
    function getEquipped() {
      const d = dataFiber?.memoizedState?.memoizedState;
      return Array.isArray(d?.equipped) && d.equipped.length > 0 ? d : null;
    }

    let refreshBadge = null;

    function tryResolveSave() {
      if (trackedProfiles[playerId]) return true;
      const fiberData = getEquipped();
      if (!fiberData) return false;
      const usernameEl = modal.querySelector(".inspect-username");
      const username  = usernameEl?.textContent?.trim() || "Unknown";
      const levelText = modal.querySelector(".inspect-level")?.textContent?.trim() ?? "";
      recordSnapshot(playerId, username, levelText, { ...fiberData, equipped: fiberData.equipped });
      refreshBadge?.();
      return true;
    }

    function tryAutoSave() {
      if (modal.querySelector(".sg-inspect-badge")) {
        tryResolveSave();
        return;
      }
      const usernameEl = modal.querySelector(".inspect-username");
      if (!usernameEl) return;

      const username  = usernameEl.textContent.trim() || "Unknown";
      const levelText = modal.querySelector(".inspect-level")?.textContent?.trim() ?? "";

      const badge = document.createElement("div");
      badge.className = "sg-inspect-badge";
      modal.style.position = "relative";

      const labelEl = document.createElement("span");
      labelEl.className = "sg-inspect-badge-label";

      const actionBtn = document.createElement("button");
      actionBtn.className = "sg-inspect-badge-btn";

      refreshBadge = function() {
        const tp = trackedProfiles[playerId];
        const inTeam = tp ? tp.teamMember !== false : false;
        const saved  = !!tp;
        labelEl.textContent = saved ? (inTeam ? "⚡ In Team" : "📋 Tracked") : "⏳ Saving…";
        actionBtn.textContent = inTeam ? "Remove" : "+ Add";
        actionBtn.className = "sg-inspect-badge-btn " + (inTeam ? "remove" : "add");
        actionBtn.style.display = saved ? "" : "none";
        badge.style.borderColor = inTeam ? "rgba(74,222,128,.3)" : "rgba(100,116,139,.3)";
      };

      actionBtn.addEventListener("click", e => {
        e.stopPropagation();
        let tp = trackedProfiles[playerId];
        if (!tp) {
          tp = { playerId, username, active: true, teamMember: false, filterKey: "", snapshots: [] };
          trackedProfiles[playerId] = tp;
        }
        tp.teamMember = !tp.teamMember;
        saveTrackedProfiles();
        if (state.activeTab === "team") render();
        refreshBadge();
      });

      badge.appendChild(labelEl);
      badge.appendChild(actionBtn);
      modal.appendChild(badge);

      // Also keep fetch-based fallback in pendingModalInfo
      pendingModalInfo[playerId] = { username, levelText, refreshBadge };
      tryResolveSave();
      refreshBadge();
    }

    tryAutoSave();
    // Keep retrying until saved — handles data loading after modal opens.
    // Poll every 300ms as fallback for React re-renders that don't mutate child nodes.
    const obs = new MutationObserver(() => { tryAutoSave(); });
    obs.observe(modal, { childList: true, subtree: true, characterData: true });
    const poll = setInterval(() => {
      tryAutoSave();
      if (trackedProfiles[playerId] || !modal.isConnected) {
        clearInterval(poll);
        obs.disconnect();
      }
    }, 300);
  }

  function setupInspectObserver() {
    _inspectObs = new MutationObserver(muts => {
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (n.nodeType !== 1) continue;
          if (n.classList?.contains("inspect-modal")) { injectInspectBadge(n); continue; }
          const inner = n.querySelector?.(".inspect-modal");
          if (inner) injectInspectBadge(inner);
        }
      }
    });
    _inspectObs.observe(document.body, { childList: true, subtree: true });
  }

  /**************************************************************************
   * RENDER — Dispatcher + Events
   **************************************************************************/

  function render() {
    const body = document.getElementById("aimSgBody");
    if (!body) return;

    if (state.activeTab==="filters" && state.filterEdit &&
        document.activeElement?.classList.contains("sg-filter-input")) return;

    if      (state.activeTab==="gear")    body.innerHTML = renderGear();
    else if (state.activeTab==="filters") body.innerHTML = renderFilters();
    else if (state.activeTab==="market")  body.innerHTML = renderMarket();
    else if (state.activeTab==="team")    body.innerHTML = renderTeam();
    else if (state.activeTab==="debug")   body.innerHTML = renderDebug();
    else                                  body.innerHTML = renderStats();

    if (state.activeTab==="filters") {
      body.querySelector(".sg-help-box")?.addEventListener("toggle", e => { filterHelpOpen = e.target.open; });
      body.querySelectorAll(".sg-filter-row").forEach((row) => {
        row.addEventListener("click", (e) => {
          if (e.target.closest("button")) return;
          state.activeFilterKey = row.dataset.fkey;
          localStorage.setItem("aim_sgActiveFilter", state.activeFilterKey);
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
      body.querySelectorAll("[data-edit]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const key = btn.dataset.edit;
          const fc  = state.filters.get(key);
          state.filterEdit = { key, name:key, stats:new Set(fc?.stats), preferredStats:new Set(fc?.preferredStats), multiBonus:{...fc?.multiBonus}, optional:new Set(fc?.optional ?? []), avoid:new Set(fc?.avoid ?? []) };
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
            localStorage.setItem("aim_sgActiveFilter", state.activeFilterKey);
          }
          saveFilters(); render();
        });
      });
      body.querySelectorAll("[data-dup]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const key   = btn.dataset.dup;
          const fc    = state.filters.get(key); if (!fc) return;
          const copy  = key + "_Copy";
          state.filters.set(copy, mkFC([...fc.stats], fc.enabled, {...fc.multiBonus}, [...fc.preferredStats], [...(fc.optional ?? [])], [...(fc.avoid ?? [])]));
          saveFilters(); render();
        });
      });
      document.getElementById("aimSgFeSave")?.addEventListener("click", () => {
        const fe = state.filterEdit; if (!fe) return;
        const newName = (document.getElementById("aimSgFeName")?.value||fe.key).trim();
        const oldFC   = state.filters.get(fe.key);
        if (newName!==fe.key) state.filters.delete(fe.key);
        state.filters.set(newName, mkFC([...fe.stats], oldFC?.enabled ?? true, fe.multiBonus, [...(fe.preferredStats ?? [])], [...(fe.optional ?? [])], [...(fe.avoid ?? [])]));
        if (state.activeFilterKey===fe.key) {
          state.activeFilterKey = newName;
          localStorage.setItem("aim_sgActiveFilter", newName);
        }
        state.filterEdit = null; saveFilters(); render();
      });
      document.getElementById("aimSgFeCancel")?.addEventListener("click", () => {
        state.filterEdit = null; render();
      });
      document.getElementById("aimSgFeClean")?.addEventListener("click", () => {
        if (!state.filterEdit) return;
        state.filterEdit.stats          = new Set();
        state.filterEdit.preferredStats = new Set();
        state.filterEdit.optional       = new Set();
        state.filterEdit.avoid          = new Set();
        render();
      });
      body.querySelectorAll("[data-estat]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const nameEl = document.getElementById("aimSgFeName");
          if (nameEl && state.filterEdit) state.filterEdit.name = nameEl.value;
          const stat = btn.dataset.estat; if (!state.filterEdit) return;
          const fe = state.filterEdit;
          if (fe.avoid.has(stat))               { fe.avoid.delete(stat); }
          else if (fe.optional.has(stat))       { fe.optional.delete(stat); fe.avoid.add(stat); }
          else if (fe.stats.has(stat))          { fe.stats.delete(stat); fe.optional.add(stat); }
          else if (fe.preferredStats.has(stat)) { fe.preferredStats.delete(stat); fe.stats.add(stat); }
          else                                  { fe.preferredStats.add(stat); }
          render();
        });
      });
      body.querySelectorAll("[data-qstat]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const fc = state.filters.get(state.activeFilterKey); if (!fc) return;
          const stat = btn.dataset.qstat;
          if (fc.avoid.has(stat))               { fc.avoid.delete(stat); }
          else if (fc.optional.has(stat))       { fc.optional.delete(stat); fc.avoid.add(stat); }
          else if (fc.stats.has(stat))          { fc.stats.delete(stat); fc.optional.add(stat); }
          else if (fc.preferredStats.has(stat)) { fc.preferredStats.delete(stat); fc.stats.add(stat); }
          else                                  { fc.preferredStats.add(stat); }
          saveFilters(); render();
        });
      });
      body.querySelectorAll("[data-mbstat]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const stat = btn.dataset.mbstat; if (!state.filterEdit) return;
          const nameEl = document.getElementById("aimSgFeName");
          if (nameEl) state.filterEdit.name = nameEl.value;
          const cur  = state.filterEdit.multiBonus[stat] ?? 0;
          const next = (cur + 1) % 4;
          if (next === 0) delete state.filterEdit.multiBonus[stat];
          else state.filterEdit.multiBonus[stat] = next;
          render();
        });
      });
      document.getElementById("aimSgFeAdd")?.addEventListener("click", () => {
        const name = `Filter ${state.filters.size+1}`;
        state.filters.set(name, mkFC([]));
        state.filterEdit = { key:name, name, stats:new Set(), preferredStats:new Set(), multiBonus:{}, optional:new Set(), avoid:new Set() };
        saveFilters(); render();
      });
    }

    if (state.activeTab==="gear") {
      body.querySelector("#aimSgModeSlot")?.addEventListener("click", () => { state.gearMode="slot"; render(); });
      body.querySelector("#aimSgModeCat")?.addEventListener("click",  () => { state.gearMode="category"; render(); });
      body.querySelector("#aimSgHlAll")?.addEventListener("click", () => {
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

      body.querySelectorAll("[data-sg-salvage-check]").forEach(chk => {
        chk.addEventListener("change", () => {
          const id = chk.dataset.sgSalvageCheck;
          if (id) {
            if (chk.checked) state.salvageSelectedIds.add(id);
            else             state.salvageSelectedIds.delete(id);
          }
          render();
        });
      });

      const selectSalvageBtn = body.querySelector("[data-sg-select-salvage]");
      if (selectSalvageBtn) {
        selectSalvageBtn.addEventListener("click", () => {
          state.highlightCats.add("sal");
          applyBagHighlights();
          render();
        });
      }

      const clearSalvageBtn = body.querySelector("[data-sg-clear-salvage]");
      if (clearSalvageBtn) {
        clearSalvageBtn.addEventListener("click", () => {
          state.highlightCats.delete("sal");
          state.salvageSelectedIds.clear();
          applyBagHighlights();
          render();
        });
      }

      body.querySelector("#aimSgSalvageExcludeS")?.addEventListener("change", e => {
        state.salvageExcludeSTier = e.target.checked;
        render();
      });

      body.querySelectorAll("[data-sg-pin-item]").forEach(btn => {
        btn.addEventListener("click", e => {
          e.stopPropagation();
          const id = btn.dataset.sgPinItem;
          state.pinnedItemId = state.pinnedItemId === id ? null : id;
          applyBagHighlights();
          render();
        });
      });

      const salvageSelectedBtn = body.querySelector("[data-sg-salvage-selected]");
      if (salvageSelectedBtn) {
        salvageSelectedBtn.addEventListener("click", () => {
          salvageSelectedItems().catch(err => {
            state.salvageBusy = false;
            state.salvageStatus = err?.message || String(err);
            render();
          });
        });
      }
    }

    if (state.activeTab==="market") {
      body.querySelector("#aimSgMktHideFuture")?.addEventListener("click", () => {
        state.marketHideFuture = !state.marketHideFuture;
        render();
      });
      body.querySelector("#aimSgMktCtx")?.addEventListener("change", e => {
        state.marketCtxPlayerId = e.target.value || null;
        rebuildMarketItems();
        render();
      });
    }

    if (state.activeTab==="team") {
      body.querySelectorAll(".sg-team-header").forEach(header => {
        header.addEventListener("click", e => {
          if (e.target.closest(".sg-team-del") || e.target.closest(".sg-team-toggle") || e.target.closest(".sg-team-fchip")) return;
          const pid    = header.closest("[data-team-pid]")?.dataset.teamPid;
          const body_  = header.nextElementSibling;
          const toggle = header.querySelector(".sg-cat-toggle");
          const nowOpen = body_.classList.toggle("collapsed") === false;
          if (toggle) toggle.textContent = nowOpen ? "▾" : "▸";
          if (pid) teamOpen[pid] = nowOpen;
        });
      });
      body.querySelectorAll(".sg-team-del").forEach(btn => {
        btn.addEventListener("click", e => {
          e.stopPropagation();
          const pid = btn.dataset.teamDel;
          if (pid) {
            delete trackedProfiles[pid];
            if (state.marketCtxPlayerId === pid) {
              state.marketCtxPlayerId = null;
              rebuildMarketItems();
            }
            saveTrackedProfiles();
            render();
          }
        });
      });
      body.querySelectorAll(".sg-team-toggle").forEach(btn => {
        btn.addEventListener("click", e => {
          e.stopPropagation();
          const pid = btn.dataset.teamActive;
          if (pid && trackedProfiles[pid]) {
            trackedProfiles[pid].active = !trackedProfiles[pid].active;
            saveTrackedProfiles();
            render();
          }
        });
      });
      body.querySelectorAll(".sg-team-fchip").forEach(btn => {
        btn.addEventListener("click", e => {
          e.stopPropagation();
          const pid  = btn.dataset.teamFset;
          const fkey = btn.dataset.fkey;
          if (pid && fkey && trackedProfiles[pid]) {
            trackedProfiles[pid].filterKey = fkey;
            saveTrackedProfiles();
            render();
          }
        });
      });

      const manageBtn = body.querySelector("[data-sg-team-manage]");
      if (manageBtn) {
        manageBtn.addEventListener("click", e => {
          e.preventDefault();
          state.teamManage = !state.teamManage;
          render();
        });
      }
      body.querySelectorAll(".sg-team-member-btn").forEach(btn => {
        btn.addEventListener("click", e => {
          e.stopPropagation();
          const pid = btn.dataset.teamMember;
          if (pid && trackedProfiles[pid]) {
            trackedProfiles[pid].teamMember = trackedProfiles[pid].teamMember === false ? true : false;
            saveTrackedProfiles();
            render();
          }
        });
      });

      const topToggleBtn = body.querySelector("[data-sg-team-toggle-top]");
      if (topToggleBtn) {
        topToggleBtn.addEventListener("click", e => {
          e.preventDefault();
          state.teamSendIncludeTop = !state.teamSendIncludeTop;
          render();
        });
      }

      const sendTopBtn = body.querySelector("[data-sg-team-send-top]");
      if (sendTopBtn) {
        sendTopBtn.addEventListener("click", e => {
          e.preventDefault();
          e.stopPropagation();
          sendTeamTopPicks().catch(err => {
            state.teamSendBusy   = false;
            state.teamSendStatus = err?.message || String(err);
            render();
          });
        });
      }

      body.querySelectorAll("[data-sg-team-send-one]").forEach(btn => {
        btn.addEventListener("click", e => {
          e.preventDefault();
          e.stopPropagation();
          sendSingleTeamTopPick(btn.dataset.sgTeamSendOne, btn.dataset.itemId).catch(err => {
            state.teamSendBusy   = false;
            state.teamSendStatus = err?.message || String(err);
            render();
          });
        });
      });

      body.querySelectorAll("[data-sg-pin-item]").forEach(btn => {
        btn.addEventListener("click", e => {
          e.stopPropagation();
          const id = btn.dataset.sgPinItem;
          state.pinnedItemId = state.pinnedItemId === id ? null : id;
          applyBagHighlights();
          render();
        });
      });
    }

    if (state.activeTab === "debug") {
      body.querySelectorAll("[data-debug-id]").forEach(row => {
        row.querySelector(".sg-debug-header")?.addEventListener("click", () => {
          const id = row.dataset.debugId;
          if (state.debugExpandedItems.has(id)) state.debugExpandedItems.delete(id);
          else state.debugExpandedItems.add(id);
          render();
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
    readSkills();
    readInventoryState();
    readMarketListings();
    applyBagHighlights();
    applyMarketBadges();
    render();
  }

  function setupCharViewObserver() {
    _charViewObs = new MutationObserver((mutations) => {
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
    });
    _charViewObs.observe(document.body, { childList: true, subtree: true });
  }

  function boot() { loadTrackedProfiles(); loadStats(); installUI(); setupTooltipObserver(); setupInspectObserver(); setupCharViewObserver(); tick(); _tickInterval = setInterval(tick, 1000); }
    return {
      ...definition,
      init(app) { _moduleApp = app; boot(); },
      render() {},
      destroy() {
        clearInterval(_tickInterval);
        _tickInterval = null;
        _tooltipObs?.disconnect();
        _tooltipObs = null;
        _inspectObs?.disconnect();
        _inspectObs = null;
        _charViewObs?.disconnect();
        _charViewObs = null;
        _cssStyleEl?.remove();
        _cssStyleEl = null;
        _hlStyleEl?.remove();
        _hlStyleEl = null;
      },
    };
  }

  window.VoidIdleModules = window.VoidIdleModules || {};
  window.VoidIdleModules['aim-loot-helper'] = createAimLootHelperModule({
    id:          'aim-loot-helper',
    name:        'Aim Loot Helper',
    icon:        '⚡',
    description: 'Stats, DPS, EHP, gear comparison, roll quality, and multi-filter scoring.',
    version:     '8.59.0',
    category:    'fighter',
  });
})();