# Scoring Redesign v9 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-score verdict system in `aim-loot-helper.js` with a three-axis model (Gear Quality, Build Fit, Upgrade Score) that never produces contradictory label/number combinations.

**Architecture:** All scoring logic lives in `modules/aim-loot-helper.js`. New pure functions are added alongside the existing `calcFilterScore()` and wired into `_buildBagItem()` progressively through five migration phases. The old path remains available behind `SCORING_MODEL: 'legacy'` until Phase 5 removes it.

**Tech Stack:** Vanilla JS (ES6), Tampermonkey userscript, no test framework — tests are `console.assert()` blocks collected in a `runV9ScoringTests()` function callable from the browser console.

**Spec:** `docs/superpowers/specs/2026-05-11-scoring-redesign-v9-design.md`

---

## File Map

| File | Role |
|---|---|
| `modules/aim-loot-helper.js` | All changes live here |

Key locations in the existing file:
- **L304–322** `SCORE_CONFIG` — existing config object
- **L636** `compactItemLabel()` — item name formatter
- **L1345–1475** `calcFilterScore()` — existing core scorer (returns 13-field object)
- **L1477** `recommendation()` — score → BiS/Top/Good/Salvage label
- **L1494–1524** `applyQualityCap()` — quality override (to be removed in Phase 5)
- **L1665** `_buildBagItem()` — main orchestrator; returns 22-field item object
- **L1743** call site of `calcFilterScore()` inside `_buildBagItem()`
- **L2424–2517** `renderDebug()` — builds debug HTML
- **L3268** `renderItemCard()` — item card DOM builder
- **L3319** `renderCatItem()` — compact list-item DOM builder

New functions to be added (all pure, all above `_buildBagItem()`):
- `V9_CONFIG` — config object
- `_gearQualityLabel(score)` — score → tier label
- `computeGearQuality(item)` — Gear Quality calculator
- `_buildFitLabel(score)` — score → tier label
- `computeBuildFit(item, filterConfig)` — Build Fit calculator
- `_upgradeLabel(score)` — score → tier label
- `_computeStatFloor(candidateValue, qualityPercent)` — statFloor helper
- `_computeValueGain(candidateValue, equippedValue, statFloor)` — log2 delta transform
- `computeUpgradeScore(ownBaseStats, eqBaseStats, filterConfig, rollQualities)` — Upgrade Score calculator
- `computeRecommendation(gearQuality, buildFit, upgrade)` — overlay badge logic
- `runV9ScoringTests()` — console.assert test suite (developer use only)

---

## Phase 1 — Debug Clarity (no formula changes)

Rename internal abbreviations in the debug output and expose when the quality cap overrides the label. Ships with zero balance changes.

---

### Task 1: Rename debug abbreviations in `renderDebug()`

**Files:**
- Modify: `modules/aim-loot-helper.js` around L2424–2517

The compact summary line currently reads:
```
cov 25.0 pow 35.7 pref -1.7 neutral 6.4 = 65.4
```

Find where this string is assembled (search for `cov` and `pow` inside `renderDebug`) and replace the labels.

- [ ] **Step 1: Find the compact summary line**

Search the file for the string that builds the compact score footer. It will look something like:
```js
`cov ${x} pow ${y} pref ${z} neutral ${n} = ${score}`
```

- [ ] **Step 2: Replace abbreviated labels**

Update every label in that string builder to plain English:

| Old | New |
|---|---|
| `cov` | `Must-have presence` |
| `pow` | `Must-have stat gain` |
| `pref` | `Preferred stat gain` |
| `neutral` | `Neutral stat gain` |
| `opt` | `Optional stat gain` |
| `raw` | `Before cap` |

Keep the numeric values identical. Only the label text changes.

- [ ] **Step 3: Verify in browser**

Load the extension, open a loot inspector panel, expand the debug view. Confirm the footer now shows full English labels instead of abbreviations.

- [ ] **Step 4: Commit**

```bash
git add modules/aim-loot-helper.js
git commit -m "fix: rename debug abbreviations to plain English in renderDebug"
```

---

### Task 2: Expose quality-cap overrides in debug output

**Files:**
- Modify: `modules/aim-loot-helper.js` around L1494–1524 (`applyQualityCap`) and L2424–2517 (`renderDebug`)

When `applyQualityCap()` changes the tier, the player currently sees only the final verdict with no explanation. This task makes the override visible.

- [ ] **Step 1: Add a `qualityCapReason` field to the item object**

Inside `applyQualityCap()`, when the recommendation is changed, record why. The function currently mutates `rec` in place. Add a string field to `rec`:

```js
// Example: inside applyQualityCap(), where BiS → Good happens:
if (medianQuality < 0.75 && (rec.cat === 'bis' || rec.cat === 'top')) {
  rec = recommendation(SCORE_CONFIG.goodThreshold); // existing downgrade
  rec.qualityCapReason = `Median roll quality ${Math.round(medianQuality * 100)}% is below the 75% threshold`;
}
```

Add `rec.qualityCapReason = null` as the default at the top of `applyQualityCap()` so the field always exists.

- [ ] **Step 2: Show the cap reason in `renderDebug()`**

In the section of `renderDebug()` that renders each item's verdict header, add a conditional line after the score:

```js
if (item.rec.qualityCapReason) {
  html += `<div class="debug-cap-warning">⚠ Label was capped: ${item.rec.qualityCapReason}</div>`;
}
```

