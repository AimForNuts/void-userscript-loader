# Guild Helper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a `guild-helper` module that intercepts the game's `/api/guild` fetch and injects a badge into the guild page showing vault gold vs next-level cost with a ready-to-level indicator.

**Architecture:** Wraps `window.fetch` once at init to clone and parse any `/api/guild` response, storing it in module state and emitting `guild-helper:data`. A `MutationObserver` on `document.body` watches for a guild container to appear; once both the container and cached data are present, the badge is injected as the first child. Badge is removed when the container leaves the DOM.

**Tech Stack:** Vanilla JS, Tampermonkey module pattern (see `MODULE_API.md`), no dependencies beyond `core`.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `modules/guild-helper.js` | **Create** | Full module: fetch hook, observer, badge render |
| `manifest.json` | **Modify** | Add guild-helper entry after boss-tracker |
| `README.md` | **Modify** | Add 🏛 Guild Helper row in Misc section |
| `SCRIPTS.md` | **Modify** | Add full Guild Helper entry in Misc section |

---

## Task 1: Create the module file

**Files:**
- Create: `modules/guild-helper.js`

- [ ] **Step 1: Write the module skeleton**

Create `modules/guild-helper.js` with this exact content:

```js
(function () {
  'use strict';

  function createGuildHelperModule(definition) {
    const state = {
      guildData: null,
      badge: null,
      observer: null,
      unsub: null,
    };

    const GUILD_SELECTORS = [
      '.guild-panel',
      '.guild-view',
      '.guild-page',
      '[class*="guild-wrap"]',
    ];

    function findGuildContainer() {
      for (const sel of GUILD_SELECTORS) {
        const el = document.querySelector(sel);
        if (el) return el;
      }
      return null;
    }

    function formatGold(n) {
      return Number(n || 0).toLocaleString() + 'g';
    }

    function renderBadgeHtml() {
      const guild = state.guildData?.guild || state.guildData || {};
      const vaultGold = guild.vaultGold || 0;
      const cost = guild.levelClaimCost || 0;
      const canClaim = guild.canClaimLevel === true;
      const goldOk = vaultGold >= cost;
      const deficit = cost - vaultGold;

      const goldStatus = goldOk
        ? `<span style="color:#4ade80">✓</span>`
        : `<span style="color:#fbbf24">(need ${formatGold(deficit)} more)</span>`;

      const readyRow = canClaim
        ? `<div style="color:#4ade80;margin-top:6px;font-weight:700">✅ Ready to level!</div>`
        : '';

      return `<div class="gh-badge" style="
        background:rgba(8,10,15,0.88);
        border:1px solid rgba(148,163,184,0.35);
        border-radius:10px;
        padding:10px 14px;
        font-family:Arial,sans-serif;
        font-size:12px;
        color:#e5e7eb;
        margin-bottom:10px;
        display:inline-block;
        min-width:200px;
      ">
        <div style="font-weight:800;margin-bottom:6px">🏛 Guild Helper</div>
        <div>Next level cost: <strong>${formatGold(cost)}</strong></div>
        <div>Vault gold: <strong>${formatGold(vaultGold)}</strong> ${goldStatus}</div>
        ${readyRow}
      </div>`;
    }

    function injectBadge(container) {
      const wrap = document.createElement('div');
      wrap.innerHTML = renderBadgeHtml();
      const badge = wrap.firstElementChild;
      container.prepend(badge);
      state.badge = badge;
    }

    function updateBadge() {
      if (!state.badge || !state.badge.isConnected) {
        state.badge = null;
        return;
      }
      const wrap = document.createElement('div');
      wrap.innerHTML = renderBadgeHtml();
      const next = wrap.firstElementChild;
      state.badge.replaceWith(next);
      state.badge = next;
    }

    function tryInject() {
      // Clear stale badge reference if it left the DOM
      if (state.badge && !state.badge.isConnected) {
        state.badge = null;
      }
      if (state.badge) return;
      if (!state.guildData) return;

      const container = findGuildContainer();
      if (!container) return;

      injectBadge(container);
    }

    function startObserver() {
      if (state.observer) return;
      state.observer = new MutationObserver(() => tryInject());
      state.observer.observe(document.body, { childList: true, subtree: true });
    }

    function stopObserver() {
      if (state.observer) {
        state.observer.disconnect();
        state.observer = null;
      }
    }

    function removeBadge() {
      if (state.badge) {
        state.badge.remove();
        state.badge = null;
      }
    }

    function installFetchHook(app) {
      if (window.__voidGuildHelperFetchHooked) return;
      window.__voidGuildHelperFetchHooked = true;

      const _orig = window.fetch;
      window.fetch = async function (...args) {
        const url = typeof args[0] === 'string'
          ? args[0]
          : (args[0]?.url || '');
        const res = await _orig.apply(this, args);
        if (/\/api\/guild($|\?)/i.test(url)) {
          res.clone().json().then(data => {
            app.events.emit('guild-helper:data', data);
          }).catch(() => {});
        }
        return res;
      };
    }

    return {
      ...definition,

      init(app) {
        installFetchHook(app);
        startObserver();

        state.unsub = app.events.on('guild-helper:data', (data) => {
          state.guildData = data;
          if (state.badge && state.badge.isConnected) {
            updateBadge();
          } else {
            state.badge = null;
            tryInject();
          }
        });

        // In case the game already fetched guild data before this module
        // loaded (rare but possible on reload), try injecting immediately.
        tryInject();
      },

      destroy() {
        stopObserver();
        removeBadge();
        if (state.unsub) {
          state.unsub();
          state.unsub = null;
        }
      },
    };
  }

  window.VoidIdleModules = window.VoidIdleModules || {};
  window.VoidIdleModules['guild-helper'] = createGuildHelperModule({
    id:          'guild-helper',
    name:        'Guild Helper',
    icon:        '🏛',
    version:     '2026-05-08.1',
    description: 'Shows vault gold vs next level cost when visiting the guild page.',
  });
})();
```

