(function () {
  'use strict';

  function createGuildHelperModule(definition) {
    const state = {
      guildData: null,
      badge: null,
      observer: null,
      unsub: null,
      fetchUnsub: null,
    };

    const GUILD_SELECTORS = [
      '.guild-panel',
      '.guild-view',
      '.guild-page',
      '[class*="guild-wrap"]',
    ];

    function findGuildContainer() {
      for (const sel of GUILD_SELECTORS) {
        const el = document.querySelector(sel);
        if (el) return el;
      }
      return null;
    }

    function formatGold(n) {
      return Number(n || 0).toLocaleString() + 'g';
    }

    function escapeHtml(value) {
      return String(value ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
      }[c]));
    }

    function renderBadgeHtml() {
      const guild = state.guildData?.guild || state.guildData || {};
      const vaultGold = guild.vaultGold || 0;
      const cost = guild.levelClaimCost || 0;
      const canClaim = guild.canClaimLevel === true;
      const goldOk = vaultGold >= cost;
      const deficit = cost - vaultGold;

      const goldStatus = goldOk
        ? `<span style="color:#4ade80">✓</span>`
        : `<span style="color:#fbbf24">(need ${escapeHtml(formatGold(deficit))} more)</span>`;

      const readyChip = canClaim
        ? `<span style="color:#4ade80;font-weight:600">✅ Ready to level!</span>`
        : '';

      return `<div class="gh-badge" style="
        display:flex;
        align-items:center;
        justify-content:space-between;
        padding:9px 14px;
        margin:6px 0;
        background:rgba(255,255,255,0.04);
        border:1px solid rgba(148,163,184,0.13);
        border-radius:8px;
        font-family:inherit;
        font-size:inherit;
        color:inherit;
        box-sizing:border-box;
        width:100%;
      ">
        <span style="opacity:0.5;font-weight:600">🏛 Guild Helper</span>
        <span>Next level: <strong>${escapeHtml(formatGold(cost))}</strong></span>
        <span>Vault: <strong>${escapeHtml(formatGold(vaultGold))}</strong> ${goldStatus}</span>
        ${readyChip}
      </div>`;
    }

    function injectBadge(container) {
      const wrap = document.createElement('div');
      wrap.innerHTML = renderBadgeHtml();
      const badge = wrap.firstElementChild;
      const anchor = container.querySelector('.guild-xp-section');
      if (anchor) {
        anchor.after(badge);
      } else {
        container.prepend(badge);
      }
      state.badge = badge;
    }

    function updateBadge() {
      if (!state.badge || !state.badge.isConnected) {
        state.badge = null;
        return;
      }
      const wrap = document.createElement('div');
      wrap.innerHTML = renderBadgeHtml();
      const next = wrap.firstElementChild;
      state.badge.replaceWith(next);
      state.badge = next;
    }

    function tryInject() {
      // Clear stale badge reference if it left the DOM
      if (state.badge && !state.badge.isConnected) {
        state.badge = null;
      }
      if (state.badge) return;
      if (!state.guildData) return;

      const container = findGuildContainer();
      if (!container) return;

      injectBadge(container);
    }

    function startObserver() {
      if (state.observer) return;
      state.observer = new MutationObserver(() => tryInject());
      state.observer.observe(document.body, { childList: true, subtree: true });
    }

    function stopObserver() {
      if (state.observer) {
        state.observer.disconnect();
        state.observer = null;
      }
    }

    function removeBadge() {
      if (state.badge) {
        state.badge.remove();
        state.badge = null;
      }
    }

    // Patch window.fetch in the page context via script-tag injection (same
    // pattern as SocketCore for WebSocket) so the intercept survives
    // Tampermonkey's sandbox isolation. The page-side script dispatches a
    // CustomEvent with the JSON payload; we listen for it in sandbox context
    // and relay it onto the app event bus.
    const RELAY_EVENT = '__voidGuildHelperData';

    function installFetchHook(app) {
      if (!window.__voidGuildHelperPageHooked) {
        window.__voidGuildHelperPageHooked = true;
        const script = document.createElement('script');
        script.textContent = `(function(){
          if (window.__voidGuildHelperFetchPatched) return;
          window.__voidGuildHelperFetchPatched = true;
          const _orig = window.fetch;
          window.fetch = async function(...args) {
            const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
            const res = await _orig.apply(this, args);
            if (/\\/api\\/guild($|\\?)/i.test(url)) {
              res.clone().json().then(data => {
                window.dispatchEvent(new CustomEvent('${RELAY_EVENT}', { detail: JSON.stringify(data) }));
              }).catch(() => {});
            }
            return res;
          };
        })()`;
        document.documentElement.appendChild(script);
        script.remove();
      }

      const handler = (e) => {
        try {
          app.events.emit('guild-helper:data', JSON.parse(e.detail));
        } catch {}
      };
      window.addEventListener(RELAY_EVENT, handler);
      return () => window.removeEventListener(RELAY_EVENT, handler);
    }

    return {
      ...definition,

      init(app) {
        state.fetchUnsub = installFetchHook(app);
        startObserver();

        state.unsub = app.events.on('guild-helper:data', (data) => {
          state.guildData = data;
          if (state.badge && state.badge.isConnected) {
            updateBadge();
          } else {
            state.badge = null;
            tryInject();
          }
        });

        // In case the game already fetched guild data before this module
        // loaded (rare but possible on reload), try injecting immediately.
        tryInject();
      },

      destroy() {
        stopObserver();
        removeBadge();
        if (state.unsub) {
          state.unsub();
          state.unsub = null;
        }
        if (state.fetchUnsub) {
          state.fetchUnsub();
          state.fetchUnsub = null;
        }
      },
    };
  }

  window.VoidIdleModules = window.VoidIdleModules || {};
  window.VoidIdleModules['guild-helper'] = createGuildHelperModule({
    id:          'guild-helper',
    name:        'Guild Helper',
    icon:        '🏛',
    version:     '2026-05-08.4',
    description: 'Shows vault gold vs next level cost when visiting the guild page.',
  });
})();