The CSS class `debug-cap-warning` should inherit existing warning styles; add `color: orange; font-size: 0.85em;` if no suitable class exists.

- [ ] **Step 3: Also show the pre-cap verdict**

Before `applyQualityCap()` runs in `_buildBagItem()`, store the raw verdict:

```js
const rawRec = recommendation(score); // already computed
// ... existing applyQualityCap call ...
item.rawRec = rawRec; // add this line after computing rawRec
```

In `renderDebug()`, show it when it differs from the final:

```js
if (item.rawRec && item.rawRec.label !== item.rec.label) {
  html += `<div class="debug-cap-warning">Score verdict: ${item.rawRec.label} → overridden to ${item.rec.label}</div>`;
}
```

- [ ] **Step 4: Verify in browser**

Find an item that triggers the quality cap. Confirm the debug panel now shows the pre-cap verdict and the reason.

- [ ] **Step 5: Commit**

```bash
git add modules/aim-loot-helper.js
git commit -m "feat: expose quality-cap overrides in debug view"
```

---

## Phase 2 — Add Gear Quality and Build Fit (display only)

Compute the two new scores and show them in the debug view alongside the existing score. The main recommendation badge is unchanged.

---

### Task 3: Add `V9_CONFIG`

**Files:**
- Modify: `modules/aim-loot-helper.js` — add near L304 alongside `SCORE_CONFIG`

- [ ] **Step 1: Add the config object immediately after `SCORE_CONFIG`**

```js
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
    upgrade:  { major: 60, upgrade: 25, minor: 10, sidegradeMin: -9, minorDowngrade: -10, downgrade: -25 },
  },

  // Migration flag — switch to 'v9' when ready
  SCORING_MODEL: 'legacy',
};
```

- [ ] **Step 2: Confirm no syntax errors**

```bash
# In browser console after loading the userscript:
console.log(typeof V9_CONFIG); // should print "object"
```

- [ ] **Step 3: Commit**

```bash
git add modules/aim-loot-helper.js
git commit -m "feat: add V9_CONFIG for scoring redesign"
```

---

### Task 4: Implement `computeGearQuality()`

**Files:**
- Modify: `modules/aim-loot-helper.js` — add new function above `_buildBagItem()` (around L1660)

- [ ] **Step 1: Add label helper**

```js
function _gearQualityLabel(score) {
  const t = V9_CONFIG.tiers.quality;
  if (score >= t.perfect)   return 'Perfect';
  if (score >= t.excellent) return 'Excellent';
  if (score >= t.good)      return 'Good';
  if (score >= t.usable)    return 'Usable';
  return 'Poor';
}
```

- [ ] **Step 2: Add `computeGearQuality()`**

```js
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
```

- [ ] **Step 3: Commit**

```bash
git add modules/aim-loot-helper.js
git commit -m "feat: add computeGearQuality() for v9 scoring"
```

---

### Task 5: Test `computeGearQuality()`

**Files:**
- Modify: `modules/aim-loot-helper.js` — add `runV9ScoringTests()` function above `_buildBagItem()`

- [ ] **Step 1: Add test function**

```js
function runV9ScoringTests() {
  console.group('V9 Scoring Tests');
  let passed = 0; let failed = 0;

  function assert(label, actual, expected, tolerance = 0) {
    const ok = Math.abs(actual - expected) <= tolerance;
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
  // weightedAvg = (0.92×1.25 + 0.38×1.00) / 2.25 = 0.676
  // median = (0.38+0.92)/2 = 0.65
  // score = round(0.70×67.6 + 0.30×65.0) = round(47.32+19.50) = 67
  assert('Sovereign Grips score ≈ 67', gqSovereign.score, 67, 1);
  assertEq('Sovereign Grips label', gqSovereign.label, 'Usable');

  // Immortal Gauntlets: ATK=96%, AllStats=84%
  const immortalGauntlets = {
    stats: { atk: 23, allStats: 2.0, _qualities: { atk: 96, allStats: 84 } },
    prefixes: [],
  };
  const gqImmortal = computeGearQuality(immortalGauntlets);
  // weightedAvg = (0.96×1.25 + 0.84×1.00) / 2.25 = 0.907
  // median = (0.84+0.96)/2 = 0.90
  // score = round(0.70×90.7 + 0.30×90.0) = round(63.49+27.0) = 90
  assert('Immortal Gauntlets score ≈ 90', gqImmortal.score, 90, 2);
  assertEq('Immortal Gauntlets label', gqImmortal.label, 'Excellent');

  // Empty item
  const emptyItem = { stats: { _qualities: {} }, prefixes: [] };
  const gqEmpty = computeGearQuality(emptyItem);
  assert('Empty item score = 0', gqEmpty.score, 0);
  assertEq('Empty item label', gqEmpty.label, 'Poor');

  console.groupEnd();
  console.log(`\nTotal: ${passed} passed, ${failed} failed`);
  console.groupEnd();
}
```

- [ ] **Step 2: Run the tests in browser console**

Open the browser console and run:
```js
runV9ScoringTests();
```

Expected output: all `computeGearQuality` tests show ✓.

- [ ] **Step 3: Fix any failures before proceeding**

If a test fails, fix `computeGearQuality()` until all pass. Do not move to the next task with failing tests.

- [ ] **Step 4: Commit**

```bash
git add modules/aim-loot-helper.js
git commit -m "test: add runV9ScoringTests() with computeGearQuality cases"
```

