# Enlightened Prefix Requirement per Filter

**Date:** 2026-05-11  
**Module:** `modules/aim-loot-helper.js`  
**Status:** Approved

## Summary

Add a per-filter toggle — "Require Enlightened prefix" — to the aim-loot-helper filter system. When enabled on a filter, items that do not carry the `enlightened` prefix are penalized as a missing must-have, driving them to Salvage. Items that do carry the prefix are unaffected.

## Background

The game API returns item prefixes as a separate array on each item:

```js
prefixes: [
  { quality: 100, type: "dropMult", value: 1 },
  { quality: 100, type: "enlightened", value: 2 },
]
```

Prefixes are currently invisible to the scoring system, which only examines `item.stats`. This change adds Enlightened-only support; other prefix types are out of scope.

## Design

### 1. Filter Config (`mkFC`)

Add `requireEnlightened: false` as a new field on every filter config object.

- **Signature:** `mkFC(stats, enabled, multiBonus, preferredStats, optional, avoid, requireEnlightened = false)`
- **Serialisation (`saveFilters`):** write `requireEnlightened` alongside existing fields.
- **Deserialisation (`loadFilters`):** read `requireEnlightened ?? false` — existing saved filters default to `false` with no migration needed.
- **`DEFAULT_FILTERS`:** all five defaults get `requireEnlightened: false` (no behaviour change).

### 2. Scoring (`calcFilterScore`)

Add a `hasEnlightened` boolean as the last parameter (default `false`).

After the must-have stats loop, insert:

```js
if (fc.requireEnlightened && !hasEnlightened) {
  mustHaveCoverageScore += cfg.mustHaveMissingPenalty; // -100
  mustHaveMissingCount++;
  reasons.push({ stat: "enlightened", tier: "mustHave", type: "missing", contribution: cfg.mustHaveMissingPenalty });
}
```

This integrates with the existing `mustHaveMissingCount` path, so `recommendation()` and `applyQualityCap()` automatically push the item to Salvage — no further changes needed downstream.

### 3. Call Sites

Every call to `calcFilterScore` must derive and pass `hasEnlightened`:

```js
const hasEnlightened = (item.prefixes ?? []).some(p => p.type === "enlightened");
```

Affected call sites:
- `_buildBagItem` (bag scoring)
- Chat tooltip scoring path
- Market item scoring path

### 4. Filter Edit UI (`renderFilters`)

Inside the `isEditing` block, after the multi-roll bonus grid, add a checkbox row:

```
☑ Require Enlightened prefix  (items without it score as Salvage)
```

- Checkbox bound to `fe.requireEnlightened`.
- Saved via the existing filter-save flow (no new event handlers needed beyond toggling the field).

### 5. Filter Row Indicator

When `fc.requireEnlightened` is `true`, append a `✨` indicator next to the filter name in the filter list row. This makes the requirement visible at a glance without opening the edit panel.

## Scope

- Enlightened prefix only — no other prefix types.
- No quality/value weighting of the Enlightened roll; presence/absence is binary.
- No changes to README, SCRIPTS.md, or manifest (no new module).

## Files Changed

- `modules/aim-loot-helper.js` only
