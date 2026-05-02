# Market Party Context — Design Spec

**Date:** 2026-05-02
**Module:** `loot-helper.js`
**Feature:** Party member context selector in the Market tab

## Summary

Add a dropdown to the Market tab that lets you switch the scoring context between yourself and any saved team profile. When a teammate is selected, market listings are re-scored using their equipped gear and assigned filter — identical to how the Team tab scores bag items today.

## State

Two new fields added to `state`:

| Field | Type | Description |
|---|---|---|
| `marketRawData` | `Array` | Raw market records before scoring: `{ item, listingId, price, sellerName, itemTier, isFutureTier }`. Populated by `readMarketListings()`. |
| `marketCtxPlayerId` | `string \| null` | Active context. `null` = Me (self). A `playerId` string = that team profile. |

## Data Flow

1. `readMarketListings()` extracts raw item data from the DOM into `state.marketRawData` (instead of scoring inline).
2. It then calls `rebuildMarketItems()`.
3. `rebuildMarketItems()` reads `state.marketCtxPlayerId`:
   - If `null`: scores using `state.equipped` + `state.activeFilterKey`
   - If a playerId: looks up the profile in `teamProfiles`, scores using `profile.equippedMap` + `profile.filterKey`
4. Scored results are written into `state.marketItems` — all downstream code (rendering, badges, sort) remains unchanged.

When the dropdown changes, only steps 3–4 run (no DOM re-read needed).

## UI

A context selector row is rendered at the top of the market tab header, above the existing listing count and hide-future-tier toggle.

- Rendered as a `<select>` element with id `sgMktCtx`.
- First option: **"Me"** (value `""`)
- One option per saved team profile: `{icon} {username}` (e.g. `⚔️ Player2`)
- Hidden entirely when no team profiles are saved.

On `change` event: update `state.marketCtxPlayerId`, call `rebuildMarketItems()`, re-render market tab.

The selected context is session-only (no localStorage persistence).

## Edge Cases

| Scenario | Behaviour |
|---|---|
| Selected profile deleted from Team tab | `rebuildMarketItems()` detects missing profile, resets `marketCtxPlayerId` to `null`, re-renders as "Me" |
| Profile has sparse/empty `equippedMap` | `_buildBagItem` handles missing slots gracefully — items still render, diffs just omitted |
| Market panel closes while teammate selected | `marketRawData` clears normally; dropdown context is preserved and applied when market reopens |
| No team profiles saved | Dropdown is hidden; behaviour identical to current |

## Files Changed

- `modules/loot-helper.js` — only file modified

## What Does Not Change

- `renderMarketItem()` — unchanged, already reads from `state.marketItems`
- `applyMarketBadges()` — unchanged, already reads from `state.marketItems`
- Team tab — unchanged
- Gear tab / bag scoring — unchanged