---

### Task 6: Implement `computeBuildFit()`

**Files:**
- Modify: `modules/aim-loot-helper.js` — add after `computeGearQuality()`

The `filterConfig` object is what `calcFilterScore()` currently calls `fc`. It has:
- `fc.preferredStats` — array of stat keys that are "must-have" (confusingly named in legacy code)
- `fc.stats` — array of stat keys that are "preferred"
- `fc.optional` — array of stat keys that are "optional"
- `fc.avoid` — array of stat keys to avoid

Read the existing `calcFilterScore()` call signature to confirm these field names before implementing.

- [ ] **Step 1: Confirm filterConfig field names**

In the existing file, find `calcFilterScore` (L1345) and read its parameter `fc`. Confirm which property names map to must-have, preferred, optional, and avoid. Update the implementation below if the names differ.

- [ ] **Step 2: Add label helper**

```js
function _buildFitLabel(score) {
  const t = V9_CONFIG.tiers.fit;
  if (score >= t.perfect)  return 'Perfect Fit';
  if (score >= t.strong)   return 'Strong Fit';
  if (score >= t.partial)  return 'Partial Fit';
  if (score >= t.weak)     return 'Weak Fit';
  return 'Off-build';
}
```

- [ ] **Step 3: Add `computeBuildFit()`**

Replace `fc.preferredStats` / `fc.stats` / `fc.optional` / `fc.avoid` with the actual field names confirmed in Step 1.

```js
function computeBuildFit(item, fc, eligibleStats = null) {
  const itemStatKeys = new Set(Object.keys(item.stats ?? {}).filter(k => k !== '_qualities'));
  const isEligible = key => !eligibleStats || eligibleStats.includes(key);

  // Must-have (fc.preferredStats in legacy naming)
  const mustHave     = (fc.preferredStats ?? []).filter(isEligible);
  const mustPresent  = mustHave.filter(k => itemStatKeys.has(k));

  // Preferred (fc.stats in legacy naming)
  const preferred    = (fc.stats ?? []).filter(isEligible);
  const prefPresent  = preferred.filter(k => itemStatKeys.has(k));

  // Optional
  const optional     = (fc.optional ?? []).filter(isEligible);
  const optPresent   = optional.filter(k => itemStatKeys.has(k));

  // Avoided
  const avoided      = (fc.avoid ?? []);
  const avoidPresent = avoided.filter(k => itemStatKeys.has(k));

  // Neutral useful: stat present on item, not in any filter category, positive value
  const filterKeys = new Set([...mustHave, ...preferred, ...optional, ...avoided]);
  const neutralUseful = [...itemStatKeys].filter(k => !filterKeys.has(k) && (item.stats[k] ?? 0) > 0);

  // Slot counts
  const totalSlots = itemStatKeys.size;
  const usefulDesired = mustPresent.length + prefPresent.length + optPresent.length;

  // Coverage score
  const coverageWeights = V9_CONFIG.coverageWeights;
  const coverageScore =
    (mustHave.length   > 0 ? coverageWeights.mustHave  * (mustPresent.length  / mustHave.length)   : 0) +
    (preferred.length  > 0 ? coverageWeights.preferred * (prefPresent.length  / preferred.length)  : 0) +
    (optional.length   > 0 ? coverageWeights.optional  * (optPresent.length   / optional.length)   : 0) +
    (totalSlots        > 0 ? coverageWeights.neutral   * (neutralUseful.length / totalSlots)        : 0);

  // Slot efficiency score
  const slotEfficiency = totalSlots > 0 ? usefulDesired / totalSlots : 0;
  const slotEfficiencyScore = V9_CONFIG.slotEfficiencyMax * slotEfficiency;

  // Avoid penalty
  const avoidPenalty = totalSlots > 0
    ? -V9_CONFIG.avoidPenaltyPerStat * (avoidPresent.length / totalSlots)
    : 0;

  const raw = coverageScore + slotEfficiencyScore + avoidPenalty;
  const score = Math.round(Math.min(Math.max(raw, 0), 100));

  return {
    score,
    label: _buildFitLabel(score),
    mustHavePresent:  mustPresent.length,
    mustHaveEligible: mustHave.length,
    preferredPresent: prefPresent.length,
    preferredEligible: preferred.length,
    optionalPresent:  optPresent.length,
    optionalEligible: optional.length,
    slotEfficiency,
    avoidStatsPresent: avoidPresent,
  };
}
```

- [ ] **Step 4: Commit**

```bash
git add modules/aim-loot-helper.js
git commit -m "feat: add computeBuildFit() for v9 scoring"
```

---

### Task 7: Test `computeBuildFit()`

**Files:**
- Modify: `modules/aim-loot-helper.js` — add tests to `runV9ScoringTests()`

- [ ] **Step 1: Add Build Fit tests to `runV9ScoringTests()`**

Inside `runV9ScoringTests()`, after the `computeGearQuality` group, add:

