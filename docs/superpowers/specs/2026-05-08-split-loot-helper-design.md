# Design: Split Loot Helper into teCsor and Aim Variants

**Date:** 2026-05-08
**Status:** Approved

## Summary

Split the existing monolithic `loot-helper.js` into two independently-maintained modules:
- `tecSor-loot-helper.js` — the original, credited to teCsor
- `aim-loot-helper.js` — a clean fork owned by AimForNuts, starts identical and evolves independently

Also fixes a double-icon bug in the tray (the `⚡` emoji was embedded in the module `name` field and also rendered separately from the `icon` field).

## Files

| Action | Path |
|--------|------|
| Rename | `modules/loot-helper.js` → `modules/tecSor-loot-helper.js` |
| Create | `modules/aim-loot-helper.js` (copy of tecSor-loot-helper.js, Aim-branded) |
| Update | `manifest.json` |
| Update | `README.md` |
| Update | `SCRIPTS.md` |

## tecSor-loot-helper.js changes

- Function renamed: `createLootHelperModule` → `createTecSorLootHelperModule`
- Display name: `"teCsor Loot Helper"`
- Panel ID: `"tecsor-loot-helper"`
- Module registration key: `window.VoidIdleModules['tecsor-loot-helper']`
- Definition `id`: `'tecsor-loot-helper'`
- Definition `name`: `'teCsor Loot Helper'` (remove embedded `⚡` — fixes double icon)
- Footer: unchanged — *"Produced, maintained & improved by teCsor"*

## aim-loot-helper.js changes

Copy of tecSor-loot-helper.js after its renames, then:

- Function renamed: `createAimLootHelperModule`
- Display name: `"Aim Loot Helper"`
- Panel ID: `"aim-loot-helper"`
- Module registration key: `window.VoidIdleModules['aim-loot-helper']`
- Definition `id`: `'aim-loot-helper'`
- Definition `name`: `'Aim Loot Helper'`
- Footer: *"Produced & maintained by AimForNuts"*
- **localStorage key isolation**: all raw `localStorage` keys (e.g. `sgFilters`, `sgActiveFilter`, `sgTrackedProfiles`, `sgMailEndpoint`, etc.) get an `aim_` prefix so filter and profile state is isolated from the teCsor module
- Icon: `⚡` (same as teCsor)

## manifest.json

- Rename existing `loot-helper` entry: update `id` → `tecsor-loot-helper`, `name` → `"teCsor Loot Helper"`, `url` → `.../tecSor-loot-helper.js`
- Add new entry for `aim-loot-helper` directly below it in the `fighter` category:
  - `id`: `aim-loot-helper`
  - `name`: `Aim Loot Helper`
  - `icon`: `⚡`
  - `url`: `.../aim-loot-helper.js`
  - Same `category`, `dependencies`, `enabled` as teCsor variant

## README.md / SCRIPTS.md

- Update existing "Loot Helper" entry to "teCsor Loot Helper" in both files
- Add new "Aim Loot Helper" entry in the `fighter` category in both files, inserted after teCsor Loot Helper

## Double-icon fix

The bug: the loader renders `icon` + `name` in the tray button. The old `name` was `'⚡ Loot Helper'`, so the tray showed `⚡ ⚡ Loot Helper`. Fix is to strip the leading `⚡ ` from the `name` field in both modules.

## Storage key inventory

These raw `localStorage` keys in the Aim module must be prefixed with `aim_`:

| Original key | Aim key |
|---|---|
| `sgFilters` | `aim_sgFilters` |
| `sgActiveFilter` | `aim_sgActiveFilter` |
| `sgTrackedProfiles` | `aim_sgTrackedProfiles` |
| `sgTeamProfiles` | `aim_sgTeamProfiles` |
| `sgStats` (via `STATS_KEY`) | `aim_sgStats` |
| `sgSalvageLearnedEndpoint` (via `SALVAGE_STORAGE_KEY`) | `aim_sgSalvageLearnedEndpoint` |
| `sgSalvageLearnedTemplateV1` (via `SALVAGE_TEMPLATE_STORAGE_KEY`) | `aim_sgSalvageLearnedTemplateV1` |
| `sgMailSendLearnedEndpoint` (via `TEAM_SEND_STORAGE_KEY`) | `aim_sgMailSendLearnedEndpoint` |
| `sgMailSendLearnedItemTemplateV2` (via `TEAM_SEND_TEMPLATE_STORAGE_KEY`) | `aim_sgMailSendLearnedItemTemplateV2` |
| `voididle.sg.apiAuthHeaders.v1` (via `API_AUTH_HEADERS_KEY`) | `voididle.aim.apiAuthHeaders.v1` |

All `_moduleApp.storage` calls are automatically namespaced by the loader using the module ID, so those do not need manual changes.
