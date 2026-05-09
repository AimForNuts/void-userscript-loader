# Aim Loot Helper — Developer Reference

Quick-reference for iterating on scoring logic, filters, and item data in `modules/aim-loot-helper.js`.

Current version: **8.53.0**

---

## Scoring System

### Overview

Scoring is layered. No flat additive weights. Must-have stats dominate; preferred contributes but is capped; avoid is opportunity cost; neutral/optional are small tie-breakers.

```
finalScore =
  mustHaveCoverageScore   (presence/absence of must-have stats)
  + mustHavePowerScore    (normalized magnitude of must-have improvement)
  + cappedPreferredScore  (preferred delta, capped vs must-have power)
  + avoidOpportunityCost  (penalty when avoided stat occupies a roll slot)
  + neutralScore          (small delta contribution from untracked stats)
  + optionalScore         (tiny contribution from optional stats)
  + multiRollBonus        (flat bonus from multiBonus config per stat)
```

### SCORE_CONFIG (all values configurable)

```js
const SCORE_CONFIG = {
  mustHaveMissingPenalty:          -100,  // per missing must-have stat
  mustHavePresentBonus:              25,  // per present must-have stat
  mustHavePowerWeight:              100,  // normDelta × this for must-have
  preferredPowerWeight:              35,  // normDelta × this for preferred
  neutralPowerWeight:                10,  // normDelta × this for untracked
  optionalPowerWeight:                3,  // normDelta × this for optional
  preferredNegativeCapRatio:        0.4,  // max preferred can subtract = mustHavePower × 0.4
  preferredPositiveCapRatio:        0.6,  // max preferred can add     = mustHavePower × 0.6
  preferredFallbackNegativeCap:      20,  // fallback cap when mustHavePower ≈ 0
  preferredFallbackPositiveCap:      20,
  avoidBasePenalty:                 -20,  // base penalty when avoided stat is on item
  avoidMultiplierCompleteItem:        0,  // ×0 if all must-have AND preferred present
  avoidMultiplierPreferredMissing:  0.5,  // ×0.5 if preferred missing
  avoidMultiplierMustHaveMissing:     1,  // ×1.0 if must-have missing
  bisThreshold:                      50,  // score ≥ this + all must-haves present → BiS
  topThreshold:                      25,  // score ≥ this → Top
  goodThreshold:                      0,  // score ≥ this → Good (below → Salvage)
};
```

### Component details

#### Must-have coverage + power (`fc.preferredStats`)

For each must-have stat:
- **Missing from candidate** → `mustHaveCoverageScore += -100`
- **Present on candidate** → `mustHaveCoverageScore += 25`, `mustHavePowerScore += normDelta × 100`

`normDelta(stat) = (candidateValue - equippedValue) / equippedValue`
— safe against zero-equipped: returns 1 if stat is new on candidate, 0 if both zero.

A single missing must-have (-100) dominates almost any other positive contribution.

#### Preferred power (`fc.stats`)

For each preferred stat: `rawPreferredScore += normDelta × 35`

Then capped so preferred cannot erase a strong must-have result:
```
mustHaveMagnitude = abs(mustHavePowerScore)
negCap = mustHaveMagnitude > 1  ?  mustHaveMagnitude × 0.4  :  20
posCap = mustHaveMagnitude > 1  ?  mustHaveMagnitude × 0.6  :  20
cappedPreferredScore = clamp(rawPreferredScore, -negCap, +posCap)
```

#### Avoid opportunity cost (`fc.avoid`)

Only applied when the candidate item **actually has** the avoided stat:
```
multiplier =
  mustHaveMissingCount > 0   →  1.0   (full penalty)
  preferredMissingCount > 0  →  0.5   (half penalty)
  else (complete item)       →  0.0   (no penalty)

avoidOpportunityCost += avoidBasePenalty × multiplier  (per avoided stat present)
```

Avoid is opportunity cost, not a flat punishment. If an item has everything you want plus an avoided stat, the avoided stat is forgiven.

#### Optional, Neutral, Multi-roll

- **Optional** (`fc.optional`): `normDelta × 3` per stat. Tiny tie-breaker only.
- **Neutral** (stats in neither set): `normDelta × 10` for all stats not in any set.
- **Multi-roll bonus**: flat score addition from `fc.multiBonus` when `multiRollCount > 0`.

### Result tiers

| Label | Condition |
|---|---|
| ⭐ BiS | all must-haves present **and** score ≥ 50 |
| ✅ Top | score ≥ 25 |
| 👍 Good | score ≥ 0 |
| 💾 Salvage | score < 0 |

BiS requires both conditions — a high score alone is not enough if any must-have is missing.
The -100 must-have penalty ensures any item missing a must-have scores well below 0 automatically.

### Roll quality cap (`applyQualityCap`)

