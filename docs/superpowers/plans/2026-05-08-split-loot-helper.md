# Split Loot Helper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the existing `loot-helper.js` to `tecSor-loot-helper.js`, rebrand its internals, copy it to `aim-loot-helper.js` with Aim branding and isolated localStorage keys, update manifest + docs, and fix the double-icon bug in the tray.

**Architecture:** Two fully self-contained JS module files — no shared code. The teCsor file is the renamed original with minimal changes; the Aim file starts as an exact copy then diverges in identifiers, storage keys, and footer. Both register themselves in `window.VoidIdleModules` with their own IDs.

**Tech Stack:** Vanilla JS userscript modules, Tampermonkey, `manifest.json` for loader registration.

---

## File Map

| Action | Path |
|--------|------|
| Rename (git mv) | `modules/loot-helper.js` → `modules/tecSor-loot-helper.js` |
| Create (copy) | `modules/aim-loot-helper.js` |
| Modify | `manifest.json` |
| Modify | `README.md` |
| Modify | `SCRIPTS.md` |

---

### Task 1: Rename file and rebrand as teCsor Loot Helper

**Files:**
- Rename: `modules/loot-helper.js` → `modules/tecSor-loot-helper.js`

- [ ] **Step 1: Git-rename the file to preserve history**

```bash
git mv modules/loot-helper.js modules/tecSor-loot-helper.js
```

- [ ] **Step 2: Update the factory function name**

In `modules/tecSor-loot-helper.js`, line 4:

Old:
```js
  function createLootHelperModule(definition) {
```
New:
```js
  function createTecSorLootHelperModule(definition) {
```

- [ ] **Step 3: Update the panel registration ID and getPanel call**

Find (around line 2091–2100):
```js
      _moduleApp.ui.registerPanel({
        id:     "loot-helper",
```
Change `"loot-helper"` → `"tecsor-loot-helper"`.

Then on the next `getPanel` call:
```js
      panelEl = _moduleApp.ui.getPanel("loot-helper");
```
Change `"loot-helper"` → `"tecsor-loot-helper"`.

- [ ] **Step 4: Update the standalone panel title (used when no loader is present)**

Find (around line 2108):
```js
          <span class="sg-title">⚡ Loot Helper <span
```
Change to:
```js
          <span class="sg-title">teCsor Loot Helper <span
```

- [ ] **Step 5: Update the module definition at the bottom of the file**

Find (around line 4710–4714):
```js
  window.VoidIdleModules['loot-helper'] = createLootHelperModule({
    id:          'loot-helper',
    name:        '⚡ Loot Helper',
```
Replace with:
```js
  window.VoidIdleModules['tecsor-loot-helper'] = createTecSorLootHelperModule({
    id:          'tecsor-loot-helper',
    name:        'teCsor Loot Helper',
```
(The `⚡` removal from `name` is the double-icon fix — the loader renders `icon` + `name`, so having `⚡` in both caused two icons in the tray.)

- [ ] **Step 6: Commit**

```bash
git add modules/tecSor-loot-helper.js
git commit -m "feat: rename loot-helper to tecSor-loot-helper, fix double tray icon"
```

---

### Task 2: Create aim-loot-helper.js

**Files:**
- Create: `modules/aim-loot-helper.js`

- [ ] **Step 1: Copy the renamed file as the starting point**

```bash
cp modules/tecSor-loot-helper.js modules/aim-loot-helper.js
```

- [ ] **Step 2: Update the factory function name**

In `modules/aim-loot-helper.js`, line 4:

Old:
```js
  function createTecSorLootHelperModule(definition) {
```
New:
```js
  function createAimLootHelperModule(definition) {
```

- [ ] **Step 3: Update the panel registration ID and getPanel call**

Find (same area as Task 1 Step 3):
```js
        id:     "tecsor-loot-helper",
```
Change to `"aim-loot-helper"`.

```js
      panelEl = _moduleApp.ui.getPanel("tecsor-loot-helper");
```
Change to `_moduleApp.ui.getPanel("aim-loot-helper")`.

- [ ] **Step 4: Update the standalone panel title**

Find:
```js
          <span class="sg-title">teCsor Loot Helper <span
```
Change to:
```js
          <span class="sg-title">Aim Loot Helper <span
```

