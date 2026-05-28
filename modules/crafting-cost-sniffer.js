(function () {
  'use strict';

  function createCraftingCostSnifferModule(definition) {
    let _scanCancelled = false;

    const state = {
      results: [],
      scanning: false,
      progress: { current: 0, total: 0 },
      error: null,
    };

    function escapeHtml(value) {
      return String(value ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
      }[c]));
    }

    function delay(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    function findSkillingGearSubcat() {
      for (const subcat of document.querySelectorAll('.cv-subcat')) {
        const label = subcat.querySelector('.cv-subcat-label');
        if (label && label.textContent.trim().toLowerCase() === 'skilling gear') {
          return subcat;
        }
      }
      return null;
    }

    function parseDetail(detail) {
      const materials = [];
      for (const mat of detail.querySelectorAll('.cv-detail-mat')) {
        const name = mat.querySelector('.cv-detail-mat-name')?.textContent.trim() || '';
        const qtyText = mat.querySelector('.cv-detail-mat-qty')?.textContent.trim() || '';
        const parts = qtyText.split(' / ');
        const have = parseInt(parts[0] || '0', 10);
        const required = parseInt(parts[1] || '0', 10);
        if (name) materials.push({ name, required, have });
      }
      return materials;
    }

    function renderStyles() {
      return `
        <style>
          .ccs-toolbar { display:flex; flex-wrap:wrap; gap:7px; align-items:center; margin-bottom:9px; }
          .ccs-status { color:rgba(229,231,235,0.55); font-size:11px; }
          .ccs-body { border:1px solid rgba(255,255,255,0.08); border-radius:10px; background:rgba(255,255,255,0.035); overflow:auto; max-height:520px; }
          .ccs-pre { margin:0; padding:10px; white-space:pre-wrap; word-break:break-word; font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:11px; line-height:1.35; color:rgba(229,231,235,0.82); }
          .ccs-placeholder { padding:14px; color:rgba(229,231,235,0.45); font-size:12px; }
          .ccs-error { padding:10px; color:#fbbf24; font-size:12px; }
        </style>
      `;
    }

    function render() {
      let bodyContent;
      if (state.error) {
        bodyContent = `<div class="ccs-error">⚠ ${escapeHtml(state.error)}</div>`;
      } else if (state.scanning) {
        bodyContent = `<div class="ccs-placeholder">Scanning ${state.progress.current} / ${state.progress.total}…</div>`;
      } else if (state.results.length > 0) {
        bodyContent = `<pre class="ccs-pre">${escapeHtml(JSON.stringify(state.results, null, 2))}</pre>`;
      } else {
        bodyContent = `<div class="ccs-placeholder">Open the crafting page, navigate to Skilling Gear, then click Scan.</div>`;
      }

      const statusText = state.scanning
        ? `Scanning ${state.progress.current} / ${state.progress.total}…`
        : state.results.length > 0
        ? `${state.results.length} items captured`
        : '';

      return `
        ${renderStyles()}
        <div class="ccs-toolbar">
          <button class="vim-btn" data-ccs-scan${state.scanning ? ' disabled' : ''}>Scan Skilling Gear</button>
          ${statusText ? `<span class="ccs-status">${escapeHtml(statusText)}</span>` : ''}
          ${state.results.length > 0 ? `<button class="vim-btn" data-ccs-copy>Copy JSON</button>` : ''}
        </div>
        <div class="ccs-body">${bodyContent}</div>
      `;
    }

    function attachEvents(app) {
      const panel = app.ui.getPanel(definition.id);
      if (!panel) return;

      panel.querySelector('[data-ccs-scan]')?.addEventListener('click', () => {
        if (!state.scanning) runScan(app);
      });

      panel.querySelector('[data-ccs-copy]')?.addEventListener('click', async () => {
        const text = JSON.stringify(state.results, null, 2);
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          console.log(text);
          alert('Could not copy automatically. JSON printed to console.');
        }
      });
    }

    function renderIntoPanel(app) {
      const panel = app.ui.getPanel(definition.id);
      if (!panel) return;
      const body = panel.querySelector('.vim-body');
      const footer = panel.querySelector('.vim-footer');
      if (!body || !footer) return;

      body.innerHTML = render();
      attachEvents(app);

      footer.textContent = state.scanning
        ? `Scanning ${state.progress.current} / ${state.progress.total}`
        : state.error
        ? '0 items | Error'
        : `${state.results.length} items | Idle`;
    }

    async function runScan(app) {
      _scanCancelled = false;
      state.scanning = true;
      state.results = [];
      state.error = null;
      state.progress = { current: 0, total: 0 };
      renderIntoPanel(app);

      const subcat = findSkillingGearSubcat();
      if (!subcat) {
        state.error = 'Skilling Gear subcategory not found. Open the crafting page first.';
        state.scanning = false;
        renderIntoPanel(app);
        return;
      }

      const cards = Array.from(subcat.querySelectorAll('.cv-recipe-card'));
      state.progress.total = cards.length;
      renderIntoPanel(app);

      for (const card of cards) {
        if (_scanCancelled) break;

        const name = card.querySelector('.cv-recipe-card-name')?.textContent.trim() || '';
        const lockText = card.querySelector('.cv-recipe-card-lock')?.textContent.trim() || '';
        const levelRequired = parseInt(lockText.replace(/lv\s*/i, ''), 10) || 0;

        card.click();
        await delay(150);

        const detail = subcat.querySelector('.cv-detail');
        const materials = detail ? parseDetail(detail) : [];

        state.results.push({ name, levelRequired, materials });
        state.progress.current++;
        renderIntoPanel(app);
      }

      state.scanning = false;
      renderIntoPanel(app);
    }

    return {
      ...definition,

      init(app) {
        app.ui.registerPanel({
          id:     definition.id,
          title:  definition.name,
          icon:   definition.icon || '🔬',
          render: () => render(),
          footer: '',
        });
        renderIntoPanel(app);
      },

      destroy() {
        _scanCancelled = true;
        state.results = [];
        state.scanning = false;
        state.error = null;
        state.progress = { current: 0, total: 0 };
      },
    };
  }

  window.VoidIdleModules = window.VoidIdleModules || {};
  window.VoidIdleModules['crafting-cost-sniffer'] = createCraftingCostSnifferModule({
    id:          'crafting-cost-sniffer',
    name:        'Crafting Cost Sniffer',
    icon:        '🔬',
    version:     '2026-05-28.1',
    description: 'Scans Skilling Gear crafting recipes and captures material costs as JSON.',
  });
})();
