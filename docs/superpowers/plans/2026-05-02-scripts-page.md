# Scripts Page & Loader UI Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the VoidIdle Loader Scripts panel to show all manifest modules and auto-refresh, then add module documentation to README.md, SCRIPTS.md, and the void-repo-rules skill.

**Architecture:** Four sequential, independent tasks. The loader fix touches only `loader.user.js` — two function rewrites and one event-wiring change. The doc tasks create/update flat markdown files. No new dependencies, no new abstractions.

**Tech Stack:** Vanilla JS (userscript), Markdown, Tampermonkey

---

## File Map

| File | Change |
|------|--------|
| `loader.user.js` | Rewrite `renderModuleRow` (line 1207), rewrite one line in `renderMaster` (line 999), rewrite `ManagerUI.init` (line 1609) |
| `README.md` | Add `## Modules` section after the Install section |
| `SCRIPTS.md` | Create new file at repo root |
| `.claude/skills/void-repo-rules/SKILL.md` | Append new rule block |

---

## Task 1: Fix `renderModuleRow` — read from manifest entry, remove status text

**Files:**
- Modify: `loader.user.js:1207-1229`

The current function reads `module.name`, `module.icon`, `module.description` from the JS module object (the value stored in `app.modules`). Most modules don't expose these properties, causing blank rows. It also renders an "Off/Open/In tray" status line that looks like a button but isn't.

Replace the entire function with a version that:
- Accepts a manifest `entry` object (has guaranteed `id`, `name`, `icon`, `description`, `enabled` fields)
- Removes the status line
- Adds a "Disabled in manifest" label only when `entry.enabled === false`

- [ ] **Open `loader.user.js` and locate `renderModuleRow` at line 1207**

The current function signature is `renderModuleRow(app, module)` and it ends at line 1229.

- [ ] **Replace the entire `renderModuleRow` function with:**

```js
  function renderModuleRow(app, entry) {
    const state = getPanelState(app, entry.id);

    if (!state) {
      return "";
    }

    const disabledBadge = entry.enabled === false
      ? '<div class="vim-muted" style="font-size:10px;margin-top:2px;">Disabled in manifest</div>'
      : '';

    return `
    <div class="vim-row">
      <div class="vim-row-main">
        <div class="vim-row-title">${escapeHtml(entry.icon || '')} ${escapeHtml(entry.name)}</div>
        <div class="vim-muted">${escapeHtml(entry.description || '')}</div>
        ${disabledBadge}
      </div>
      <label class="vim-switch-row">
        <input type="checkbox" data-module-toggle="${escapeHtml(entry.id)}" ${state.enabled ? "checked" : ""} />
        <span>Enabled</span>
      </label>
    </div>
  `;
  }
```

- [ ] **Commit**

```bash
git add loader.user.js
git commit -m "fix: renderModuleRow reads from manifest entry, removes status text"
```

---

## Task 2: Fix `renderMaster` — iterate manifest entries instead of `app.modules`

**Files:**
- Modify: `loader.user.js:999`

`renderMaster` currently does `[...app.modules.values()].map((module) => renderModuleRow(app, module))`. Since `app.modules` only contains successfully-loaded modules, any module that failed, is manifest-disabled, or hasn't finished loading yet is invisible.

Change it to read all entries from the cached manifest instead.

- [ ] **In `loader.user.js`, find line 999 inside `renderMaster`:**

```js
        ${[...app.modules.values()].map((module) => renderModuleRow(app, module)).join("")}
```

- [ ] **Replace that single line with:**

```js
        ${(ModuleLoader._loadCachedManifest()?.modules || []).map((entry) => renderModuleRow(app, entry)).join("")}
```

The rest of `renderMaster` (the `footer.textContent`, event listener wiring for the checkbox, module toggles, and Run Scripts button) stays exactly as-is.

- [ ] **Commit**

```bash
git add loader.user.js
git commit -m "fix: renderMaster iterates manifest entries, shows all modules"
```

---

## Task 3: Fix `ManagerUI.init` — wire events to `renderMaster` for auto-refresh

**Files:**
- Modify: `loader.user.js:1609-1617`

`ManagerUI.init` subscribes to loader events and calls `this._refresh(app)`, which tries to update `#voididle-loader-manager-body`. That div was destroyed by `renderMaster` in `renderAll`, so `_refresh` is a no-op. The result: the Scripts panel never updates after the initial render, requiring the user to open/close the window.

Fix: redirect all event callbacks to call `WindowManager.renderMaster(app)` instead.

- [ ] **In `loader.user.js`, find `ManagerUI.init` at line 1609:**

```js
    init(app) {
      app.events.on('loader:manifest',        () => this._refresh(app));
      app.events.on('loader:module:loaded',   () => this._refresh(app));
      app.events.on('loader:module:failed',   () => this._refresh(app));
      app.events.on('loader:module:skipped',  () => this._refresh(app));
      app.events.on('loader:module:reloaded', () => this._refresh(app));
      app.events.on('loader:complete',        () => this._refresh(app));
      app.events.on('loader:error',           () => this._refresh(app));
    },
```

