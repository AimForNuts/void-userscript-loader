# Enlightened Prefix Requirement per Filter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-filter "Require Enlightened prefix" toggle that penalises items lacking the `enlightened` prefix as a missing must-have, driving them to Salvage.

**Architecture:** Add `requireEnlightened` to the filter config (`mkFC`), pass an `hasEnlightened` boolean into `calcFilterScore` where the penalty is applied, wire the field through all filter persistence/edit paths, and render a checkbox in the edit panel plus a ✨ indicator on the filter row.

**Tech Stack:** Vanilla JS, Tampermonkey userscript — single file `modules/aim-loot-helper.js`. Tests run via `window.runV9ScoringTests()` in the browser console.

---

### Task 1: Extend `mkFC` and filter persistence

**Files:**
- Modify: `modules/aim-loot-helper.js:378-413`

- [ ] **Step 1: Update `mkFC` signature**

Replace line 378:
```js
function mkFC(stats, enabled=true, multiBonus={}, preferredStats=[], optional=[], avoid=[]) {
  return { stats: new Set(stats), enabled, multiBonus, preferredStats: new Set(preferredStats), optional: new Set(optional), avoid: new Set(avoid) };
}
```
With:
```js
function mkFC(stats, enabled=true, multiBonus={}, preferredStats=[], optional=[], avoid=[], requireEnlightened=false) {
  return { stats: new Set(stats), enabled, multiBonus, preferredStats: new Set(preferredStats), optional: new Set(optional), avoid: new Set(avoid), requireEnlightened };
}
```

- [ ] **Step 2: Update `loadFilters` deserialization**

In `loadFilters` at line 392, replace:
```js
map.set(k, mkFC(v.stats ?? [], v.enabled !== false, v.multiBonus ?? {}, v.preferredStats ?? [], v.optional ?? [], v.avoid ?? []));
```
With:
```js
map.set(k, mkFC(v.stats ?? [], v.enabled !== false, v.multiBonus ?? {}, v.preferredStats ?? [], v.optional ?? [], v.avoid ?? [], v.requireEnlightened ?? false));
```

- [ ] **Step 3: Update `saveFilters` serialization**

In `saveFilters` at line 410, replace:
```js
out[k] = { stats:[...fc.stats], enabled:fc.enabled, multiBonus:fc.multiBonus, preferredStats:[...fc.preferredStats], optional:[...(fc.optional ?? [])], avoid:[...(fc.avoid ?? [])] };
```
With:
```js
out[k] = { stats:[...fc.stats], enabled:fc.enabled, multiBonus:fc.multiBonus, preferredStats:[...fc.preferredStats], optional:[...(fc.optional ?? [])], avoid:[...(fc.avoid ?? [])], requireEnlightened: fc.requireEnlightened ?? false };
```

- [ ] **Step 4: Add tests to `runV9ScoringTests`**

After the existing `computeBuildFit` tests (around line 1880), add a new test group:

```js
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
```

- [ ] **Step 5: Run tests**

Open the browser console on VoidIdle and run:
```js
window.runV9ScoringTests()
```
Expected: all `requireEnlightened persistence` assertions log `✓`.

- [ ] **Step 6: Commit**

```bash
git add modules/aim-loot-helper.js
git commit -m "feat(aim-loot-helper): add requireEnlightened field to filter config and persistence"
```

---

### Task 2: Apply Enlightened penalty in `calcFilterScore`

**Files:**
- Modify: `modules/aim-loot-helper.js:1395-1524`

- [ ] **Step 1: Write the failing tests**

After the `requireEnlightened persistence` group from Task 1, add:

