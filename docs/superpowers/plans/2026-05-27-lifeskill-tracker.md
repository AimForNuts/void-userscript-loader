# Lifeskill Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a new `lifeskill-tracker` module that injects a time-to-next-level countdown and ETA into the game's skill header DOM, updated on every `gatherTick` WebSocket message.

**Architecture:** A single self-contained module file following the same IIFE + `VoidIdleModules` registration pattern as `guild-helper.js`. It listens to `socket:any` events, filters for `gatherTick`, derives time-remaining from XP rate, and injects/updates a `<span>` into the matching `.gv-skill-header` element. No panel, no storage.

**Tech Stack:** Vanilla JS, Tampermonkey userscript module system, game WebSocket events via `app.events`

---

## Files

| Action | Path | Responsibility |
|---|---|---|
| Create | `modules/lifeskill-tracker.js` | Module: WS listener, TTL calculation, DOM injection |
| Modify | `manifest.json` | Register new module in gather category |
| Modify | `README.md` | Add Lifeskill Tracker entry under Gather section |
| Modify | `SCRIPTS.md` | Add Lifeskill Tracker section under Gather category |

---

### Task 1: Create the module file with TTL formatting

**Files:**
- Create: `modules/lifeskill-tracker.js`

- [ ] **Step 1: Create the module skeleton**

Create `modules/lifeskill-tracker.js` with this content:

```js
(function () {
  'use strict';

  function createLifeskillTrackerModule(definition) {
    const state = {
      stopTimer: null,
    };

    // Format milliseconds as "001d 04h 25m 35s"
    function formatTTL(ms) {
      if (!Number.isFinite(ms) || ms <= 0) return '---';
      const totalSec = Math.floor(ms / 1000);
      const d = Math.floor(totalSec / 86400);
      const h = Math.floor((totalSec % 86400) / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;
      return [
        String(d).padStart(3, '0') + 'd',
        String(h).padStart(2, '0') + 'h',
        String(m).padStart(2, '0') + 'm',
        String(s).padStart(2, '0') + 's',
      ].join(' ');
    }

    // Format a future Date as local "at HH:MM AM/PM"
    function formatETA(ms) {
      if (!Number.isFinite(ms) || ms <= 0) return '';
      const eta = new Date(Date.now() + ms);
      return 'at ' + eta.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }

    return {
      ...definition,
      init(_app) {},
      destroy() {
        if (state.stopTimer) {
          clearTimeout(state.stopTimer);
          state.stopTimer = null;
        }
      },
    };
  }

  window.VoidIdleModules = window.VoidIdleModules || {};
  window.VoidIdleModules['lifeskill-tracker'] = createLifeskillTrackerModule({
    id:          'lifeskill-tracker',
    name:        'Lifeskill Tracker',
    icon:        '⛏',
    version:     '2026-05-27.1',
    description: 'Shows time to next level and ETA in the active skill header.',
  });
})();
```

- [ ] **Step 2: Manually verify `formatTTL` in browser console**

Open browser DevTools console and paste:

```js
function formatTTL(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '---';
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [
    String(d).padStart(3, '0') + 'd',
    String(h).padStart(2, '0') + 'h',
    String(m).padStart(2, '0') + 'm',
    String(s).padStart(2, '0') + 's',
  ].join(' ');
}
console.assert(formatTTL(0) === '---', 'zero');
console.assert(formatTTL(-1) === '---', 'negative');
console.assert(formatTTL(5435000) === '000d 01h 30m 35s', '1.5 hrs');
console.assert(formatTTL(90061000) === '001d 01h 01m 01s', '1d1h1m1s');
console.log('formatTTL OK');
```

Expected: `formatTTL OK` with no assertion errors.

- [ ] **Step 3: Commit**

```bash
git add modules/lifeskill-tracker.js
git commit -m "feat(lifeskill-tracker): scaffold module with TTL formatter"
```

---

### Task 2: Add DOM injection logic

**Files:**
- Modify: `modules/lifeskill-tracker.js`

- [ ] **Step 1: Add `findSkillHeader` and `getOrCreateSpan` helpers**