- [ ] **Replace the entire `init` method body with:**

```js
    init(app) {
      const refresh = () => WindowManager.renderMaster(app);
      app.events.on('loader:manifest',        refresh);
      app.events.on('loader:module:loaded',   refresh);
      app.events.on('loader:module:failed',   refresh);
      app.events.on('loader:module:skipped',  refresh);
      app.events.on('loader:module:reloaded', refresh);
      app.events.on('loader:complete',        refresh);
      app.events.on('loader:error',           refresh);
    },
```

- [ ] **Manual verification — install the updated userscript in Tampermonkey and open voididle.com:**
  - Open the Scripts panel from the tray — all 10 manifest modules should appear without opening/closing
  - Modules with `enabled: true` in manifest show no badge; any with `enabled: false` show "Disabled in manifest" at the bottom of their row
  - The "Off" status text is gone
  - Toggling a checkbox does not shift other rows
  - "Run Scripts" button still works

- [ ] **Commit**

```bash
git add loader.user.js
git commit -m "fix: ManagerUI.init triggers renderMaster on loader events, fixes auto-refresh"
```

---

## Task 4: Update README.md — add Modules section

**Files:**
- Modify: `README.md`

Add a `## Modules` section after the existing content, grouped by category. Descriptions are expanded 1–2 sentences beyond the manifest `description` field for README clarity.

- [ ] **Open `README.md` and append the following after the existing content:**

```markdown

## Modules

### Misc

**👁️ Presence Tracker** — Background-only module with no UI panel. Sends anonymised presence pings to a Cloudflare Worker so AimForNuts can see who is using the loader.

**🛰️ WS Sniffer** — Captures live WebSocket frames (both inbound and outbound) with type and content filters. Built for world boss debugging; useful any time you need to inspect raw game traffic.

**👑 Boss Tracker** — Tracks world boss spawn history, records which fighters participated, and maintains DPS leaderboards across sessions. Persists data locally so history survives page reloads.

### Fighter

**◈ Rune Planner** — Plan rune loadouts by type and tier, then copy the result as a formatted list for Discord or personal notes. Lets you model builds before committing runes.

**📊 Stat Grabber** — Fetches and displays player stats alongside gear comparisons, roll quality ratings, inventory filters, and customisable scoring. The go-to tool for evaluating whether a new drop is an upgrade.

**🎯 DPS Coach** — Personal and team DPS tracking with relay support. Connects to the combat relay so party members can share live DPS data without leaving the game.

**🎁 Item Share** — Share item tooltips in chat and within a party, automate mail actions, and access salvage tools from a single panel. Reduces back-and-forth when coordinating loot distribution.

**⚡ Loot Helper** — Stats, DPS, EHP, gear comparison, roll quality, and multi-filter scoring in one place. A comprehensive loot evaluation suite for quickly triaging drops.

### Gather

**🗓️ Party Planner** — The main gather coordination module. Covers inventory scanning, party composition tools, a rune planner, tool planner, and crafting debug output.

**🔍 Party Planner Debug** — Extended version of Party Planner with spirit essence tracing and additional debug output. Intended for development and diagnosing gather-side issues.
```

- [ ] **Commit**

```bash
git add README.md
git commit -m "docs: add Modules section to README"
```

---

## Task 5: Create SCRIPTS.md — developer module catalog

**Files:**
- Create: `SCRIPTS.md`

A developer-facing reference. Each module gets a heading, inline metadata (manifest ID, category, file), and a descriptive paragraph. Grouped by category, ordered to match manifest order within each category.

- [ ] **Create `SCRIPTS.md` at the repo root with the following content:**