- [ ] **Step 5: Update the footer text**

Find:
```js
        footer: "Produced, maintained & improved by teCsor",
```
Change to:
```js
        footer: "Produced & maintained by AimForNuts",
```

Also the standalone-mode footer (further down, inside the `else` block):
```js
        <div class="sg-footer">Produced, maintained &amp; improved by <span class="sg-footer-name">teCsor</span></div>
```
Change to:
```js
        <div class="sg-footer">Produced &amp; maintained by <span class="sg-footer-name">AimForNuts</span></div>
```

- [ ] **Step 6: Update the module definition at the bottom**

Find:
```js
  window.VoidIdleModules['tecsor-loot-helper'] = createTecSorLootHelperModule({
    id:          'tecsor-loot-helper',
    name:        'teCsor Loot Helper',
```
Replace with:
```js
  window.VoidIdleModules['aim-loot-helper'] = createAimLootHelperModule({
    id:          'aim-loot-helper',
    name:        'Aim Loot Helper',
```

- [ ] **Step 7: Isolate localStorage constant keys**

These constant definitions need new values so Aim's stored data doesn't bleed into teCsor's. Find each line and update:

```js
// Line ~290
const STATS_KEY = "sgStats";
// → change to:
const STATS_KEY = "aim_sgStats";

// Line ~321
const TRACKED_KEY = "sgTrackedProfiles";
// → change to:
const TRACKED_KEY = "aim_sgTrackedProfiles";

// Line ~447
const API_AUTH_HEADERS_KEY = "voididle.sg.apiAuthHeaders.v1";
// → change to:
const API_AUTH_HEADERS_KEY = "voididle.aim.apiAuthHeaders.v1";

// Line ~3072
const SALVAGE_STORAGE_KEY          = "sgSalvageLearnedEndpoint";
// → change to:
const SALVAGE_STORAGE_KEY          = "aim_sgSalvageLearnedEndpoint";

// Line ~3073
const SALVAGE_TEMPLATE_STORAGE_KEY = "sgSalvageLearnedTemplateV1";
// → change to:
const SALVAGE_TEMPLATE_STORAGE_KEY = "aim_sgSalvageLearnedTemplateV1";

// Line ~3261
const TEAM_SEND_STORAGE_KEY          = "sgMailSendLearnedEndpoint";
// → change to:
const TEAM_SEND_STORAGE_KEY          = "aim_sgMailSendLearnedEndpoint";

// Line ~3262
const TEAM_SEND_TEMPLATE_STORAGE_KEY = "sgMailSendLearnedItemTemplateV2";
// → change to:
const TEAM_SEND_TEMPLATE_STORAGE_KEY = "aim_sgMailSendLearnedItemTemplateV2";
```

- [ ] **Step 8: Isolate inline localStorage string literals**

These keys are used as raw string literals (not via a constant). Find and replace each:

```js
// Line ~255 — filter load
localStorage.getItem("sgFilters"
// → "aim_sgFilters"

// Line ~283 — filter save
localStorage.setItem("sgFilters",
// → "aim_sgFilters"

// Line ~332 — legacy profile migration read
localStorage.getItem("sgTrackedProfiles"
// → "aim_sgTrackedProfiles"

// Line ~336 — legacy profile migration remove
localStorage.removeItem("sgTrackedProfiles"
// → "aim_sgTrackedProfiles"

// Line ~342 — profile load fallback
localStorage.getItem("sgTrackedProfiles"
// → "aim_sgTrackedProfiles"

// Line ~346 — old team profiles migration
localStorage.getItem("sgTeamProfiles"
// → "aim_sgTeamProfiles"

// Line ~679 — active filter load
localStorage.getItem("sgActiveFilter"
// → "aim_sgActiveFilter"

// Lines ~4311, ~4346, ~4359 — active filter saves (3 occurrences)
localStorage.setItem("sgActiveFilter",
// → "aim_sgActiveFilter"  (replace all 3)
```

- [ ] **Step 9: Commit**

```bash
git add modules/aim-loot-helper.js
git commit -m "feat: add aim-loot-helper.js as independent fork of tecSor variant"
```

---

### Task 3: Update manifest.json

**Files:**
- Modify: `manifest.json`

