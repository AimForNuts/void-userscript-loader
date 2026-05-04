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