Inside `createLifeskillTrackerModule`, after the `formatETA` function and before the `return` block, add:

```js
    // Find the .gv-skill-header whose .gv-skill-name matches the skill name (case-insensitive)
    function findSkillHeader(skillName) {
      const headers = document.querySelectorAll('.gv-skill-header');
      for (const header of headers) {
        const nameEl = header.querySelector('.gv-skill-name');
        if (nameEl && nameEl.textContent.trim().toLowerCase() === skillName.toLowerCase()) {
          return header;
        }
      }
      return null;
    }

    // Get (or create and insert) the TTL span inside a header
    function getOrCreateSpan(header) {
      let span = header.querySelector('.gv-ttl-inline');
      if (!span) {
        const xphrEl = header.querySelector('.gv-xphr-inline');
        span = document.createElement('span');
        span.className = 'gv-ttl-inline';
        span.style.cssText = 'font-size:inherit;color:#aaa;margin-left:8px;';
        if (xphrEl) {
          xphrEl.insertAdjacentElement('afterend', span);
        } else {
          header.appendChild(span);
        }
      }
      return span;
    }

    // Remove TTL span from a header if present
    function removeSpan(header) {
      const span = header && header.querySelector('.gv-ttl-inline');
      if (span) span.remove();
    }
```

- [ ] **Step 2: Verify injection in browser console**

With the game open on a gathering page, paste in DevTools:

```js
// Simulate what the module will do
const headers = document.querySelectorAll('.gv-skill-header');
console.log('Headers found:', headers.length);
headers.forEach(h => {
  const name = h.querySelector('.gv-skill-name');
  const xphr = h.querySelector('.gv-xphr-inline');
  console.log('Header:', name?.textContent, '| xphr el:', !!xphr);
});
```

Expected: logs showing at least one header with a skill name and `xphr el: true`.

- [ ] **Step 3: Commit**

```bash
git add modules/lifeskill-tracker.js
git commit -m "feat(lifeskill-tracker): add DOM injection helpers"
```

---

### Task 3: Wire up gatherTick listener and stop detection

**Files:**
- Modify: `modules/lifeskill-tracker.js`

- [ ] **Step 1: Replace the `init` stub with the full implementation**

Replace:
```js
      init(_app) {},
```

With:
```js
      init(app) {
        app.events.on('socket:any', (msg) => {
          if (msg.type !== 'gatherTick') return;

          const { skill, skillXp, skillXpToNext, xpGain, tickMs } = msg;

          // Skip ticks with no XP gain (avoids division by zero)
          if (!xpGain || !tickMs) return;

          const xpPerMs = xpGain / tickMs;
          const xpRemaining = skillXpToNext - skillXp;
          const msRemaining = xpRemaining / xpPerMs;

          const header = findSkillHeader(skill);
          if (header) {
            const span = getOrCreateSpan(header);
            span.textContent = `→ ${formatTTL(msRemaining)}  ${formatETA(msRemaining)}`;
          }

          // Reset stop-detection timer: remove span if no tick arrives within 2.5× tickMs
          if (state.stopTimer) clearTimeout(state.stopTimer);
          state.stopTimer = setTimeout(() => {
            const h = findSkillHeader(skill);
            removeSpan(h);
            state.stopTimer = null;
          }, tickMs * 2.5);
        });
      },
```

- [ ] **Step 2: Verify in the game**

Load the userscript with this module enabled. Start gathering any skill. Open DevTools and confirm:
- The `.gv-skill-header` for the active skill gains a `.gv-ttl-inline` span
- The span text looks like `→ 000d 02h 14m 08s  at 10:45 PM`
- The span updates every ~5 seconds with each tick
- After stopping gathering, the span disappears within ~12.5 seconds (2.5 × 5000ms)

- [ ] **Step 3: Commit**

```bash
git add modules/lifeskill-tracker.js
git commit -m "feat(lifeskill-tracker): wire gatherTick listener and stop detection"
```

---

### Task 4: Register in manifest.json

**Files:**
- Modify: `manifest.json`

- [ ] **Step 1: Add the module entry**