```js
console.group('calcFilterScore — requireEnlightened');

const enlFC = mkFC([], true, {}, ["atk"], [], [], true); // requireEnlightened ON
const baseStats   = { atk: 20 };
const equippedStats = { atk: 15 };
const statKeys    = new Set(["atk"]);

// Item without Enlightened → should incur mustHaveMissingPenalty (-100) on top of normal score
const bdNoEnl = calcFilterScore(baseStats, equippedStats, enlFC, 0, statKeys, null, false);
assert('no-enl: mustHaveMissingCount includes enlightened', bdNoEnl.mustHaveMissingCount, 1);
assert('no-enl: reasons includes enlightened missing', bdNoEnl.reasons.some(r => r.stat === 'enlightened' && r.type === 'missing'), true);
assert('no-enl: finalScore reduced by 100', bdNoEnl.finalScore < calcFilterScore(baseStats, equippedStats, mkFC([], true, {}, ["atk"], [], [], false), 0, statKeys, null, false).finalScore - 99, true);

// Item with Enlightened → no penalty, score unchanged vs a filter without requireEnlightened
const fcOff = mkFC([], true, {}, ["atk"], [], [], false);
const bdEnl  = calcFilterScore(baseStats, equippedStats, enlFC, 0, statKeys, null, true);
const bdOff  = calcFilterScore(baseStats, equippedStats, fcOff,  0, statKeys, null, false);
assert('with-enl: mustHaveMissingCount same as without flag', bdEnl.mustHaveMissingCount, bdOff.mustHaveMissingCount);
assert('with-enl: finalScore same as without flag', bdEnl.finalScore, bdOff.finalScore);

// requireEnlightened OFF → passing hasEnlightened=false has no effect
const fcOff2 = mkFC([], true, {}, ["atk"], [], [], false);
const bdOff2 = calcFilterScore(baseStats, equippedStats, fcOff2, 0, statKeys, null, false);
assert('flag off: no penalty even without enlightened', bdOff2.mustHaveMissingCount, 0);

console.groupEnd();
```