Applied after scoring, can only lower the result:
- Median roll quality < 75%: capped at Good (exception: `allStats` present forces exactly Good, prevents Salvage too)
- Weapon with ATK quality < 75% and no multi-roll: capped at Salvage

### Slot eligibility

Stats ineligible for a given slot are skipped during scoring — they don't incur must-have penalties or preferred bonuses. This prevents e.g. "ATK must-have" penalising a chest piece that cannot roll ATK.

`eligibleStatsForItem(item)` routes by `slotType`, `weaponSubType`, and `armorWeight` to return the correct `Set` from `SLOT_STAT_POOLS`. Returns `null` for unknown slots (all stats treated as eligible).

`calcFilterScore` receives this set as the `eligibleStats` param. Ineligible stats appear in `reasons[]` with `tier:"ineligible"` for Debug tab display.

### Score breakdown object

`calcFilterScore` returns a full breakdown stored per-filter on every item at `item.filterBreakdowns[filterKey]`:

```js
{
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
  reasons: [
    { stat, tier, type, candVal, curVal, delta, contribution },
    ...
  ]
}
```

`reasons[]` has one entry per tracked stat (plus ineligible entries). Used by the Debug tab.

---

## Filter Data Model

```js
mkFC(stats, enabled, multiBonus, preferredStats, optional, avoid)
// Returns: { stats: Set, preferredStats: Set, optional: Set, avoid: Set,
//            enabled: bool, multiBonus: {} }
```

### Filter chip states

| UI label | Internal field | Score role |
|---|---|---|
| ★ Must have | `preferredStats` | Coverage ±100, power ×100 |
| ♥ Preferred | `stats` | Power ×35, capped |
| ◎ Optional | `optional` | ×3 tie-breaker |
| ✗ Avoid | `avoid` | Opportunity cost |
| Neutral | *(not stored)* | ×10 tie-breaker |

Cycle order: Neutral → Must have → Preferred → Optional → Avoid → Neutral

Serialised to `localStorage` key `aim_sgFilters` via `saveFilters()` / `loadFilters()`.

### Filter row actions

- **⎘ Duplicate** — copies the filter, names it `[Name]_Copy`
- **✏ Edit** — opens the edit panel below the row
- **✗ Delete** — removes the filter (hidden when only one filter exists)

### Edit panel actions

- **Save** — renames and persists the filter
- **Clean** — resets all chip selections to Neutral (does not save until Save is clicked)
- **✗ Cancel** — discards unsaved changes

### Default filters (first load, no saved data)

| Filter | Must have (★) | Preferred (♥) | Optional (◎) | Avoid (✗) |
|---|---|---|---|---|
| Bow | atk | atkSpeed, critChance | allStats | def, healPower |
| Harp | atk | cdr, allStats | critChance | def |
| Spear | def | manaRegen | — | healPower |
| Staff | cdr | critChance, manaRegen | — | def, healPower |
| Loot | dropRate | — | allStats | — |

---

## Stat Keys (internal)

```
atk, atkSpeed, critChance, critDmg, def, hp, mana, healPower,
cdr, manaRegen, dropRate, allStats,
goldFind, hpOnKill, manaOnKill, execute
```

`normStatKey()` maps game API field names to these canonical keys (`STAT_KEY_MAP`).
`TOOLTIP_STAT_MAP` maps uppercase tooltip label strings to canonical keys.

### New stats (v8.51.0)

| Key | Label | Description |
|---|---|---|
| `goldFind` | Gold | Boost gold from mob kills |
| `hpOnKill` | HP/k | Restore HP after every kill |
| `manaOnKill` | Mana/k | Restore mana after every kill |
| `execute` | Exec. | Bonus damage to enemies below 30% HP |

Roll ranges are placeholder estimates — update `BONUS_STAT_RANGES` once real values are observed in-game.

---

## What Each Slot Can Roll

### Weapons

| Slot | Primary | Possible Bonus Stats |
|---|---|---|
| Sword / Spear | atk | critChance, critDmg, hp, def, atkSpeed, allStats, hpOnKill, manaOnKill, execute |
| Bow | atk | critChance, critDmg, hp, atkSpeed, allStats, hpOnKill, manaOnKill, execute |
| Staff / Harp | atk | mana, healPower, cdr, hp, atkSpeed, allStats, hpOnKill, manaOnKill, execute |
| Fan | atk | mana, critChance, critDmg, cdr, atkSpeed, allStats, hpOnKill, manaOnKill, execute |

### Accessories

| Slot | Possible Bonus Stats |
|---|---|
| Amulet | mana, healPower, cdr, critChance, atkSpeed, dropRate, manaRegen, allStats, goldFind, hpOnKill, manaOnKill, execute |
| Ring | critChance, critDmg, mana, healPower, cdr, hp, atkSpeed, dropRate, manaRegen, allStats, goldFind, hpOnKill, manaOnKill, execute |