- [ ] **Step 1: Update the existing loot-helper entry**

In `manifest.json`, find the `loot-helper` object (around line 98–108) and update three fields:

Old:
```json
    {
      "id": "loot-helper",
      "name": "Loot Helper",
      "icon": "⚡",
      "description": "Stats, DPS, EHP, gear comparison, roll quality, and multi-filter scoring.",
      "url": "https://raw.githubusercontent.com/AimForNuts/void-userscript-loader/main/modules/loot-helper.js",
      "version": "8.45.4",
      "category": "fighter",
      "enabled": true,
      "dependencies": ["core"]
    },
```
New:
```json
    {
      "id": "tecsor-loot-helper",
      "name": "teCsor Loot Helper",
      "icon": "⚡",
      "description": "Stats, DPS, EHP, gear comparison, roll quality, and multi-filter scoring.",
      "url": "https://raw.githubusercontent.com/AimForNuts/void-userscript-loader/main/modules/tecSor-loot-helper.js",
      "version": "8.45.4",
      "category": "fighter",
      "enabled": true,
      "dependencies": ["core"]
    },
```

- [ ] **Step 2: Add aim-loot-helper entry directly after teCsor's entry**

Insert after the closing `},` of the teCsor entry:
```json
    {
      "id": "aim-loot-helper",
      "name": "Aim Loot Helper",
      "icon": "⚡",
      "description": "Stats, DPS, EHP, gear comparison, roll quality, and multi-filter scoring.",
      "url": "https://raw.githubusercontent.com/AimForNuts/void-userscript-loader/main/modules/aim-loot-helper.js",
      "version": "8.45.4",
      "category": "fighter",
      "enabled": true,
      "dependencies": ["core"]
    },
```

- [ ] **Step 3: Commit**

```bash
git add manifest.json
git commit -m "feat: register tecsor-loot-helper and aim-loot-helper in manifest"
```

---

### Task 4: Update README.md and SCRIPTS.md

**Files:**
- Modify: `README.md`
- Modify: `SCRIPTS.md`

- [ ] **Step 1: Update the Loot Helper entry in README.md**

Find (in the Fighter section):
```markdown
**⚡ Loot Helper** — Stats, DPS, EHP, gear comparison, roll quality, and multi-filter scoring in one place. A comprehensive loot evaluation suite for quickly triaging drops.
```
Replace with:
```markdown
**⚡ teCsor Loot Helper** — Stats, DPS, EHP, gear comparison, roll quality, and multi-filter scoring in one place. The original loot evaluation suite by teCsor.

**⚡ Aim Loot Helper** — Independent fork of teCsor Loot Helper maintained by AimForNuts. Starts identical and evolves separately.
```

- [ ] **Step 2: Update the Loot Helper section in SCRIPTS.md**

Find:
```markdown
### ⚡ Loot Helper
**ID:** `loot-helper` | **Category:** Fighter | **File:** `modules/loot-helper.js`

Comprehensive loot evaluation suite. Computes stats, DPS, EHP, and roll quality for items, supports gear comparison, and applies multi-filter scoring to surface the best drops. The largest module in the repo by line count (2600+ lines). If you're modifying it, read through the scoring engine at the top of the file before touching anything else.
```
Replace with:
```markdown
### ⚡ teCsor Loot Helper
**ID:** `tecsor-loot-helper` | **Category:** Fighter | **File:** `modules/tecSor-loot-helper.js`

Comprehensive loot evaluation suite by teCsor. Computes stats, DPS, EHP, and roll quality for items, supports gear comparison, and applies multi-filter scoring to surface the best drops. The largest module in the repo by line count (4700+ lines). If you're modifying it, read through the scoring engine at the top of the file before touching anything else.

---

### ⚡ Aim Loot Helper
**ID:** `aim-loot-helper` | **Category:** Fighter | **File:** `modules/aim-loot-helper.js`

Independent fork of teCsor Loot Helper, maintained by AimForNuts. Starts with identical logic and evolves separately. Uses isolated localStorage keys (all prefixed `aim_`) so filter and profile state is independent from the teCsor variant.
```

- [ ] **Step 3: Commit**

```bash
git add README.md SCRIPTS.md
git commit -m "docs: update README and SCRIPTS for teCsor/Aim loot helper split"
```
