# Module Lifecycle & Memory Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fully stop and clean up disabled modules (destroy + storage clear), re-initialize them on re-enable, and display per-module storage usage with a Free Memory button in the scripts list.

**Architecture:** Wire `setModuleEnabled` to call `destroy()`/`reload()` and clear localStorage on toggle. Add `getModuleStorageBytes` and `freeModuleMemory` helpers to the loader. Add a `destroy()` to the four modules that are missing one.

**Tech Stack:** Vanilla JS, Tampermonkey userscript, localStorage, no build tools, no test runner — verification is done manually in browser DevTools.

---

## File Map

| File | Changes |
|------|---------|
| `loader.user.js` | Add `getModuleStorageBytes`, `freeModuleMemory`; update `renderModuleRow`, `renderMaster`, `setModuleEnabled` |
| `modules/ws-sniffer.js` | Add `destroy()` — detach socket:debug event listener |
| `modules/rune-planner.js` | Add `destroy()` — no-op (no timers or subscriptions) |
| `modules/dps-coach.js` | Add `destroy()` — clear interval, detach all event bus listeners |
| `modules/loot-helper.js` | Add `destroy()` — clear interval, disconnect 3 MutationObservers, remove 2 style elements |

---

### Task 1: Add storage helpers to loader.user.js

**Files:**
- Modify: `loader.user.js` — add after the `PanelStorage` block (around line 133)

- [ ] **Step 1: Add `getModuleStorageBytes(id)` after the `PanelStorage` object**

Find the closing `};` of the `PanelStorage` object (line ~133). Add immediately after it:

```js
function getModuleStorageBytes(id) {
  const gamePrefix   = `voididle.module.${id}.`;
  const sourcePrefix = `voididle.loader.module.${id}@`;
  let bytes = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (key.startsWith(gamePrefix) || key.startsWith(sourcePrefix)) {
      bytes += (localStorage.getItem(key)?.length ?? 0) * 2;
    }
  }
  return bytes;
}

function formatStorageBytes(bytes) {
  if (bytes === 0) return '0 KB';
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function freeModuleMemory(id) {
  // Clear game data
  const gamePrefix = `voididle.module.${id}.`;
  const sourcePrefix = `voididle.loader.module.${id}@`;
  const toDelete = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (key.startsWith(gamePrefix) || key.startsWith(sourcePrefix)) {
      toDelete.push(key);
    }
  }
  toDelete.forEach(k => localStorage.removeItem(k));
}
```

- [ ] **Step 2: Verify helpers exist in browser console**

Install the updated loader in Tampermonkey, open voididle.com, open DevTools console and run:
```js
getModuleStorageBytes('loot-helper')
formatStorageBytes(getModuleStorageBytes('loot-helper'))
```
Expected: a number and a string like `"124.3 KB"` (or `"0 KB"` if no cache).

- [ ] **Step 3: Commit**

```bash
git add loader.user.js
git commit -m "feat(loader): add getModuleStorageBytes and freeModuleMemory helpers"
```

---

### Task 2: Add memory badge and Free Memory button to module rows

**Files:**
- Modify: `loader.user.js` — `renderModuleRow` function (~line 1207)

- [ ] **Step 1: Update `renderModuleRow` to show memory badge and Free Memory button**

Replace the full `renderModuleRow` function with:

```js
function renderModuleRow(app, entry) {
  const state = getPanelState(app, entry.id);

  if (!state) {
    return "";
  }

  const disabledBadge = entry.enabled === false
    ? '<div class="vim-muted" style="font-size:10px;margin-top:2px;">Disabled in manifest</div>'
    : '';

  const kb = formatStorageBytes(getModuleStorageBytes(entry.id));

  return `
  <div class="vim-row">
    <div class="vim-row-main">
      <div class="vim-row-title">${escapeHtml(entry.icon || '')} ${escapeHtml(entry.name)}</div>
      <div class="vim-muted">${escapeHtml(entry.description || '')}</div>
      ${disabledBadge}
    </div>
    <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
      <span class="vim-muted" style="font-size:10px;white-space:nowrap;">${escapeHtml(kb)}</span>
      <button type="button" class="vim-btn" style="font-size:10px;padding:3px 7px;" data-free-memory="${escapeHtml(entry.id)}">Free</button>
      <label class="vim-switch-row">
        <input type="checkbox" data-module-toggle="${escapeHtml(entry.id)}" ${state.enabled ? "checked" : ""} />
        <span>Enabled</span>
      </label>
    </div>
  </div>
`;
}
```

- [ ] **Step 2: Wire the Free Memory button handler in `renderMaster`**

Inside `renderMaster`, after the existing `body.querySelectorAll("[data-module-toggle]").forEach(...)` block, add:

