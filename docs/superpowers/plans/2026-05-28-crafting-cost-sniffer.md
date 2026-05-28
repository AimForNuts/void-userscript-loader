# Crafting Cost Sniffer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a `crafting-cost-sniffer` Misc module with a floating panel that auto-clicks every recipe card under "Skilling Gear" in the crafting UI and captures material costs as copyable JSON.

**Architecture:** Single IIFE module file following the WS Sniffer floating-panel pattern — `app.ui.registerPanel` for the UI, a user-triggered async scan loop that clicks each `.cv-recipe-card` within the "Skilling Gear" `.cv-subcat`, waits 150ms per card for the DOM to update, then reads `.cv-detail` for material data. No WebSocket dependency — pure DOM scraping.

**Tech Stack:** Vanilla JS (ES2020), Tampermonkey userscript, browser DOM APIs

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `modules/crafting-cost-sniffer.js` | IIFE module — state, DOM helpers, scan engine, panel render/events |
| Modify | `manifest.json` | Add module entry with SRI integrity hash |
| Modify | `README.md` | Add entry to Misc section |
| Modify | `SCRIPTS.md` | Add section to Misc category |

---

## Context for Subagents

This repo is a Tampermonkey userscript loader. There is **no test runner** — verification is done by loading the script in Tampermonkey and checking in-browser. Each module is an IIFE that registers itself on `window.VoidIdleModules['<id>']`.

**Key UI API (from `app.ui`):**
- `app.ui.registerPanel({ id, title, icon, render, footer })` — registers a floating panel
- `app.ui.getPanel(id)` — returns the panel DOM element (has `.vim-body` and `.vim-footer` children)
- `app.ui.isPanelEnabled(id)` — true if the panel is open

**Game crafting DOM structure (relevant selectors):**
```html
<div class="cv-subcat">
  <button class="cv-subcat-header">
    <span class="cv-subcat-label">Skilling Gear</span>
  </button>
  <div class="cv-recipe-card [locked] [selected]">
    <div class="cv-recipe-card-name">Copper Pickaxe</div>
    <span class="cv-recipe-card-lock">Lv 5</span>
  </div>
  <!-- After clicking a card, this detail appears as a sibling within .cv-subcat: -->
  <div class="cv-detail cv-detail-inline">
    <div class="cv-detail-mats">
      <div class="cv-detail-mat">
        <span class="cv-detail-mat-name">Bamboo Plank</span>
        <span class="cv-detail-mat-qty">0 / 45</span>
      </div>
    </div>
  </div>
</div>
```

**Existing module to reference:** `modules/ws-sniffer.js` — same panel registration and render pattern used here.

---

## Task 1: Create the module file

**Files:**
- Create: `modules/crafting-cost-sniffer.js`

- [ ] **Step 1: Write the complete module file**

Create `modules/crafting-cost-sniffer.js` with the full content below:

```js
(function () {
  'use strict';

  function createCraftingCostSnifferModule(definition) {
    const state = {
      results: [],
      scanning: false,
      progress: { current: 0, total: 0 },
      error: null,
    };

    function escapeHtml(value) {
      return String(value ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
      }[c]));
    }

    function delay(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    function findSkillingGearSubcat() {
      for (const subcat of document.querySelectorAll('.cv-subcat')) {
        const label = subcat.querySelector('.cv-subcat-label');
        if (label && label.textContent.trim().toLowerCase() === 'skilling gear') {
          return subcat;
        }
      }
      return null;
    }

    function parseDetail(detail) {
      const materials = [];
      for (const mat of detail.querySelectorAll('.cv-detail-mat')) {
        const name = mat.querySelector('.cv-detail-mat-name')?.textContent.trim() || '';
        const qtyText = mat.querySelector('.cv-detail-mat-qty')?.textContent.trim() || '';
        const parts = qtyText.split(' / ');
        const have = parseInt(parts[0] || '0', 10);
        const required = parseInt(parts[1] || '0', 10);
        if (name) materials.push({ name, required, have });
      }
      return materials;
    }

    function renderStyles() {
      return `
        <style>
          .ccs-toolbar { display:flex; flex-wrap:wrap; gap:7px; align-items:center; margin-bottom:9px; }
          .ccs-status { color:rgba(229,231,235,0.55); font-size:11px; }
          .ccs-body { border:1px solid rgba(255,255,255,0.08); border-radius:10px; background:rgba(255,255,255,0.035); overflow:auto; max-height:520px; }
          .ccs-pre { margin:0; padding:10px; white-space:pre-wrap; word-break:break-word; font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:11px; line-height:1.35; color:rgba(229,231,235,0.82); }
          .ccs-placeholder { padding:14px; color:rgba(229,231,235,0.45); font-size:12px; }
          .ccs-error { padding:10px; color:#fbbf24; font-size:12px; }
        </style>
      `;
    }

    function render() {
      let bodyContent;
      if (state.error) {
        bodyContent = `<div class="ccs-error">⚠ ${escapeHtml(state.error)}</div>`;
      } else if (state.scanning) {
        bodyContent = `<div class="ccs-placeholder">Scanning ${state.progress.current} / ${state.progress.total}…</div>`;
      } else if (state.results.length > 0) {
        bodyContent = `<pre class="ccs-pre">${escapeHtml(JSON.stringify(state.results, null, 2))}</pre>`;
      } else {
        bodyContent = `<div class="ccs-placeholder">Open the crafting page, navigate to Skilling Gear, then click Scan.</div>`;
      }

      const statusText = state.scanning
        ? `Scanning ${state.progress.current} / ${state.progress.total}…`
        : state.results.length > 0
        ? `${state.results.length} items captured`
        : '';

      return `
        ${renderStyles()}
        <div class="ccs-toolbar">
          <button class="vim-btn" data-ccs-scan${state.scanning ? ' disabled' : ''}>Scan Skilling Gear</button>
          ${statusText ? `<span class="ccs-status">${escapeHtml(statusText)}</span>` : ''}
          ${state.results.length > 0 ? `<button class="vim-btn" data-ccs-copy>Copy JSON</button>` : ''}
        </div>
        <div class="ccs-body">${bodyContent}</div>
      `;
    }

    function attachEvents(app) {
      const panel = app.ui.getPanel(definition.id);
      if (!panel) return;
      const body = panel.querySelector('.vim-body');
      if (!body) return;

      body.querySelector('[data-ccs-scan]')?.addEventListener('click', () => {
        if (!state.scanning) runScan(app);
      });

      body.querySelector('[data-ccs-copy]')?.addEventListener('click', async () => {
        const text = JSON.stringify(state.results, null, 2);
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          console.log(text);
          alert('Could not copy automatically. JSON printed to console.');
        }
      });
    }

    function renderIntoPanel(app) {
      const panel = app.ui.getPanel(definition.id);
      if (!panel) return;
      const body = panel.querySelector('.vim-body');
      const footer = panel.querySelector('.vim-footer');
      if (!body || !footer) return;

      body.innerHTML = render();
      attachEvents(app);

      footer.textContent = state.scanning
        ? `Scanning ${state.progress.current} / ${state.progress.total}`
        : state.error
        ? '0 items | Error'
        : `${state.results.length} items | Idle`;
    }

    async function runScan(app) {
      state.scanning = true;
      state.results = [];
      state.error = null;
      state.progress = { current: 0, total: 0 };
      renderIntoPanel(app);

      const subcat = findSkillingGearSubcat();
      if (!subcat) {
        state.error = 'Skilling Gear subcategory not found. Open the crafting page first.';
        state.scanning = false;
        renderIntoPanel(app);
        return;
      }

      const cards = Array.from(subcat.querySelectorAll('.cv-recipe-card'));
      state.progress.total = cards.length;
      renderIntoPanel(app);

      for (const card of cards) {
        const name = card.querySelector('.cv-recipe-card-name')?.textContent.trim() || '';
        const lockText = card.querySelector('.cv-recipe-card-lock')?.textContent.trim() || '';
        const levelRequired = parseInt(lockText.replace(/lv\s*/i, ''), 10) || 0;

        card.click();
        await delay(150);

        const detail = subcat.querySelector('.cv-detail');
        const materials = detail ? parseDetail(detail) : [];

        state.results.push({ name, levelRequired, materials });
        state.progress.current++;
        renderIntoPanel(app);
      }

      state.scanning = false;
      renderIntoPanel(app);
    }

    return {
      ...definition,

      init(app) {
        app.ui.registerPanel({
          id:     definition.id,
          title:  definition.name,
          icon:   definition.icon || '🔬',
          render: () => render(),
          footer: '',
        });
      },

      destroy() {
        state.results = [];
        state.scanning = false;
        state.error = null;
        state.progress = { current: 0, total: 0 };
      },
    };
  }

  window.VoidIdleModules = window.VoidIdleModules || {};
  window.VoidIdleModules['crafting-cost-sniffer'] = createCraftingCostSnifferModule({
    id:          'crafting-cost-sniffer',
    name:        'Crafting Cost Sniffer',
    icon:        '🔬',
    version:     '2026-05-28.1',
    description: 'Scans Skilling Gear crafting recipes and captures material costs as JSON.',
  });
})();
```

- [ ] **Step 2: Verify the file exists and has no syntax errors**

Run:
```powershell
node --input-type=module < modules/crafting-cost-sniffer.js
```
Expected: exits cleanly (no output). If node is unavailable, open the file and confirm it ends with `})();` on the last line.

- [ ] **Step 3: Commit the module file**

```powershell
git add modules/crafting-cost-sniffer.js
git commit -m "feat(crafting-cost-sniffer): add module with scan engine and floating panel"
```

---

## Task 2: Register in manifest.json

**Files:**
- Modify: `manifest.json`

- [ ] **Step 1: Compute the SHA-256 integrity hash**

Run this PowerShell command from the repo root:
```powershell
$bytes = [System.IO.File]::ReadAllBytes("$PWD\modules\crafting-cost-sniffer.js")
$hash = [System.Security.Cryptography.SHA256]::Create().ComputeHash($bytes)
"sha256-" + [Convert]::ToBase64String($hash)
```
Copy the output string (it will look like `sha256-abc123...=`).

- [ ] **Step 2: Add the module entry to manifest.json**

Open `manifest.json`. Insert the following entry in the `"modules"` array after the `guild-helper` entry (which ends around line 57) and before the `rune-planner` entry:

```json
    {
      "id": "crafting-cost-sniffer",
      "name": "Crafting Cost Sniffer",
      "icon": "🔬",
      "description": "Scans Skilling Gear crafting recipes and captures material costs as JSON.",
      "url": "https://raw.githubusercontent.com/AimForNuts/void-userscript-loader/main/modules/crafting-cost-sniffer.js",
      "version": "2026-05-28.1",
      "integrity": "<PASTE_HASH_HERE>",
      "category": "misc",
      "enabled": true,
      "dependencies": ["core"]
    },
```

Replace `<PASTE_HASH_HERE>` with the hash string from Step 1.

- [ ] **Step 3: Verify manifest.json is valid JSON**

Run:
```powershell
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('valid')"
```
Expected output: `valid`

- [ ] **Step 4: Commit**

```powershell
git add manifest.json
git commit -m "feat(crafting-cost-sniffer): register in manifest"
```

---

## Task 3: Update README.md

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add the module entry to the Misc section**

Open `README.md`. In the `### Misc` section, add the following line after the `**🏛 Guild Helper**` entry:

```markdown
**🔬 Crafting Cost Sniffer** — Scans every recipe under Skilling Gear in the crafting UI, clicking through each card to capture material requirements, and displays the full cost breakdown as copyable JSON.
```

- [ ] **Step 2: Commit**

```powershell
git add README.md
git commit -m "docs(crafting-cost-sniffer): add entry to README"
```

---

## Task 4: Update SCRIPTS.md

**Files:**
- Modify: `SCRIPTS.md`

- [ ] **Step 1: Add the module section**

Open `SCRIPTS.md`. In the `## Misc` section, add the following after the `### 🏛 Guild Helper` block (after its closing `---`):

```markdown
### 🔬 Crafting Cost Sniffer
**ID:** `crafting-cost-sniffer` | **Category:** Misc | **File:** `modules/crafting-cost-sniffer.js`

Scans the game's crafting UI for Skilling Gear recipes by auto-clicking each `.cv-recipe-card` within the "Skilling Gear" `.cv-subcat`, waiting 150ms per card for the inline `.cv-detail` panel to update, then reading material names and quantities. Results are stored in module state as an array of `{ name, levelRequired, materials[] }` objects and rendered as pretty-printed JSON in a floating panel. A "Copy JSON" button writes the full array to the clipboard. Progress is shown live during the scan. The scan is user-triggered — the crafting page must be open and the Skilling Gear subcategory visible before clicking Scan.

---
```

- [ ] **Step 2: Commit**

```powershell
git add SCRIPTS.md
git commit -m "docs(crafting-cost-sniffer): add section to SCRIPTS.md"
```
