# Module Lifecycle & Memory Management — Design Spec

**Date:** 2026-05-04  
**Status:** Approved

## Problem

Disabling a module in the scripts list only hides it from the tray — it never calls `destroy()` on the live module. Timers, MutationObservers, and event listeners keep running, causing browser RAM to grow unboundedly. Additionally, ~10 MB of localStorage accumulates from module JS source caches and game data with no way to clear it.

## Goals

1. Disabling a module fully stops its background work and clears all its stored data.
2. Re-enabling a module in the same session works without a page reload.
3. The scripts list shows per-module storage usage.
4. A "Free Memory" button lets users manually clear any module's data at any time.
5. Every module has a `destroy()` that cleans up its resources.

## Architecture

### Lifecycle — Disable path

`WindowManager.setModuleEnabled(app, id, false)` gains the following steps before updating UI state:

1. Look up the live module: `ModuleRegistry.get(id)?.module`
2. Call `mod.destroy?.()` — stops timers, observers, event listeners
3. `app.modules.delete(id)`
4. `ModuleRegistry.delete(id)`
5. `createModuleStorage(id).clear()` — removes all `voididle.module.{id}.*` localStorage keys
6. Remove all source cache entries: scan `localStorage` for keys matching `voididle.loader.module.{id}@*` and delete them
7. `ModuleLoader.saveUserSetting(id, false)` — persists the disabled state across reloads
8. Update panel state: `enabled: false, open: false`
9. Re-render master panel and tray

### Lifecycle — Enable path

`WindowManager.setModuleEnabled(app, id, true)` becomes:

1. `ModuleLoader.saveUserSetting(id, true)` — persists before attempting load
2. Update panel state: `enabled: true`
3. `ModuleLoader.reload(app, id)` — re-fetches JS from GitHub CDN, re-evals, re-inits, registers in `ModuleRegistry` and `app.modules`
4. Re-render master panel and tray

`ModuleLoader.reload` already handles the full fetch → eval → init → register cycle, including fallback to cache if the network is unavailable.

### Storage size helper

A new helper function `getModuleStorageBytes(id)` is added to the loader:

```js
function getModuleStorageBytes(id) {
  const gamePrefix   = `voididle.module.${id}.`;
  const sourcePrefix = `voididle.loader.module.${id}@`;
  let bytes = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith(gamePrefix) || key.startsWith(sourcePrefix)) {
      bytes += (localStorage.getItem(key)?.length ?? 0) * 2; // UTF-16
    }
  }
  return bytes;
}
```

### Free Memory action

A standalone function `freeModuleMemory(id)`:

1. `createModuleStorage(id).clear()` — wipes game data
2. Remove all `voididle.loader.module.{id}@*` source cache keys
3. Does NOT call `destroy()` or affect the running module — data only
4. Triggers a re-render of the master panel so the badge updates

## UI — Scripts List (`renderMaster`)

Each module row gains:

- **Memory badge**: `getModuleStorageBytes(id)` formatted as "X KB" rounded to one decimal (shows "0 KB" when empty). Computed fresh on every `renderMaster` call.
- **Free Memory button**: calls `freeModuleMemory(id)`. Always visible regardless of enabled state.

Row layout (approximate):
```
[✓] Enabled   ⚡ Loot Helper        128 KB  [Free Memory]
              Stats, DPS, EHP, gear comparison…
```

The badge automatically reflects 0 KB after a disable (since disable clears storage) without any extra wiring.

## Module `destroy()` audit

### Already have `destroy()`
- `boss-tracker` — disconnects MutationObserver, clears scan timer
- `item-share` — stops observer, clears scan timer, detaches boss-tracker events
- `party-planner` — removes injected CSS element
- `party-planner-debug` — removes injected CSS element
- `presence-tracker` — clears heartbeat and refresh intervals

### Need `destroy()` added
Each will be audited by reading the module source, then a `destroy()` added that covers:

| Module | Expected cleanup |
|--------|-----------------|
| `ws-sniffer` | Detach event bus listeners, remove DOM panel |
| `rune-planner` | Remove injected DOM/style elements |
| `dps-coach` | Clear intervals, detach event bus listeners |
| `loot-helper` | Clear intervals/timers, remove injected DOM/style |

(`stat-grabber` is present in `modules/` but is not in `manifest.json` and is never loaded — excluded.)

The exact cleanup for each will be confirmed by reading the module before implementing.

## Out of scope

- Clearing data for modules that are already loaded at page boot before the user has a chance to disable them — the user can use "Free Memory" for this.
- Changing the number of rollback source cache slots kept by `_pruneOldCache` (currently 1 kept; this spec doesn't change that, since the bigger win is clearing disabled modules entirely).
- Adding memory display to the ManagerUI panel (the `⚙️` panel) — the scripts list (`renderMaster`) is sufficient.
