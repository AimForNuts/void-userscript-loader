# Aim Loot Helper — Developer Reference

A quick-reference for iterating on scoring logic, filters, and item data in `modules/aim-loot-helper.js`.

---

## Scoring System

### Base stat score (`calcPrefScore`)

Each stat that changed vs. equipped item contributes to a score:

| Filter state | Field | Score per changed stat |
|---|---|---|
| Must have (★) | `preferredStats` | ±4 |
| Preferred (♥) | `stats` | ±2 |
| Optional (◎) | `optional` | **unscored** (stored, not weighted) |
| Avoid (✗) | `avoid` | **unscored** (stored, not weighted) |
| Neutral | *(not in any set)* | ±0.5 |

Direction: `+` if new item > equipped, `−` if new item < equipped.

Multi-roll bonus adds a flat value (0–3) per stat configured in `fc.multiBonus` when the item has a multi-roll.

### Qualification gate (`_qualifies`)

Top Pick and Interesting also require the item to *qualify*:
- At least `min(2, totalTrackedStats)` tracked stats (must-have + preferred) improved **OR**
- A tracked stat was multi-rolled

### Thresholds (`recommendation`)

| Label | Condition |
|---|---|
| ✅ Top Pick | score ≥ 4 AND qualifies |
| 👍 Interesting | score ≥ 1 AND qualifies |
| ↔ Neutral | score ≥ −1 |
| 💾 Salvage | score < −1 |

### Roll quality cap (`applyQualityCap`)

Applied after scoring, can only lower the result:
- Median roll quality < 75%: capped at Neutral (never lower if `allStats` is present)
- Weapon with ATK quality < 75% and no multi-roll: capped at Salvage

### Mode score bump (`adjustedRec`)

Each filter has a `mode` field (`"aggressive"` | `"defensive"`) that optionally adjusts the final score:

| Mode | Measures | Bump table |
|---|---|---|
| 🗡 Aggressive | DPS % change | >5%→+3, >2%→+2, <-2%→-2, <-5%→-3 |
| 🛡 Defensive | EHP % change (hp × def proxy) | same brackets |

**Design note:** Only the Spear (tank) build benefits from Defensive mode. All other classes prioritize attack. A future improvement is to auto-derive mode from filter stats (e.g., if `def` or `hp` is in `preferredStats` → defensive, otherwise aggressive) and remove the manual toggle.

---

## Filter Data Model

```js
mkFC(stats, enabled, multiBonus, preferredStats, mode, optional, avoid)
// Returns: { stats: Set, preferredStats: Set, optional: Set, avoid: Set,
//            enabled: bool, multiBonus: {}, mode: "aggressive"|"defensive" }
```

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

## Known Improvement Areas

### Mode auto-detection (remove manual toggle)

**Current:** Each filter has a manual 🗡/🛡 toggle. Default is `"defensive"` for all.

**Proposal:** Auto-derive from filter stats — if `def` or `hp` is in `preferredStats`, use defensive mode; otherwise aggressive. Remove the toggle button entirely.

**Impact:** `fc.mode` field removed. `adjustedRec()` derives mode inline. `data-fmode` event handler and `.sg-mode-btn` CSS removed.

### Optional / Avoid scoring

**Current:** `optional` and `avoid` Sets are stored and displayed but contribute 0 to `calcPrefScore`.

**Ideas:**
- Avoid: apply a negative weight (e.g., −2) when an avoided stat appears on the item
- Optional: apply a small positive weight (e.g., +0.5 or +1) — effectively like Neutral but explicitly chosen

---

## Key File Locations

| Thing | Location |
|---|---|
| Scoring logic | `calcPrefScore`, `_qualifies`, `recommendation`, `applyQualityCap` (~line 1215) |
| Mode bump | `_dpsScoreBump`, `_ehpScoreBump`, `adjustedRec` (~line 2713) |
| Filter model | `mkFC`, `loadFilters`, `saveFilters` (~line 249) |
| Default filters | `DEFAULT_FILTERS` (~line 237) |
| Chip state info | `statChipInfo` (~line 761) |
| Stat key map | `STAT_KEY_MAP`, `STAT_DEFS` (~line 140) |
| Slot tables | `RARITY_STAT_SLOTS`, `WEAPON_RARITY_STAT_SLOTS` (~line 37) |
| Sub-tier breakpoints | `SUB_TIER_BREAKPOINTS`, `subTierFromGearReq` (~line 78) |
