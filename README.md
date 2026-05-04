# VoidIdle Userscript Loader

Modular Tampermonkey userscript for [Void Idle](https://voididle.com).

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/)
2. Click **[Install Loader](https://raw.githubusercontent.com/AimForNuts/void-userscript-loader/main/loader.user.js)**

## Update a Module

Edit `manifest.json` and bump the module's `version` field. No reinstall needed.

## Add a Community Module

Add an entry to `manifest.json` pointing to any hosted `.js` file.

## Modules

### Misc

**🔬 Debug Inspector** — Dev-only always-visible overlay that dumps decoded JWT payload, localStorage string candidates, and captured responses from auth/user network requests. Draggable. Has per-section and Copy All buttons. Disabled by default; enable in the manifest to use.

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
