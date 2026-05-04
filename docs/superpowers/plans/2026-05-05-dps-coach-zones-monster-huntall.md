# DPS Coach Zones — Monster & Hunt All Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the DPS Coach Zones tab so each row tracks a unique zone + tier + monster + hunt-all combo, captured from the game's `POST /api/party/set-zone` request.

**Architecture:** Monkey-patch `window.fetch` inside `dps-coach.js` at `init()` time to intercept `set-zone` calls and populate three new state fields (`currentMonsterName`, `huntAll`, `setZoneReady`). Zone records and keys are only created once all four fields are known. The zone key format gains monster and hunt-all segments. The Zones table gains Monster and Hunt All columns and drops Last Seen.

**Tech Stack:** Vanilla JS userscript module inside `modules/dps-coach.js`. No build step, no external dependencies. Changes are entirely self-contained in that one file.

---

## File Map

- **Modify:** `modules/dps-coach.js`
  - Add state fields
  - Add `formatSlugToDisplay`, `handleSetZone`, `installSetZoneInterceptor`
  - Update `DPS_ZONE_STATS_STORAGE_KEY` (v4 → v5)
  - Update `getZoneKeyFor`, `getCurrentZoneKey`
  - Update `createEmptyZoneRecord`, `sanitizeZoneRecord`, `loadZoneStats`, `saveZoneStats`
  - Update `touchCurrentZone`
  - Update `renderZonesTab`, `copyZoneStats`

---

## Task 1: Bump storage version + add state fields + formatSlugToDisplay

**Files:**
- Modify: `modules/dps-coach.js`

- [ ] **Step 1: Change the storage key constant**

Find line ~264:
```js
const DPS_ZONE_STATS_STORAGE_KEY = "voididle.dpsCoach.zoneStats.v4.session";
// v4 intentionally does not import older zone history. Older builds stored
// lifetime totals, which made the Zones tab look wildly different from
// the Summary tab after long play sessions.
```

Replace with:
```js
const DPS_ZONE_STATS_STORAGE_KEY = "voididle.dpsCoach.zoneStats.v5.session";
// v5 intentionally does not import older zone history. v5 adds per-monster
// and hunt-all tracking; old keys lack those segments and are incompatible.
```

- [ ] **Step 2: Add three new fields to the `state` object**

Find the `zoneStats` block in `state` (around line 85):
```js
            zoneStats: {},
            lastZoneStatsKey: "",
            zoneStatsLastTickAt: 0,
```

Replace with:
```js
            zoneStats: {},
            lastZoneStatsKey: "",
            zoneStatsLastTickAt: 0,

            currentMonsterName: "",
            huntAll: false,
            setZoneReady: false,
```

- [ ] **Step 3: Add `formatSlugToDisplay` helper**

Place this immediately after the `getZoneKeyFor` function (around line 336):
```js
        function formatSlugToDisplay(slug) {
            return String(slug || "")
                .split("-")
                .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                .join(" ") || "";
        }
```

- [ ] **Step 4: Manual smoke test**

Open the game in the browser with Tampermonkey active. Open DevTools Console and run:
```js
// Should print the new storage key — old v4 key data should be gone
console.log(localStorage.getItem("voididle.dpsCoach.zoneStats.v5.session")); // null initially
console.log(localStorage.getItem("voididle.dpsCoach.zoneStats.v4.session")); // old data, if any
```
Expected: v5 key returns `null` on first load (no old data imported). No console errors.

- [ ] **Step 5: Commit**

```bash
git add modules/dps-coach.js
git commit -m "feat(dps-coach): bump zone stats to v5, add monster/huntAll state fields"
```

---

## Task 2: Add fetch interceptor for set-zone

**Files:**
- Modify: `modules/dps-coach.js`

- [ ] **Step 1: Add `handleSetZone` function**

Place this after the `formatSlugToDisplay` function added in Task 1:
```js
        function handleSetZone(body) {
            const zoneId = String(body?.zoneId || "").trim();
            const monsterId = String(body?.monsterId || "").trim();
            const tier = String(body?.tier ?? "").trim();
            const huntAll = body?.huntAll === true;

            if (!zoneId || !monsterId) return;

            state.zoneId = zoneId;
            state.tier = tier;
            state.currentMonsterName = formatSlugToDisplay(monsterId);
            state.huntAll = huntAll;
            state.setZoneReady = true;
            state.lastSocketZoneAt = now();
        }
```

- [ ] **Step 2: Add `installSetZoneInterceptor` function**