In `manifest.json`, add the following entry after the `party-planner-debug` entry (keeping gather category modules together). The full `modules` array entry to insert:

```json
    {
      "id": "lifeskill-tracker",
      "name": "Lifeskill Tracker",
      "icon": "⛏",
      "description": "Shows time to next level and ETA in the active skill header, updated each gather tick.",
      "url": "https://raw.githubusercontent.com/AimForNuts/void-userscript-loader/main/modules/lifeskill-tracker.js",
      "version": "2026-05-27.1",
      "integrity": "sha256-PLACEHOLDER",
      "category": "gather",
      "enabled": true,
      "dependencies": ["core"]
    }
```

> **Note on integrity:** After committing the module file, compute the real SHA-256 integrity hash with:
> ```bash
> cat modules/lifeskill-tracker.js | openssl dgst -sha256 -binary | base64
> ```
> Replace `sha256-PLACEHOLDER` with `sha256-<result>`.

- [ ] **Step 2: Compute and set the real integrity hash**

```bash
cat modules/lifeskill-tracker.js | openssl dgst -sha256 -binary | base64
```

Copy the output and update `manifest.json` replacing `sha256-PLACEHOLDER` with `sha256-<output>`.

- [ ] **Step 3: Commit**

```bash
git add manifest.json
git commit -m "feat(lifeskill-tracker): register in manifest"
```

---

### Task 5: Update README.md and SCRIPTS.md

**Files:**
- Modify: `README.md`
- Modify: `SCRIPTS.md`

- [ ] **Step 1: Add entry to README.md Gather section**

In `README.md`, find the `### Gather` section. After the existing Party Planner Debug entry, add:

```markdown
**⛏ Lifeskill Tracker** — Shows a live time-to-next-level countdown and clock ETA directly in the active skill's XP header. Updates every gather tick; disappears automatically when gathering stops.
```

- [ ] **Step 2: Add section to SCRIPTS.md**

In `SCRIPTS.md`, find the `## Gather` section. After the `party-planner-debug` section, add:

```markdown
### ⛏ Lifeskill Tracker
**ID:** `lifeskill-tracker` | **Category:** Gather | **File:** `modules/lifeskill-tracker.js`

Injects a time-to-next-level countdown and ETA clock directly into the game's skill header element, immediately after the XP/hr badge. Reads `gatherTick` WebSocket messages to derive XP rate and remaining XP, then formats the result as `001d 04h 25m 35s  at 11:45 PM`. The element updates on every tick (typically every 5 seconds) and is automatically removed when gathering stops. No panel, no settings, no persistence.
```

- [ ] **Step 3: Commit**

```bash
git add README.md SCRIPTS.md
git commit -m "docs: add lifeskill-tracker to README and SCRIPTS"
```

---

## Self-Review

**Spec coverage:**
- ✅ New module `lifeskill-tracker` in gather category — Tasks 1–3, 4
- ✅ Listens to `socket:any`, filters `gatherTick` — Task 3
- ✅ Derives TTL from `xpGain`, `tickMs`, `skillXp`, `skillXpToNext` — Task 3
- ✅ `xpGain === 0` guard (skip update) — Task 3 (`if (!xpGain || !tickMs) return`)
- ✅ Finds header by `skill` name match — Task 2
- ✅ Injects span after `.gv-xphr-inline` — Task 2
- ✅ Format `001d 04h 25m 35s  at HH:MM PM` — Task 1
- ✅ Stop detection via `setTimeout(tickMs × 2.5)` — Task 3
- ✅ Header not in DOM = silent no-op — Task 3 (`if (header)` guard)
- ✅ Level-up self-corrects on next tick — naturally handled (no special case needed)
- ✅ manifest.json registration — Task 4
- ✅ README + SCRIPTS docs — Task 5

**Placeholder scan:** No TBD/TODO/placeholder text except the integrity hash, which has explicit instructions on how to compute it.

**Type consistency:** `findSkillHeader`, `getOrCreateSpan`, `removeSpan`, `formatTTL`, `formatETA` are defined in Task 1–2 and referenced in Task 3 — names match exactly.
