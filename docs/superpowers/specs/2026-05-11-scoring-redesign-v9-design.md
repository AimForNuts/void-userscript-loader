# Aim Loot Helper — Scoring Redesign v9

**Status:** Draft for review  
**Date:** 2026-05-11  
**Scope:** Full replacement of the single-score verdict system with a three-axis scoring model

---

## Problem statement

The current system produces visible contradictions such as:

```
Sovereign Grips     Good  65.4
Immortal Gauntlets  BiS   56.6
```

A player reasonably assumes `BiS` is better than `Good`, but the numeric score says the opposite. The root cause is that the system computes one score that mixes quality, build fit, and upgrade value together, then applies a roll-quality cap afterward that can override the tier label independently of the score.

---

## Goal

Replace the single verdict with three independent scores that each answer one question:

| Score | Question |
|---|---|
| **Gear Quality** | How well rolled is this item? |
| **Build Fit** | Does it contain the stats my build wants? |
| **Upgrade Score** | Is it better than what I currently have equipped? |

No post-hoc caps. No quality overrides. Each score is computed independently and displayed clearly.

---

## 1. Architecture

### 1.1 Three independent scores

**Gear Quality (0–100)**  
Computed from `stats._qualities` only. Does not know about the filter, the equipped item, or slot context. Describes the item in isolation.

**Build Fit (0–100)**  
Computed from the filter config (must-have / preferred / optional / avoid) and the candidate item's stat list. Does not compare against the equipped item. Does not use delta values — only presence/absence of matching stats.

**Upgrade Score (unbounded, signed integer)**  
Computed from deltas between candidate and equipped item, weighted by filter role. Positive = upgrade, negative = downgrade. This is the primary driver of the recommendation label.

### 1.2 Recommendation label

The Upgrade Score drives the main label. Gear Quality and Build Fit appear as secondary labels and may trigger overlay badges. There are no post-hoc caps: quality never downgrades the Upgrade label.

### 1.3 UI structure

```
Sovereign Grips
Upgrade: Major Upgrade  +54
Quality: Good  72/100
Fit:     Strong  88/100
```

```
Immortal Gauntlets
Upgrade: Upgrade  +48
Quality: Excellent  91/100
Fit:     Strong  85/100
```

This makes the real situation legible:
- Sovereign Grips is the larger **current upgrade**
- Immortal Gauntlets has **better long-term roll quality and build shape**

Both facts are visible without contradiction.

---

## 2. Gear Quality Score

### 2.1 Purpose

Answers: *How well rolled is this item for its slot?*

Uses only the `_qualities` map on the item's stats. Does not use filter config or equipped item.

### 2.2 Per-stat quality

```
statQuality = clamp(qualityPercent / 100, 0, 1)
```

where `qualityPercent` comes directly from `stats._qualities[statKey]`.

### 2.3 Weighted average

```
weightedQuality = weightedAverage(statQuality, statWeights)
```

Suggested stat weights:

| Stat position | Weight |
|---|---|
| Primary stat (first slot) | 1.25 |
| Bonus stat | 1.00 |

Multi-roll stats are **not** given a separate bonus. Their higher final value already produces a higher quality percentage, which flows through naturally.

### 2.4 Final formula

```
GearQuality = round(70% × weightedQuality × 100 + 30% × medianQuality × 100)
```

The blend of weighted average and median resists a single extreme outlier roll distorting the score.

Configurable via:
```js
qualityAverageWeight: 0.70,
qualityMedianWeight:  0.30,
```

### 2.5 Quality tier labels

| Score | Label |
|---:|---|
| 95–100 | Perfect |
| 85–94 | Excellent |
| 70–84 | Good |
| 50–69 | Usable |
| 0–49 | Poor |

`Gear Quality` must never use the words `BiS`, `Top`, or `Upgrade` — those imply comparison, not roll quality.

### 2.6 Example