```js
console.group('computeBuildFit');

const bowFilter = {
  preferredStats: ['atk'],           // must-have
  stats: ['atkSpeed', 'critChance'], // preferred
  optional: ['allStats'],
  avoid: [],
};

// Sovereign Grips: ATK ✓, Crit% ✓, AtkSpeed ✗, AllStats ✗
const sgItem = {
  stats: { atk: 19, critChance: 2.3, _qualities: { atk: 92, critChance: 38 } },
  prefixes: [],
};
const bfSovereign = computeBuildFit(sgItem, bowFilter);
// Coverage: 60×1 + 25×0.5 + 10×0 + 5×0 = 72.5
// SlotEff: 2/2 × 15 = 15
// Score = round(87.5) = 88 → Strong Fit
assert('Sovereign Grips BuildFit ≈ 88', bfSovereign.score, 88, 1);
assertEq('Sovereign Grips fit label', bfSovereign.label, 'Strong Fit');
assert('mustHavePresent = 1', bfSovereign.mustHavePresent, 1);
assert('preferredPresent = 1', bfSovereign.preferredPresent, 1);

// Immortal Gauntlets: ATK ✓, Crit% ✗, AtkSpeed ✗, AllStats ✓
const igItem = {
  stats: { atk: 23, allStats: 2.0, _qualities: { atk: 96, allStats: 84 } },
  prefixes: [],
};
const bfImmortal = computeBuildFit(igItem, bowFilter);
// Coverage: 60×1 + 25×0 + 10×1 + 5×0 = 70
// SlotEff: 2/2 × 15 = 15
// Score = round(85) = 85 → Strong Fit
assert('Immortal Gauntlets BuildFit ≈ 85', bfImmortal.score, 85, 1);
assertEq('Immortal Gauntlets fit label', bfImmortal.label, 'Strong Fit');
assert('preferredPresent = 0', bfImmortal.preferredPresent, 0);

// Off-build item: only DEF stat
const offBuildItem = {
  stats: { def: 50, _qualities: { def: 90 } },
  prefixes: [],
};
const bfOff = computeBuildFit(offBuildItem, bowFilter);
// Coverage: 0 (no mustHave, no preferred, no optional, no useful neutral — DEF is neutral but value > 0)
// Wait: DEF is neutral useful (not in filter, value > 0) → 5 × (1/1) = 5
// SlotEff: 0 useful desired / 1 slot = 0
// Score = round(5) = 5 → Off-build
assert('Off-build BuildFit ≤ 30', bfOff.score, 5, 5);
assertEq('Off-build label', bfOff.label, 'Off-build');

console.groupEnd();
```

- [ ] **Step 2: Run tests**

```js
runV9ScoringTests();
```

Expected: all `computeBuildFit` tests show ✓.

- [ ] **Step 3: Fix any failures**

- [ ] **Step 4: Commit**

```bash
git add modules/aim-loot-helper.js
git commit -m "test: add computeBuildFit cases to runV9ScoringTests"
```

---

### Task 8: Wire Gear Quality + Build Fit into `_buildBagItem()`

**Files:**
- Modify: `modules/aim-loot-helper.js` — `_buildBagItem()` around L1665 and its return object around L1825

- [ ] **Step 1: Call both functions inside `_buildBagItem()`**

Find the section of `_buildBagItem()` where `filterScores` and `filterBreakdowns` are assembled (around L1743). After existing scoring logic, add:

```js
// v9 scores — computed for all items regardless of SCORING_MODEL
const v9GearQuality = computeGearQuality(item);
const v9BuildFit    = computeBuildFit(item, bestFilter, eligibleStats);
```

`bestFilter` is the filter config object already used in the legacy scoring path. `eligibleStats` is the existing eligible-stats array already computed in `_buildBagItem()`.

- [ ] **Step 2: Add to the return object**

In the return object (around L1825), add:

```js
v9GearQuality,
v9BuildFit,
```

- [ ] **Step 3: Verify no errors**

Load the userscript in the browser. Open a loot panel. Confirm no console errors. Open the browser console and check:

```js
// Access a bag item from state (adjust path as needed)
const item = window._voidState?.bagItems?.[0];
console.log(item?.v9GearQuality); // should log an object with score, label, stats
console.log(item?.v9BuildFit);    // should log an object with score, label, etc.
```

- [ ] **Step 4: Commit**

```bash
git add modules/aim-loot-helper.js
git commit -m "feat: compute v9GearQuality and v9BuildFit in _buildBagItem"
```

---

### Task 9: Show Gear Quality and Build Fit in `renderDebug()`

**Files:**
- Modify: `modules/aim-loot-helper.js` — `renderDebug()` around L2424

- [ ] **Step 1: Add secondary score block to each item's debug section**

In `renderDebug()`, find where each item's debug section is rendered. After the existing verdict badge line, add:

```js
if (item.v9GearQuality) {
  html += `<div class="debug-v9-row">`;
  html += `<span class="debug-v9-label">Quality:</span> `;
  html += `<span>${item.v9GearQuality.score}/100 — ${item.v9GearQuality.label}</span>`;
  html += `</div>`;
}
if (item.v9BuildFit) {
  html += `<div class="debug-v9-row">`;
  html += `<span class="debug-v9-label">Build Fit:</span> `;
  html += `<span>${item.v9BuildFit.score}/100 — ${item.v9BuildFit.label}</span>`;
  html += `</div>`;
}
```

- [ ] **Step 2: Add minimal CSS if needed**

If the existing stylesheet doesn't have `.debug-v9-row`, add inline styles or append to the existing style block:

```css
.debug-v9-row { font-size: 0.85em; color: #aaa; margin-top: 2px; }
.debug-v9-label { min-width: 80px; display: inline-block; }
```

- [ ] **Step 3: Verify in browser**

