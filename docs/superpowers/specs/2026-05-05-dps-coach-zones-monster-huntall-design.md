# DPS Coach — Zones Tab: Monster & Hunt All

**Date:** 2026-05-05
**Status:** Approved

## Background

The game updated its zone system. Zones now have a depth (tier) per zone, and each monster within a zone has its own Hunt All toggle. The old Zones tab tracked only Zone + Tier and had no concept of which monster was being hunted or whether Hunt All was active. Stats for different monsters in the same zone would be merged into a single row, making comparisons impossible.

The game sends a `POST /api/party/set-zone` request whenever the player changes their zone configuration:

```json
{
  "huntAll": true,
  "monsterId": "rogue-soldier",
  "tier": 3,
  "updated": true,
  "zoneId": "iron-gate-pass"
}
```

## Goal

Update the Zones tab so each row represents a unique combination of **zone + tier + monster + hunt-all mode**, and the table shows the columns:

**Time — Zone — Monster — Hunt All — XP/hr — Gold/hr — Shards/hr — Kills/hr — Deaths — Accuracy**

## Data Capture

### Fetch intercept (authoritative)

At `init()`, monkey-patch `window.fetch` to watch for outbound `POST /api/party/set-zone` calls. When detected, parse the request body and call `handleSetZone({ zoneId, monsterId, tier, huntAll })`, which updates:

- `state.zoneId` — slug e.g. `"iron-gate-pass"`
- `state.currentMonsterName` — display name derived from `monsterId` slug (e.g. `"rogue-soldier"` → `"Rogue Soldier"`)
- `state.tier` — depth number e.g. `3`
- `state.huntAll` — boolean

### No fallback / no degraded rows

Zone tracking does **not** start until `set-zone` has fired and all fields are known. If the page loads mid-session and the player never changes their zone config, that session produces no zone rows. This is intentional — it avoids rows with incomplete data that would pollute the history.

New state fields added:
- `currentMonsterName: ""`
- `huntAll: false`
- `setZoneReady: false` — becomes `true` after first `set-zone` intercept

## Zone Key & Record Structure

### Key format

```
iron-gate-pass|T3|rogue-soldier|hunt-all
iron-gate-pass|T3|rogue-soldier|single
```

Built from: `zoneId slug | T{tier} | monsterId slug | hunt-all or single`

`getCurrentZoneKey()` returns `null` if `setZoneReady` is false, preventing any zone record from being created or touched before data is complete.

### Record fields (display)

| Field | Example | Notes |
|-------|---------|-------|
| `zoneName` | `"Iron Gate Pass T3"` | Formatted from zoneId slug + tier |
| `monsterName` | `"Rogue Soldier"` | Formatted from monsterId slug |
| `huntAll` | `true` | Boolean from set-zone payload |

Plus existing stat fields: `xp`, `gold`, `shards`, `kills`, `deaths`, `hits`, `attempts`, `activeMs`, `sessions`, `firstSeenAt`, `lastSeenAt`, `base`, `visitStart`, `visitStartedAt`.

### Storage version

Bump to **v5** (`voididle.dpsCoach.zoneStats.v5.session`). Old v4 data is silently dropped — the key format is incompatible.

## Display

### Zones table columns

| # | Column | Notes |
|---|--------|-------|
| 1 | Time | Tracked active time in this config |
| 2 | Zone | `"Iron Gate Pass T3"` — zone name + tier |
| 3 | Monster | `"Rogue Soldier"` |
| 4 | Hunt All | `Yes` / `No` |
| 5 | XP/hr | Blue |
| 6 | Gold/hr | Yellow |
| 7 | Shards/hr | Purple |
| 8 | Kills/hr | Default |
| 9 | Deaths | Red if > 0 |
| 10 | Accuracy | Green ≥ 90%, yellow ≥ 75%, red otherwise |

- **"Last seen"** column is removed.
- **"▶"** current-row marker is kept.
- Copy Zones and Clear Zones buttons are kept.
- Copy format updated to include Monster and Hunt All fields.

## Functions to Change

| Function | Change |
|----------|--------|
| `getZoneKeyFor(zoneName, tier)` | Add `monsterId`, `huntAll` params; return `null`-safe key |
| `getCurrentZoneKey()` | Return `null` if `!state.setZoneReady` |
| `createEmptyZoneRecord(...)` | Add `monsterName`, `huntAll` params and fields |
| `sanitizeZoneRecord(raw, fallbackKey)` | Restore `monsterName`, `huntAll` from stored record |
| `formatZoneNameForDisplay(record)` | Unchanged (still returns zone + tier) |
| `renderZonesTab()` | New column headers and row cells |
| `copyZoneStats()` | Include Monster and Hunt All in text output |
| `touchCurrentZone()` | Guard: return early if `getCurrentZoneKey()` is null |

## New Functions

| Function | Purpose |
|----------|---------|
| `handleSetZone(body)` | Updates state from set-zone payload |
| `installSetZoneInterceptor()` | Wraps `window.fetch`; called in `init()` |
| `formatSlugToDisplay(slug)` | `"rogue-soldier"` → `"Rogue Soldier"` |