```
Sovereign Grips
  ATK quality:   92% → 0.92
  Crit% quality: 38% → 0.38

  Weighted average: (0.92 × 1.25 + 0.38 × 1.00) / (1.25 + 1.00) = 0.676
  Median: 0.65 (midpoint of [0.38, 0.92])
  GearQuality = round(0.70 × 67.6 + 0.30 × 65.0) = round(47.3 + 19.5) = 67 → Usable

Immortal Gauntlets
  ATK quality:      96% → 0.96
  All Stats quality: 84% → 0.84

  Weighted average: (0.96 × 1.25 + 0.84 × 1.00) / (1.25 + 1.00) = 0.907
  Median: 0.90 (midpoint of [0.84, 0.96])
  GearQuality = round(0.70 × 90.7 + 0.30 × 90.0) = round(63.5 + 27.0) = 91 → Excellent
```

---

## 3. Build Fit Score

### 3.1 Purpose

Answers: *Does this item contain the stats my build actually wants?*

Does not measure improvement over equipped gear. Only checks whether the item is the right shape.

### 3.2 Formula

```
BuildFit = CoverageScore + SlotEfficiencyScore + AvoidPenalty
BuildFit = clamp(BuildFit, 0, 100)
```

### 3.3 Coverage score

```
CoverageScore =
  60 × (mustHavePresent / mustHaveEligible)
+ 25 × (preferredPresent / preferredEligible)
+ 10 × (optionalPresent / optionalEligible)
+  5 × (neutralUsefulPresent / totalBonusStatSlotsUsed)
```

"Eligible" means the stat can roll on this slot. Stats that cannot roll on the slot are excluded from the denominator. "Neutral useful" means a stat that is not in the filter but has a positive value on the candidate item.

### 3.4 Slot efficiency score

```
slotEfficiency = usefulDesiredStatsPresent / totalBonusStatSlotsUsed
SlotEfficiencyScore = 15 × slotEfficiency
```

This prevents an item with many stat slots from scoring well if those slots are filled with irrelevant stats.

### 3.5 Avoid penalty

```
AvoidPenalty = -20 × (avoidedStatsPresentCount / totalBonusStatSlotsUsed)
```

### 3.6 Fit tier labels

| Score | Label |
|---:|---|
| 95–100 | Perfect Fit |
| 80–94 | Strong Fit |
| 60–79 | Partial Fit |
| 30–59 | Weak Fit |
| 0–29 | Off-build |

### 3.7 Example

Filter: must-have ATK, preferred Crit%/Atk Speed, optional All Stats

**Sovereign Grips** (ATK ✓, Crit% ✓, Atk Speed ✗, All Stats ✗)
```
Coverage:
  Must-have: 1/1 × 60 = 60.0
  Preferred: 1/2 × 25 = 12.5
  Optional:  0/1 × 10 =  0.0
Slot efficiency: 2 useful / 2 slots × 15 = 15.0
Avoid penalty: 0
BuildFit = 87.5 → Strong Fit
```

**Immortal Gauntlets** (ATK ✓, Crit% ✗, Atk Speed ✗, All Stats ✓)
```
Coverage:
  Must-have: 1/1 × 60 = 60.0
  Preferred: 0/2 × 25 =  0.0
  Optional:  1/1 × 10 = 10.0
Slot efficiency: 2 useful / 2 slots × 15 = 15.0
Avoid penalty: 0
BuildFit = 85.0 → Strong Fit
```

Note: both land in Strong Fit here. The difference in preferred coverage (12.5 vs 0) is visible in the breakdown. Thresholds can be tuned later if the Strong Fit label feels too generous for an item with 0/2 preferred stats.

---

## 4. Upgrade Score

### 4.1 Purpose

Answers: *Should I equip this instead of what I currently have?*

This is the primary signal for the player's immediate decision.

### 4.2 Role weights

| Role | Weight |
|---|---:|
| Must-have | 100 |
| Preferred | 45 |
| Optional | 12 |
| Neutral | 5 |
| Avoid (newly present) | −20 |

### 4.3 Delta transform

Raw percentage deltas are unstable around small denominators. Apply a logarithmic transform:

```
statFloor = candidateValue × (50 / qualityPercent)
```

This gives the value the stat would have at 50% roll quality, assuming min roll = 0. It prevents division by near-zero when the equipped stat is very low or absent.

```
denominator = max(abs(equippedValue), statFloor)
relativeDelta = (candidateValue − equippedValue) / denominator
valueGain = sign(relativeDelta) × log2(1 + abs(relativeDelta))
```

Approximate transformed values for reference:

| Raw change | valueGain |
|---:|---:|
| +5% | 0.07 |
| +20% | 0.26 |
| +50% | 0.58 |
| +100% | 1.00 |
| −5% | −0.07 |
| −50% | −0.58 |
| −100% | −1.00 |

**Stat gained from zero (newly present):**  
When equipped value = 0, use `statFloor` as the denominator. `relativeDelta = candidateValue / statFloor`. This rewards gaining a new stat without producing unbounded scores.

**Stat lost entirely (goes to zero):**  
`relativeDelta = (0 − equippedValue) / max(abs(equippedValue), statFloor) = −1.0` (or close to it). Transformed to approximately −1.00. This is a real penalty but not a cliff.

### 4.4 Magnitude score

```
statImprovement = roleWeight × valueGain
MagnitudeScore = sum(statImprovement for all relevant stats)
```

### 4.5 Coverage bonus

Rewards improving a broader set of desired stats, but cannot overpower a large core-stat gain.

```
coverageRatio = desiredStatsImproved / desiredStatsEligible
CoverageBonus = coverageBonusMax × coverageRatio²
```

Default `coverageBonusMax = 20`.

"Desired stats" includes must-have, preferred, and optional. "Improved" means `valueGain > 0` for that stat (the candidate is strictly better than equipped). Stats absent from both equipped and candidate are excluded from the denominator. Stats newly gained from zero count as improved.

Why squared: at 1/4 stats improved the bonus is 1.25; at 4/4 it is 20. Broad coverage helps but never dominates.

### 4.6 Must-have presence adjustment

Presence is tracked separately from improvement magnitude.

```
MustHaveAdjustment =
  +15 for each must-have newly gained (not on equipped, present on candidate)
  −35 for each must-have lost (on equipped, not on candidate)
```

This is decisive but not catastrophic. Strict filters belong in the **recommendation layer** (overlays), not as a buried arithmetic bomb.

### 4.7 Multi-roll bonus

**Not applied.** Multi-rolled stats produce higher stat values, which already flow through as a higher `valueGain` and higher `GearQuality`. A separate multi-roll bonus would double-count the benefit. Multi-roll status is shown descriptively in the debug view as a label on the stat row.

### 4.8 Final formula

```
UpgradeScore = round(
  MagnitudeScore
  + CoverageBonus
  + MustHaveAdjustment
)
```

### 4.9 Upgrade tier labels

| Score | Label |
|---:|---|
| +60 or higher | Major Upgrade |
| +25 to +59 | Upgrade |
| +10 to +24 | Minor Upgrade |
| −9 to +9 | Sidegrade |
| −10 to −24 | Minor Downgrade |
| −25 or lower | Downgrade |

### 4.10 Worked example: large single-stat gain vs. broad small gains

Filter: must-have ATK, preferred Crit%/Atk Speed, optional All Stats

**Item A — +100% ATK, nothing else changes**
```
ATK:      100 × log2(1 + 1.00) = 100 × 1.00 = 100.0
Coverage: 1/4 improved → bonus = 20 × (0.25)² = 1.25
MustHaveAdjustment: 0 (ATK was already present)
UpgradeScore = round(100.0 + 1.25) = 101 → Major Upgrade
```

**Item B — +5% on ATK, Crit%, Atk Speed, All Stats**
```
ATK:       100 × 0.07 =  7.0
Crit%:      45 × 0.07 =  3.15
Atk Speed:  45 × 0.07 =  3.15
All Stats:  12 × 0.07 =  0.84
MagnitudeScore = 14.14
Coverage: 4/4 improved → bonus = 20 × (1.0)² = 20.0
MustHaveAdjustment: 0
UpgradeScore = round(14.14 + 20.0) = 34 → Upgrade
```

Item A (101) still beats Item B (34) decisively. Broad coverage helps but cannot overpower a dominant core-stat gain.

---

## 5. Recommendation System

### 5.1 Primary label

Derived from Upgrade Score tier (see section 4.9). This is what appears in the item card header badge.

### 5.2 Overlay badges

Applied on top of the primary label when conditions are met. At most one overlay is shown.