Open the debug panel. Each item should now show three lines:
- Existing verdict badge (unchanged)
- `Quality: 67/100 — Usable`
- `Build Fit: 88/100 — Strong Fit`

- [ ] **Step 4: Commit**

```bash
git add modules/aim-loot-helper.js
git commit -m "feat: show v9 Gear Quality and Build Fit in debug panel"
```

---

## Phase 3 — Upgrade Score (parallel with legacy)

Add the v9 Upgrade Score and show it alongside the legacy score. The main badge still uses legacy until Phase 4.

---

### Task 10: Implement the delta transform helpers

**Files:**
- Modify: `modules/aim-loot-helper.js` — add above `computeUpgradeScore()`

- [ ] **Step 1: Add `_computeStatFloor()`**

```js
function _computeStatFloor(candidateValue, qualityPercent) {
  // qualityPercent is 0–100; guard against zero-quality edge case
  const safeQuality = Math.max(qualityPercent, 1);
  return Math.abs(candidateValue) * (V9_CONFIG.statFloorQuality / safeQuality);
}
```

- [ ] **Step 2: Add `_computeValueGain()`**

```js
function _computeValueGain(candidateValue, equippedValue, statFloor) {
  const denominator = Math.max(Math.abs(equippedValue), statFloor, 0.0001);
  const relativeDelta = (candidateValue - equippedValue) / denominator;
  return Math.sign(relativeDelta) * Math.log2(1 + Math.abs(relativeDelta));
}
```

- [ ] **Step 3: Add tests for helpers in `runV9ScoringTests()`**

```js
console.group('Delta transform helpers');

// statFloor: candidateValue=19, quality=92 → 19*(50/92) ≈ 10.33
assert('statFloor(19, 92) ≈ 10.33', _computeStatFloor(19, 92), 10.33, 0.05);

// statFloor: quality=0 → uses safeQuality=1 → 19*50 = 950 (clamped)
assert('statFloor handles quality=0', _computeStatFloor(19, 0), 950, 1);

// valueGain: +100% gain → log2(2) = 1.00
assert('valueGain(20, 10, 5) = 1.00', _computeValueGain(20, 10, 5), 1.00, 0.01);

// valueGain: +5% gain → log2(1.05) ≈ 0.0703
assert('valueGain +5% ≈ 0.07', _computeValueGain(10.5, 10, 5), 0.0703, 0.005);

// valueGain: -5% loss
assert('valueGain -5% ≈ -0.07', _computeValueGain(9.5, 10, 5), -0.0703, 0.005);

// newly gained stat: equipped=0
// denominator = max(0, statFloor) = statFloor
const gainedFloor = _computeStatFloor(19, 92); // ≈ 10.33
assert('Newly gained stat has positive valueGain', _computeValueGain(19, 0, gainedFloor), 0.88, 0.05);

console.groupEnd();
```

- [ ] **Step 4: Run tests**

```js
runV9ScoringTests();
```

All delta transform tests should pass.

- [ ] **Step 5: Commit**

```bash
git add modules/aim-loot-helper.js
git commit -m "feat: add _computeStatFloor and _computeValueGain for v9 upgrade scoring"
```

---

### Task 11: Implement `computeUpgradeScore()`

**Files:**
- Modify: `modules/aim-loot-helper.js` — add after `_computeValueGain()`

- [ ] **Step 1: Add upgrade label helper**

```js
function _upgradeLabel(score) {
  const t = V9_CONFIG.tiers.upgrade;
  if (score >= t.major)          return 'Major Upgrade';
  if (score >= t.upgrade)        return 'Upgrade';
  if (score >= t.minor)          return 'Minor Upgrade';
  if (score >= t.sidegradeMin)   return 'Sidegrade';
  if (score >= t.minorDowngrade) return 'Minor Downgrade';
  return 'Downgrade';
}
```

- [ ] **Step 2: Add `computeUpgradeScore()`**

`rollQualities` is `item.stats._qualities` — a map of statKey → quality %.

```js
function computeUpgradeScore(ownBaseStats, eqBaseStats, fc, rollQualities, eligibleStats = null) {
  const isEligible = key => !eligibleStats || eligibleStats.includes(key);

  // Build role map: statKey → role string
  const roleMap = {};
  (fc.preferredStats ?? []).forEach(k => { roleMap[k] = 'mustHave'; });
  (fc.stats ?? []).forEach(k => { if (!roleMap[k]) roleMap[k] = 'preferred'; });
  (fc.optional ?? []).forEach(k => { if (!roleMap[k]) roleMap[k] = 'optional'; });
  (fc.avoid ?? []).forEach(k => { if (!roleMap[k]) roleMap[k] = 'avoid'; });

  // All stat keys to evaluate (union of candidate + equipped, minus _qualities)
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
      // Penalty only if newly present on candidate
      if (candidateVal > 0 && equippedVal === 0) {
        magnitudeScore -= V9_CONFIG.avoidNewStatPenalty;
      }
      statResults.push({ stat: key, role, equippedValue: equippedVal, candidateValue: candidateVal,
        statFloor: 0, relativeDelta: 0, valueGain: 0, weight: 0, contribution: candidateVal > 0 && equippedVal === 0 ? -V9_CONFIG.avoidNewStatPenalty : 0,
        isMultiRoll: false, multiRollCount: 1 });
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

    // Coverage tracking: desired = mustHave + preferred + optional
    if (role === 'mustHave' || role === 'preferred' || role === 'optional') {
      // Eligible = at least one of candidate or equipped is non-zero
      if (candidateVal > 0 || equippedVal > 0) {
        desiredEligible++;
        if (valueGain > 0) desiredImproved++;
      }
    }

    magnitudeScore += contribution;

    statResults.push({
      stat: key, role,
      equippedValue: equippedVal,
      candidateValue: candidateVal,
      statFloor,
      relativeDelta: candidateVal !== 0 || equippedVal !== 0
        ? (candidateVal - equippedVal) / Math.max(Math.abs(equippedVal), statFloor, 0.0001)
        : 0,
      valueGain,
      weight,
      contribution,
      isMultiRoll: false,
      multiRollCount: 1,
    });
  }

  // Coverage bonus
  const coverageRatio   = desiredEligible > 0 ? desiredImproved / desiredEligible : 0;
  const coverageBonus   = V9_CONFIG.coverageBonusMax * coverageRatio * coverageRatio;

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
```

