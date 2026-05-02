# Market Party Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a party member context dropdown to the Market tab so listings are scored against any saved team profile's equipped gear and filter, not just the current player's.

**Architecture:** Store raw market item data before scoring; add a `rebuildMarketItems()` function that re-scores using whichever context (self or team profile) is active; add a `<select>` dropdown to the market toolbar that triggers a re-score on change.

**Tech Stack:** Vanilla JS userscript (Tampermonkey), no build step. All changes are in `modules/loot-helper.js`. Reload Tampermonkey after each save to test.

---

### Task 1: Add state fields

**Files:**
- Modify: `modules/loot-helper.js:429`

- [ ] **Step 1: Add `marketRawData` and `marketCtxPlayerId` to the state object**

Find line 429 (the `marketItems` line):
```js
    marketItems: [], marketVisible: false, marketHideFuture: false,
```
Replace with:
```js
    marketItems: [], marketRawData: [], marketVisible: false, marketHideFuture: false,
    marketCtxPlayerId: null,
```

- [ ] **Step 2: Commit**
```bash
git add modules/loot-helper.js
git commit -m "feat(market): add marketRawData and marketCtxPlayerId state fields"
```

---

### Task 2: Add `marketCtx()` helper and `rebuildMarketItems()`; refactor `readMarketListings()`

**Files:**
- Modify: `modules/loot-helper.js` — the `selfCtx()` / `buildEquippedMap()` block (~line 381) and `readMarketListings()` (~line 1135)

- [ ] **Step 1: Add `marketCtx()` helper directly after the `selfCtx()` function (after line 385)**

```js
  function marketCtx() {
    if (!state.marketCtxPlayerId) return selfCtx();
    const profile = teamProfiles[state.marketCtxPlayerId];
    if (!profile) return selfCtx();
    return deriveCharStatsFromProfile(profile);
  }

  function marketCtxFilterKey() {
    if (!state.marketCtxPlayerId) return state.activeFilterKey;
    const profile = teamProfiles[state.marketCtxPlayerId];
    return profile?.filterKey ?? state.activeFilterKey;
  }
```

- [ ] **Step 2: Add `rebuildMarketItems()` directly after the new helpers**

```js
  function rebuildMarketItems() {
    if (!state.marketRawData.length) { state.marketItems = []; return; }

    let equippedMap, filterKey;
    if (state.marketCtxPlayerId && teamProfiles[state.marketCtxPlayerId]) {
      const profile = teamProfiles[state.marketCtxPlayerId];
      equippedMap = profile.equippedMap;
      filterKey   = profile.filterKey ?? state.activeFilterKey;
    } else {
      state.marketCtxPlayerId = null;   // reset if profile was deleted
      equippedMap = state.equipped;
      filterKey   = state.activeFilterKey;
    }

    state.marketItems = state.marketRawData.map(r =>
      ({ ..._buildBagItem(r.item, equippedMap, filterKey),
         listingId: r.listingId, price: r.price,
         sellerName: r.sellerName, itemTier: r.itemTier, isFutureTier: r.isFutureTier })
    );
  }
```

- [ ] **Step 3: Refactor `readMarketListings()` to populate `marketRawData` and call `rebuildMarketItems()`**

Find the current `readMarketListings()` function (~line 1135). Replace it entirely with:

```js
  function readMarketListings() {
    const mpPanel = document.querySelector(".mp-panel");
    state.marketVisible = !!mpPanel;
    if (!mpPanel) { state.marketRawData = []; state.marketItems = []; return; }

    const mwt  = Math.floor((state.level ?? 0) / 10) + 1;
    const raws = [];

    mpPanel.querySelectorAll(".mp-listing").forEach(el => {
      const fkey = Object.keys(el).find(k => k.startsWith("__reactFiber"));
      if (!fkey) return;
      const listingProps = el[fkey]?.return?.memoizedProps;
      if (!listingProps?.l?.item) return;
      const listing = listingProps.l;
      const raw     = listing.item;

      const item = {
        ...raw,
        id:           listing.id,
        forgeTier:    raw.forge_tier ?? raw.forgeTier ?? "",
        equippedSlot: null,
        sellPrice:    listing.price,
      };

      const itemTier     = raw.itemTier ?? 1;
      const isFutureTier = (itemTier - mwt) > 1;
      raws.push({ item, listingId: listing.id, price: listing.price,
                  sellerName: listing.sellerName, itemTier, isFutureTier });
    });

    state.marketRawData = raws;
    rebuildMarketItems();
  }
```