```js
body.querySelectorAll('[data-free-memory]').forEach((btn) => {
  btn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    freeModuleMemory(btn.dataset.freeMemory);
    this.renderMaster(app);
  });
});
```

- [ ] **Step 3: Verify in browser**

Open the Scripts panel (🧩 tray button). Each module row should now show a KB badge and a "Free" button. Clicking "Free" on a module should clear its cached JS and update the badge to "0 KB".

Check in DevTools → Application → Local Storage that `voididle.loader.module.{id}@*` keys disappear for that module after clicking Free.

- [ ] **Step 4: Commit**

```bash
git add loader.user.js
git commit -m "feat(loader): memory badge and Free Memory button in scripts list"
```

---

### Task 3: Wire setModuleEnabled — disable path

**Files:**
- Modify: `loader.user.js` — `WindowManager.setModuleEnabled` method (~line 1089)

- [ ] **Step 1: Replace `setModuleEnabled` with the full lifecycle-aware version**

Replace the existing `setModuleEnabled` method with:

```js
setModuleEnabled(app, id, enabled) {
  const state = getPanelState(app, id);
  if (!state) return;

  if (!enabled) {
    // Destroy the running module
    const record = ModuleRegistry.get(id);
    if (record?.module) {
      try { record.module.destroy?.(); } catch (err) {
        logger.warn(`destroy() threw for ${id}:`, err.message);
      }
    }
    app.modules.delete(id);
    ModuleRegistry.delete(id);

    // Clear all storage for this module
    freeModuleMemory(id);

    // Persist the disabled state
    ModuleLoader.saveUserSetting(id, false);

    state.enabled = false;
    state.open = false;
  } else {
    // Persist before attempting load so a reload failure doesn't desync state
    ModuleLoader.saveUserSetting(id, true);
    state.enabled = true;
    state.open = !!app.settings.openScriptsAutomatically;

    // Re-fetch and re-init the module in this session
    ModuleLoader.reload(app, id).then(result => {
      if (!result.ok) {
        logger.warn(`Failed to re-enable ${id}:`, result.error);
        state.enabled = false;
        ModuleLoader.saveUserSetting(id, false);
      }
      this.renderMaster(app);
      this.renderTray(app);
      PanelStorage.save(app.settings);
    });

    // Update UI immediately — reload is async
    this.applyPanel(app, id);
    this.renderMaster(app);
    this.renderTray(app);
    PanelStorage.save(app.settings);
    return;
  }

  this.applyPanel(app, id);
  this.renderMaster(app);
  this.renderTray(app);
  PanelStorage.save(app.settings);
},
```

- [ ] **Step 2: Verify disable in browser**