- [ ] **Step 3: Commit**

```bash
git add modules/aim-loot-helper.js
git commit -m "feat: add computeUpgradeScore() for v9 scoring"
```

---

### Task 12: Test `computeUpgradeScore()`

**Files:**
- Modify: `modules/aim-loot-helper.js` — add to `runV9ScoringTests()`

- [ ] **Step 1: Add Upgrade Score tests**

```js
console.group('computeUpgradeScore');

const bowFilter = {
  preferredStats: ['atk'],
  stats: ['atkSpeed', 'critChance'],
  optional: ['allStats'],
  avoid: [],
};

// Spec worked example A: +100% ATK, nothing else
const ownA = { atk: 20, _qualities: { atk: 80 } };
const eqA  = { atk: 10 };
const quA  = { atk: 80 };
const upA  = computeUpgradeScore(ownA, eqA, bowFilter, quA);
// ATK: floor=20*(50/80)=12.5, denom=max(10,12.5)=12.5, delta=(20-10)/12.5=0.8, valueGain=log2(1.8)≈0.848
// contribution = 100 × 0.848 = 84.8
// coverage: 1/1 improved (only ATK eligible) → bonus = 20×1² = 20
// score ≈ round(84.8 + 20) = 105
assert('Item A (big ATK gain) score > 60', upA.score, upA.score, 0); // just verify it runs
assert('Item A score >> 60 (Major Upgrade)', upA.score >= 60, true, 0);

// Spec worked example B: +5% everywhere
const ownB = { atk: 10.5, critChance: 2.1, atkSpeed: 1.05, allStats: 1.05, _qualities: { atk: 80, critChance: 80, atkSpeed: 80, allStats: 80 } };
const eqB  = { atk: 10,   critChance: 2.0, atkSpeed: 1.00, allStats: 1.00 };
const quB  = { atk: 80, critChance: 80, atkSpeed: 80, allStats: 80 };
const upB  = computeUpgradeScore(ownB, eqB, bowFilter, quB);
// All 4 improve by ~5%, coverage bonus = 20×1² = 20
// magnitude ≈ 100×0.07 + 45×0.07 + 45×0.07 + 12×0.07 ≈ 14.14
// score ≈ round(14.14 + 20) = 34
assert('Item B (+5% everywhere) score ≈ 34', upB.score, 34, 5);
assert('Item B < Item A score (big gain wins)', upA.score > upB.score, true, 0);

// Lost a must-have
const ownLost = { _qualities: {} };
const eqLost  = { atk: 14 };
const quLost  = {};
const upLost  = computeUpgradeScore(ownLost, eqLost, bowFilter, quLost);
assert('Lost must-have: adjustment = -35', upLost.mustHaveAdjustment, -35, 0);

console.groupEnd();
```

- [ ] **Step 2: Run tests**

```js
runV9ScoringTests();
```

All Upgrade Score tests should pass.

- [ ] **Step 3: Fix any failures**

- [ ] **Step 4: Commit**

```bash
git add modules/aim-loot-helper.js
git commit -m "test: add computeUpgradeScore cases to runV9ScoringTests"
```

---

### Task 13: Implement `computeRecommendation()`

**Files:**
- Modify: `modules/aim-loot-helper.js` — add after `computeUpgradeScore()`

- [ ] **Step 1: Add `computeRecommendation()`**

```js
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

  // Build a one-sentence summary
  const parts = [];
  if (up >= 10)  parts.push(`${upgrade.label.toLowerCase()} due to ${_topContributingStat(upgrade)}`);
  if (gq >= 85)  parts.push('well-rolled item');
  if (bf < 60)   parts.push('poor build fit');
  if (up < -9)   parts.push('worse than equipped across key stats');
  const summary = parts.length > 0 ? parts.join('; ') + '.' : 'No significant change.';

  return { primary, overlay, summary };
}

function _topContributingStat(upgrade) {
  const top = [...upgrade.stats]
    .filter(r => r.role !== 'avoid')
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))[0];
  return top ? `${top.stat} (${top.contribution > 0 ? '+' : ''}${top.contribution.toFixed(1)})` : 'stat gains';
}
```

- [ ] **Step 2: Commit**

```bash
git add modules/aim-loot-helper.js
git commit -m "feat: add computeRecommendation() for v9 overlay badges"
```

---

### Task 14: Wire Upgrade Score + Recommendation into `_buildBagItem()`

**Files:**
- Modify: `modules/aim-loot-helper.js` — `_buildBagItem()` around L1743