| Badge | Condition |
|---|---|
| `Best-in-Slot Candidate` | Build Fit ≥ 95 and Gear Quality ≥ 85 |
| `Temporary Upgrade` | Upgrade Score ≥ 10 and Build Fit < 60 |
| `Keep — High Quality` | Gear Quality ≥ 85 and Build Fit < 60 |
| `Low-quality Upgrade` | Upgrade Score ≥ 10 and Gear Quality < 50 |
| `Perfect Roll` | Gear Quality ≥ 95 |

Note: `Best-in-Slot Candidate` replaces the old `BiS` label. The tool cannot know every future item or setup, so "candidate" is more accurate than a definitive claim.

---

## 6. Debug / Inspector Format

### 6.1 Compact card

```
Upgrade: Upgrade  +49
Quality: Usable  67/100
Fit:     Strong  88/100

Why:
✓ Must-have ATK present and improves from 14 → 19 (+36%)
✓ Preferred Crit% present but worsens from 2.4 → 2.3 (−5%)
– Preferred Atk Speed absent
– Optional All Stats absent

Upgrade breakdown:
  ATK improvement            +44.0
  Crit% change                −2.7
  Coverage bonus              +1.25
  Neutral stat changes        +6.4
  Final Upgrade Score:       +49
```

### 6.2 Expanded card

```
Sovereign Grips — Hands
Compared against: Immortal Gauntlets (currently equipped)

━━ VERDICT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Upgrade Score:  +54  →  Upgrade
Gear Quality:  67/100  →  Usable
Build Fit:     88/100  →  Strong Fit

━━ 1. GEAR QUALITY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ATK roll quality:          92%  (weight ×1.25)
  Crit% roll quality:        38%  (weight ×1.00)
  Weighted average quality:  68%
  Median quality:            65%
  Final: 0.70 × 68 + 0.30 × 65 = 67  →  Usable

━━ 2. BUILD FIT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Must-have present:  1 / 1  (ATK ✓)
  Preferred present:  1 / 2  (Crit% ✓, Atk Speed ✗)
  Optional present:   0 / 1  (All Stats ✗)
  Slot efficiency:    2 useful stats / 2 slots used
  Avoid stats:        none
  Score:  60.0 + 12.5 + 0 + 15.0 = 87.5  →  Strong Fit

━━ 3. UPGRADE COMPARISON ━━━━━━━━━━━━━━━━━━━━━━━━━━

  Stat        Role        Equipped  Item   Change   Contribution
  ──────────  ──────────  ────────  ─────  ───────  ────────────
  ATK         Must-have   14        19     +36%     +44.3
  Crit%       Preferred   2.4       2.3    −5%      −1.7
  Atk Speed   Preferred   —         —      —        +0.0
  All Stats   Optional    —         —      —        +0.0

  Must-have gained/lost:   0  (adjustment: +0.0)
  Coverage bonus:          1 of 4 desired stats improved  →  +1.25
  Neutral stat changes:    +6.4
  ──────────────────────────────────────────────────────────────
  Final Upgrade Score:     +49  →  Upgrade

━━ 4. SUMMARY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
This is a solid upgrade because the ATK gain is large. The roll quality
is only Usable — Crit% rolled at 38%, which drags the quality score down.
It is not a perfect build fit because it lacks Atk Speed and the Crit%
value is slightly lower than what is equipped.
```

### 6.3 Renamed internal terms

| Current abbreviation | New label |
|---|---|
| `cov` | Must-have presence |
| `pow` | Must-have stat gain |
| `pref` | Preferred stat gain |
| `neutral` | Neutral stat gain |
| `opt` | Optional stat gain |
| `raw` | Before cap |
| `Δ` | Change vs equipped |

The compact abbreviations may remain behind a developer-only toggle, but the default inspector uses full labels.

---

## 7. Data Model

