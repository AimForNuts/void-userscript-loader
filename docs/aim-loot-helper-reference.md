# Aim Loot Helper — Developer Reference

Quick-reference for iterating on scoring logic, filters, and item data in `modules/aim-loot-helper.js`.

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
  upgradeThreshold:                  10,  // score ≥ this → Interesting
  downgradeThreshold:               -10,  // score < this → Salvage
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

### Result thresholds

| Label | Condition |
|---|---|
| ✅ Top Pick | score ≥ 50 |
| 👍 Interesting | score ≥ 10 |
| ↔ Neutral | score ≥ −10 |
| 💾 Salvage | score < −10 |

The old qualification gate (`_qualifies`) is removed — the -100 coverage penalty makes any item missing a must-have score far below Interesting automatically.

### Roll quality cap (`applyQualityCap`)

Applied after scoring, can only lower the result:
- Median roll quality < 75%: capped at Neutral (unless `allStats` is present)
- Weapon with ATK quality < 75% and no multi-roll: capped at Salvage

### Debug breakdown

`calcFilterScore` returns a full breakdown object stored per-filter on every item:

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

`reasons[]` has one entry per tracked stat. Used by the Debug tab to show the full per-stat breakdown. `item.filterBreakdowns[filterKey]` accesses this for any item.

---

## Filter Data Model

```js
mkFC(stats, enabled, multiBonus, preferredStats, optional, avoid)
// Returns: { stats: Set, preferredStats: Set, optional: Set, avoid: Set,
//            enabled: bool, multiBonus: {} }
// Note: no `mode` field — mode was removed (see history below)
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
atk, atkSpeed, critChance, critDamage, def, hp, mana, healPower (healingPower),
cdr (cooldownReduction), manaRegen, dropRate, allStats
```

`normStatKey()` maps server field names to these canonical keys.

---

## What Each Slot Can Roll

### Weapons

| Slot | Primary | Possible Bonus Stats |
|---|---|---|
| Sword / Spear | atk | critChance, critDamage, hp, def, atkSpeed, allStats |
| Bow | atk | critChance, critDamage, atk (multi), hp, atkSpeed, allStats |
| Staff / Harp | atk | mana, healPower, cdr, hp, atkSpeed, allStats |
| Fan | atk | mana, critChance, critDamage, cdr, atkSpeed, allStats |

### Accessories

| Slot | Possible Bonus Stats |
|---|---|
| Amulet | mana, healPower, cdr, critChance, atkSpeed, dropRate, manaRegen, allStats |
| Ring | critChance, critDamage, mana, healPower, cdr, hp, atkSpeed, dropRate, manaRegen, allStats |

### Light Armor (caster / DPS / utility — no hp/def/healPower bonus)

| Slot | Primary | Possible Bonus Stats |
|---|---|---|
| Helmet | def 3–4 | mana, cdr, critChance, atkSpeed, manaRegen, allStats |
| Shoulders | def 3–4 | cdr, critChance, atkSpeed, manaRegen, allStats |
| Chest | def 4–6 | mana, cdr, critChance, critDamage, atkSpeed, manaRegen, dropRate, allStats |
| Hands | atk 2–3 | critChance, critDamage, atk, cdr, atkSpeed, manaRegen, allStats |
| Legs | def 3–4 | mana, cdr, critDamage, atkSpeed, manaRegen, allStats |
| Boots | def 3–4 | mana, cdr, atkSpeed, critChance, manaRegen, allStats |
| Shield | def 4–6 | mana, cdr, manaRegen, allStats *(always light)* |

### Heavy Armor (Spear only — no crit/mana/cdr/atkSpeed bonus)

| Slot | Primary | Possible Bonus Stats |
|---|---|---|
| Helmet | def 4–5 | hp, def, healPower, manaRegen, allStats |
| Shoulders | def 4–5 | hp, def, healPower, manaRegen, allStats |
| Chest | def 6–8 | hp, def, healPower, manaRegen, allStats |
| Hands | def 3–4 | hp, def, healPower, manaRegen, allStats |
| Legs | def 4–5 | hp, def, healPower, manaRegen, allStats |
| Boots | def 4–5 | hp, def, healPower, manaRegen, allStats |

**Notes:**
- Lifesteal is **not** a gear stat — comes from Vampiric runes or ability-tree passives only.
- Heavy armor is Spear-exclusive. All other classes use light armor.
- Shield is always light regardless of class.

---

## Design History

### Why layered scoring (v8.48.0)

Old system: flat ±4 / ±2 / ±0.5 per stat. Two preferred stat regressions could cancel a must-have improvement, even though the must-have is what the user actually cares about.

New system: normalized deltas with a cap on how much preferred can influence the result. A strong must-have improvement is protected.

### Why mode was removed (v8.47.0)

Each filter previously had a 🗡 aggressive / 🛡 defensive toggle that added hidden DPS/EHP score bumps. This was implicit magic — the user's intent is already expressed through stat chip states. Scoring is now purely stat-driven.

---

## Known Improvement Areas

### Optional / Avoid scoring

`optional` and `avoid` are now fully wired into scoring (optional ×3, avoid opportunity cost). Future iterations may tune these weights using Debug tab feedback.

### Debug tab (planned)

A Debug tab will show `filterBreakdowns` for every bag item — per-filter, per-stat breakdown of `reasons[]`, coverage scores, caps, and final verdict. This is the main tool for validating and tuning `SCORE_CONFIG`.

---

## Key File Locations

| Thing | Location |
|---|---|
| SCORE_CONFIG | ~line 245 |
| calcFilterScore | ~line 1234 |
| recommendation / categoryOf | ~line 1362 |
| applyQualityCap | ~line 1380 |
| Filter model: mkFC, loadFilters, saveFilters | ~line 264 |
| Default filters: DEFAULT_FILTERS | ~line 237 |
| Chip state info: statChipInfo | ~line 793 |
| Stat key map: STAT_KEY_MAP, STAT_DEFS | ~line 140 |
| Slot tables: RARITY_STAT_SLOTS | ~line 37 |
| Sub-tier breakpoints: SUB_TIER_BREAKPOINTS | ~line 78 |