Place immediately after `handleSetZone`:
```js
        function installSetZoneInterceptor() {
            const originalFetch = window.fetch;

            window.fetch = async function (resource, options) {
                const url = typeof resource === "string"
                    ? resource
                    : (resource instanceof Request ? resource.url : String(resource || ""));

                if (url.includes("/api/party/set-zone") && String(options?.method || "").toUpperCase() === "POST") {
                    try {
                        const body = JSON.parse(options?.body || "{}");
                        handleSetZone(body);
                    } catch { }
                }

                return originalFetch.apply(this, arguments);
            };
        }
```

- [ ] **Step 3: Wire up in `init()`**

Find the `init(app)` function (around line 4174). Add the interceptor call as the first line of the function body, before any other setup:
```js
            init(app) {
                installSetZoneInterceptor();   // ← add this line
                appRef = app;
                // ... rest of init unchanged
```

- [ ] **Step 4: Manual smoke test**

In the game, open DevTools Network tab and filter for `set-zone`. Change your zone or monster setting. Then in Console:
```js
// Access the module's state via whatever global the loader exposes, or just observe the log
// Alternatively, add a temporary console.log inside handleSetZone to verify it fires
```
Expected: `handleSetZone` runs when the network call is made; no errors; original fetch still completes normally (the zone change takes effect in the game).

- [ ] **Step 5: Commit**

```bash
git add modules/dps-coach.js
git commit -m "feat(dps-coach): intercept set-zone to capture monster, huntAll, zoneId"
```

---

## Task 3: Update zone key functions

**Files:**
- Modify: `modules/dps-coach.js`

- [ ] **Step 1: Update `getZoneKeyFor` to accept monster + huntAll**

Find the current `getZoneKeyFor` function (around line 332):
```js
        function getZoneKeyFor(zoneName, tier = "") {
            const base = getZoneStorageKey(zoneName);
            const cleanTier = String(tier || "").replace(/^T/i, "").trim();
            return cleanTier ? `${base}|T${cleanTier}` : base;
        }
```

Replace with:
```js
        function getZoneKeyFor(zoneName, tier = "", monsterId = "", huntAll = null) {
            const base = getZoneStorageKey(zoneName);
            const cleanTier = String(tier || "").replace(/^T/i, "").trim();
            const tierPart = cleanTier ? `T${cleanTier}` : "";
            const cleanMonster = String(monsterId || "")
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-+|-+$/g, "");
            const huntPart = huntAll === true ? "hunt-all" : huntAll === false ? "single" : "";

            return [base, tierPart, cleanMonster, huntPart].filter(Boolean).join("|");
        }
```

- [ ] **Step 2: Update `getCurrentZoneKey` to return null when not ready**

Find `getCurrentZoneKey` (around line 495):
```js
        function getCurrentZoneKey() {
            return getZoneKeyFor(getCurrentZoneName(), getCurrentZoneTier());
        }
```

Replace with:
```js
        function getCurrentZoneKey() {
            if (!state.setZoneReady) return null;

            return getZoneKeyFor(
                getCurrentZoneName(),
                getCurrentZoneTier(),
                state.currentMonsterName
                    ? state.currentMonsterName.toLowerCase().replace(/\s+/g, "-")
                    : "",
                state.huntAll,
            );
        }
```

Note: we pass `currentMonsterName` re-slugified so the key remains stable regardless of display formatting changes. Alternatively, store the raw `monsterId` alongside `currentMonsterName` — but since `formatSlugToDisplay` is deterministic and reversible, re-slugifying the display name works correctly here.

- [ ] **Step 3: Manual smoke test**

Open DevTools Console. Change zone in game (triggers `set-zone`). Then:
```js
// The key should now include monster and hunt-all segments
// You can temporarily add a console.log inside getCurrentZoneKey to verify
```
Expected: key format is `iron-gate-pass|T3|rogue-soldier|hunt-all` or `|single`. No errors. If `set-zone` hasn't fired, `getCurrentZoneKey()` returns `null`.

- [ ] **Step 4: Commit**

```bash
git add modules/dps-coach.js
git commit -m "feat(dps-coach): update zone key to include monster and hunt-all segments"
```

---

## Task 4: Update zone record create / sanitize / load / save

**Files:**
- Modify: `modules/dps-coach.js`

- [ ] **Step 1: Update `createEmptyZoneRecord`**

Find `createEmptyZoneRecord` (around line 549):
```js
        function createEmptyZoneRecord(zoneName = "Unknown Zone", tier = "") {
            const cleanZoneName = normalizeZoneName(zoneName);
            const ts = now();
            const base = getDpsCoachSummaryTotals();

            return {
                key: getZoneKeyFor(cleanZoneName, tier),
                zoneName: cleanZoneName,
                tier: String(tier || ""),
                firstSeenAt: ts,
                ...
            };
        }
```

