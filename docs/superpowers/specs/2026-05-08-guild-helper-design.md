# Guild Helper — Design Spec

**Date:** 2026-05-08
**Module ID:** `guild-helper`
**Category:** misc

---

## Overview

A new module that intercepts the game's own `/api/guild` fetch, caches the response, and injects an inline badge into the guild page UI showing vault gold vs the cost to claim the next level. When `canClaimLevel` is true, a "Ready to level!" indicator is shown. No extra network requests are made; data is only available after the player visits the guild page.

---

## Architecture

### Fetch interception

In `init`, the module wraps `window.fetch` once with a thin interceptor. Any request whose URL contains `/api/guild` has its response cloned, parsed as JSON, and emitted on the app event bus as `guild-helper:data`. The original `Response` object is returned to the game unchanged so normal game behaviour is not affected.

The interceptor guards against double-wrapping with a flag (`window.__voidGuildHelperFetchHooked`). If the module is destroyed and re-initialised, the hook is already installed and the event will still fire.

### DOM injection

A `MutationObserver` on `document.body` (childList + subtree) watches for a guild container to appear. Candidate selectors (tried in order):

1. `.guild-panel`
2. `.guild-view`
3. `.guild-page`
4. `[class*="guild-wrap"]`
5. `main section` (broad fallback)

The first matching element whose text content includes the guild name or a guild-related keyword ("vault", "guild level", "members") is used as the anchor. The badge is prepended as the first child of that container.

The same observer detects when the container is removed from the DOM and tears down the badge.

### Badge content

```
┌─────────────────────────────────────────┐
│ 🏛 Guild Helper                          │
│ Next level cost:  894,427g               │
│ Vault gold:     2,342,303g  ✓            │
│ ✅ Ready to level!                       │  ← only when canClaimLevel === true
└─────────────────────────────────────────┘
```

- If `vaultGold >= levelClaimCost` → show ✓ in green next to vault gold
- If `vaultGold < levelClaimCost` → show deficit `(need 123,456g more)` in amber
- `canClaimLevel === true` → show a green "✅ Ready to level!" row
- Badge is only injected once `guildData` is set, so the guild container entering the DOM before the fetch fires has no effect — the observer will try again on the next mutation

### State

```js
const state = {
  guildData: null,   // parsed /api/guild response, or null
  badge: null,       // injected DOM element, or null
  observer: null,    // MutationObserver instance
};
```

### Lifecycle

| Event | Action |
|---|---|
| `guild-helper:data` fires | Store `guildData`; if badge already in DOM, re-render it |
| Guild container enters DOM | Inject badge (if `guildData` is set) |
| Guild container leaves DOM | Remove badge, set `state.badge = null` |
| `destroy()` called | Disconnect observer; remove badge |

---

## Module registration

**`manifest.json`** entry (inserted after `boss-tracker`, within `misc` category):

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
}
```

**`README.md`** — add to the Misc group:

> 🏛 **Guild Helper** — Intercepts the guild API response and injects a badge showing vault gold vs next level cost, with a ready-to-level indicator.

**`SCRIPTS.md`** — add a full section (misc category, after boss-tracker entry).

---

## CSS

Badge uses inline styles only (no shared stylesheet additions needed). Styled to be unobtrusive: dark semi-transparent background (`rgba(8,10,15,0.88)`), 12px font, rounded corners, a thin border matching the vim-panel aesthetic. Class prefix `gh-` to avoid collisions.

---

## Out of scope

- XP progress bar (user did not request it)
- Manual refresh button (data comes from the game's own fetch; stale data is expected until the player revisits the guild page)
- Displaying any other guild fields (buffs, members, etc.)