1. Enable loot-helper (confirm it's running — tray button appears).
2. Uncheck "Enabled" for loot-helper.
3. Open DevTools console — run `app.modules.has('loot-helper')` (should be `false`).
4. Check Local Storage — `voididle.loader.module.loot-helper@*` keys should be gone.
5. Tray button for loot-helper should disappear.

- [ ] **Step 3: Verify re-enable in browser**

1. Check "Enabled" for loot-helper.
2. Console: `app.modules.has('loot-helper')` — should be `true` after a second.
3. Check Local Storage — `voididle.loader.module.loot-helper@*` key should reappear (re-fetched).
4. Tray button for loot-helper should reappear.

- [ ] **Step 4: Commit**

```bash
git add loader.user.js
git commit -m "feat(loader): wire destroy/reload into setModuleEnabled lifecycle"
```

---

### Task 4: Add destroy() to ws-sniffer

**Files:**
- Modify: `modules/ws-sniffer.js`

ws-sniffer subscribes to one event bus event (`socket:debug`) and has no timers. The fix is to capture the unsub function returned by `events.on()`.

- [ ] **Step 1: Add a closure-level variable to hold the unsub**

In `createWsSnifferModule`, after the `state` object declaration (around line 8), add:

```js
let _detachSocketDebug = null;
```

- [ ] **Step 2: Capture the unsub in init**

In the `init(app)` function, change:

```js
app.events.on("socket:debug", (entry) => {
  if (!app.ui.isPanelEnabled(definition.id)) return;
  addEntry(entry);
  queueRender(app);
});
```

to:

```js
_detachSocketDebug = app.events.on("socket:debug", (entry) => {
  if (!app.ui.isPanelEnabled(definition.id)) return;
  addEntry(entry);
  queueRender(app);
});
```

- [ ] **Step 3: Add destroy() to the returned object**

In the `return { ...definition, init(app) {...}, render() {...} };` block, add `destroy()` after `render()`:

```js
destroy() {
  _detachSocketDebug?.();
  _detachSocketDebug = null;
},
```

- [ ] **Step 4: Verify in browser**

1. Disable ws-sniffer via the Scripts panel toggle.
2. In DevTools console: `app.events` — confirm the `socket:debug` listener set is now empty (or the handler is gone) by checking the listeners map.
   Alternatively: `[...app.events._listeners?.get?.('socket:debug') || []].length` — should decrease by 1.
3. Re-enable ws-sniffer, confirm it works again (WS messages appear in the panel).

- [ ] **Step 5: Commit**

```bash
git add modules/ws-sniffer.js
git commit -m "feat(ws-sniffer): add destroy() to detach socket:debug listener"
```

---

### Task 5: Add destroy() to rune-planner

**Files:**
- Modify: `modules/rune-planner.js`

rune-planner has no timers, no event bus subscriptions, and no globally injected DOM. It uses `requestAnimationFrame` in `queueRender` (one-shot, self-cancels). A minimal destroy is sufficient.

- [ ] **Step 1: Add destroy() to the returned object**

In `createRunePlannerModule`, the returned object at the bottom (around line 601) currently has `init(app) {...}` and `render() {...}`. Add `destroy()` after `render()`:

```js
destroy() {
  // no timers or event subscriptions — nothing to tear down
},
```

- [ ] **Step 2: Verify in browser**

Disable rune-planner via the Scripts panel. No errors in DevTools console. Re-enable — it initialises correctly.

- [ ] **Step 3: Commit**

```bash
git add modules/rune-planner.js
git commit -m "feat(rune-planner): add destroy() stub"
```

---

### Task 6: Add destroy() to dps-coach

**Files:**
- Modify: `modules/dps-coach.js`

dps-coach subscribes to 12 event bus events and starts one `setInterval`. Both must be cleaned up.

- [ ] **Step 1: Add closure-level tracking variables**

In `createDpsCoachModule`, after the `state` object and `let appRef = null;` declarations (around line 95), add:

```js
const _unsubs = [];
let _tickInterval = null;
```

- [ ] **Step 2: Capture all event unsubs in init**

In `init(app)`, change every `app.events.on(...)` call from:
```js
app.events.on("fullState", (msg) => { ... });
```
to:
```js
_unsubs.push(app.events.on("fullState", (msg) => { ... }));
```

Apply this to all 12 subscriptions:
`fullState`, `partyTick`, `auraRegen`, `auraXpGain`, `relay:ready`, `relay:status`, `relay:peers`, `relay:hello`, `relay:teamSnapshot`, `relay:abilityDamage`, `relay:abilityHealing`, `relay:abilityCast`.

- [ ] **Step 3: Capture the setInterval**

In `init(app)`, change:

```js
setInterval(() => {
    if (
        state.inCombat &&
        state.lastCombatAt &&
        now() - state.lastCombatAt > config.fightTimeoutMs
    ) {
        state.inCombat = false;
    }

    syncCurrentZoneFromDom();
    touchCurrentZone();
    pruneRollingEvents();
    sendTeamSnapshot();
    queueRender(app);
}, 1000);
```

to:

```js
_tickInterval = setInterval(() => {
    if (
        state.inCombat &&
        state.lastCombatAt &&
        now() - state.lastCombatAt > config.fightTimeoutMs
    ) {
        state.inCombat = false;
    }

    syncCurrentZoneFromDom();
    touchCurrentZone();
    pruneRollingEvents();
    sendTeamSnapshot();
    queueRender(app);
}, 1000);
```

- [ ] **Step 4: Add destroy() to the returned object**

In the `return { ...definition, init(app) {...}, render() {...} };` block (around line 4169), add `destroy()` after `render()`:

```js
destroy() {
  _unsubs.forEach(fn => fn());
  _unsubs.length = 0;
  clearInterval(_tickInterval);
  _tickInterval = null;
  appRef = null;
},
```

- [ ] **Step 5: Verify in browser**

1. Confirm dps-coach is running (DPS panel active).
2. Disable dps-coach via Scripts panel.
3. In DevTools console: `_tickInterval` is not accessible from outside the closure, but you can confirm the interval has stopped by watching that the 1-second render loop has stopped (no repeated `[VoidIdle:dps-coach]` log lines).
4. Re-enable — confirm DPS tracking resumes.

- [ ] **Step 6: Commit**

```bash
git add modules/dps-coach.js
git commit -m "feat(dps-coach): add destroy() — clear interval and detach event listeners"
```

---

### Task 7: Add destroy() to loot-helper

**Files:**
- Modify: `modules/loot-helper.js`

loot-helper calls `boot()` in init, which: injects 2 `<style>` elements, starts 3 persistent MutationObservers, and starts a `setInterval(tick, 1000)`. All four need cleanup.

- [ ] **Step 1: Add closure-level tracking variables**

In `createLootHelperModule`, near the top after the constants (before `RARITY_COLOR` or similar), add:

```js
let _tickInterval   = null;
let _tooltipObs     = null;
let _inspectObs     = null;
let _charViewObs    = null;
let _cssStyleEl     = null;
let _hlStyleEl      = null;
```

- [ ] **Step 2: Track style elements in installUI**

Find `function installUI()` (around line 1709). Change the two style element creations to use the tracking variables. Replace:

```js
const style = document.createElement("style");
style.textContent = CSS;
document.documentElement.appendChild(style);

const hlStyle = document.createElement("style");
hlStyle.textContent = `
```

With:

```js
_cssStyleEl = document.createElement("style");
_cssStyleEl.textContent = CSS;
document.documentElement.appendChild(_cssStyleEl);

_hlStyleEl = document.createElement("style");
_hlStyleEl.textContent = `
```

And change `document.documentElement.appendChild(hlStyle);` to `document.documentElement.appendChild(_hlStyleEl);`.

- [ ] **Step 3: Track the tooltip observer**

Find `function setupTooltipObserver()` (around line 866). Change:

```js
function setupTooltipObserver() {
  new MutationObserver(muts => {
```

to:

```js
function setupTooltipObserver() {
  _tooltipObs = new MutationObserver(muts => {
```

And change the `.observe(...)` call at the end of that function to use `_tooltipObs.observe(...)`.

- [ ] **Step 4: Track the inspect observer**

Find `function setupInspectObserver()` (around line 3510). Change:

```js
function setupInspectObserver() {
  new MutationObserver(muts => {
```

to:

```js
function setupInspectObserver() {
  _inspectObs = new MutationObserver(muts => {
```

And change the `.observe(...)` call at the end to use `_inspectObs.observe(...)`.

- [ ] **Step 5: Track the charView observer**

Find `function setupCharViewObserver()` (around line 3823). Change:

```js
function setupCharViewObserver() {
  new MutationObserver((mutations) => {
```

to:

```js
function setupCharViewObserver() {
  _charViewObs = new MutationObserver((mutations) => {
```

And change the `.observe(...)` call to use `_charViewObs.observe(...)`.

- [ ] **Step 6: Track the tick interval in boot()**

Find `function boot()` (around line 3838). Change:

```js
function boot() { loadStats(); installUI(); setupTooltipObserver(); setupInspectObserver(); setupCharViewObserver(); tick(); setInterval(tick, 1000); }
```

to:

```js
function boot() { loadStats(); installUI(); setupTooltipObserver(); setupInspectObserver(); setupCharViewObserver(); tick(); _tickInterval = setInterval(tick, 1000); }
```

- [ ] **Step 7: Add destroy() to the returned object**

The returned object near the bottom of `createLootHelperModule` currently has `init(app)` and `render()` (around line 3839). Add `destroy()` after them:

```js
destroy() {
  clearInterval(_tickInterval);
  _tickInterval = null;
  _tooltipObs?.disconnect();
  _tooltipObs = null;
  _inspectObs?.disconnect();
  _inspectObs = null;
  _charViewObs?.disconnect();
  _charViewObs = null;
  _cssStyleEl?.remove();
  _cssStyleEl = null;
  _hlStyleEl?.remove();
  _hlStyleEl = null;
},
```

- [ ] **Step 8: Verify in browser**

1. Confirm loot-helper is running (inventory tooltips show badges, chat comparison works).
2. Disable loot-helper via Scripts panel.
3. In DevTools → Performance or Memory tab: confirm no recurring 1-second entry for loot-helper's tick.
4. In DevTools → Elements: confirm the two `<style>` elements injected by loot-helper are gone from `<html>`.
5. Re-enable — confirm tooltips and chat comparison work again.

- [ ] **Step 9: Commit**

```bash
git add modules/loot-helper.js
git commit -m "feat(loot-helper): add destroy() — clear interval, observers, and style elements"
```

---

## Known limitations

- Modules that store data under **custom localStorage keys** (e.g. `voididle.runePlanner.counts.v1`, `voididle.dpsCoach.relaySession.v1`, `voididle.wsSniffer.settings.v1`) are not cleared by `freeModuleMemory`, which only covers `voididle.module.{id}.*` and `voididle.loader.module.{id}@*`. These custom keys are small (< 10 KB total) and are intentionally left out of this spec — they represent user preferences and game data the user likely wants to retain across sessions.

- The `window.fetch` hook installed by loot-helper at eval time cannot be undone in `destroy()`. This is acceptable — the hook is lightweight and only intercepts inspect API calls.
