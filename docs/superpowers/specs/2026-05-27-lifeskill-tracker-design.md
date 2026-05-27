# Lifeskill Tracker — Design Spec

**Date:** 2026-05-27  
**Status:** Approved  
**Category:** Gather

---

## Overview

A new module `lifeskill-tracker` that injects a time-to-next-level countdown and ETA directly into the game's skill header DOM. No floating panel. Updates on every `gatherTick` WebSocket message. Removes itself when gathering stops.

---

## Module metadata

| Field | Value |
|---|---|
| `id` | `lifeskill-tracker` |
| `name` | Lifeskill Tracker |
| `icon` | ⛏ |
| `category` | `gather` |
| `dependencies` | `["core"]` |

---

## Data flow

### Source

`gatherTick` WebSocket messages, received via `app.events.on("socket:any", msg)` filtered to `msg.type === "gatherTick"`.

### Relevant fields

| Field | Description |
|---|---|
| `skill` | Skill identifier e.g. `"mining"` |
| `skillXp` | Current XP accumulated in this level |
| `skillXpToNext` | Total XP required for this level |
| `xpGain` | XP earned this tick |
| `tickMs` | Duration of this tick in milliseconds |

### Derived values

```
xpPerMs      = xpGain / tickMs
xpRemaining  = skillXpToNext - skillXp
msRemaining  = xpRemaining / xpPerMs
eta          = new Date(Date.now() + msRemaining)
```

Update frequency: on each `gatherTick` only (typically every ~5s). No 1-second interval.

---

## DOM injection

### Finding the target header

Search all `.gv-skill-header` elements for one whose `.gv-skill-name` child text matches `msg.skill` case-insensitively (e.g. `"mining"` → `"Mining"`). If no match is found, silently no-op.

### Injected element

A `<span class="gv-ttl-inline">` inserted immediately after the `.gv-xphr-inline` span.

On first injection: `insertAdjacentElement("afterend", span)`.  
On subsequent ticks: update `textContent` in place.

### Display format

```
→  001d 04h 25m 35s  at 11:45 PM
```

- Days zero-padded to 3 digits
- Hours, minutes, seconds zero-padded to 2 digits
- ETA formatted as local time (`HH:MM AM/PM`)
- Separator `→` visually separates from XP/hr

### Styling

```css
font-size: inherit;
color: #aaa;
margin-left: 8px;
```

No bold. Inherits font from the header. Unobtrusive.

---

## Stop detection

Each tick resets a `setTimeout` of `tickMs × 2.5`. When the timeout fires (no new tick arrived), the injected span is removed from the DOM and the timeout handle is cleared.

---

## Edge cases

| Scenario | Behaviour |
|---|---|
| `xpGain === 0` | Skip update, keep last displayed value |
| Header not in DOM (user on different page) | Silent no-op; injection happens on next tick when page is visible |
| Level up (`skillXpToNext` resets) | Calculation corrects naturally on the next tick |
| Multiple skill headers visible | Only the header matching `msg.skill` is updated |
| Days > 999 | Still renders correctly; format handles any integer |

---

## What this module does NOT do

- No floating panel
- No session history or XP log
- No mastery tracking
- No persistence between sessions
