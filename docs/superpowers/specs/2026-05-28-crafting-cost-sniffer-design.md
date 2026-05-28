# Crafting Cost Sniffer — Design Spec

**Date:** 2026-05-28
**Module ID:** `crafting-cost-sniffer`
**Category:** misc
**Icon:** 🔬
**File:** `modules/crafting-cost-sniffer.js`

---

## Overview

A Misc module with a floating panel that scans the game's crafting UI, clicking through every recipe card under the "Skilling Gear" subcategory, and capturing each item's name, level requirement, and material costs. Results are displayed as pretty-printed JSON and can be copied to clipboard.

---

## Architecture

Follows the WS Sniffer floating-panel pattern:
- Registers a panel via `app.ui.registerPanel`
- No WebSocket dependency — pure DOM scraping triggered by a user button
- No `init`-time side effects beyond panel registration

### State

```js
const state = {
  results: [],              // array of captured recipe objects
  scanning: false,          // true while scan is running
  progress: { current: 0, total: 0 },
  error: null,              // string error message or null
};
```

---

## Data Model

Each captured recipe is an object:

```json
{
  "name": "Copper Pickaxe",
  "levelRequired": 5,
  "materials": [
    { "name": "Bamboo Plank", "required": 45, "have": 0 },
    { "name": "Copper Ingot",  "required": 75, "have": 0 }
  ]
}
```

- `name` — from `.cv-recipe-card-name` on the clicked card
- `levelRequired` — integer parsed from `.cv-recipe-card-lock` text (strip `"Lv "`)
- `materials[].name` — from `.cv-detail-mat-name`
- `materials[].required` — right side of `"0 / 45"` in `.cv-detail-mat-qty`
- `materials[].have` — left side of `"0 / 45"` in `.cv-detail-mat-qty`

The full output is a JSON array of all recipe objects.

---

## UI Layout

Panel registered with `app.ui.registerPanel({ id, title, icon, render, footer })`.

### Toolbar
- **"Scan Skilling Gear"** button — disabled while `scanning === true`
- Status text inline: `"Scanning 12 / 48…"` during scan, `"48 items captured"` after, empty before first scan

### Body
- Before first scan: placeholder text — `"Open the crafting page, navigate to Skilling Gear, then click Scan."`
- During scan: progress message `"Scanning X / Y…"`
- Error state: error message in amber
- After scan: `<pre>` block with pretty-printed JSON array (monospace, same style as WS Sniffer's `.wss-pre`)

### Toolbar (right side)
- **"Copy JSON"** button — copies full JSON array to clipboard via `navigator.clipboard.writeText`. Falls back to `console.log` + `alert` if clipboard API fails.

### Footer
- `"N items | Idle"` or `"N items | Scanning X/Y"` or `"0 items | Error"`

---

## Scan Flow

1. User opens the game's crafting page and navigates to a view containing the "Skilling Gear" subcategory.
2. User clicks **"Scan Skilling Gear"** in the panel.
3. Module sets `scanning: true`, `results: []`, `error: null`, re-renders.
4. Finds `.cv-subcat` whose `.cv-subcat-label` text content equals `"Skilling Gear"` (case-insensitive trim).
5. If not found: sets `error = "Skilling Gear subcategory not found. Open the crafting page first."`, sets `scanning: false`, re-renders, returns.
6. Collects all `.cv-recipe-card` elements within that subcat. Sets `progress.total`.
7. For each card (sequential `async/await` loop):
   a. Clicks the card element.
   b. Awaits a 150ms timeout (`await delay(150)`).
   c. Reads the `.cv-detail` element that immediately follows the card in the DOM (`.cv-detail` sibling or the subcat's own inline detail).
   d. Parses name, levelRequired, and materials array.
   e. Pushes the recipe object to `results`.
   f. Increments `progress.current`, re-renders panel.
8. Sets `scanning: false`, re-renders with final JSON.

### DOM Reading Details

- **Card name:** `card.querySelector('.cv-recipe-card-name').textContent.trim()`
- **Level:** `parseInt(card.querySelector('.cv-recipe-card-lock')?.textContent.replace('Lv ', '') || '0', 10)`
- **Detail element:** find the next `.cv-detail` sibling after the clicked card within the subcat container
- **Materials:** `detail.querySelectorAll('.cv-detail-mat')` → for each:
  - name: `.cv-detail-mat-name.textContent.trim()`
  - qty string: `.cv-detail-mat-qty.textContent.trim()` → split on `" / "` → `[have, required]`

---

## Error Handling

- Subcat not found → error state in panel, no crash
- Card has no detail after 150ms → record `materials: []` and continue (don't abort scan)
- Clipboard write fails → fallback to `console.log` + `alert`

---

## Module Registration

- Entry in `manifest.json` under `misc` category
- SHA-256 integrity hash computed after implementation
- Entry in `README.md` Modules section
- Entry in `SCRIPTS.md` developer catalog