- [ ] **Step 2: Verify the file exists**

```
ls modules/guild-helper.js
```

Expected: file listed with a non-zero size.

- [ ] **Step 3: Commit**

```bash
git add modules/guild-helper.js
git commit -m "feat(guild-helper): add module with fetch hook and badge injection"
```

---

## Task 2: Register the module in manifest.json

**Files:**
- Modify: `manifest.json`

- [ ] **Step 1: Add the guild-helper entry after boss-tracker**

In `manifest.json`, find the `boss-tracker` entry (the third object in the `"modules"` array). Insert the following object immediately after the closing `}` of the boss-tracker entry, before the `rune-planner` entry:

```json
    {
      "id":          "guild-helper",
      "name":        "Guild Helper",
      "icon":        "🏛",
      "description": "Shows vault gold vs next level cost when visiting the guild page.",
      "url":         "https://raw.githubusercontent.com/AimForNuts/void-userscript-loader/main/modules/guild-helper.js",
      "version":     "2026-05-08.1",
      "category":    "misc",
      "enabled":     true,
      "dependencies": ["core"]
    },
```

- [ ] **Step 2: Verify the JSON is valid**

```bash
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('OK')"
```

Expected output: `OK`

- [ ] **Step 3: Commit**

```bash
git add manifest.json
git commit -m "feat(guild-helper): register module in manifest"
```

---

## Task 3: Update README.md

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add the Guild Helper entry to the Misc section**

In `README.md`, find the Misc section. After the `**👑 Boss Tracker**` line, add:

```markdown
**🏛 Guild Helper** — Intercepts the guild API response and injects a badge showing vault gold vs next level cost, with a ready-to-level indicator when both XP and gold thresholds are met.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs(guild-helper): add README entry"
```

---

## Task 4: Update SCRIPTS.md

**Files:**
- Modify: `SCRIPTS.md`

- [ ] **Step 1: Add the Guild Helper section after Boss Tracker in the Misc section**

In `SCRIPTS.md`, find the `### 👑 Boss Tracker` section. After its closing `---` separator, insert:

```markdown
### 🏛 Guild Helper
**ID:** `guild-helper` | **Category:** Misc | **File:** `modules/guild-helper.js`

Intercepts the game's own `/api/guild` HTTP response (no extra network request) and caches the parsed guild data in module state. When the guild page container appears in the DOM, a small badge is prepended showing the vault gold balance vs the gold cost to claim the next level, plus a "Ready to level!" indicator when `canClaimLevel` is true. The badge is removed when the guild container leaves the DOM. Data stays cached until the next `/api/guild` response is intercepted.

---
```

- [ ] **Step 2: Commit**

```bash
git add SCRIPTS.md
git commit -m "docs(guild-helper): add SCRIPTS.md entry"
```

---

## Manual Verification

After all tasks are committed:

- [ ] Navigate to `https://www.voididle.com/guild` while Tampermonkey is active with the loader installed.
- [ ] Open DevTools → Network → filter by `guild`. Confirm the game makes exactly one `GET /api/guild` request (no duplicate from our module).
- [ ] Confirm the 🏛 Guild Helper badge appears near the top of the guild page content area, showing "Next level cost", "Vault gold", and a ✓ or deficit notice.
- [ ] If your guild's `canClaimLevel` is `true`, confirm "✅ Ready to level!" is shown.
- [ ] Navigate away from the guild page. Confirm the badge is no longer in the DOM.
- [ ] Return to the guild page. Confirm the badge reappears after the game re-fetches guild data.
- [ ] Open the loader manager panel → Misc tab. Confirm "Guild Helper" appears with a toggle. Toggle it off and confirm the badge does not appear.
