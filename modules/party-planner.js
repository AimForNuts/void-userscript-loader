(function () {
  'use strict';

  function createPartyPlannerModule(definition) {
    let appRef;

    const LS = {
      tab: 'voididle.partyPlannerRunes.tab.v1',
      inventory: 'voididle.partyPlannerRunes.inventory.v1',
      scannedAt: 'voididle.partyPlannerRunes.scannedAt.v1',
      crafting: 'voididle.partyPlannerRunes.crafting.v1',
      craftingAt: 'voididle.partyPlannerRunes.craftingAt.v1',
      partyTools: 'voididle.partyPlannerRunes.partyTools.v1',
      partyToolsAt: 'voididle.partyPlannerRunes.partyToolsAt.v1',
      targetTier: 'voididle.partyPlannerRunes.targetTier.v1',
      runeTier: 'voididle.partyPlannerRunes.runeTier.v1',
      runeQty: 'voididle.partyPlannerRunes.runeQty.v1',
      debugCraftingResponse: 'voididle.partyPlannerRunes.debugCraftingResponse.v1',
      spiritEssenceDebug: 'voididle.partyPlannerRunes.spiritEssenceDebug.v1',
      cardCollapsed: 'voididle.partyPlannerRunes.cardCollapsed.v1',
    };

    const TOOL_SLOTS = {
      gather_pickaxe: 'Pickaxe',
      gather_sickle: 'Sickle',
      gather_axe: 'Axe',
      craft_hammer: 'Hammer',
      craft_flask: 'Flask',
      craft_tome: 'Tome',
      gather_gloves: 'Gloves',
      gather_pack: 'Pack',
    };

    const MATERIAL_ALIASES = {
      'Bamboo': 'bamboo', 'Ironwood': 'ironwood', 'Spiritwood': 'spiritwood', 'Ashwood': 'ashwood', 'Duskwood': 'duskwood', 'Elderwood': 'elderwood',
      'Bamboo Plank': 'bamboo_plank', 'Ironwood Plank': 'ironwood_plank', 'Spiritwood Plank': 'spiritwood_plank', 'Ashwood Plank': 'ashwood_plank', 'Duskwood Plank': 'duskwood_plank', 'Elderwood Plank': 'elderwood_plank',
      'Copper Ore': 'copper_ore', 'Iron Ore': 'iron_ore', 'Mithril Ore': 'mithril_ore', 'Adamantite Ore': 'adamantite_ore', 'Starmetal Ore': 'starmetal_ore', 'Celestial Ore': 'celestial_ore',
      'Copper Ingot': 'copper_ingot', 'Iron Ingot': 'iron_ingot', 'Mithril Ingot': 'mithril_ingot', 'Adamantite Ingot': 'adamantite_ingot', 'Starmetal Ingot': 'starmetal_ingot', 'Celestial Ingot': 'celestial_ingot',
      'Spirit Herb': 'spirit_herb', 'Jade Lotus': 'jade_lotus', 'Phoenix Bloom': 'phoenix_bloom', 'Moonpetal': 'moonpetal', 'Voidbloom': 'voidbloom', 'Dragon Root': 'dragon_root',
      'Herb Extract': 'herb_extract', 'Lotus Extract': 'lotus_extract', 'Phoenix Extract': 'phoenix_extract', 'Moonpetal Extract': 'moonpetal_extract', 'Voidbloom Extract': 'voidbloom_extract', 'Dragon Extract': 'dragon_extract',
      'Beast Hide': 'beast_hide', 'Monster Bone': 'monster_bone', 'Spirit Essence': 'spirit_essence', 'Storm Essence': 'storm_essence', 'Elemental Core': 'elemental_core', 'Shadow Essence': 'shadow_essence', 'Dragon Scale': 'dragon_scale', 'Demon Fang': 'demon_fang', 'Void Essence': 'void_essence', 'Celestial Essence': 'celestial_essence', 'Dao Fragment': 'dao_fragment', 'Dao Crystal': 'dao_crystal',
    };

    const TOOL_ID_NAMES = {
      copper_pickaxe: 'Copper Pickaxe', iron_pickaxe: 'Iron Pickaxe', mithril_pickaxe: 'Mithril Pickaxe', adamantite_pickaxe: 'Adamantite Pickaxe', starmetal_pickaxe: 'Starmetal Pickaxe', celestial_pickaxe: 'Celestial Pickaxe',
      copper_sickle: 'Copper Sickle', iron_sickle: 'Iron Sickle', mithril_sickle: 'Mithril Sickle', adamantite_sickle: 'Adamantite Sickle', starmetal_sickle: 'Starmetal Sickle', celestial_sickle: 'Celestial Sickle',
      copper_axe: 'Copper Axe', iron_axe: 'Iron Axe', mithril_axe: 'Mithril Axe', adamantite_axe: 'Adamantite Axe', starmetal_axe: 'Starmetal Axe', celestial_axe: 'Celestial Axe',
      copper_hammer: "Copper Engineer's Hammer", iron_hammer: "Iron Engineer's Hammer", mithril_hammer: "Mithril Engineer's Hammer", adamantite_hammer: "Adamantite Engineer's Hammer", starmetal_hammer: "Starmetal Engineer's Hammer", celestial_hammer: "Celestial Engineer's Hammer",
      copper_flask: "Copper Alchemist's Flask", iron_flask: "Iron Alchemist's Flask", mithril_flask: "Mithril Alchemist's Flask", adamantite_flask: "Adamantite Alchemist's Flask", starmetal_flask: "Starmetal Alchemist's Flask", celestial_flask: "Celestial Alchemist's Flask",
      copper_tome: "Copper-Bound Enchanter's Tome", iron_tome: "Iron-Bound Enchanter's Tome", mithril_tome: "Mithril-Bound Enchanter's Tome", adamantite_tome: "Adamantite-Bound Enchanter's Tome", starmetal_tome: "Starmetal-Bound Enchanter's Tome", celestial_tome: "Celestial-Bound Enchanter's Tome",
      gather_gloves_t1: 'Copper Gathering Gloves', gather_gloves_t2: 'Iron Gathering Gloves', gather_gloves_t3: 'Mithril Gathering Gloves', gather_gloves_t4: 'Adamantite Gathering Gloves', gather_gloves_t5: 'Starmetal Gathering Gloves', gather_gloves_t6: 'Celestial Gathering Gloves',
      gather_pack_t1: 'Copper Gathering Pack', gather_pack_t2: 'Iron Gathering Pack', gather_pack_t3: 'Mithril Gathering Pack', gather_pack_t4: 'Adamantite Gathering Pack', gather_pack_t5: 'Starmetal Gathering Pack', gather_pack_t6: 'Celestial Gathering Pack',
    };

    Object.keys(TOOL_ID_NAMES).forEach(id => { MATERIAL_ALIASES[TOOL_ID_NAMES[id]] = id; });

    const state = {
      tab: localStorage.getItem(LS.tab) || 'inventory',
      inventory: loadJSON(LS.inventory, {}),
      crafting: loadJSON(LS.crafting, null),
      partyTools: loadJSON(LS.partyTools, {}),
      targetTier: Number(localStorage.getItem(LS.targetTier) || 2),
      runeTier: Number(localStorage.getItem(LS.runeTier) || 1),
      runeQty: loadJSON(LS.runeQty, {}),
      msg: '',
    };

    function loadJSON(key, fallback) { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } }
    function saveJSON(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
    function clean(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
    function norm(s) { return clean(s).toLowerCase().replace(/[â']/g, '').replace(/&amp;/g, '&').replace(/[^a-z0-9]+/g, ' ').trim(); }
    function slug(s) { return norm(s).replace(/\s+/g, '_'); }
    function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
    function text(el) { return clean(el?.textContent || ''); }
    function num(v) { let s = String(v ?? '').trim().replace(/,/g, ''); if (!s || s === 'â') return 0; const mult = /k$/i.test(s) ? 1000 : /m$/i.test(s) ? 1000000 : /b$/i.test(s) ? 1000000000 : 1; s = s.replace(/[kmb]$/i, ''); const n = Number(s); return Number.isFinite(n) ? n * mult : 0; }
    function fmt(n) { const x = Number(n || 0); if (!Number.isFinite(x)) return String(n); if (Math.abs(x) >= 1000) return Math.ceil(x).toLocaleString(); return String(Math.ceil(x * 100) / 100); }
    function materialIdFromName(name) { if (!name) return ''; if (MATERIAL_ALIASES[name]) return MATERIAL_ALIASES[name]; const n = norm(name); for (const [label, id] of Object.entries(MATERIAL_ALIASES)) if (norm(label) === n) return id; return slug(name); }
    function displayName(id) { if (!id) return ''; if (TOOL_ID_NAMES[id]) return TOOL_ID_NAMES[id]; const found = Object.entries(MATERIAL_ALIASES).find(([, aliasId]) => aliasId === id); return found?.[0] || id; }
    function addTo(map, id, qty) { if (!id || !qty) return; map[id] = (map[id] || 0) + qty; }
    function mergeInto(dst, src, mult = 1) { Object.entries(src || {}).forEach(([id, qty]) => addTo(dst, id, qty * mult)); }
    function emptyTools() { const out = {}; Object.keys(TOOL_SLOTS).forEach(slot => { out[slot] = null; }); return out; }

    function getStoredAuthToken() {
      const stores = [localStorage, sessionStorage];
      const preferred = ['token', 'authToken', 'jwt', 'accessToken', 'voididle_token', 'voididle.auth', 'auth'];
      for (const store of stores) {
        for (const key of preferred) { const token = readPossibleToken(store.getItem(key)); if (token) return token; }
        for (let i = 0; i < store.length; i++) { const token = readPossibleToken(store.getItem(store.key(i))); if (token) return token; }
      }
      return '';
    }

    function readPossibleToken(value) {
      if (!value) return '';
      const raw = String(value).trim();
      if (/^Bearer\s+eyJ/.test(raw)) return raw.replace(/^Bearer\s+/i, '');
      if (/^eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/.test(raw)) return raw;
      try { const parsed = JSON.parse(raw); for (const key of ['token', 'authToken', 'jwt', 'accessToken']) { const nested = readPossibleToken(parsed?.[key]); if (nested) return nested; } } catch {}
      return '';
    }

    function authHeaders() { const token = getStoredAuthToken(); if (!token) return null; return { accept: '*/*', 'content-type': 'application/json', authorization: 'Bearer ' + token }; }

    async function apiGet(url) {
      const headers = authHeaders();
      if (!headers) throw new Error('Could not find auth token in localStorage/sessionStorage.');
      const res = await fetch(url, { method: 'GET', credentials: 'include', cache: 'no-store', headers });
      if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
      const data = await res.json();
      if (String(url).includes('/api/crafting')) {
        window.__vilLastCraftingRequest = { url, status: res.status, capturedAt: new Date().toISOString(), response: data };
        localStorage.setItem(LS.debugCraftingResponse, JSON.stringify(window.__vilLastCraftingRequest));
        console.log('VoidIdle /api/crafting sniffed response:', window.__vilLastCraftingRequest);
      }
      return data;
    }

    function summarizeToolItem(item) { const stats = item.totalStats || item.stats || {}; return { name: item.name || null, type: item.type || null, equippedSlot: item.equippedSlot || null, itemTier: item.itemTier ?? null, plus_level: item.plus_level ?? 0, rarity: item.rarity || null, power: stats.power ?? null, stats }; }
    function recordFromInspect(data, partyMember) { const tools = emptyTools(); const rawEquippedItems = {}; for (const item of data?.equipped || []) { const slot = item?.equippedSlot; if (!slot || !(slot in TOOL_SLOTS)) continue; tools[slot] = summarizeToolItem(item); rawEquippedItems[slot] = item; } return { name: data?.username || partyMember?.username || data?.id || partyMember?.player_id || 'Unknown', playerId: data?.id || partyMember?.player_id || null, level: data?.level ?? partyMember?.level ?? null, online: data?.online ?? partyMember?.online ?? null, activity: partyMember?.activity || null, savedAt: new Date().toISOString(), tools, rawEquippedItems }; }

    function getCraftingRecipes() { const recipes = []; const professions = state.crafting?.professions || {}; Object.entries(professions).forEach(([profession, info]) => { (info.recipes || []).forEach(r => recipes.push({ ...r, profession: r.profession || profession })); }); return recipes; }
    function getToolRecipes() { return getCraftingRecipes().filter(r => r?.result?.type === 'trade_gear'); }
    function getRuneRecipes() { return getCraftingRecipes().filter(r => r?.result?.type === 'rune'); }
    function getRefineRecipesByResult() {
      const out = {};
      getCraftingRecipes().forEach(r => {
        if (r?.result?.type !== 'refine' || !r.result.materialId) return;
        const resultId = r.result.materialId;
        const current = out[resultId];
        const isBaseRefine = String(r.id || '').startsWith('refine_');
        const currentIsBaseRefine = String(current?.id || '').startsWith('refine_');
        if (!current) { out[resultId] = r; return; }
        if (isBaseRefine && !currentIsBaseRefine) { out[resultId] = r; }
      });
      return out;
    }
    function toolRecipeKey(slot, tier) { return getToolRecipes().find(r => r?.result?.slot === slot && Number(r?.result?.tier || r?.tier) === Number(tier)) || null; }
    function isToolItemId(id) { return !!getToolRecipes().find(r => r.id === id); }
    function directMaterials(recipe, skipToolItems) { const out = {}; Object.entries(recipe?.materials || {}).forEach(([id, qty]) => { if (skipToolItems && isToolItemId(id)) return; addTo(out, id, Number(qty || 0)); }); return out; }
    function expandToRaw(id, qty, refineMap, stack = {}) { if (!id || !qty) return {}; if (stack[id]) return { [id]: qty }; const recipe = refineMap[id]; if (!recipe) return { [id]: qty }; const resultQty = Number(recipe.result?.quantity || 1); const crafts = qty / resultQty; const out = {}; const nextStack = { ...stack, [id]: true }; Object.entries(recipe.materials || {}).forEach(([mat, matQty]) => mergeInto(out, expandToRaw(mat, Number(matQty || 0) * crafts, refineMap, nextStack))); return out; }
    function rawEquivalent(materials) { const refineMap = getRefineRecipesByResult(); const out = {}; Object.entries(materials || {}).forEach(([id, qty]) => mergeInto(out, expandToRaw(id, qty, refineMap))); return out; }
    function neededMinusInventory(needs) { const out = {}; Object.entries(needs || {}).forEach(([id, qty]) => { const have = Number(state.inventory?.[id] || 0); const miss = Math.max(0, qty - have); if (miss > 0) out[id] = miss; }); return out; }

    function getCardCollapsedMap() { return loadJSON(LS.cardCollapsed, {}); }
    function setCardCollapsed(key, collapsed) { const map = getCardCollapsedMap(); if (collapsed) map[key] = true; else delete map[key]; saveJSON(LS.cardCollapsed, map); }
    function cardKeyFor(title, idx) { return state.tab + ':' + idx + ':' + title; }

    function makeCardsCollapsible(panel) {
      const bodyEl = panel.querySelector('.vim-body') || panel;
      const cards = Array.from(bodyEl.querySelectorAll(':scope > .vilCard'));
      const collapsedMap = getCardCollapsedMap();

      cards.forEach((card, idx) => {
        if (card.dataset.vilCollapsible === '1') return;
        const firstChild = card.firstElementChild;
        const titleEl = firstChild && firstChild.tagName === 'B' ? firstChild : null;
        if (!titleEl) return;
        const title = clean(titleEl.textContent || 'Section');
        if (!title) return;
        const key = cardKeyFor(title, idx);
        const isCollapsed = !!collapsedMap[key];
        const existingChildren = Array.from(card.childNodes);
        const header = document.createElement('div');
        header.className = 'vilCollapseHead';
        header.innerHTML = '<button class="vilMiniBtn" type="button" data-card-collapse="' + esc(key) + '">' + (isCollapsed ? '+' : '−') + '</button><span>' + esc(title) + '</span>';
        const content = document.createElement('div');
        content.className = 'vilCollapseBody' + (isCollapsed ? ' vilHidden' : '');
        existingChildren.forEach(node => { if (node === titleEl) return; content.appendChild(node); });
        card.textContent = '';
        card.dataset.vilCollapsible = '1';
        card.appendChild(header);
        card.appendChild(content);
      });

      panel.querySelectorAll('[data-card-collapse]').forEach(btn => {
        btn.onclick = () => {
          const key = btn.dataset.cardCollapse;
          const card = btn.closest('.vilCard');
          const body = card?.querySelector('.vilCollapseBody');
          if (!body) return;
          const nowCollapsed = !body.classList.contains('vilHidden');
          body.classList.toggle('vilHidden', nowCollapsed);
          btn.textContent = nowCollapsed ? '+' : '−';
          setCardCollapsed(key, nowCollapsed);
        };
      });
    }

    function plannerForPlayer(rec, targetTier) {
      const processed = {}, raw = {}, missingRecipes = [], steps = [];
      Object.entries(TOOL_SLOTS).forEach(([slot, label]) => {
        const currentTier = Number(rec.tools?.[slot]?.itemTier || 0);
        if (currentTier >= targetTier) return;
        for (let tier = currentTier + 1; tier <= targetTier; tier++) {
          const recipe = toolRecipeKey(slot, tier);
          if (!recipe) { missingRecipes.push(label + ' T' + tier); continue; }
          const mats = directMaterials(recipe, true);
          mergeInto(processed, mats);
          mergeInto(raw, rawEquivalent(mats));
          steps.push({ slot, label, fromTier: tier - 1, toTier: tier, recipeId: recipe.id, recipeName: recipe.name, materials: mats });
        }
      });
      return { player: rec.name, playerId: rec.playerId, processed, raw, steps, missingRecipes };
    }

    function plannerAll() { const target = state.targetTier; const players = Object.values(state.partyTools || {}).sort((a, b) => String(a.name).localeCompare(String(b.name))); const perPlayer = players.map(p => plannerForPlayer(p, target)); const totalProcessed = {}, totalRaw = {}; perPlayer.forEach(p => { mergeInto(totalProcessed, p.processed); mergeInto(totalRaw, p.raw); }); return { targetTier: target, perPlayer, totalProcessed, totalRaw }; }

    function selectedRunePlan() {
      const selected = Object.entries(state.runeQty || {}).filter(([, qty]) => Number(qty) > 0);
      const recipesById = {};
      getRuneRecipes().forEach(r => { recipesById[r.id] = r; });
      const processed = {}, raw = {}, selections = [];
      selected.forEach(([id, qtyRaw]) => {
        const qty = Number(qtyRaw || 0);
        const recipe = recipesById[id];
        if (!recipe || qty <= 0) return;
        const mats = directMaterials(recipe, false);
        mergeInto(processed, mats, qty);
        mergeInto(raw, rawEquivalent(mats), qty);
        selections.push({ id, name: recipe.name, tier: recipe.tier, qty, materials: mats });
      });
      return { selections, processed, raw, missingProcessed: neededMinusInventory(processed), missingRaw: neededMinusInventory(raw) };
    }

    function debugCraftingSpiritEssenceSources() {
      const recipes = getCraftingRecipes();
      const refineRecipes = recipes.filter(r => r?.result?.type === 'refine');
      const runeRecipes = getRuneRecipes();
      const refineMap = getRefineRecipesByResult();
      const plan = selectedRunePlan();
      const selectedRuneIds = Object.entries(state.runeQty || {}).filter(([, qty]) => Number(qty) > 0).map(([id]) => id);
      const selectedRunes = runeRecipes.filter(r => selectedRuneIds.includes(r.id));
      const relevantProcessedIds = new Set();
      selectedRunes.forEach(r => { Object.keys(r.materials || {}).forEach(id => relevantProcessedIds.add(id)); });
      const relevantRefines = refineRecipes.filter(r => relevantProcessedIds.has(r?.result?.materialId));
      const allRecipesMentioningSpiritEssence = recipes.filter(r => r?.materials && Object.prototype.hasOwnProperty.call(r.materials, 'spirit_essence'));
      const rawExpansionByProcessedMaterial = Object.entries(plan.processed || {}).map(([id, qty]) => ({
        processedId: id, processedName: displayName(id), qty,
        refineRecipeUsed: refineMap[id] ? { id: refineMap[id].id, name: refineMap[id].name, profession: refineMap[id].profession, result: refineMap[id].result, materials: refineMap[id].materials } : null,
        expandedRaw: expandToRaw(id, qty, refineMap),
        spiritEssenceInExpandedRaw: Number(expandToRaw(id, qty, refineMap).spirit_essence || 0),
      }));
      const report = {
        capturedAt: new Date().toISOString(),
        craftingCachedAt: localStorage.getItem(LS.craftingAt) || null,
        selectedRunes: selectedRunes.map(r => ({ id: r.id, name: r.name, tier: r.tier, result: r.result, materials: r.materials })),
        processedMaterialsFromSelectedRunes: Array.from(relevantProcessedIds),
        relevantRefineRecipesUsedForRawEquivalent: relevantRefines.map(r => ({ id: r.id, name: r.name, profession: r.profession, tier: r.tier, result: r.result, materials: r.materials })),
        allRecipesMentioningSpiritEssence: allRecipesMentioningSpiritEssence.map(r => ({ id: r.id, name: r.name, profession: r.profession, tier: r.tier, result: r.result, materials: r.materials })),
        rawExpansionByProcessedMaterial,
        selectedRunePlan: plan,
        lastSniffedCraftingRequest: window.__vilLastCraftingRequest || loadJSON(LS.debugCraftingResponse, null),
      };
      window.__vilSpiritEssenceDebug = report;
      localStorage.setItem(LS.spiritEssenceDebug, JSON.stringify(report));
      console.group('VoidIdle Rune Planner Spirit Essence Debug');
      console.log(report);
      console.table(report.rawExpansionByProcessedMaterial);
      console.table(report.relevantRefineRecipesUsedForRawEquivalent);
      console.table(report.allRecipesMentioningSpiritEssence);
      console.groupEnd();
      return report;
    }

    function installCSS() {
      if (document.getElementById('vilCss')) return;
      const css = '.vilTabs{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-bottom:10px}.vilTab{background:#101a2d;border:1px solid #304762;color:#dcecff;border-radius:8px;padding:7px;font-weight:900;cursor:pointer}.vilTab.active{background:#063653;border-color:#47cfff;color:#fff}.vilCard{background:#0b1528;border:1px solid #223653;border-radius:11px;padding:10px;margin-bottom:9px}.vilRow{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.vilTiny{font-size:10px;color:#aab8ce}.vilMuted{color:#92a3bd}.vilErr{color:#ffd1d1}.vilGood{color:#7dffb2}.vilBtn{background:#111c31;border:1px solid #35506f;color:#eaf4ff;border-radius:8px;padding:5px 9px;font-weight:800;cursor:pointer}.vilBtn:hover{border-color:#65d7ff}.vilHot{background:#08314f;border-color:#2ab7f5}.vilBad{border-color:#f87171;color:#ffd1d1}.vilInput{background:#050b17;color:#f4f8ff;border:1px solid #2b405e;border-radius:8px;padding:6px;min-width:64px}.vilQty{width:70px}.vilTable{width:100%;border-collapse:collapse}.vilTable th,.vilTable td{border-bottom:1px solid rgba(255,255,255,.08);padding:6px;text-align:left;vertical-align:top}.vilTable th{font-size:10px;text-transform:uppercase;color:#a9bddb}.vilHidden{display:none!important}.vilScroll{max-height:320px;overflow:auto;border:1px solid rgba(255,255,255,.06);border-radius:8px;margin-top:8px}.vilCollapseHead{display:flex;align-items:center;gap:8px;font-weight:900}.vilCollapseHead span{flex:1}.vilCollapseBody{margin-top:8px}.vilMiniBtn{width:24px;height:24px;border-radius:7px;border:1px solid #35506f;background:#111c31;color:#eaf4ff;font-weight:900;cursor:pointer;line-height:1}';
      const style = document.createElement('style'); style.id = 'vilCss'; style.textContent = css; document.head.appendChild(style);
    }

    function scanInventory() { const out = {}; const rows = document.querySelectorAll('.inv-resources .res-row, .res-row.sellable'); for (const row of rows) { const name = text(row.querySelector('.res-name')); const qtyEl = row.querySelector('.res-qty'); const qty = num(qtyEl?.getAttribute('title') || text(qtyEl)); const id = materialIdFromName(name); if (id && Number.isFinite(qty)) out[id] = qty; } state.inventory = out; saveJSON(LS.inventory, out); localStorage.setItem(LS.scannedAt, new Date().toISOString()); state.msg = 'Scanned ' + Object.keys(out).length + ' inventory items.'; renderIntoPanel(); }

    async function loadCrafting() {
      try {
        state.msg = 'Loading crafting data...'; renderIntoPanel();
        state.crafting = await apiGet('/api/crafting');
        window.__vilLastCraftingResponse = state.crafting;
        localStorage.setItem(LS.debugCraftingResponse, JSON.stringify({ url: '/api/crafting', capturedAt: new Date().toISOString(), response: state.crafting }));
        saveJSON(LS.crafting, state.crafting);
        localStorage.setItem(LS.craftingAt, new Date().toISOString());
        state.msg = 'Crafting cached. Tools: ' + getToolRecipes().length + ', runes: ' + getRuneRecipes().length + '. Sniffer saved /api/crafting.';
        renderIntoPanel();
      } catch (e) { state.msg = 'Crafting load failed: ' + (e.message || e); renderIntoPanel(); }
    }

    async function loadPartyTools() { try { state.msg = 'Loading party...'; renderIntoPanel(); const party = await apiGet('/api/party'); const members = party?.members || []; state.msg = 'Inspecting ' + members.length + ' party members...'; renderIntoPanel(); const records = await Promise.all(members.map(async m => { try { const data = await apiGet('/api/player/' + encodeURIComponent(m.player_id) + '/inspect'); return recordFromInspect(data, m); } catch (e) { return { name: m.username || m.player_id || 'Unknown', playerId: m.player_id || null, savedAt: new Date().toISOString(), error: e.message || String(e), tools: emptyTools() }; } })); const next = {}; records.forEach(r => { next[r.name] = r; }); state.partyTools = next; saveJSON(LS.partyTools, state.partyTools); localStorage.setItem(LS.partyToolsAt, new Date().toISOString()); state.msg = 'Loaded tools for ' + records.length + ' party members.'; renderIntoPanel(); } catch (e) { state.msg = 'Party tools load failed: ' + (e.message || e); renderIntoPanel(); } }
    async function copyText(txt, okMsg) { try { await navigator.clipboard.writeText(txt); } catch { const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); } state.msg = okMsg; renderIntoPanel(); }
    function clearInventory() { state.inventory = {}; saveJSON(LS.inventory, {}); localStorage.removeItem(LS.scannedAt); state.msg = 'Inventory cleared.'; renderIntoPanel(); }
    function clearTools() { state.partyTools = {}; saveJSON(LS.partyTools, {}); localStorage.removeItem(LS.partyToolsAt); state.msg = 'Tools cleared.'; renderIntoPanel(); }
    function clearCrafting() { state.crafting = null; localStorage.removeItem(LS.crafting); localStorage.removeItem(LS.craftingAt); localStorage.removeItem(LS.debugCraftingResponse); localStorage.removeItem(LS.spiritEssenceDebug); state.msg = 'Crafting cache and debug cache cleared.'; renderIntoPanel(); }
    function clearRuneSelection() { state.runeQty = {}; saveJSON(LS.runeQty, {}); state.msg = 'Rune selection cleared.'; renderIntoPanel(); }
    function removeToolRecord(name) { delete state.partyTools[name]; saveJSON(LS.partyTools, state.partyTools); state.msg = 'Removed ' + name + '.'; renderIntoPanel(); }

    function materialRows(map, showHave) { const keys = Object.keys(map || {}).sort((a, b) => displayName(a).localeCompare(displayName(b))); if (!keys.length) return '<tr><td colspan="4" class="vilMuted">None</td></tr>'; return keys.map(id => { const have = Number(state.inventory?.[id] || 0); const need = Number(map[id] || 0); const missing = Math.max(0, need - have); return '<tr><td>' + esc(displayName(id)) + '<div class="vilTiny">' + esc(id) + '</div></td><td>' + fmt(need) + '</td>' + (showHave ? '<td>' + fmt(have) + '</td><td>' + (missing ? fmt(missing) : '<span class="vilGood">0</span>') + '</td>' : '') + '</tr>'; }).join(''); }
    function tabButton(id, label) { return '<button class="vilTab ' + (state.tab === id ? 'active' : '') + '" data-tab="' + id + '">' + esc(label) + '</button>'; }
    function inventoryBody() { const inv = state.inventory || {}; return '<div class="vilCard"><div class="vilRow"><button class="vilBtn vilHot" data-act="scanInventory">Scan Inventory</button><button class="vilBtn" data-act="copyInventory">Copy Inventory</button><button class="vilBtn vilBad" data-act="clearInventory">Clear</button></div><div class="vilTiny" style="margin-top:6px">Open the Resources inventory view first, then click Scan Inventory.</div></div><div class="vilCard"><b>Inventory</b><div class="vilTiny">Cached items: ' + Object.keys(inv).length + '</div><div class="vilScroll"><table class="vilTable"><thead><tr><th>Item</th><th>Qty</th></tr></thead><tbody>' + materialRows(inv, false) + '</tbody></table></div></div>'; }
    function toolCell(item) { if (!item) return '<td class="vilMuted">None</td><td></td>'; const plus = item.plus_level ? ' +' + item.plus_level : ''; const meta = [item.itemTier ? 'T' + item.itemTier : '', item.rarity || '', item.power == null ? '' : 'Power ' + item.power].filter(Boolean).join(' · '); return '<td>' + esc((item.name || item.type || 'Unknown') + plus) + '<div class="vilTiny">' + esc(meta) + '</div></td><td>' + esc(item.type || '') + '</td>'; }
    function toolsBody() { const names = Object.keys(state.partyTools || {}).sort(); const cards = names.map(name => { const rec = state.partyTools[name]; const rows = Object.entries(TOOL_SLOTS).map(([slot, label]) => '<tr><td>' + esc(label) + '<div class="vilTiny">' + esc(slot) + '</div></td>' + toolCell(rec.tools?.[slot]) + '</tr>').join(''); return '<div class="vilCard"><div class="vilRow"><b style="flex:1">' + esc(name) + '</b><button class="vilBtn vilBad" data-remove-tool-record="' + esc(name) + '">Remove</button></div><div class="vilTiny">Player ID: ' + esc(rec.playerId || 'n/a') + ' · Saved: ' + esc(rec.savedAt || 'unknown') + '</div>' + (rec.error ? '<div class="vilTiny vilErr">' + esc(rec.error) + '</div>' : '') + '<table class="vilTable" style="margin-top:8px"><thead><tr><th>Slot</th><th>Item</th><th>Type</th></tr></thead><tbody>' + rows + '</tbody></table></div>'; }).join('') || '<div class="vilCard vilMuted">No tools loaded yet.</div>'; return '<div class="vilCard"><div class="vilRow"><button class="vilBtn vilHot" data-act="loadPartyTools">Load Party Tools</button><button class="vilBtn" data-act="copyTools">Copy Tools</button><button class="vilBtn vilBad" data-act="clearTools">Clear Tools</button></div><div class="vilTiny" style="margin-top:6px">Calls /api/party, then /api/player/&lt;player_id&gt;/inspect for each member.</div></div>' + cards; }

    function runesBody() {
      const tier = state.runeTier;
      const runes = getRuneRecipes().filter(r => Number(r.tier || r.result?.tier || 0) === tier).sort((a, b) => a.name.localeCompare(b.name));
      const plan = selectedRunePlan();
      const rows = runes.map(r => {
        const qty = Number(state.runeQty[r.id] || 0) || '';
        const mats = Object.entries(r.materials || {}).map(([id, q]) => displayName(id) + ' ×' + fmt(q)).join(', ');
        const result = r.result || {};
        return '<tr><td><input class="vilInput vilQty" type="number" min="0" step="1" data-rune-qty="' + esc(r.id) + '" value="' + esc(qty) + '"></td><td>' + esc(r.name) + '<div class="vilTiny">' + esc(r.id) + ' · ' + esc(r.profession || '') + '</div></td><td>' + esc(result.category || '') + '</td><td>' + esc(result.stat || '') + '</td><td>' + esc(mats) + '</td></tr>';
      }).join('') || '<tr><td colspan="5" class="vilMuted">Load crafting data first, or no runes found for this tier.</td></tr>';
      return '<div class="vilCard"><div class="vilRow"><button class="vilBtn vilHot" data-act="loadCrafting">Load / Refresh Crafting Data</button><label>Rune tier <select class="vilInput" id="vilRuneTier"><option value="1">T1</option><option value="2">T2</option><option value="3">T3</option><option value="4">T4</option><option value="5">T5</option><option value="6">T6</option></select></label><button class="vilBtn" data-act="copyRunePlan">Copy Rune Plan</button><button class="vilBtn" data-act="copySpiritDebug">Copy Spirit Debug</button><button class="vilBtn" data-act="copyCraftingSniff">Copy Crafting Sniff</button><button class="vilBtn vilBad" data-act="clearRuneSelection">Clear Selected Runes</button></div><div class="vilTiny" style="margin-top:6px">Enter how many of each rune you want. Raw equivalent prefers normal refine_* recipes and avoids transmute recipes overwriting them.</div></div><div class="vilCard"><b>Runes T' + esc(tier) + '</b><div class="vilTiny">Showing ' + runes.length + ' rune recipes. Cached at: ' + esc(localStorage.getItem(LS.craftingAt) || 'never') + '</div><div class="vilScroll"><table class="vilTable"><thead><tr><th>Qty</th><th>Rune</th><th>Gear</th><th>Stat</th><th>Cost each</th></tr></thead><tbody>' + rows + '</tbody></table></div></div><div class="vilCard"><b>Selected rune breakdown – processed</b><div class="vilScroll"><table class="vilTable"><thead><tr><th>Material</th><th>Need</th><th>Have</th><th>Missing</th></tr></thead><tbody>' + materialRows(plan.processed, true) + '</tbody></table></div></div><div class="vilCard"><b>Selected rune breakdown – raw equivalent</b><div class="vilScroll"><table class="vilTable"><thead><tr><th>Raw material</th><th>Need</th><th>Have</th><th>Missing</th></tr></thead><tbody>' + materialRows(plan.raw, true) + '</tbody></table></div></div>';
    }

    function plannerBody() { const plan = plannerAll(); const missingRaw = neededMinusInventory(plan.totalRaw); const missingProcessed = neededMinusInventory(plan.totalProcessed); const playerCards = plan.perPlayer.map(p => { const steps = p.steps.map(s => s.label + ' T' + s.toTier).join(', ') || 'Already at target'; return '<div class="vilCard"><b>' + esc(p.player) + '</b><div class="vilTiny">' + esc(steps) + (p.missingRecipes.length ? ' · Missing recipes: ' + esc(p.missingRecipes.join(', ')) : '') + '</div><table class="vilTable" style="margin-top:8px"><thead><tr><th>Processed needed</th><th>Qty</th></tr></thead><tbody>' + materialRows(p.processed, false) + '</tbody></table><table class="vilTable" style="margin-top:8px"><thead><tr><th>Raw equivalent</th><th>Qty</th></tr></thead><tbody>' + materialRows(p.raw, false) + '</tbody></table></div>'; }).join('') || '<div class="vilCard vilMuted">Load party tools first.</div>'; return '<div class="vilCard"><div class="vilRow"><button class="vilBtn vilHot" data-act="loadCrafting">Load / Refresh Crafting Data</button><button class="vilBtn vilHot" data-act="loadPartyTools">Load Party Tools</button><label>Desired tool tier <select class="vilInput" id="vilTargetTier"><option value="1">T1</option><option value="2">T2</option><option value="3">T3</option><option value="4">T4</option><option value="5">T5</option><option value="6">T6</option></select></label><button class="vilBtn" data-act="copyPlanner">Copy Planner</button></div><div class="vilTiny" style="margin-top:6px">Tool planner crafts each missing tier step and expands refined materials back to raw.</div></div><div class="vilCard"><b>Total processed materials</b><div class="vilScroll"><table class="vilTable"><thead><tr><th>Material</th><th>Need</th><th>Have</th><th>Missing</th></tr></thead><tbody>' + materialRows(plan.totalProcessed, true) + '</tbody></table></div></div><div class="vilCard"><b>Total raw equivalent</b><div class="vilScroll"><table class="vilTable"><thead><tr><th>Raw material</th><th>Need</th><th>Have</th><th>Missing</th></tr></thead><tbody>' + materialRows(plan.totalRaw, true) + '</tbody></table></div></div><div class="vilCard"><b>Missing after inventory – processed</b><div class="vilScroll"><table class="vilTable"><thead><tr><th>Material</th><th>Qty</th></tr></thead><tbody>' + materialRows(missingProcessed, false) + '</tbody></table></div></div><div class="vilCard"><b>Missing after inventory – raw equivalent</b><div class="vilScroll"><table class="vilTable"><thead><tr><th>Raw material</th><th>Qty</th></tr></thead><tbody>' + materialRows(missingRaw, false) + '</tbody></table></div></div>' + playerCards; }

    function render() {
      const body = state.tab === 'tools' ? toolsBody()
                 : state.tab === 'runes' ? runesBody()
                 : state.tab === 'planner' ? plannerBody()
                 : inventoryBody();
      return (state.msg ? '<div class="vilCard vilTiny">' + esc(state.msg) + '</div>' : '')
           + '<div class="vilTabs">'
           + tabButton('inventory', 'Inventory') + tabButton('tools', 'Tools') + tabButton('runes', 'Runes') + tabButton('planner', 'Planner')
           + '</div>'
           + body;
    }

    function renderIntoPanel() {
      if (!appRef) return;
      const panel = appRef.ui.getPanel(definition.id);
      if (!panel) return;
      const bodyEl = panel.querySelector('.vim-body');
      if (!bodyEl) return;
      bodyEl.innerHTML = render();
      makeCardsCollapsible(panel);
      bindEvents(panel);
    }

    function bindEvents(panel) {
      panel.querySelectorAll('[data-tab]').forEach(btn => { btn.onclick = () => { state.tab = btn.dataset.tab; localStorage.setItem(LS.tab, state.tab); renderIntoPanel(); }; });
      panel.querySelectorAll('[data-remove-tool-record]').forEach(btn => { btn.onclick = () => removeToolRecord(btn.dataset.removeToolRecord); });
      const tierSelect = panel.querySelector('#vilTargetTier'); if (tierSelect) { tierSelect.value = String(state.targetTier); tierSelect.onchange = () => { state.targetTier = Number(tierSelect.value || 2); localStorage.setItem(LS.targetTier, String(state.targetTier)); renderIntoPanel(); }; }
      const runeTierSelect = panel.querySelector('#vilRuneTier'); if (runeTierSelect) { runeTierSelect.value = String(state.runeTier); runeTierSelect.onchange = () => { state.runeTier = Number(runeTierSelect.value || 1); localStorage.setItem(LS.runeTier, String(state.runeTier)); renderIntoPanel(); }; }
      panel.querySelectorAll('[data-rune-qty]').forEach(input => { input.onchange = input.oninput = () => { const id = input.dataset.runeQty; const qty = Math.max(0, Math.floor(Number(input.value || 0))); if (qty > 0) state.runeQty[id] = qty; else delete state.runeQty[id]; saveJSON(LS.runeQty, state.runeQty); renderIntoPanel(); }; });
      panel.querySelectorAll('[data-act]').forEach(btn => { btn.onclick = () => { const act = btn.dataset.act; if (act === 'scanInventory') scanInventory(); if (act === 'copyInventory') copyText(JSON.stringify({ scannedAt: localStorage.getItem(LS.scannedAt) || null, inventory: state.inventory }, null, 2), 'Inventory copied.'); if (act === 'clearInventory') clearInventory(); if (act === 'loadCrafting') loadCrafting(); if (act === 'copyCrafting') copyText(JSON.stringify(state.crafting || {}, null, 2), 'Crafting cache copied.'); if (act === 'copyCraftingSniff') copyText(JSON.stringify(window.__vilLastCraftingRequest || loadJSON(LS.debugCraftingResponse, null) || { error: 'No /api/crafting sniff saved yet. Click Load / Refresh Crafting Data first.' }, null, 2), 'Crafting sniff copied.'); if (act === 'clearCrafting') clearCrafting(); if (act === 'loadPartyTools') loadPartyTools(); if (act === 'copyTools') copyText(JSON.stringify({ loadedAt: localStorage.getItem(LS.partyToolsAt) || null, partyTools: state.partyTools }, null, 2), 'Tools copied.'); if (act === 'clearTools') clearTools(); if (act === 'copyPlanner') copyText(JSON.stringify(plannerAll(), null, 2), 'Planner copied.'); if (act === 'copyRunePlan') copyText(JSON.stringify(selectedRunePlan(), null, 2), 'Rune plan copied.'); if (act === 'copySpiritDebug') copyText(JSON.stringify(debugCraftingSpiritEssenceSources(), null, 2), 'Spirit Essence debug copied.'); if (act === 'clearRuneSelection') clearRuneSelection(); }; });
    }

    return {
      id: definition.id,
      name: definition.name,
      icon: definition.icon || '🗓️',
      description: definition.description || '',

      init(app) {
        appRef = app;
        installCSS();
        app.ui.registerPanel({
          id: definition.id,
          title: definition.name,
          icon: definition.icon || '🗓️',
          render: () => render(),
          footer: 'Inventory: ' + Object.keys(state.inventory).length + ' · Tool recipes: ' + getToolRecipes().length + ' · Runes: ' + getRuneRecipes().length,
        });
        renderIntoPanel();
      },

      destroy() {
        document.getElementById('vilCss')?.remove();
      },
    };
  }

  window.VoidIdleModules = window.VoidIdleModules || {};
  window.VoidIdleModules['party-planner'] = createPartyPlannerModule({
    id: 'party-planner',
    name: 'Party Planner',
    icon: '🗓️',
    description: 'Inventory scan, party tools, rune planner, tool planner, and crafting debug.',
  });
})();