Replace with:
```js
        function createEmptyZoneRecord(zoneName = "Unknown Zone", tier = "", monsterName = "", huntAll = false) {
            const cleanZoneName = normalizeZoneName(zoneName);
            const ts = now();
            const base = getDpsCoachSummaryTotals();
            const monsterSlug = monsterName
                ? monsterName.toLowerCase().replace(/\s+/g, "-")
                : "";

            return {
                key: getZoneKeyFor(cleanZoneName, tier, monsterSlug, huntAll),
                zoneName: cleanZoneName,
                tier: String(tier || ""),
                monsterName: String(monsterName || ""),
                huntAll: huntAll === true,
                firstSeenAt: ts,
                lastSeenAt: ts,
                sessions: 0,
                activeMs: 0,
                visitStartedAt: 0,
                base: cloneZoneMetrics(base),
                visitStart: createZeroZoneMetrics(),

                xp: 0,
                gold: 0,
                shards: 0,
                kills: 0,
                deaths: 0,

                hits: 0,
                misses: 0,
                attempts: 0,
                damage: 0,
                manaSpent: 0,
                manaRegen: 0,
            };
        }
```

- [ ] **Step 2: Update `sanitizeZoneRecord`**

Find `sanitizeZoneRecord` (around line 581):
```js
        function sanitizeZoneRecord(raw, fallbackKey = "Unknown Zone") {
            const fallbackText = String(fallbackKey || "Unknown Zone").replace(/\|T\d+$/i, "");
            const zoneName = normalizeZoneName(raw?.zoneName || fallbackText || "Unknown Zone");
            const tier = String(raw?.tier || parseZoneTier(fallbackKey) || "");
            const record = createEmptyZoneRecord(zoneName, tier);
            ...
        }
```

Replace with:
```js
        function sanitizeZoneRecord(raw, fallbackKey = "Unknown Zone") {
            const fallbackText = String(fallbackKey || "Unknown Zone")
                .replace(/\|[^|]+\|[^|]+$/i, "")  // strip |monster|hunt segments
                .replace(/\|T\d+$/i, "");           // strip |T3 segment
            const zoneName = normalizeZoneName(raw?.zoneName || fallbackText || "Unknown Zone");
            const tier = String(raw?.tier || parseZoneTier(fallbackKey) || "");
            const monsterName = String(raw?.monsterName || "");
            const huntAll = raw?.huntAll === true;
            const record = createEmptyZoneRecord(zoneName, tier, monsterName, huntAll);

            record.firstSeenAt = Number(raw?.firstSeenAt || record.firstSeenAt);
            record.lastSeenAt = Number(raw?.lastSeenAt || record.lastSeenAt);
            record.sessions = Number(raw?.sessions || 0);
            record.activeMs = Number(raw?.activeMs || raw?.combatMs || raw?.timeMs || 0);
            record.visitStartedAt = Number(raw?.visitStartedAt || 0);

            record.xp = Number(raw?.xp || 0);
            record.gold = Number(raw?.gold || 0);
            record.shards = Number(raw?.shards || 0);
            record.kills = Number(raw?.kills || 0);
            record.deaths = Number(raw?.deaths || 0);

            record.hits = Number(raw?.hits || 0);
            record.misses = Number(raw?.misses || 0);
            record.attempts = Number(raw?.attempts || (record.hits + record.misses) || 0);
            record.damage = Number(raw?.damage || 0);
            record.manaSpent = Number(raw?.manaSpent || 0);
            record.manaRegen = Number(raw?.manaRegen || 0);

            record.base = cloneZoneMetrics(raw?.base || getDpsCoachSummaryTotals());
            record.visitStart = cloneZoneMetrics(raw?.visitStart || record);

            return record;
        }
```

- [ ] **Step 3: Update `loadZoneStats` to use new `getZoneKeyFor` signature**

Find `loadZoneStats` (around line 623):
```js
                for (const [key, value] of Object.entries(parsed)) {
                    const record = sanitizeZoneRecord(value, key);
                    record.key = getZoneKeyFor(record.zoneName, record.tier);
                    loaded[record.key] = mergeZoneRecords(loaded[record.key], record);
                }
```

Replace the two lines inside the loop that rebuild the key:
```js
                for (const [key, value] of Object.entries(parsed)) {
                    const record = sanitizeZoneRecord(value, key);
                    const monsterSlug = record.monsterName
                        ? record.monsterName.toLowerCase().replace(/\s+/g, "-")
                        : "";
                    record.key = getZoneKeyFor(record.zoneName, record.tier, monsterSlug, record.huntAll);
                    loaded[record.key] = mergeZoneRecords(loaded[record.key], record);
                }
```