- [ ] **Step 4: Verify the game still works — reload Tampermonkey, open the market panel, confirm listings appear as before (self context, no dropdown yet)**

- [ ] **Step 5: Commit**
```bash
git add modules/loot-helper.js
git commit -m "feat(market): extract rebuildMarketItems, store raw data for re-scoring"
```

---

### Task 3: Update `renderMarketItem()` to use market context

**Files:**
- Modify: `modules/loot-helper.js:2046–2078`

The function currently hardcodes `state.activeFilterKey` for chip highlighting and `selfCtx()` for the delta corner. When a teammate is active, both should reflect their context.

- [ ] **Step 1: Find this line inside `renderMarketItem()` (~line 2048):**
```js
    const activeFC = state.filters.get(state.activeFilterKey) ?? mkFC([]);
```
Replace with:
```js
    const activeFC = state.filters.get(marketCtxFilterKey()) ?? mkFC([]);
```

- [ ] **Step 2: Find this line inside `renderMarketItem()` (~line 2073):**
```js
        ${_itemDeltasCornerHtml(item, selfCtx())}
```
Replace with:
```js
        ${_itemDeltasCornerHtml(item, marketCtx())}
```

- [ ] **Step 3: Commit**
```bash
git add modules/loot-helper.js
git commit -m "feat(market): renderMarketItem uses marketCtx for diffs and filter chips"
```

---

### Task 4: Add context selector dropdown to `renderMarket()`

**Files:**
- Modify: `modules/loot-helper.js` — `renderMarket()` function (~line 1979)

- [ ] **Step 1: Update the equipped-gear guard to be context-aware**

Find (~line 1986):
```js
    if (!Object.keys(state.equipped).length) {
      return `<div class="sg-hint" style="padding:6px 10px;">No equipped gear cached — open inventory first for diffs.</div>`;
    }
```
Replace with:
```js
    const ctxProfile = state.marketCtxPlayerId ? teamProfiles[state.marketCtxPlayerId] : null;
    if (!ctxProfile && !Object.keys(state.equipped).length) {
      return `<div class="sg-hint" style="padding:6px 10px;">No equipped gear cached — open inventory first for diffs.</div>`;
    }
```

- [ ] **Step 2: Build the context selector HTML snippet**

Add a helper just before (or at the top of) `renderMarket()`:

```js
  function _marketCtxSelectorHtml() {
    const profiles = Object.values(teamProfiles);
    if (!profiles.length) return "";
    const opts = profiles.map(p => {
      const eqWeapon = Object.values(p.equippedMap).find(i => ITEM_TYPE_TO_SLOT[i.type] === "Weapon");
      const icon     = eqWeapon ? (ITEM_ICONS[eqWeapon.type] ?? "⚔️") : "👤";
      const sel      = state.marketCtxPlayerId === p.playerId ? " selected" : "";
      return `<option value="${esc(p.playerId)}"${sel}>${icon} ${esc(p.username)}</option>`;
    }).join("");
    return `<select id="sgMktCtx" style="font-size:10px;background:#0f172a;color:#e8eefc;border:1px solid #1e293b;border-radius:4px;padding:1px 4px;cursor:pointer;">
      <option value=""${!state.marketCtxPlayerId ? " selected" : ""}>👤 Me</option>
      ${opts}
    </select>`;
  }
```

- [ ] **Step 3: Insert the selector into the market toolbar**

Find inside `renderMarket()` (~line 1997):
```js
    let html = `<div class="sg-gear-toolbar">
      <div style="display:flex;gap:6px;align-items:center;">
        <span style="color:#e8eefc;font-size:11px;font-weight:600;">${state.marketItems.length} listings</span>
        <span style="color:#4b5563;font-size:10px;">max T${mwt} (Lv${state.level??0})</span>
      </div>
      <div style="display:flex;gap:5px;align-items:center;">
        ${futureItems.length ? `<button class="sg-mode-btn${state.marketHideFuture?" active":""}" id="sgMktHideFuture"
          style="${state.marketHideFuture?"color:#6b7280;border-color:#374151;":""}"
          title="${state.marketHideFuture?"Show":"Hide"} future tier items">🔒 ${futureItems.length}</button>` : ""}
        <span class="sg-cache-hint">· <span style="color:#3b82f6;">${esc(state.activeFilterKey||"—")}</span></span>
      </div>
    </div>`;
```
Replace with:
```js
    const ctxSelector = _marketCtxSelectorHtml();
    let html = `<div class="sg-gear-toolbar">
      <div style="display:flex;gap:6px;align-items:center;">
        <span style="color:#e8eefc;font-size:11px;font-weight:600;">${state.marketItems.length} listings</span>
        <span style="color:#4b5563;font-size:10px;">max T${mwt} (Lv${state.level??0})</span>
        ${ctxSelector}
      </div>
      <div style="display:flex;gap:5px;align-items:center;">
        ${futureItems.length ? `<button class="sg-mode-btn${state.marketHideFuture?" active":""}" id="sgMktHideFuture"
          style="${state.marketHideFuture?"color:#6b7280;border-color:#374151;":""}"
          title="${state.marketHideFuture?"Show":"Hide"} future tier items">🔒 ${futureItems.length}</button>` : ""}
        <span class="sg-cache-hint">· <span style="color:#3b82f6;">${esc(marketCtxFilterKey()||"—")}</span></span>
      </div>
    </div>`;
```