### Light Armor (caster / DPS / utility)

| Slot | Primary | Possible Bonus Stats |
|---|---|---|
| Helmet | def 3–4 | mana, cdr, critChance, atkSpeed, manaRegen, allStats, hpOnKill, manaOnKill |
| Shoulders | def 3–4 | cdr, critChance, atkSpeed, manaRegen, allStats, hpOnKill, execute |
| Chest | def 4–6 | mana, cdr, critChance, critDmg, atkSpeed, manaRegen, dropRate, allStats, hpOnKill |
| Hands | atk 2–3 | critChance, critDmg, cdr, atkSpeed, manaRegen, allStats, hpOnKill, goldFind, execute |
| Legs | def 3–4 | mana, cdr, critDmg, atkSpeed, manaRegen, allStats, hpOnKill, manaOnKill |
| Boots | def 3–4 | mana, cdr, atkSpeed, critChance, manaRegen, allStats, hpOnKill, goldFind |
| Shield | def 4–6 | mana, cdr, manaRegen, allStats *(always light)* |

### Heavy Armor (Spear only)

| Slot | Primary | Possible Bonus Stats |
|---|---|---|
| Helmet | def 4–5 | hp, healPower, manaRegen, allStats, hpOnKill, manaOnKill |
| Shoulders | def 4–5 | hp, healPower, manaRegen, allStats, hpOnKill, execute |
| Chest | def 6–8 | hp, healPower, manaRegen, allStats, hpOnKill |
| Hands | def 3–4 | hp, healPower, manaRegen, allStats, hpOnKill, goldFind, execute |
| Legs | def 4–5 | hp, healPower, manaRegen, allStats, hpOnKill, manaOnKill |
| Boots | def 4–5 | hp, healPower, manaRegen, allStats, hpOnKill, goldFind |

**Notes:**
- Lifesteal is **not** a gear stat — comes from Vampiric runes or ability-tree passives only.
- Heavy armor is Spear-exclusive. All other classes use light armor.
- Shield is always light regardless of class.
- `def` no longer appears as a bonus stat in heavy armor rows — it is the primary, not a bonus.

---

## Design History

### New stats: goldFind, hpOnKill, manaOnKill, execute (v8.51.0)

Four new gear bonus stats added with full slot pool coverage and filter chip support. Roll ranges in `BONUS_STAT_RANGES` are guesses pending real in-game observation.

### BiS/Top/Good/Salvage verdict tiers (v8.50.0)

Replaced the old four-tier system (Top Pick / Interesting / Neutral / Salvage) with semantically clearer tiers. The Neutral tier was removed — with normalized deltas the score itself carries that meaning. BiS introduces a dual condition: high score *and* all must-haves present, separating "perfect item" from "great item".

### Slot eligibility (v8.49.0)

Added `SLOT_STAT_POOLS` and `eligibleStatsForItem()`. Stats that cannot roll on a given slot are skipped in scoring so must-have penalties don't fire on impossible rolls. Debug tab added to show per-item, per-filter score breakdowns. History and Rating tabs removed.

### Why layered scoring (v8.48.0)

Old system: flat ±4 / ±2 / ±0.5 per stat. Two preferred stat regressions could cancel a must-have improvement, even though the must-have is what the user actually cares about.

New system: normalized deltas with a cap on how much preferred can influence the result. A strong must-have improvement is protected.

### Why mode was removed (v8.47.0)

Each filter previously had a 🗡 aggressive / 🛡 defensive toggle that added hidden DPS/EHP score bumps. This was implicit magic — the user's intent is already expressed through stat chip states. Scoring is now purely stat-driven.

---

## Key File Locations

| Thing | Location |
|---|---|
| `MODULE_VERSION` | line 4 (IIFE scope) |
| `STAT_KEY_MAP`, `STAT_DEFS` | ~line 27 |
| `SLOT_PRIMARY_STAT` | ~line 52 |
| `BONUS_STAT_RANGES` | ~line 107 |
| `TOOLTIP_STAT_MAP` | ~line 216 |
| `DEFAULT_FILTERS` | ~line 257 |
| `SLOT_STAT_POOLS` | ~line 265 |
| `eligibleStatsForItem` | ~line 293 |
| `SCORE_CONFIG` | ~line 303 |
| `mkFC`, `loadFilters`, `saveFilters` | ~line 327 |
| `statChipInfo` | ~line 839 |
| `calcFilterScore` | ~line 1295 |
| `recommendation` / `categoryOf` | ~line 1427 |
| `applyQualityCap` | ~line 1444 |
| `RARITY_STAT_SLOTS` | ~line 38 |
| `SUB_TIER_BREAKPOINTS` | ~line 81 |
