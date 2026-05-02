# Scripts Page & Loader UI Fix — Design Spec
*Date: 2026-05-02*

## Overview

Three related deliverables:
1. Fix the VoidIdle Loader in-game Scripts panel to show all manifest modules and auto-refresh
2. Add a `## Modules` section to README.md with 2–3 line descriptions per module
3. Create SCRIPTS.md as a developer catalog
4. Update the `void-repo-rules` skill to enforce keeping both docs current

---

## 1. Loader UI Fix

### Problem

The Scripts panel (rendered by `renderMaster` in `loader.user.js`) has three bugs:

- **Missing modules**: `renderMaster` iterates `app.modules.values()` — only modules that successfully loaded and were added to the map. Modules that failed, are manifest-disabled, or haven't finished loading yet are invisible.
- **Blank rows**: `renderModuleRow` reads `module.name`, `module.icon`, `module.description` from the JS module object. Most modules don't expose these properties; the manifest entry has them. Results in rows with no name or description.
- **Open/close refresh bug**: After modules finish loading, only `renderTray` is called. `renderMaster` is only triggered by user interaction (opening/closing the panel). The panel body is stale until the user manually opens it.

There is also a dead code issue: `ManagerUI._renderBody` was built to replace `renderMaster` but was never wired up — `renderMaster` (called from `renderAll`) overwrites the `#voididle-loader-manager-body` div that `ManagerUI` targets, so `ManagerUI._refresh` never runs.

### Fix

**`renderModuleRow(app, entry)`** — change signature to accept a manifest entry object instead of a module object. Source name/icon/description from `entry` (always populated). Show a small muted "Disabled" label at the bottom of the row only when `entry.enabled === false`. No layout shift when the user toggles the Enabled checkbox.

Remove the existing "Off/Open/In tray" status text. The Enabled checkbox already communicates this.

**`renderMaster(app)`** — replace `[...app.modules.values()]` with `ModuleLoader._loadCachedManifest()?.modules || []`. Iterate all manifest entries. This shows every module regardless of load status.

**`ManagerUI.init(app)`** — redirect all event handler callbacks from `this._refresh(app)` to `WindowManager.renderMaster(app)`. Events that trigger a refresh: `loader:manifest`, `loader:module:loaded`, `loader:module:failed`, `loader:module:skipped`, `loader:module:reloaded`, `loader:complete`, `loader:error`. This fixes the open/close refresh bug — the panel updates automatically as modules load.

**No category grouping** in `renderMaster` — keep the flat list as-is.

**No changes** to enable/disable logic, panel state, "Run Scripts" button, or tray rendering.

### "Disabled" label spec

Appears as a third line inside `.vim-row-main`, below the description, styled with `.vim-muted` and `font-size: 10px`. Text: `Disabled in manifest`. Only shown when `entry.enabled === false`. Not shown when the user's Enabled checkbox is unchecked.

---

## 2. README.md — Modules Section

Add a `## Modules` section after the existing Install section. Group modules by category using `### Category` subheadings (Misc, Fighter, Gather). Each entry:

```
**Icon Name** — 2–3 line description.
```

Descriptions drawn from manifest `description` fields, expanded slightly where needed for clarity. The section is kept in sync manually whenever a module is added or updated (enforced by void-repo-rules skill rule).

---

## 3. SCRIPTS.md

New file at repo root. Developer-facing catalog. Structure:

```
# Scripts

One section per module:

## Icon Name
**ID:** `manifest-id`  **Category:** Misc / Fighter / Gather  **File:** `modules/filename.js`

Short paragraph (3–5 sentences) describing what the module does, its key features, and any notable dependencies or caveats.
```

Grouped by category. Ordered to match manifest order within each category.

---

## 4. void-repo-rules Skill Update

Add the following rule to `SKILL.md`:

> **When adding a new module:**
> - Add a manifest entry to `manifest.json`
> - Add an entry to the `## Modules` section of `README.md` (icon + name + 2–3 line description, in the correct category group)
> - Add a section to `SCRIPTS.md` (ID, category, file, description paragraph)
>
> **When updating an existing module** (description, version, category change):
> - Update the existing entry in README.md and SCRIPTS.md — do not add a duplicate

---

## Files Changed

| File | Change |
|------|--------|
| `loader.user.js` | Fix `renderModuleRow`, `renderMaster`, `ManagerUI.init` |
| `README.md` | Add `## Modules` section |
| `SCRIPTS.md` | Create new file |
| `.claude/skills/void-repo-rules/SKILL.md` | Add new module maintenance rule |