```js
{
  gearQuality: {
    score: 67,                  // 0–100
    label: 'Usable',
    weightedAverage: 0.676,
    medianQuality: 0.65,
    stats: [
      { stat: 'atk',       quality: 0.92, weight: 1.25, isMultiRoll: false },
      { stat: 'critChance', quality: 0.38, weight: 1.00, isMultiRoll: false },
    ],
  },

  buildFit: {
    score: 88,                  // 0–100, clamped
    label: 'Strong Fit',
    mustHavePresent: 1,
    mustHaveEligible: 1,
    preferredPresent: 1,
    preferredEligible: 2,
    optionalPresent: 0,
    optionalEligible: 1,
    slotEfficiency: 1.0,
    avoidStatsPresent: [],
  },

  upgrade: {
    score: 49,                  // signed integer, unbounded
    label: 'Upgrade',
    magnitudeScore: 41.3,
    coverageBonus: 1.25,
    mustHaveAdjustment: 0,
    neutralContribution: 6.4,
    stats: [
      {
        stat: 'atk',
        role: 'mustHave',
        equippedValue: 14,
        candidateValue: 19,
        statFloor: 11.45,       // candidateValue × (50 / quality)
        relativeDelta: 0.439,
        valueGain: 0.443,
        weight: 100,
        contribution: 44.3,
        isMultiRoll: false,
        multiRollCount: 1,
      },
      {
        stat: 'critChance',
        role: 'preferred',
        equippedValue: 2.4,
        candidateValue: 2.3,
        statFloor: 1.47,
        relativeDelta: -0.042,
        valueGain: -0.059,
        weight: 45,
        contribution: -1.7,
        isMultiRoll: false,
        multiRollCount: 1,
      },
    ],
    desiredStatsImproved: 1,
    desiredStatsEligible: 4,
  },

  recommendation: {
    primary: 'Upgrade',
    overlay: null,              // or e.g. 'Temporary Upgrade'
    summary: 'Large ATK gain outweighs a small Crit% loss. Roll quality is mediocre.',
  },
}
```

---

## 8. Migration Plan

### Phase 1 — Debug clarity only (no formula changes)

Keep the current score calculation. Rename internal debug labels to plain language. Expose when a quality cap changed the label:

```
Score from formula:  65.4  →  BiS
After quality cap:   Good
Reason: Crit% roll quality (38%) is below the 75% threshold
```

Ships immediately. No balance changes, no tuning needed.

### Phase 2 — Add secondary labels alongside legacy score

Introduce Gear Quality and Build Fit as display-only additions. Keep the legacy score and tier label as the primary verdict. This lets the player start seeing the new signals without any change to recommendations.

### Phase 3 — Parallel scoring

Add v9 Upgrade Score behind a config flag:

```js
SCORING_MODEL: 'legacy' | 'v9'
```

Log both side-by-side in the debug view. Collect real dropped-item data to validate that thresholds feel right before removing legacy logic.

### Phase 4 — Switch primary verdict to v9

Make the v9 Upgrade Score the primary recommendation driver. Remove the quality-cap override. Legacy score remains in the debug view as `Legacy Score` for one more session.

### Phase 5 — Remove legacy code

Delete the old scoring path once confidence is established.

---

## 9. Configuration Reference

```js
const V9_CONFIG = {
  // Gear Quality
  qualityAverageWeight:     0.70,
  qualityMedianWeight:      0.30,
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
  slotEfficiencyMax:        15,
  avoidPenaltyPerStat:      20,

  // Upgrade Score
  roleWeights: {
    mustHave:  100,
    preferred:  45,
    optional:   12,
    neutral:     5,
  },
  avoidNewStatPenalty:      20,
  coverageBonusMax:         20,
  mustHaveGainedBonus:      15,
  mustHaveLostPenalty:      35,
  statFloorQuality:         50,   // % quality used to derive statFloor

  // Tier thresholds
  tiers: {
    quality: {
      perfect:   95,
      excellent: 85,
      good:      70,
      usable:    50,
    },
    fit: {
      perfect:  95,
      strong:   80,
      partial:  60,
      weak:     30,
    },
    upgrade: {
      major:          60,
      upgrade:        25,
      minor:          10,
      sidegradeMin:   -9,
      minorDowngrade: -10,
      downgrade:      -25,
    },
  },
};
```

---

## 10. Design principles

1. One score answers one question.
2. A label must never contradict the number beside it.
3. Quality describes the item; Upgrade describes the comparison.
4. Large gains on must-have stats must remain dominant.
5. Broad stat coverage should help, but not overpower raw core-stat magnitude.
6. The inspector explains results in plain language, not abbreviations.
7. Strict filters belong in the recommendation layer, not inside raw arithmetic.
8. The system must remain tunable from config with no hidden class-mode logic.