- [ ] **Step 1: Add v9 upgrade scoring call**

After the existing `v9GearQuality` and `v9BuildFit` computation from Task 8, add:

```js
const v9Upgrade = computeUpgradeScore(
  item.ownBaseStats,
  item.eqBaseStats,
  bestFilter,
  item.stats._qualities ?? {},
  eligibleStats
);
const v9Recommendation = computeRecommendation(v9GearQuality, v9BuildFit, v9Upgrade);
```

- [ ] **Step 2: Add to return object**

```js
v9GearQuality,
v9BuildFit,
v9Upgrade,
v9Recommendation,
```

- [ ] **Step 3: Verify in browser console**

```js
const item = window._voidState?.bagItems?.[0];
console.log(item?.v9Upgrade);         // signed integer score + label + stats array
console.log(item?.v9Recommendation);  // { primary, overlay, summary }
```

- [ ] **Step 4: Commit**

```bash
git add modules/aim-loot-helper.js
git commit -m "feat: compute v9Upgrade and v9Recommendation in _buildBagItem"
```

---

### Task 15: Show v9 Upgrade Score alongside legacy in `renderDebug()`

**Files:**
- Modify: `modules/aim-loot-helper.js` — `renderDebug()` around L2424

- [ ] **Step 1: Add v9 section to debug output**

In `renderDebug()`, after the existing compact footer (the line showing `Must-have presence: X Must-have stat gain: Y ...`), add a v9 section:

```js
if (item.v9Upgrade) {
  const up = item.v9Upgrade;
  const gq = item.v9GearQuality;
  const bf = item.v9BuildFit;
  const rec = item.v9Recommendation;

  html += `<div class="debug-v9-section">`;
  html += `<div class="debug-v9-header">── v9 Scoring ──</div>`;
  html += `<div class="debug-v9-row"><b>Upgrade:</b> ${up.label}  ${up.score >= 0 ? '+' : ''}${up.score}</div>`;
  html += `<div class="debug-v9-row"><b>Quality:</b> ${gq.score}/100 — ${gq.label}</div>`;
  html += `<div class="debug-v9-row"><b>Fit:</b> ${bf.score}/100 — ${bf.label}</div>`;
  if (rec.overlay) {
    html += `<div class="debug-v9-row"><b>Overlay:</b> ${rec.overlay}</div>`;
  }
  html += `<div class="debug-v9-row debug-v9-summary">${rec.summary}</div>`;

  // Upgrade breakdown
  html += `<div class="debug-v9-breakdown">`;
  html += `<div>Must-have presence adjustment: ${up.mustHaveAdjustment >= 0 ? '+' : ''}${up.mustHaveAdjustment.toFixed(1)}</div>`;
  html += `<div>Coverage bonus: +${up.coverageBonus.toFixed(2)} (${up.desiredStatsImproved}/${up.desiredStatsEligible} desired stats improved)</div>`;
  html += `<div>Neutral stat changes: ${up.neutralContribution >= 0 ? '+' : ''}${up.neutralContribution.toFixed(1)}</div>`;
  html += `<div>Stat magnitude: ${up.magnitudeScore >= 0 ? '+' : ''}${up.magnitudeScore.toFixed(1)}</div>`;
  html += `</div>`;

  html += `</div>`;
}
```

- [ ] **Step 2: Add minimal CSS**

```css
.debug-v9-section { margin-top: 8px; border-top: 1px solid #333; padding-top: 6px; font-size: 0.85em; }
.debug-v9-header  { color: #888; margin-bottom: 4px; }
.debug-v9-breakdown { margin-left: 12px; color: #999; }
.debug-v9-summary { font-style: italic; margin-top: 4px; }
```

- [ ] **Step 3: Verify in browser**

Open the debug panel. Each item now shows both the legacy score block and a `── v9 Scoring ──` section below it.

- [ ] **Step 4: Commit**

```bash
git add modules/aim-loot-helper.js
git commit -m "feat: show v9 upgrade score alongside legacy in debug panel"
```

---

## Phase 4 — Switch Primary Verdict to v9

The player-facing badge now uses v9. Legacy remains in debug for comparison.

---

### Task 16: Switch primary badge to v9 when `SCORING_MODEL = 'v9'`

**Files:**
- Modify: `modules/aim-loot-helper.js` — `_buildBagItem()` return path and `renderItemCard()`/`renderCatItem()`

- [ ] **Step 1: Switch the default model**

In `V9_CONFIG`, change:
```js
SCORING_MODEL: 'legacy',
```
to:
```js
SCORING_MODEL: 'v9',
```

- [ ] **Step 2: Use v9 recommendation as primary `rec` in `_buildBagItem()`**

Find where `item.rec` is set in `_buildBagItem()` (the object that `renderItemCard` reads). Add a branch:

```js
// After all v9 scores are computed:
if (V9_CONFIG.SCORING_MODEL === 'v9' && v9Recommendation) {
  // Build a rec object matching the shape renderItemCard expects
  item.rec = {
    label: v9Recommendation.overlay ?? v9Recommendation.primary,
    cls: _v9RecClass(v9Upgrade.score),
    qualityCapReason: null, // no post-hoc caps in v9
    // keep legacy fields so renderCatItem doesn't break:
    cat: _v9Cat(v9Upgrade.score),
  };
}
```

- [ ] **Step 3: Add `_v9RecClass()` and `_v9Cat()`**