```markdown
# Scripts

Developer reference for all modules in this loader. Each entry covers what the module does, where to find it, and anything worth knowing before touching the code.

---

## Misc

### 👁️ Presence Tracker
**ID:** `presence-tracker` | **Category:** Misc | **File:** `modules/presence-tracker.js`

Background-only module — no UI panel, no user controls. On init it registers with a Cloudflare Worker (see `cloudflare/`) to record that the loader is active. Designed exclusively for AimForNuts internal visibility; it should not be modified to add UI or expose data to other modules. The Worker URL is set directly in the module source.

---

### 🛰️ WS Sniffer
**ID:** `ws-sniffer` | **Category:** Misc | **File:** `modules/ws-sniffer.js`

Captures WebSocket frames intercepted by `SocketCore` (the loader's built-in WS hook) and displays them in a filterable log panel. Supports filtering by message type and content substring. Useful for inspecting world boss packets, diagnosing unexpected game state, or reverse-engineering new message types. Reads from the `socket:debug` event emitted by the loader core.

---

### 👑 Boss Tracker
**ID:** `boss-tracker` | **Category:** Misc | **File:** `modules/boss-tracker.js`

Listens to `socket:message` events for world boss lifecycle messages and builds a local history of spawns, fighters, and damage contributions. Renders a leaderboard panel. Data is persisted to `localStorage` via the module storage API so history survives page reloads. No relay dependency — all data is derived from the local WebSocket stream.

---

## Fighter

### ◈ Rune Planner
**ID:** `rune-planner` | **Category:** Fighter | **File:** `modules/rune-planner.js`

A standalone build-planning tool. Lets the user pick rune types and tiers, previews the resulting loadout, and copies a formatted summary to the clipboard for sharing on Discord. No live game-state dependency — works entirely off user input. No relay or socket usage.

---

### 📊 Stat Grabber
**ID:** `stat-grabber` | **Category:** Fighter | **File:** `modules/stat-grabber.js`

Fetches player stats and inventory data via the game API (using the loader's `ApiHelper`). Renders a tabbed panel covering stat display, gear comparison, roll quality ratings, and scored item filters. Filters and scoring weights are configurable and persisted per-user. The heaviest UI module in the Fighter category — touch carefully.

---

### 🎯 DPS Coach
**ID:** `dps-coach` | **Category:** Fighter | **File:** `modules/dps-coach.js`

Tracks DPS for the local player by processing `socket:message` combat events. Optionally connects to the combat relay (`RelayCore`) so party members can broadcast their DPS to a shared room. Relay connection is opt-in via UI controls. Relay data is emitted as `relay:dps` events that other modules can subscribe to.

---

### 🎁 Item Share
**ID:** `item-share` | **Category:** Fighter | **File:** `modules/item-share.js`

Provides item tooltip sharing in chat and party context, mail automation helpers, and a salvage tool. Uses `ApiHelper` to interact with the game's mail and inventory endpoints. The salvage flow requires user confirmation before calling destructive API routes.

---

### ⚡ Loot Helper
**ID:** `loot-helper` | **Category:** Fighter | **File:** `modules/loot-helper.js`

Comprehensive loot evaluation suite. Computes stats, DPS, EHP, and roll quality for items, supports gear comparison, and applies multi-filter scoring to surface the best drops. The largest module in the repo by line count (2600+ lines). If you're modifying it, read through the scoring engine at the top of the file before touching anything else.

---

## Gather

### 🗓️ Party Planner
**ID:** `party-planner` | **Category:** Gather | **File:** `modules/party-planner.js`

The primary gather coordination tool. Tabs cover inventory scanning, party slot management, rune planning, tool planning, and crafting debug output. Reads inventory from the game API. Party data is shared via the relay when connected. This is the production gather module — `party-planner-debug` is its development counterpart.

---

### 🔍 Party Planner Debug
**ID:** `party-planner-debug` | **Category:** Gather | **File:** `modules/party-planner-debug.js`

Extended version of Party Planner with spirit essence tracing and verbose debug panels. Intended for diagnosing gather-side issues and developing new Party Planner features before promoting them to the stable module. Not intended for regular use — leave it disabled in the manifest for production.
```

- [ ] **Commit**

```bash
git add SCRIPTS.md
git commit -m "docs: add SCRIPTS.md developer module catalog"
```

---

## Task 6: Update void-repo-rules skill — add module maintenance rule

**Files:**
- Modify: `.claude/skills/void-repo-rules/SKILL.md`

Append a new rule so future sessions automatically know to update README.md and SCRIPTS.md when a module is added or changed.

- [ ] **Open `.claude/skills/void-repo-rules/SKILL.md` and append the following after the existing rule:**

```markdown


## Rule: Keep README.md and SCRIPTS.md current

`README.md` has a `## Modules` section and `SCRIPTS.md` is the developer module catalog. Both must stay in sync with `manifest.json`.

**When adding a new module:**
- Add an entry to `manifest.json`
- Add an entry to the correct category group in the `## Modules` section of `README.md` (icon + bold name + 2–3 line description)
- Add a full section to `SCRIPTS.md` (ID, category, file path, descriptive paragraph), inserted in manifest order within the category

**When updating an existing module** (description change, category change, rename):
- Update the existing entry in both `README.md` and `SCRIPTS.md` — do not add a duplicate

**Never:**
- Add a new module to `manifest.json` without updating both doc files
- Leave placeholder text ("TBD", "coming soon") in either doc file
```

- [ ] **Commit**

```bash
git add .claude/skills/void-repo-rules/SKILL.md
git commit -m "docs: add module maintenance rule to void-repo-rules skill"
```

---

## Self-Review

**Spec coverage:**
- ✅ Loader UI: `renderModuleRow` rewrite (Task 1), `renderMaster` manifest read (Task 2), `ManagerUI.init` auto-refresh fix (Task 3)
- ✅ "Disabled in manifest" label at bottom of row, only for `entry.enabled === false` (Task 1)
- ✅ No layout shift on checkbox toggle — `disabledBadge` is static per manifest entry (Task 1)
- ✅ README.md Modules section, grouped by category, 2–3 line descriptions (Task 4)
- ✅ SCRIPTS.md developer catalog, grouped by category, manifest order (Task 5)
- ✅ void-repo-rules rule for new/updated modules (Task 6)

**Placeholder scan:** No TBDs, no "similar to Task N" references, all code blocks are complete. ✓

**Type consistency:** `renderModuleRow(app, entry)` — `entry` used consistently across Task 1 and Task 2. `WindowManager.renderMaster(app)` — matches existing method signature throughout. ✓