Run in console — expected: all `calcFilterScore — requireEnlightened` tests FAIL with "calcFilterScore is not a function" or wrong values (the param doesn't exist yet).

- [ ] **Step 2: Add `hasEnlightened` parameter and penalty block**

In `calcFilterScore` at line 1395, replace the signature:
```js
function calcFilterScore(ownBaseStats, eqBaseStats, fc, multiRollCount, itemStatKeys, eligibleStats = null) {
```
With:
```js
function calcFilterScore(ownBaseStats, eqBaseStats, fc, multiRollCount, itemStatKeys, eligibleStats = null, hasEnlightened = false) {
```

Then after the must-have loop closing brace at line 1428 (after `}`), insert:

```js
    if (fc.requireEnlightened && !hasEnlightened) {
      mustHaveCoverageScore += cfg.mustHaveMissingPenalty;
      mustHaveMissingCount++;
      reasons.push({ stat: "enlightened", tier: "mustHave", type: "missing", contribution: cfg.mustHaveMissingPenalty });
    }
```

- [ ] **Step 3: Run tests**

```js
window.runV9ScoringTests()
```
Expected: all `calcFilterScore — requireEnlightened` tests log `✓`. All pre-existing tests still pass.

- [ ] **Step 4: Commit**

```bash
git add modules/aim-loot-helper.js
git commit -m "feat(aim-loot-helper): apply Enlightened must-have penalty in calcFilterScore"
```

---

### Task 3: Pass `hasEnlightened` at all `calcFilterScore` call sites

**Files:**
- Modify: `modules/aim-loot-helper.js:1110, 2259, 2299-2304`

There are three call sites. Note: the chat tooltip path (line 1110) parses tooltip text — prefix data is not available there — so it always passes `false`. The penalty will not apply to chat-inspected items; this is an acceptable limitation given the data source.

- [ ] **Step 1: Main bag scoring loop (line ~2299)**

Before the `for (const [key, fc] of state.filters)` loop (around line 2299), add:

```js
const hasEnlightened = (item.prefixes ?? []).some(p => p.type === "enlightened");
```

Then on line 2300, replace:
```js
const bd = calcFilterScore(ownBaseStats, eqBaseStats, fc, multiRollCount, itemStatKeys, eligibleStats);
```
With:
```js
const bd = calcFilterScore(ownBaseStats, eqBaseStats, fc, multiRollCount, itemStatKeys, eligibleStats, hasEnlightened);
```

- [ ] **Step 2: Ring slot comparison (line ~2259)**

In the ring comparison block, compute `hasEnl` once **before** `scoreVs` is defined (both ring calls share the same item), then pass it in. Replace the entire `scoreVs` definition:
```js
const hasEnl = (item.prefixes ?? []).some(p => p.type === "enlightened");
const scoreVs = (eq) => {
  const eqS = {};
  for (const [k, v] of Object.entries(eq.stats)) { if (k !== "_qualities") eqS[normStatKey(k)] = v; }
  return calcFilterScore(ownBaseStats, eqS, fc, 0, new Set(Object.keys(ownBaseStats)), ringEligibleStats, hasEnl).finalScore;
};
```

- [ ] **Step 3: Chat tooltip path (line ~1110)**

Replace:
```js
const chatBd = calcFilterScore(ttStats, eqBaseStats, activeFC, multiRollCount, itemStatKeys, chatEligibleStats);
```
With:
```js
const chatBd = calcFilterScore(ttStats, eqBaseStats, activeFC, multiRollCount, itemStatKeys, chatEligibleStats, false);
```

- [ ] **Step 4: Verify no other call sites were missed**

Run in console:
```js
// Search for any remaining calls missing the new arg — should return 0 results
document.querySelectorAll('script').length; // just a health check
```

Also grep the file to confirm:
```
grep -n "calcFilterScore(" modules/aim-loot-helper.js
```
Expected: exactly 3 results, all updated.

- [ ] **Step 5: Smoke-test bag scoring**

Open inventory in VoidIdle, open the loot helper panel. Items should score and label normally. No console errors.

- [ ] **Step 6: Commit**

```bash
git add modules/aim-loot-helper.js
git commit -m "feat(aim-loot-helper): pass hasEnlightened to calcFilterScore at all call sites"
```

---

### Task 4: Wire `requireEnlightened` through filter edit state

**Files:**
- Modify: `modules/aim-loot-helper.js:5054, 5076, 5085, 5144`

- [ ] **Step 1: Edit button handler — populate `filterEdit` from existing fc**

At line 5054, replace:
```js
state.filterEdit = { key, name:key, stats:new Set(fc?.stats), preferredStats:new Set(fc?.preferredStats), multiBonus:{...fc?.multiBonus}, optional:new Set(fc?.optional ?? []), avoid:new Set(fc?.avoid ?? []) };
```
With:
```js
state.filterEdit = { key, name:key, stats:new Set(fc?.stats), preferredStats:new Set(fc?.preferredStats), multiBonus:{...fc?.multiBonus}, optional:new Set(fc?.optional ?? []), avoid:new Set(fc?.avoid ?? []), requireEnlightened: fc?.requireEnlightened ?? false };
```

- [ ] **Step 2: "New Filter" handler — initialise with `requireEnlightened: false`**

At line 5144, replace:
```js
state.filterEdit = { key:name, name, stats:new Set(), preferredStats:new Set(), multiBonus:{}, optional:new Set(), avoid:new Set() };
```
With:
```js
state.filterEdit = { key:name, name, stats:new Set(), preferredStats:new Set(), multiBonus:{}, optional:new Set(), avoid:new Set(), requireEnlightened: false };
```

- [ ] **Step 3: Save handler — pass `requireEnlightened` to `mkFC`**

At line 5085, replace:
```js
state.filters.set(newName, mkFC([...fe.stats], oldFC?.enabled ?? true, fe.multiBonus, [...(fe.preferredStats ?? [])], [...(fe.optional ?? [])], [...(fe.avoid ?? [])]));
```
With:
```js
state.filters.set(newName, mkFC([...fe.stats], oldFC?.enabled ?? true, fe.multiBonus, [...(fe.preferredStats ?? [])], [...(fe.optional ?? [])], [...(fe.avoid ?? [])], fe.requireEnlightened ?? false));
```

- [ ] **Step 4: Duplicate handler — copy `requireEnlightened`**

At line 5076, replace:
```js
state.filters.set(copy, mkFC([...fc.stats], fc.enabled, {...fc.multiBonus}, [...fc.preferredStats], [...(fc.optional ?? [])], [...(fc.avoid ?? [])]));
```
With:
```js
state.filters.set(copy, mkFC([...fc.stats], fc.enabled, {...fc.multiBonus}, [...fc.preferredStats], [...(fc.optional ?? [])], [...(fc.avoid ?? [])], fc.requireEnlightened ?? false));
```

- [ ] **Step 5: Smoke-test**

Open the filter edit panel for an existing filter, save it, reload the page. `requireEnlightened` should round-trip correctly (stays `false` for existing filters). No console errors.

- [ ] **Step 6: Commit**

```bash
git add modules/aim-loot-helper.js
git commit -m "feat(aim-loot-helper): wire requireEnlightened through filterEdit state and save/dup handlers"
```

---

### Task 5: Filter edit UI — Enlightened checkbox

**Files:**
- Modify: `modules/aim-loot-helper.js:3354-3366` (inside `renderFilters` edit block)

- [ ] **Step 1: Add checkbox to the edit panel HTML**

In `renderFilters`, after the multi-roll bonus grid closing `</div>` (line ~3366), before the outer `</div>`, add a checkbox row:

```js
html += `</div>
  <div style="margin-top:8px;display:flex;align-items:center;gap:6px;">
    <input type="checkbox" id="aimSgFeEnlightened"${fe.requireEnlightened ? " checked" : ""}>
    <label for="aimSgFeEnlightened" style="font-size:11px;color:#cbd5e1;cursor:pointer;">✨ Require Enlightened prefix <span style="color:#64748b;">(items without it → Salvage)</span></label>
  </div>
</div>`;
```

Remove the original closing `</div></div>` that ends the edit block and replace with the above.

- [ ] **Step 2: Wire the checkbox to `filterEdit` state**

In the event-wiring section (around line 5095 after the Clean button handler), add:

```js
document.getElementById("aimSgFeEnlightened")?.addEventListener("change", (e) => {
  if (!state.filterEdit) return;
  state.filterEdit.requireEnlightened = e.target.checked;
});
```

- [ ] **Step 3: Smoke-test the checkbox**

Open filter edit for any filter. The checkbox "✨ Require Enlightened prefix" should appear at the bottom of the edit panel. Checking it and saving should persist `requireEnlightened: true` (verify via `JSON.parse(localStorage.getItem("aim_sgFilters"))`).

- [ ] **Step 4: Commit**

```bash
git add modules/aim-loot-helper.js
git commit -m "feat(aim-loot-helper): add Enlightened checkbox to filter edit panel"
```

---

### Task 6: Filter row ✨ indicator

**Files:**
- Modify: `modules/aim-loot-helper.js:3337-3344` (filter row HTML in `renderFilters`)

- [ ] **Step 1: Add ✨ indicator to filter name span**

At line 3339, replace:
```js
<span class="sg-filter-name">${esc(key)}</span>
```
With:
```js
<span class="sg-filter-name">${esc(key)}${fc.requireEnlightened ? ' <span title="Requires Enlightened prefix">✨</span>' : ""}</span>
```

- [ ] **Step 2: Smoke-test the indicator**

Enable `requireEnlightened` on one filter via the checkbox (Task 5). The filter list should show `FilterName ✨`. Hovering the ✨ shows the tooltip "Requires Enlightened prefix". Other filters are unaffected.

- [ ] **Step 3: End-to-end test**

1. Enable `requireEnlightened` on the active filter.
2. Open inventory with a mix of Enlightened and non-Enlightened gear.
3. Non-Enlightened items should show 💾 Salvage regardless of stats.
4. Enlightened items should score normally.
5. Disable the toggle and re-open inventory — all items score normally again.

- [ ] **Step 4: Commit**

```bash
git add modules/aim-loot-helper.js
git commit -m "feat(aim-loot-helper): show ✨ indicator on filter row when requireEnlightened is set"
```
