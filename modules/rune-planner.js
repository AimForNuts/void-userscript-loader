(function () {
  'use strict';

  function createRunePlannerModule(definition) {
    const RUNE_CATEGORIES = [
      {
        label: "Weapon Runes",
        accent: "#e07b54",
        dimBg: "#1f140f",
        runes: [
          { name: "Sharpened", stat: "+ATK" },
          { name: "Precise", stat: "+Crit%" },
          { name: "Brutal", stat: "+CritDmg%" },
          { name: "Swift", stat: "+CDR%" },
          { name: "Vampiric", stat: "+Lifesteal%" },
          { name: "Arcane", stat: "+Healing" },
        ],
      },
      {
        label: "Armor Runes",
        accent: "#4fc3f7",
        dimBg: "#0d1820",
        runes: [
          { name: "Fortified", stat: "+DEF" },
          { name: "Resilient", stat: "+HP" },
          { name: "Warding", stat: "+Mana" },
          { name: "Regenerating", stat: "+HP Regen" },
          { name: "Absorbing", stat: "+Dmg Reduction%" },
          { name: "Thorned", stat: "+Thorns" },
        ],
      },
      {
        label: "Accessories Runes",
        accent: "#f9d857",
        dimBg: "#1a1900",
        runes: [
          { name: "Prosperous", stat: "+Gold%" },
          { name: "Enlightened", stat: "+XP%" },
          { name: "Wise", stat: "+Mana" },
          { name: "Energized", stat: "+Mana Regen" },
          { name: "Lucky", stat: "+Loot%" },
          { name: "Efficient", stat: "+CDR%" },
        ],
      },
    ];

    const MAX_TIER = 4;
    const TIER_COLORS = ["#888", "#7ec8e3", "#a78bfa", "#f472b6"];
    const STORAGE_KEY = "voididle.runePlanner.counts.v1";
    const TAB_KEY = "voididle.runePlanner.tab.v1";
    const PARTY_KEY = "voididle.runePlanner.party.v1";
    const PARTY_TIER_KEY = "voididle.runePlanner.partyTier.v1";
    const CRAFTING_KEY = "voididle.partyPlannerRunes.crafting.v1";
    const CRAFTING_AT_KEY = "voididle.partyPlannerRunes.craftingAt.v1";
    const INVENTORY_KEY = "voididle.partyPlannerRunes.inventory.v1";
    const INVENTORY_AT_KEY = "voididle.partyPlannerRunes.scannedAt.v1";
    const DEBUG_CRAFTING_KEY = "voididle.partyPlannerRunes.debugCraftingResponse.v1";
    const RESOURCE_IDS = new Set([
      "beast_hide",
      "spirit_essence",
      "storm_essence",
      "shadow_essence",
      "dragon_scale",
      "demon_fang",
      "void_essence",
      "celestial_essence",
      "dao_fragment",
      "elemental_core",
    ]);

    const MATERIAL_ALIASES = {
      "Bamboo": "bamboo", "Ironwood": "ironwood", "Spiritwood": "spiritwood", "Ashwood": "ashwood", "Duskwood": "duskwood", "Elderwood": "elderwood",
      "Bamboo Plank": "bamboo_plank", "Ironwood Plank": "ironwood_plank", "Spiritwood Plank": "spiritwood_plank", "Ashwood Plank": "ashwood_plank", "Duskwood Plank": "duskwood_plank", "Elderwood Plank": "elderwood_plank",
      "Copper Ore": "copper_ore", "Iron Ore": "iron_ore", "Mithril Ore": "mithril_ore", "Adamantite Ore": "adamantite_ore", "Starmetal Ore": "starmetal_ore", "Celestial Ore": "celestial_ore",
      "Copper Ingot": "copper_ingot", "Iron Ingot": "iron_ingot", "Mithril Ingot": "mithril_ingot", "Adamantite Ingot": "adamantite_ingot", "Starmetal Ingot": "starmetal_ingot", "Celestial Ingot": "celestial_ingot",
      "Spirit Herb": "spirit_herb", "Jade Lotus": "jade_lotus", "Phoenix Bloom": "phoenix_bloom", "Moonpetal": "moonpetal", "Voidbloom": "voidbloom", "Dragon Root": "dragon_root",
      "Herb Extract": "herb_extract", "Lotus Extract": "lotus_extract", "Phoenix Extract": "phoenix_extract", "Moonpetal Extract": "moonpetal_extract", "Voidbloom Extract": "voidbloom_extract", "Dragon Extract": "dragon_extract",
      "Beast Hide": "beast_hide", "Monster Bone": "monster_bone", "Spirit Essence": "spirit_essence", "Storm Essence": "storm_essence", "Elemental Core": "elemental_core", "Shadow Essence": "shadow_essence", "Dragon Scale": "dragon_scale", "Demon Fang": "demon_fang", "Void Essence": "void_essence", "Celestial Essence": "celestial_essence", "Dao Fragment": "dao_fragment", "Dao Crystal": "dao_crystal",
    };

    const PARTY_ITEMS = {
      "Armor Runes": ["Shoulders", "Helmet", "Chest", "Hands", "Legs", "Boots"],
      "Accessories Runes": ["Amulet", "Ring 1", "Ring 2"],
      "Weapon Runes": ["Weapon", "Off Hand"],
    };

    const state = {
      tab: localStorage.getItem(TAB_KEY) === "party" ? "party" : "manual",
      counts: createEmptyCounts(),
      party: loadPartySettings(),
      partyTier: Math.min(MAX_TIER, Math.max(1, Number(localStorage.getItem(PARTY_TIER_KEY) || 1))),
      inventory: loadJSON(INVENTORY_KEY, {}),
      crafting: loadJSON(CRAFTING_KEY, null),
      lastCopiedAt: null,
      lastMessage: "",
      lastMessageColor: "#69f0ae",
      updateQueued: false,
    };

    function createEmptyCounts() {
      const counts = {};
      for (const cat of RUNE_CATEGORIES) {
        for (const rune of cat.runes) {
          counts[rune.name] = {};
          for (let tier = 1; tier <= MAX_TIER; tier += 1) {
            counts[rune.name][tier] = 0;
          }
        }
      }
      return counts;
    }

    function createDefaultPartySettings() {
      return {
        players: Array.from({ length: 4 }, (_, index) => {
          const player = {
            name: `Player ${index + 1}`,
            slots: {},
            priorities: {},
          };
          for (const cat of RUNE_CATEGORIES) {
            player.slots[cat.label] = {};
            player.priorities[cat.label] = {};
            for (const item of PARTY_ITEMS[cat.label] || []) {
              player.slots[cat.label][item] = 0;
            }
            cat.runes.forEach((rune, runeIndex) => {
              player.priorities[cat.label][rune.name] = runeIndex + 1;
            });
          }
          return player;
        }),
      };
    }

    function normalizePartySettings(saved) {
      const fresh = createDefaultPartySettings();
      const players = Array.isArray(saved?.players) ? saved.players : [];
      fresh.players.forEach((player, playerIndex) => {
        const savedPlayer = players[playerIndex] || {};
        player.name = clean(savedPlayer.name || player.name);
        for (const cat of RUNE_CATEGORIES) {
          for (const item of PARTY_ITEMS[cat.label] || []) {
            const value = Number(savedPlayer.slots?.[cat.label]?.[item] ?? player.slots[cat.label][item]);
            player.slots[cat.label][item] = Math.min(5, Math.max(0, Math.floor(value || 0)));
          }
          for (const rune of cat.runes) {
            const value = Number(savedPlayer.priorities?.[cat.label]?.[rune.name] ?? player.priorities[cat.label][rune.name]);
            player.priorities[cat.label][rune.name] = Math.min(cat.runes.length, Math.max(0, Math.floor(value || 0)));
          }
        }
      });
      return fresh;
    }

    function loadPartySettings() {
      return normalizePartySettings(loadJSON(PARTY_KEY, null));
    }

    function savePartySettings() {
      saveJSON(PARTY_KEY, state.party);
    }

    function loadCounts() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw);
        if (!saved || typeof saved !== "object") return;
        const fresh = createEmptyCounts();
        for (const [runeName, tiers] of Object.entries(saved)) {
          if (!fresh[runeName] || !tiers || typeof tiers !== "object") continue;
          for (let tier = 1; tier <= MAX_TIER; tier += 1) {
            fresh[runeName][tier] = Math.max(0, Number(tiers[tier] || 0));
          }
        }
        state.counts = fresh;
      } catch {
        state.counts = createEmptyCounts();
      }
    }

    function saveCounts() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.counts));
      } catch (err) {
        console.warn("[VoidIdle Rune Planner] Could not save counts", err);
      }
    }

    function loadJSON(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch {
        return fallback;
      }
    }

    function saveJSON(key, value) {
      localStorage.setItem(key, JSON.stringify(value));
    }

    function clean(value) {
      return String(value ?? "").replace(/\s+/g, " ").trim();
    }

    function norm(value) {
      return clean(value).toLowerCase().replace(/['']/g, "").replace(/&amp;/g, "&").replace(/[^a-z0-9]+/g, " ").trim();
    }

    function slug(value) {
      return norm(value).replace(/\s+/g, "_");
    }

    function escapeHtml(value) {
      return String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      }[char]));
    }

    function formatTime(ts) {
      if (!ts) return "—";
      return new Date(ts).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    }

    function formatDateTime(value) {
      if (!value) return "never";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return String(value);
      return date.toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }

    function fmt(value) {
      const number = Number(value || 0);
      if (!Number.isFinite(number)) return String(value);
      if (Math.abs(number) >= 1000) return Math.ceil(number).toLocaleString();
      return String(Math.ceil(number * 100) / 100);
    }

    function text(el) {
      return clean(el?.textContent || "");
    }

    function num(value) {
      let raw = String(value ?? "").trim().replace(/,/g, "");
      if (!raw || raw === "-" || raw === "â€”") return 0;
      const mult = /k$/i.test(raw) ? 1000 : /m$/i.test(raw) ? 1000000 : /b$/i.test(raw) ? 1000000000 : 1;
      raw = raw.replace(/[kmb]$/i, "");
      const number = Number(raw);
      return Number.isFinite(number) ? number * mult : 0;
    }

    function materialIdFromName(name) {
      if (!name) return "";
      if (MATERIAL_ALIASES[name]) return MATERIAL_ALIASES[name];
      const normalized = norm(name);
      for (const [label, id] of Object.entries(MATERIAL_ALIASES)) {
        if (norm(label) === normalized) return id;
      }
      return slug(name);
    }

    function displayName(id) {
      if (!id) return "";
      const found = Object.entries(MATERIAL_ALIASES).find(([, aliasId]) => aliasId === id);
      return found?.[0] || String(id).replace(/_/g, " ").replace(/\b[a-z]/g, (char) => char.toUpperCase());
    }

    function addTo(map, id, qty) {
      if (!id || !qty) return;
      map[id] = (map[id] || 0) + qty;
    }

    function mergeInto(dst, src, mult = 1) {
      Object.entries(src || {}).forEach(([id, qty]) => addTo(dst, id, Number(qty || 0) * mult));
    }

    function getCount(runeName, tier, counts = state.counts) {
      return Number(counts?.[runeName]?.[tier] || 0);
    }

    function setCount(runeName, tier, value) {
      if (!state.counts[runeName]) state.counts[runeName] = {};
      state.counts[runeName][tier] = Math.max(0, Number(value || 0));
      saveCounts();
    }

    function changeCount(runeName, tier, delta) {
      setCount(runeName, tier, getCount(runeName, tier) + delta);
    }

    function addRuneCount(counts, runeName, tier, qty = 1) {
      if (!counts[runeName]) counts[runeName] = {};
      counts[runeName][tier] = Math.max(0, Number(counts[runeName][tier] || 0) + qty);
    }

    function getPartyCounts() {
      const counts = createEmptyCounts();
      const tier = Math.min(MAX_TIER, Math.max(1, Number(state.partyTier || 1)));
      for (const player of state.party.players || []) {
        for (const cat of RUNE_CATEGORIES) {
          const priorities = player.priorities?.[cat.label] || {};
          for (const item of PARTY_ITEMS[cat.label] || []) {
            const slots = Math.min(5, Math.max(0, Math.floor(Number(player.slots?.[cat.label]?.[item] || 0))));
            if (slots <= 0) continue;
            for (const rune of cat.runes) {
              const priority = Number(priorities[rune.name] || 0);
              if (priority > 0 && priority <= slots) {
                addRuneCount(counts, rune.name, tier, 1);
              }
            }
          }
        }
      }
      return counts;
    }

    function getActiveCounts() {
      return state.tab === "party" ? getPartyCounts() : state.counts;
    }

    function getStoredAuthToken() {
      const stores = [localStorage, sessionStorage];
      const preferred = ["token", "authToken", "jwt", "accessToken", "voididle_token", "voididle.auth", "auth"];
      for (const store of stores) {
        for (const key of preferred) {
          const token = readPossibleToken(store.getItem(key));
          if (token) return token;
        }
        for (let i = 0; i < store.length; i += 1) {
          const token = readPossibleToken(store.getItem(store.key(i)));
          if (token) return token;
        }
      }
      return "";
    }

    function readPossibleToken(value) {
      if (!value) return "";
      const raw = String(value).trim();
      if (/^Bearer\s+eyJ/.test(raw)) return raw.replace(/^Bearer\s+/i, "");
      if (/^eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/.test(raw)) return raw;
      try {
        const parsed = JSON.parse(raw);
        for (const key of ["token", "authToken", "jwt", "accessToken"]) {
          const nested = readPossibleToken(parsed?.[key]);
          if (nested) return nested;
        }
      } catch {}
      return "";
    }

    function authHeaders() {
      const token = getStoredAuthToken();
      if (!token) return null;
      return { accept: "*/*", "content-type": "application/json", authorization: "Bearer " + token };
    }

    async function apiGet(url) {
      const headers = authHeaders();
      if (!headers) throw new Error("Could not find auth token in localStorage/sessionStorage.");
      const res = await fetch(url, { method: "GET", credentials: "include", cache: "no-store", headers });
      if (!res.ok) throw new Error("HTTP " + res.status + " for " + url);
      const data = await res.json();
      if (String(url).includes("/api/crafting")) {
        window.__vilLastCraftingRequest = { url, status: res.status, capturedAt: new Date().toISOString(), response: data };
        saveJSON(DEBUG_CRAFTING_KEY, window.__vilLastCraftingRequest);
        console.log("VoidIdle /api/crafting sniffed response:", window.__vilLastCraftingRequest);
      }
      return data;
    }

    function getCraftingRecipes() {
      const recipes = [];
      const professions = state.crafting?.professions || {};
      Object.entries(professions).forEach(([profession, info]) => {
        (info.recipes || []).forEach((recipe) => recipes.push({ ...recipe, profession: recipe.profession || profession }));
      });
      return recipes;
    }

    function getRuneRecipes() {
      return getCraftingRecipes().filter((recipe) => recipe?.result?.type === "rune");
    }

    function directMaterials(recipe) {
      const out = {};
      Object.entries(recipe?.materials || {}).forEach(([id, qty]) => addTo(out, id, Number(qty || 0)));
      return out;
    }

    function recipeRuneName(recipe) {
      const result = recipe?.result || {};
      return clean(result.name || recipe.name || "").replace(/\brune\b/ig, "");
    }

    function findRuneRecipe(runeName, tier) {
      const wanted = norm(runeName);
      const wantedTier = Number(tier);
      return getRuneRecipes().find((recipe) => {
        const recipeTier = Number(recipe.tier || recipe.result?.tier || 0);
        if (recipeTier !== wantedTier) return false;
        const recipeName = norm(recipeRuneName(recipe));
        return recipeName === wanted || recipeName.includes(wanted) || norm(recipe.id || "").includes(wanted);
      }) || null;
    }

    function selectedRunePlan(counts = getActiveCounts()) {
      const processed = {};
      const selections = [];
      const missingRecipes = [];
      for (const cat of RUNE_CATEGORIES) {
        for (const rune of cat.runes) {
          for (let tier = 1; tier <= MAX_TIER; tier += 1) {
            const qty = getCount(rune.name, tier, counts);
            if (qty <= 0) continue;
            const recipe = findRuneRecipe(rune.name, tier);
            if (!recipe) {
              missingRecipes.push(`${rune.name} T${tier}`);
              continue;
            }
            const mats = directMaterials(recipe);
            mergeInto(processed, mats, qty);
            selections.push({ id: recipe.id, name: recipe.name, tier, qty, materials: mats });
          }
        }
      }
      return {
        selections,
        processed,
        missingRecipes,
      };
    }

    async function loadCrafting(app) {
      try {
        showMessage(app, "Loading crafting data...", "#c9b8ff");
        state.crafting = await apiGet("/api/crafting");
        window.__vilLastCraftingResponse = state.crafting;
        saveJSON(CRAFTING_KEY, state.crafting);
        localStorage.setItem(CRAFTING_AT_KEY, new Date().toISOString());
        showMessage(app, `Crafting cached: ${getRuneRecipes().length} rune recipes`, "#69f0ae");
      } catch (err) {
        showMessage(app, "Crafting load failed: " + (err.message || err), "#ffa726");
      }
    }

    function scanInventory(app) {
      const out = {};
      const rows = document.querySelectorAll(".inv-resources .res-row, .res-row.sellable");
      for (const row of rows) {
        const name = text(row.querySelector(".res-name"));
        const qtyEl = row.querySelector(".res-qty");
        const qty = num(qtyEl?.getAttribute("title") || text(qtyEl));
        const id = materialIdFromName(name);
        if (id && Number.isFinite(qty)) out[id] = qty;
      }
      state.inventory = out;
      saveJSON(INVENTORY_KEY, out);
      localStorage.setItem(INVENTORY_AT_KEY, new Date().toISOString());
      showMessage(app, `Scanned ${Object.keys(out).length} inventory items`, "#69f0ae");
    }

    function getSelectedLines(counts = getActiveCounts()) {
      const lines = [];
      for (const cat of RUNE_CATEGORIES) {
        for (const rune of cat.runes) {
          const parts = [];
          for (let tier = 1; tier <= MAX_TIER; tier += 1) {
            const count = getCount(rune.name, tier, counts);
            if (count > 0) {
              parts.push(`t${tier} x ${count}`);
            }
          }
          if (parts.length > 0) {
            lines.push(`${rune.name} rune ${parts.join(" / ")}`);
          }
        }
      }
      return lines;
    }

    function getResourceLines(plan) {
      return Object.keys(plan?.processed || {})
        .filter((id) => RESOURCE_IDS.has(id))
        .sort((a, b) => displayName(a).localeCompare(displayName(b)))
        .map((id) => `${id} x ${fmt(plan.processed[id])}`);
    }

    function getSelectedTotal(counts = getActiveCounts()) {
      let total = 0;
      for (const cat of RUNE_CATEGORIES) {
        for (const rune of cat.runes) {
          for (let tier = 1; tier <= MAX_TIER; tier += 1) {
            total += getCount(rune.name, tier, counts);
          }
        }
      }
      return total;
    }

    function showMessage(app, message, color = "#69f0ae") {
      state.lastMessage = message;
      state.lastMessageColor = color;
      renderIntoPanel(app);
      setTimeout(() => {
        if (state.lastMessage === message) {
          state.lastMessage = "";
          renderIntoPanel(app);
        }
      }, 2200);
    }

    async function copyText(text) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        try {
          const textarea = document.createElement("textarea");
          textarea.value = text;
          textarea.style.cssText = "position:fixed;left:-9999px;top:-9999px";
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand("copy");
          textarea.remove();
          return true;
        } catch {
          console.log(text);
          return false;
        }
      }
    }

    async function exportToClipboard(app) {
      const lines = getSelectedLines();
      if (!lines.length) {
        showMessage(app, "⚠ Nothing selected", "#ffa726");
        return;
      }
      const resourceLines = getResourceLines(selectedRunePlan());
      const copied = await copyText([
        "Runes:",
        ...lines,
        "",
        "Resources:",
        ...(resourceLines.length ? resourceLines : ["None"]),
      ].join("\n"));
      if (copied) {
        state.lastCopiedAt = Date.now();
        showMessage(app, "✓ Copied!", "#69f0ae");
      } else {
        showMessage(app, "⚠ Copy failed; printed to console", "#ffa726");
      }
    }

    function resetAll(app) {
      if (state.tab === "party") {
        state.party = createDefaultPartySettings();
        state.partyTier = 1;
        savePartySettings();
        localStorage.setItem(PARTY_TIER_KEY, String(state.partyTier));
        showMessage(app, "Reset party rune plan", "#ffa726");
        return;
      }
      state.counts = createEmptyCounts();
      saveCounts();
      showMessage(app, "Reset all rune counts", "#ffa726");
    }

    function materialRows(map, showHave) {
      const keys = Object.keys(map || {})
        .filter((id) => RESOURCE_IDS.has(id))
        .sort((a, b) => displayName(a).localeCompare(displayName(b)));
      if (!keys.length) {
        return `<tr><td colspan="${showHave ? 4 : 2}" class="rp-muted">None</td></tr>`;
      }
      return keys.map((id) => {
        const need = Number(map[id] || 0);
        const have = Number(state.inventory?.[id] || 0);
        const missing = Math.max(0, need - have);
        return `
          <tr>
            <td>
              <div class="rp-mat-name">${escapeHtml(displayName(id))}</div>
              <div class="rp-mat-id">${escapeHtml(id)}</div>
            </td>
            <td>${escapeHtml(fmt(need))}</td>
            ${showHave ? `<td>${escapeHtml(fmt(have))}</td><td>${missing ? `<span class="rp-warn">${escapeHtml(fmt(missing))}</span>` : `<span class="rp-good">0</span>`}</td>` : ""}
          </tr>
        `;
      }).join("");
    }

    function renderResourcePanel(plan) {
      const craftingAt = localStorage.getItem(CRAFTING_AT_KEY);
      const inventoryAt = localStorage.getItem(INVENTORY_AT_KEY);
      const hasCrafting = !!state.crafting;
      const missingText = plan.missingRecipes.length
        ? `<div class="rp-muted" style="margin-top:7px;">Missing recipes: ${escapeHtml(plan.missingRecipes.join(", "))}</div>`
        : "";

      return `
        <div class="rp-summary">
          <div class="rp-resource-head">
            <div>
              <div class="rp-resource-title">Resources</div>
              <div class="rp-muted">Crafting: ${escapeHtml(formatDateTime(craftingAt))} | Inventory: ${escapeHtml(formatDateTime(inventoryAt))}</div>
            </div>
            <div class="rp-actions">
              <button type="button" class="vim-btn vim-btn-primary" data-rp-load-crafting>Load Crafting</button>
              <button type="button" class="vim-btn" data-rp-scan-inventory>Scan Inventory</button>
            </div>
          </div>

          ${hasCrafting ? "" : `<div class="rp-muted">Load crafting data once so the planner can match selected runes to recipes.</div>`}
          ${missingText}

          <div class="rp-scroll">
            <table class="rp-table">
              <thead><tr><th>Material</th><th>Need</th><th>Have</th><th>Missing</th></tr></thead>
              <tbody>${materialRows(plan.processed, true)}</tbody>
            </table>
          </div>
        </div>
      `;
    }

    function renderStyles() {
      return `
      <style>
        .rp-wrap {
          color:#cdd6f4;
          font-family:Arial, sans-serif;
          font-size:12px;
        }

        .rp-head {
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:10px;
          margin-bottom:10px;
          padding:10px;
          border-radius:10px;
          background:rgba(124,111,205,0.10);
          border:1px solid rgba(124,111,205,0.25);
        }

        .rp-title {
          font-weight:800;
          font-size:14px;
          color:#c9b8ff;
          margin-bottom:3px;
        }

        .rp-muted {
          color:rgba(229,231,235,0.58);
        }

        .rp-actions {
          display:flex;
          gap:6px;
          flex-wrap:wrap;
          justify-content:flex-end;
        }

        .rp-tabs {
          display:grid;
          grid-template-columns:1fr 1fr;
          gap:6px;
          margin-bottom:10px;
        }

        .rp-tab {
          background:#101826;
          border:1px solid rgba(255,255,255,0.10);
          color:#cdd6f4;
          border-radius:8px;
          padding:7px 9px;
          font-weight:800;
          cursor:pointer;
        }

        .rp-tab.active {
          background:rgba(124,111,205,0.32);
          border-color:rgba(201,184,255,0.55);
          color:#fff;
        }

        .rp-toast {
          margin-top:8px;
          min-height:16px;
          font-size:12px;
          font-weight:800;
        }

        .rp-section {
          margin-bottom:12px;
          border-radius:10px;
          overflow:hidden;
          border:1px solid rgba(255,255,255,0.08);
          background:rgba(255,255,255,0.035);
        }

        .rp-section-title {
          font-size:11px;
          font-weight:800;
          text-transform:uppercase;
          letter-spacing:.08em;
          padding:8px 10px;
          display:flex;
          align-items:center;
          gap:8px;
        }

        .rp-dot {
          width:8px;
          height:8px;
          border-radius:50%;
          flex-shrink:0;
        }

        .rp-table {
          width:100%;
          border-collapse:collapse;
        }

        .rp-table th {
          text-align:center;
          font-size:11px;
          font-weight:800;
          padding:6px 4px;
          white-space:nowrap;
          background:rgba(0,0,0,0.24);
        }

        .rp-table th:first-child {
          text-align:left;
          padding-left:10px;
          min-width:190px;
          color:rgba(229,231,235,0.45);
        }

        .rp-table th.rp-tier-hdr {
          min-width:78px;
        }

        .rp-table td {
          padding:5px 4px;
          text-align:center;
          vertical-align:middle;
          border-top:1px solid rgba(255,255,255,0.055);
        }

        .rp-table td:first-child {
          text-align:left;
          padding-left:10px;
          padding-right:8px;
          white-space:nowrap;
        }

        .rp-table tr:hover td {
          background:rgba(255,255,255,0.03);
        }

        .rp-rune-name {
          font-weight:800;
          font-size:12px;
        }

        .rp-rune-stat {
          font-size:10px;
          opacity:.58;
          margin-left:5px;
        }

        .rp-cell {
          display:inline-flex;
          align-items:center;
          justify-content:center;
          gap:3px;
        }

        .rp-minus,
        .rp-plus {
          width:23px;
          height:23px;
          border-radius:6px;
          border:1px solid rgba(255,255,255,0.10);
          background:rgba(255,255,255,0.055);
          color:#aaa;
          font-size:15px;
          line-height:1;
          cursor:pointer;
          padding:0;
          display:flex;
          align-items:center;
          justify-content:center;
        }

        .rp-plus:hover {
          background:rgba(74,222,128,0.12);
          border-color:rgba(74,222,128,0.55);
          color:#69f0ae;
        }

        .rp-minus:hover {
          background:rgba(248,113,113,0.12);
          border-color:rgba(248,113,113,0.55);
          color:#ef9a9a;
        }

        .rp-count {
          min-width:24px;
          text-align:center;
          font-size:12px;
          color:rgba(229,231,235,0.42);
          font-weight:800;
          border-radius:5px;
          padding:2px 4px;
        }

        .rp-count.nonzero {
          color:#fff;
          background:rgba(124,111,205,0.42);
        }

        .rp-summary {
          margin-top:10px;
          padding:9px;
          border-radius:10px;
          background:rgba(255,255,255,0.04);
          border:1px solid rgba(255,255,255,0.08);
        }

        .rp-pre {
          white-space:pre-wrap;
          color:rgba(229,231,235,0.82);
          font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
          font-size:11px;
          line-height:1.35;
          max-height:160px;
          overflow:auto;
          background:rgba(0,0,0,0.20);
          border-radius:8px;
          padding:8px;
          margin-top:8px;
        }

        .rp-input,
        .rp-select {
          background:#050b17;
          color:#f4f8ff;
          border:1px solid rgba(255,255,255,0.12);
          border-radius:7px;
          padding:5px 6px;
          font-size:12px;
        }

        .rp-input {
          width:100%;
          box-sizing:border-box;
        }

        .rp-select {
          min-width:54px;
        }

        .rp-player-head {
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:8px;
          padding:8px 10px;
          background:rgba(0,0,0,0.22);
        }

        .rp-player-name {
          max-width:190px;
        }

        .rp-party-grid {
          display:grid;
          grid-template-columns:1fr;
          gap:8px;
        }

        .rp-party-block {
          padding:8px 10px 10px;
          border-top:1px solid rgba(255,255,255,0.06);
        }

        .rp-party-label {
          font-size:11px;
          font-weight:800;
          text-transform:uppercase;
          letter-spacing:.08em;
          color:rgba(229,231,235,0.64);
          margin-bottom:6px;
        }

        .rp-slot-grid,
        .rp-priority-grid {
          display:grid;
          grid-template-columns:repeat(auto-fit,minmax(112px,1fr));
          gap:6px;
        }

        .rp-field {
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:6px;
          min-height:30px;
          color:rgba(229,231,235,0.82);
        }

        .rp-field span {
          min-width:0;
          overflow:hidden;
          text-overflow:ellipsis;
          white-space:nowrap;
        }

        .rp-resource-head {
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:10px;
          flex-wrap:wrap;
          margin-bottom:7px;
        }

        .rp-resource-title {
          font-weight:800;
          color:#e5e7eb;
        }

        .rp-scroll {
          max-height:220px;
          overflow:auto;
          border:1px solid rgba(255,255,255,0.06);
          border-radius:8px;
          margin-top:8px;
        }

        .rp-mat-name {
          font-weight:700;
          color:rgba(229,231,235,0.86);
        }

        .rp-mat-id {
          font-size:10px;
          color:rgba(229,231,235,0.40);
          margin-top:2px;
        }

        .rp-good {
          color:#69f0ae;
          font-weight:800;
        }

        .rp-warn {
          color:#ffa726;
          font-weight:800;
        }
      </style>
    `;
    }

    function render() {
      const counts = getActiveCounts();
      const selectedLines = getSelectedLines(counts);
      const selectedTotal = getSelectedTotal(counts);
      const plan = selectedRunePlan(counts);

      return `
      ${renderStyles()}

      <div class="rp-wrap">
        <div class="rp-head">
          <div>
            <div class="rp-title">◈ Rune Planner</div>
            <div class="rp-muted">Plan rune loadouts by type and tier, then copy the list for Discord or notes.</div>
            <div class="rp-toast" style="color:${escapeHtml(state.lastMessageColor)};">${escapeHtml(state.lastMessage)}</div>
          </div>

          <div class="rp-actions">
            <button type="button" class="vim-btn vim-btn-primary" data-rp-export>📋 Copy</button>
            <button type="button" class="vim-btn" data-rp-reset>Reset</button>
          </div>
        </div>

        <div class="rp-tabs">
          ${renderTabButton("manual", "Manual Counts")}
          ${renderTabButton("party", "Party Priorities")}
        </div>

        ${state.tab === "party" ? renderPartyBody() : renderManualBody()}

        ${renderResourcePanel(plan)}

        <div class="rp-summary">
          <div><b>Selected:</b> ${selectedTotal} rune${selectedTotal === 1 ? "" : "s"}</div>
          <div class="rp-muted">Last copied: ${escapeHtml(formatTime(state.lastCopiedAt))}</div>

          ${
            selectedLines.length
              ? `<div class="rp-pre">${escapeHtml(selectedLines.join("\n"))}</div>`
              : `<div class="rp-muted" style="margin-top:8px;">No runes selected yet.</div>`
          }
        </div>
      </div>
    `;
    }

    function renderTabButton(id, label) {
      return `<button type="button" class="rp-tab${state.tab === id ? " active" : ""}" data-rp-tab="${escapeHtml(id)}">${escapeHtml(label)}</button>`;
    }

    function renderManualBody() {
      return RUNE_CATEGORIES.map(renderCategory).join("");
    }

    function renderPartyBody() {
      const tierOptions = Array.from({ length: MAX_TIER }, (_, index) => {
        const tier = index + 1;
        return `<option value="${tier}"${Number(state.partyTier) === tier ? " selected" : ""}>T${tier}</option>`;
      }).join("");

      return `
        <div class="rp-summary">
          <div class="rp-resource-head">
            <div>
              <div class="rp-resource-title">Party Priorities</div>
              <div class="rp-muted">Each item uses priorities up to its slot count. Priority 0 skips that rune.</div>
            </div>
            <label class="rp-field" style="min-width:110px;">
              <span>Rune tier</span>
              <select class="rp-select" data-rp-party-tier>${tierOptions}</select>
            </label>
          </div>
        </div>
        <div class="rp-party-grid">
          ${(state.party.players || []).map((player, index) => renderPlayerCard(player, index)).join("")}
        </div>
      `;
    }

    function renderPlayerCard(player, playerIndex) {
      return `
        <div class="rp-section">
          <div class="rp-player-head">
            <input
              class="rp-input rp-player-name"
              data-rp-party-name="${playerIndex}"
              value="${escapeHtml(player.name)}"
              aria-label="Player ${playerIndex + 1} name"
            >
            <span class="rp-muted">Player ${playerIndex + 1}</span>
          </div>
          ${RUNE_CATEGORIES.map((cat) => renderPlayerCategory(player, playerIndex, cat)).join("")}
        </div>
      `;
    }

    function renderPlayerCategory(player, playerIndex, cat) {
      const slotFields = (PARTY_ITEMS[cat.label] || []).map((item) => {
        const value = Number(player.slots?.[cat.label]?.[item] || 0);
        return `
          <label class="rp-field">
            <span>${escapeHtml(item)}</span>
            <select class="rp-select" data-rp-party-slot="${playerIndex}" data-rp-category="${escapeHtml(cat.label)}" data-rp-item="${escapeHtml(item)}">
              ${renderNumberOptions(0, 5, value)}
            </select>
          </label>
        `;
      }).join("");

      const priorityFields = cat.runes.map((rune) => {
        const value = Number(player.priorities?.[cat.label]?.[rune.name] || 0);
        return `
          <label class="rp-field">
            <span title="${escapeHtml(rune.name)} ${escapeHtml(rune.stat)}">${escapeHtml(rune.stat.replace(/^\+/, ""))}</span>
            <select class="rp-select" data-rp-party-priority="${playerIndex}" data-rp-category="${escapeHtml(cat.label)}" data-rp-rune="${escapeHtml(rune.name)}">
              ${renderNumberOptions(0, cat.runes.length, value)}
            </select>
          </label>
        `;
      }).join("");

      return `
        <div class="rp-party-block" style="border-color:${cat.accent}33;">
          <div class="rp-section-title" style="padding:0 0 7px;background:transparent;color:${cat.accent};">
            <span class="rp-dot" style="background:${cat.accent};"></span>
            ${escapeHtml(cat.label)}
          </div>
          <div class="rp-party-label">Item Slots</div>
          <div class="rp-slot-grid">${slotFields}</div>
          <div class="rp-party-label" style="margin-top:8px;">Rune Priority</div>
          <div class="rp-priority-grid">${priorityFields}</div>
        </div>
      `;
    }

    function renderNumberOptions(min, max, current) {
      return Array.from({ length: max - min + 1 }, (_, index) => {
        const value = min + index;
        return `<option value="${value}"${Number(current) === value ? " selected" : ""}>${value}</option>`;
      }).join("");
    }

    function renderCategory(cat) {
      const tierHeaders = Array.from({ length: MAX_TIER }, (_, index) => {
        const tier = index + 1;
        const color = TIER_COLORS[index];
        return `<th class="rp-tier-hdr" style="color:${color};">T${tier}</th>`;
      }).join("");

      return `
      <div class="rp-section" style="border-color:${cat.accent}33;">
        <div class="rp-section-title" style="background:${cat.dimBg};color:${cat.accent};">
          <span class="rp-dot" style="background:${cat.accent};"></span>
          ${escapeHtml(cat.label)}
        </div>

        <table class="rp-table">
          <thead>
            <tr>
              <th></th>
              ${tierHeaders}
            </tr>
          </thead>
          <tbody>
            ${cat.runes.map((rune) => renderRuneRow(cat, rune)).join("")}
          </tbody>
        </table>
      </div>
    `;
    }

    function renderRuneRow(cat, rune) {
      return `
      <tr>
        <td>
          <span class="rp-rune-name" style="color:${cat.accent};">${escapeHtml(rune.name)}</span>
          <span class="rp-rune-stat">${escapeHtml(rune.stat)}</span>
        </td>

        ${Array.from({ length: MAX_TIER }, (_, index) => {
          const tier = index + 1;
          const count = getCount(rune.name, tier);

          return `
            <td>
              <div class="rp-cell">
                <button
                  type="button"
                  class="rp-minus"
                  data-rp-change="-1"
                  data-rp-rune="${escapeHtml(rune.name)}"
                  data-rp-tier="${tier}"
                  title="Remove ${escapeHtml(rune.name)} T${tier}"
                >−</button>

                <span class="rp-count${count > 0 ? " nonzero" : ""}">${count}</span>

                <button
                  type="button"
                  class="rp-plus"
                  data-rp-change="1"
                  data-rp-rune="${escapeHtml(rune.name)}"
                  data-rp-tier="${tier}"
                  title="Add ${escapeHtml(rune.name)} T${tier}"
                >+</button>
              </div>
            </td>
          `;
        }).join("")}
      </tr>
    `;
    }

    function attachEvents(app) {
      const panel = app.ui.getPanel(definition.id);
      if (!panel) return;

      if (panel.dataset.runePlannerEventsBound === "1") return;
      panel.dataset.runePlannerEventsBound = "1";

      panel.addEventListener("click", async (event) => {
        const target = event.target;

        const tabButton = target.closest("[data-rp-tab]");
        if (tabButton && panel.contains(tabButton)) {
          event.preventDefault();
          event.stopPropagation();
          state.tab = tabButton.dataset.rpTab === "party" ? "party" : "manual";
          localStorage.setItem(TAB_KEY, state.tab);
          renderIntoPanel(app);
          return;
        }

        const changeButton = target.closest("[data-rp-change]");
        if (changeButton && panel.contains(changeButton)) {
          event.preventDefault();
          event.stopPropagation();

          const runeName = clean(changeButton.dataset.rpRune);
          const tier = Number(changeButton.dataset.rpTier || 0);
          const delta = Number(changeButton.dataset.rpChange || 0);

          if (!runeName || !tier || !delta) return;

          changeCount(runeName, tier, delta);
          renderIntoPanel(app);
          return;
        }

        const exportButton = target.closest("[data-rp-export]");
        if (exportButton && panel.contains(exportButton)) {
          event.preventDefault();
          event.stopPropagation();
          await exportToClipboard(app);
          return;
        }

        const loadCraftingButton = target.closest("[data-rp-load-crafting]");
        if (loadCraftingButton && panel.contains(loadCraftingButton)) {
          event.preventDefault();
          event.stopPropagation();
          await loadCrafting(app);
          return;
        }

        const scanInventoryButton = target.closest("[data-rp-scan-inventory]");
        if (scanInventoryButton && panel.contains(scanInventoryButton)) {
          event.preventDefault();
          event.stopPropagation();
          scanInventory(app);
          return;
        }

        const resetButton = target.closest("[data-rp-reset]");
        if (resetButton && panel.contains(resetButton)) {
          event.preventDefault();
          event.stopPropagation();
          resetAll(app);
        }
      });

      panel.addEventListener("change", (event) => {
        const target = event.target;
        if (!target || !panel.contains(target)) return;

        if (target.matches("[data-rp-party-tier]")) {
          state.partyTier = Math.min(MAX_TIER, Math.max(1, Number(target.value || 1)));
          localStorage.setItem(PARTY_TIER_KEY, String(state.partyTier));
          renderIntoPanel(app);
          return;
        }

        if (target.matches("[data-rp-party-name]")) {
          const playerIndex = Number(target.dataset.rpPartyName);
          if (!state.party.players[playerIndex]) return;
          state.party.players[playerIndex].name = clean(target.value) || `Player ${playerIndex + 1}`;
          savePartySettings();
          renderIntoPanel(app);
          return;
        }

        if (target.matches("[data-rp-party-slot]")) {
          const playerIndex = Number(target.dataset.rpPartySlot);
          const category = clean(target.dataset.rpCategory);
          const item = clean(target.dataset.rpItem);
          const player = state.party.players[playerIndex];
          if (!player || !category || !item) return;
          if (!player.slots[category]) player.slots[category] = {};
          player.slots[category][item] = Math.min(5, Math.max(0, Math.floor(Number(target.value || 0))));
          savePartySettings();
          renderIntoPanel(app);
          return;
        }

        if (target.matches("[data-rp-party-priority]")) {
          const playerIndex = Number(target.dataset.rpPartyPriority);
          const category = clean(target.dataset.rpCategory);
          const runeName = clean(target.dataset.rpRune);
          const player = state.party.players[playerIndex];
          const cat = RUNE_CATEGORIES.find((entry) => entry.label === category);
          if (!player || !cat || !runeName) return;
          if (!player.priorities[category]) player.priorities[category] = {};
          player.priorities[category][runeName] = Math.min(cat.runes.length, Math.max(0, Math.floor(Number(target.value || 0))));
          savePartySettings();
          renderIntoPanel(app);
        }
      });
    }

    function renderIntoPanel(app) {
      const panel = app.ui.getPanel(definition.id);
      if (!panel) return;

      const body = panel.querySelector(".vim-body");
      const footer = panel.querySelector(".vim-footer");

      if (!body || !footer) return;

      body.innerHTML = render();

      const selectedTotal = getSelectedTotal(getActiveCounts());
      footer.textContent =
        `${state.tab === "party" ? "Party" : "Manual"} | ${selectedTotal} selected | Rune recipes ${getRuneRecipes().length} | Inventory ${Object.keys(state.inventory || {}).length} | Last copied ${formatTime(state.lastCopiedAt)}`;

      attachEvents(app);
    }

    function queueRender(app) {
      if (!app || state.updateQueued) return;
      state.updateQueued = true;
      requestAnimationFrame(() => {
        state.updateQueued = false;
        renderIntoPanel(app);
      });
    }

    return {
      ...definition,

      init(app) {
        loadCounts();
        app.ui.registerPanel({
          id: definition.id,
          title: definition.name,
          icon: definition.icon || '◈',
          render: () => render(),
          footer: '',
        });
        queueRender(app);
      },

      render() {
        return render();
      },

      destroy() {
        // no timers or event subscriptions — nothing to tear down
      },
    };
  }

  window.VoidIdleModules = window.VoidIdleModules || {};
  window.VoidIdleModules['rune-planner'] = createRunePlannerModule({
    id: 'rune-planner',
    name: 'Rune Planner',
    icon: '◈',
    description: 'Plan rune loadouts by type and tier, then copy the list for Discord or notes.',
  });
})();