- [ ] **Step 4: Update `saveZoneStats` to use new `getZoneKeyFor` signature**

Find `saveZoneStats` (around line 645), the lines inside the loop:
```js
                for (const record of records) {
                    const cleanRecord = sanitizeZoneRecord(record, record.key);
                    cleanRecord.key = getZoneKeyFor(cleanRecord.zoneName, cleanRecord.tier);
                    out[cleanRecord.key] = mergeZoneRecords(out[cleanRecord.key], cleanRecord);
                }
```

Replace with:
```js
                for (const record of records) {
                    const cleanRecord = sanitizeZoneRecord(record, record.key);
                    const monsterSlug = cleanRecord.monsterName
                        ? cleanRecord.monsterName.toLowerCase().replace(/\s+/g, "-")
                        : "";
                    cleanRecord.key = getZoneKeyFor(cleanRecord.zoneName, cleanRecord.tier, monsterSlug, cleanRecord.huntAll);
                    out[cleanRecord.key] = mergeZoneRecords(out[cleanRecord.key], cleanRecord);
                }
```

- [ ] **Step 5: Manual smoke test**

In the game, change zones (triggers `set-zone`), fight for a minute, then open the Zones tab. Check DevTools → Application → LocalStorage → `voididle.dpsCoach.zoneStats.v5.session`. Confirm the stored JSON keys contain monster and hunt-all segments (e.g. `iron-gate-pass|T3|rogue-soldier|hunt-all`). Confirm records have `monsterName` and `huntAll` fields.

- [ ] **Step 6: Commit**

```bash
git add modules/dps-coach.js
git commit -m "feat(dps-coach): add monsterName/huntAll to zone records, update key building"
```

---

## Task 5: Guard touchCurrentZone against null key

**Files:**
- Modify: `modules/dps-coach.js`

- [ ] **Step 1: Add null-key guard to `touchCurrentZone`**

Find `touchCurrentZone` (around line 694):
```js
        function touchCurrentZone(trackTime = false) {
            const zoneName = getCurrentZoneName();
            if (!zoneName || zoneName === "Unknown Zone") return null;

            const tier = getCurrentZoneTier();
            const key = getCurrentZoneKey();
            const existing = state.zoneStats[key] || createEmptyZoneRecord(zoneName, tier);
```

Replace the opening block with:
```js
        function touchCurrentZone(trackTime = false) {
            const zoneName = getCurrentZoneName();
            if (!zoneName || zoneName === "Unknown Zone") return null;

            const tier = getCurrentZoneTier();
            const key = getCurrentZoneKey();
            if (!key) return null;

            const existing = state.zoneStats[key] || createEmptyZoneRecord(
                zoneName,
                tier,
                state.currentMonsterName,
                state.huntAll,
            );
```

Also update the two lines that refresh `existing.zoneName` and `existing.tier` — add `monsterName` and `huntAll` refresh:
```js
            existing.key = key;
            existing.zoneName = zoneName;
            existing.tier = existing.tier || tier;
            existing.monsterName = existing.monsterName || state.currentMonsterName;
            existing.huntAll = state.huntAll;
            existing.lastSeenAt = ts;
            existing.activeMs = Number(existing.activeMs || 0);
```

- [ ] **Step 2: Manual smoke test**

Reload the page without changing zones. Confirm the Zones tab shows an empty state ("No zone stats yet") rather than creating a blank/incomplete row. Then change zones — confirm a row appears after fighting.

- [ ] **Step 3: Commit**

```bash
git add modules/dps-coach.js
git commit -m "feat(dps-coach): guard zone tracking until set-zone has fired"
```

---

## Task 6: Update renderZonesTab

**Files:**
- Modify: `modules/dps-coach.js`

- [ ] **Step 1: Replace the table in `renderZonesTab`**

Find `renderZonesTab` (around line 2734). Replace the entire `${rows.length ? \`...\` : ...}` block with:

```js
      ${rows.length ? `
        <table class="dps-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Zone</th>
              <th>Monster</th>
              <th>Hunt All</th>
              <th>XP/hr</th>
              <th>Gold/hr</th>
              <th>Shards/hr</th>
              <th>Kills/hr</th>
              <th>Deaths</th>
              <th>Accuracy</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => {
                const accuracy = getZoneAccuracy(row);
                const name = formatZoneNameForDisplay(row);
                const isCurrent = row.key === currentKey;
                const huntAllLabel = row.huntAll ? "Yes" : "No";

                return `
                  <tr>
                    <td>${escapeHtml(formatZoneTrackedTime(row))}</td>
                    <td>${isCurrent ? "▶ " : ""}${escapeHtml(name)}</td>
                    <td>${escapeHtml(row.monsterName || "—")}</td>
                    <td>${escapeHtml(huntAllLabel)}</td>
                    <td class="dps-blue">${formatNumber(getZoneRate(row, "xp"))}</td>
                    <td class="dps-warn">${formatNumber(getZoneRate(row, "gold"))}</td>
                    <td class="dps-purple">${formatNumber(getZoneRate(row, "shards"))}</td>
                    <td>${formatNumber(getZoneRate(row, "kills"))}</td>
                    <td class="${Number(row.deaths || 0) > 0 ? "dps-bad" : ""}">${formatNumber(row.deaths)}</td>
                    <td class="${accuracy >= 90 ? "dps-good" : accuracy >= 75 ? "dps-warn" : accuracy > 0 ? "dps-bad" : "dps-muted"}">${pct(accuracy)}</td>
                  </tr>
                `;
            }).join("")}
          </tbody>
        </table>
      ` : `<div class="dps-muted">No zone stats yet. Change your zone or monster to start tracking.</div>`}
```

- [ ] **Step 2: Manual smoke test**

Open the Zones tab. Verify column order: Time, Zone, Monster, Hunt All, XP/hr, Gold/hr, Shards/hr, Kills/hr, Deaths, Accuracy. Verify "Last seen" is gone. Verify monster name displays correctly (e.g. "Rogue Soldier"). Verify Hunt All shows "Yes" or "No". Verify the "▶" marker appears on the active row.

- [ ] **Step 3: Commit**

```bash
git add modules/dps-coach.js
git commit -m "feat(dps-coach): update Zones tab columns to include Monster and Hunt All"
```

---

## Task 7: Update copyZoneStats

**Files:**
- Modify: `modules/dps-coach.js`

- [ ] **Step 1: Add Monster and Hunt All to copy format**

Find `copyZoneStats` (around line 2795). The `rows.map` block currently builds a line per row. Replace the inner `.map` callback:

```js
                ? [
                    "VoidIdle DPS Coach Zone History",
                    ...rows.map((row) => {
                        const name = formatZoneNameForDisplay(row);
                        return [
                            name,
                            row.monsterName ? `Monster ${row.monsterName}` : "",
                            `Hunt All ${row.huntAll ? "Yes" : "No"}`,
                            `Time ${formatZoneTrackedTime(row)}`,
                            `XP/hr ${formatNumber(getZoneRate(row, "xp"))}`,
                            `Gold/hr ${formatNumber(getZoneRate(row, "gold"))}`,
                            `Shards/hr ${formatNumber(getZoneRate(row, "shards"))}`,
                            `Kills/hr ${formatNumber(getZoneRate(row, "kills"))}`,
                            `Deaths ${formatNumber(row.deaths)}`,
                            `Accuracy ${pct(getZoneAccuracy(row))}`,
                        ].filter(Boolean).join(" | ");
                    }),
                ].join("\n")
```

- [ ] **Step 2: Manual smoke test**

Click "Copy Zones" in the Zones tab. Paste into a text editor. Verify each line contains the monster name and Hunt All field.

- [ ] **Step 3: Commit**

```bash
git add modules/dps-coach.js
git commit -m "feat(dps-coach): include Monster and Hunt All in zone stats copy output"
```

---

## Task 8: End-to-end verification

- [ ] **Step 1: Full session test**

1. Reload the game page fresh (no prior v5 storage).
2. Confirm Zones tab shows "No zone stats yet."
3. Change your zone and monster using the game UI — this fires `set-zone`.
4. Fight for ~2 minutes.
5. Open the Zones tab. Confirm one row appears with correct Zone, Monster, Hunt All, and rate values.
6. Switch to Hunt All mode for the same monster. Fight for ~1 minute.
7. Confirm a **second** row appears (same zone + monster, different Hunt All).
8. Switch to a different monster. Fight for ~1 minute.
9. Confirm a **third** row appears.
10. Reload the page. Confirm all three rows persist (localStorage restored).

- [ ] **Step 2: Edge case — page load without zone change**

Reload the page and fight without changing zones. Confirm the Zones tab remains empty (no row with blank monster). After changing zones once, confirm tracking resumes.

- [ ] **Step 3: Clear zones test**

Click "Clear Zones". Confirm all rows disappear and localStorage v5 key is cleared.

- [ ] **Step 4: Final commit if any cleanup needed**

```bash
git add modules/dps-coach.js
git commit -m "fix(dps-coach): zone tracking cleanup after e2e verification"
```