Note: the filter key label also now uses `marketCtxFilterKey()` so it shows the teammate's filter name when they're selected.

- [ ] **Step 4: Reload Tampermonkey and verify the dropdown appears in the market tab when team profiles exist. Selecting it should do nothing yet (event not wired).**

- [ ] **Step 5: Commit**
```bash
git add modules/loot-helper.js
git commit -m "feat(market): add party context dropdown to market toolbar"
```

---

### Task 5: Wire the dropdown event and handle profile deletion

**Files:**
- Modify: `modules/loot-helper.js` — the market tab event listener block (~line 2734) and the team tab deletion handler (~line 2753)

- [ ] **Step 1: Add the `#sgMktCtx` change listener**

Find (~line 2734):
```js
    if (state.activeTab==="market") {
      body.querySelector("#sgMktHideFuture")?.addEventListener("click", () => {
        state.marketHideFuture = !state.marketHideFuture;
        render();
      });
    }
```
Replace with:
```js
    if (state.activeTab==="market") {
      body.querySelector("#sgMktHideFuture")?.addEventListener("click", () => {
        state.marketHideFuture = !state.marketHideFuture;
        render();
      });
      body.querySelector("#sgMktCtx")?.addEventListener("change", e => {
        state.marketCtxPlayerId = e.target.value || null;
        rebuildMarketItems();
        render();
      });
    }
```

- [ ] **Step 2: Reset market context when a team profile is deleted**

Find (~line 2753):
```js
      body.querySelectorAll(".sg-team-del").forEach(btn => {
        btn.addEventListener("click", e => {
          e.stopPropagation();
          const pid = btn.dataset.teamDel;
          if (pid) { delete teamProfiles[pid]; saveTeamProfiles(); render(); }
        });
      });
```
Replace with:
```js
      body.querySelectorAll(".sg-team-del").forEach(btn => {
        btn.addEventListener("click", e => {
          e.stopPropagation();
          const pid = btn.dataset.teamDel;
          if (pid) {
            delete teamProfiles[pid];
            if (state.marketCtxPlayerId === pid) {
              state.marketCtxPlayerId = null;
              rebuildMarketItems();
            }
            saveTeamProfiles();
            render();
          }
        });
      });
```

- [ ] **Step 3: Commit**
```bash
git add modules/loot-helper.js
git commit -m "feat(market): wire context dropdown and reset on profile deletion"
```

---

### Task 6: Manual test checklist

- [ ] **Baseline — self context**
  - Open market panel → Weapons/Armor tab
  - Market tab shows listings scored against your own gear, filter label shows your active filter
  - No dropdown visible if no team profiles are saved

- [ ] **With one team profile saved**
  - Inspect a teammate → Save Profile in Team tab
  - Switch to Market tab → dropdown now shows "👤 Me" and the teammate's name
  - Select self: listings scored against your gear (same as before)

- [ ] **Switch to teammate context**
  - Select teammate from dropdown
  - Listings re-score against their equipped gear
  - Diff chips highlight their filter's preferred stats
  - Filter label in toolbar updates to show their filter name
  - DPS/EHP delta corner reflects their character stats

- [ ] **Profile deletion while selected**
  - Select teammate in Market tab
  - Go to Team tab, delete that profile
  - Switch back to Market tab → dropdown resets to "👤 Me", listings scored against self

- [ ] **Market panel close/reopen**
  - Select teammate, close market panel (navigate away)
  - Reopen market panel → teammate is still selected, listings re-score correctly