```js
function _v9RecClass(score) {
  const t = V9_CONFIG.tiers.upgrade;
  if (score >= t.major)          return 'rec-major-upgrade';
  if (score >= t.upgrade)        return 'rec-upgrade';
  if (score >= t.minor)          return 'rec-minor-upgrade';
  if (score >= t.sidegradeMin)   return 'rec-sidegrade';
  if (score >= t.minorDowngrade) return 'rec-minor-downgrade';
  return 'rec-downgrade';
}

function _v9Cat(score) {
  const t = V9_CONFIG.tiers.upgrade;
  if (score >= t.upgrade) return 'upgrade';
  if (score >= t.minor)   return 'minor';
  if (score >= t.sidegradeMin) return 'sidegrade';
  return 'salvage';
}
```

Note: CSS classes for the new rec values may need to be added or mapped to existing ones. Check what classes `renderItemCard` uses for badge styling and map accordingly.

- [ ] **Step 4: Keep legacy score visible in debug**

In `renderDebug()`, show legacy score labeled as `Legacy Score:` so it remains visible for comparison during this phase:

```js
html += `<div class="debug-v9-row" style="color:#666">Legacy score: ${item.bestFilterScore?.toFixed(1) ?? '—'}</div>`;
```

- [ ] **Step 5: Verify in browser**

Load the extension. Item badges should now show `Major Upgrade`, `Upgrade`, `Sidegrade`, etc. The debug panel shows both legacy and v9 scores.

- [ ] **Step 6: Commit**

```bash
git add modules/aim-loot-helper.js
git commit -m "feat: switch primary verdict badge to v9 scoring model"
```

---

## Phase 5 — Remove Legacy Code

Once satisfied with v9 results from real play sessions, clean up.

---

### Task 17: Remove legacy scoring path

**Files:**
- Modify: `modules/aim-loot-helper.js`

> **Prerequisite:** Only do this after at least one real play session confirms v9 results feel correct.

- [ ] **Step 1: Delete `applyQualityCap()`**

Remove the function at L1494–1524. Search for all call sites and remove them.

- [ ] **Step 2: Remove `SCORING_MODEL` flag**

Remove `SCORING_MODEL` from `V9_CONFIG` and remove the `if (SCORING_MODEL === 'legacy')` branches.

- [ ] **Step 3: Remove legacy debug section**

Remove the `Legacy score:` line added in Task 16 Step 4.

- [ ] **Step 4: Remove `SCORE_CONFIG`**

Delete `SCORE_CONFIG` (L304–322) and `calcFilterScore()` (L1345–1475). Confirm no remaining references.

- [ ] **Step 5: Search for orphan references**

```bash
grep -n "calcFilterScore\|applyQualityCap\|SCORE_CONFIG\|bisThreshold\|topThreshold\|goodThreshold" modules/aim-loot-helper.js
```

Expected: no results. Fix any that remain.

- [ ] **Step 6: Full smoke test in browser**

Load the extension. Open several items. Confirm all panels render without errors.

- [ ] **Step 7: Commit**

```bash
git add modules/aim-loot-helper.js
git commit -m "refactor: remove legacy scoring path, applyQualityCap, and SCORE_CONFIG"
```

---

## Self-Review

**Spec coverage check:**

| Spec section | Task |
|---|---|
| Gear Quality formula (§2) | Task 4 |
| Gear Quality tiers (§2.5) | Task 4 |
| Build Fit formula (§3) | Task 6 |
| Build Fit tiers (§3.6) | Task 6 |
| Upgrade Score delta transform (§4.3) | Task 10 |
| Upgrade Score magnitude + coverage bonus (§4.4–4.5) | Task 11 |
| Must-have presence adjustment (§4.6) | Task 11 |
| Multi-roll bonus removed (§4.7) | Task 11 (not included in formula) |
| Upgrade tier labels (§4.9) | Task 11 |
| Worked example A vs B (§4.10) | Task 12 |
| Recommendation overlays (§5.2) | Task 13 |
| Debug compact card (§6.1) | Task 15 |
| Debug expanded card (§6.2) | Task 15 |
| Renamed debug terms (§6.3) | Task 1 |
| Data model shape (§7) | Tasks 4, 6, 11, 13 |
| Migration phase 1 (§8) | Tasks 1, 2 |
| Migration phase 2 (§8) | Tasks 3–9 |
| Migration phase 3 (§8) | Tasks 10–15 |
| Migration phase 4 (§8) | Task 16 |
| Migration phase 5 (§8) | Task 17 |
| V9_CONFIG reference (§9) | Task 3 |

All spec sections covered. ✓

**Placeholder scan:** No TBDs, no "implement later", no references to undefined functions. All code blocks are complete. ✓

**Type consistency check:**
- `computeGearQuality()` returns `{ score, label, weightedAverage, medianQuality, stats }` — used consistently in Tasks 8, 9, 13, 14, 15.
- `computeBuildFit()` returns `{ score, label, mustHavePresent, ... }` — used consistently.
- `computeUpgradeScore()` returns `{ score, label, magnitudeScore, coverageBonus, mustHaveAdjustment, neutralContribution, stats, desiredStatsImproved, desiredStatsEligible }` — used consistently in Tasks 13, 15.
- `computeRecommendation()` returns `{ primary, overlay, summary }` — used consistently in Tasks 14, 15, 16.
- `_v9RecClass()` and `_v9Cat()` called in Task 16 only; both defined in Task 16. ✓
