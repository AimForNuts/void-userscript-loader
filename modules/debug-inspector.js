(function () {
  'use strict';

  function createDebugInspectorModule(definition) {
    let overlayEl = null;
    let originalFetch = null;
    const captured = { network: [] };
    const JWT_RE = /^eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/;
    const AUTH_RE = /user|auth|login|me|profile|account/i;

    function decodeJWT(token) {
      try {
        const part = token.split('.')[1];
        const padded = part + '==='.slice((part.length + 3) % 4 === 0 ? 0 : (part.length + 3) % 4);
        return JSON.parse(atob(padded.replace(/-/g, '+').replace(/_/g, '/')));
      } catch { return null; }
    }

    function scanStorage() {
      const result = { jwt: {}, strings: {} };
      for (const [label, store] of [['localStorage', localStorage], ['sessionStorage', sessionStorage]]) {
        try {
          for (let i = 0; i < store.length; i++) {
            const key = store.key(i);
            if (!key) continue;
            const val = store.getItem(key);
            if (!val) continue;
            if (JWT_RE.test(val.trim())) {
              result.jwt[label + '.' + key] = decodeJWT(val.trim());
            } else if (val.length < 128 && !/^\{/.test(val) && !/^\[/.test(val)) {
              result.strings[label + '.' + key] = val.trim();
            }
          }
        } catch {}
      }
      return result;
    }

    function hookFetch() {
      originalFetch = window.fetch;
      window.fetch = async function (...args) {
        const res = await originalFetch.apply(this, args);
        try {
          const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
          if (AUTH_RE.test(url) && captured.network.length < 20) {
            res.clone().json().then(data => {
              if (data && typeof data === 'object') {
                captured.network.push({ url, data });
                renderOverlay();
              }
            }).catch(() => {});
          }
        } catch {}
        return res;
      };
    }

    function esc(s) {
      return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    }

    function pre(obj, color) {
      return '<pre style="margin:0;padding:6px 8px;background:#0d1620;border:1px solid #35506f;border-radius:6px;font-size:10px;color:' + color + ';white-space:pre-wrap;word-break:break-all">'
        + esc(JSON.stringify(obj, null, 2)) + '</pre>';
    }

    const copyData = {};

    function renderContent() {
      const storage = scanStorage();
      copyData.storage = JSON.stringify(storage, null, 2);
      copyData.network = JSON.stringify(captured.network, null, 2);
      copyData.all = JSON.stringify({ storage, network: captured.network }, null, 2);

      const networkContent = captured.network.length
        ? pre(captured.network, '#7dffb2')
        : '<div style="padding:6px 8px;background:#0d1620;border:1px solid #35506f;border-radius:6px;font-size:10px;color:#4a5568">No matching requests captured yet</div>';

      return '<div style="font:12px/1.4 system-ui,sans-serif;color:#eaf4ff">'
        + '<div id="dbg-handle" style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:#111c31;border-bottom:1px solid #35506f;cursor:grab;user-select:none">'
        + '<span style="font-weight:900;font-size:11px">🔬 Debug Inspector</span>'
        + '<button data-act="close" style="background:none;border:none;color:#aab8ce;cursor:pointer;font-size:16px;line-height:1;padding:0 2px">×</button>'
        + '</div>'
        + '<div style="padding:8px 10px;max-height:420px;overflow-y:auto">'
        + section('Storage', 'storage', pre(storage, '#ffd580'))
        + section('Network (' + captured.network.length + ')', 'network', networkContent)
        + '<button data-act="copy-all" style="width:100%;background:#1a2d4a;border:1px solid #35506f;color:#eaf4ff;border-radius:8px;padding:6px;font-size:11px;font-weight:800;cursor:pointer;margin-top:4px">Copy All</button>'
        + '</div>'
        + '</div>';
    }

    function section(label, key, content) {
      return '<div style="margin-bottom:8px">'
        + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">'
        + '<span style="font-size:10px;text-transform:uppercase;color:#a9bddb;font-weight:700">' + label + '</span>'
        + '<button data-act="copy-' + key + '" style="background:#111c31;border:1px solid #35506f;color:#eaf4ff;border-radius:6px;padding:2px 8px;font-size:10px;cursor:pointer">Copy</button>'
        + '</div>'
        + content
        + '</div>';
    }

    function renderOverlay() {
      if (!overlayEl) return;
      overlayEl.innerHTML = renderContent();
      bindEvents();
    }

    function bindEvents() {
      overlayEl.querySelector('[data-act="close"]').onclick = () => overlayEl.style.display = 'none';
      overlayEl.querySelector('[data-act="copy-storage"]').onclick = () => navigator.clipboard.writeText(copyData.storage).catch(() => {});
      overlayEl.querySelector('[data-act="copy-network"]').onclick = () => navigator.clipboard.writeText(copyData.network).catch(() => {});
      overlayEl.querySelector('[data-act="copy-all"]').onclick = () => navigator.clipboard.writeText(copyData.all).catch(() => {});

      const handle = overlayEl.querySelector('#dbg-handle');
      handle.addEventListener('mousedown', onDragStart);
      handle.addEventListener('touchstart', onDragStart, { passive: true });
    }

    function onDragStart(e) {
      const touch = e.touches?.[0] || e;
      const startX = touch.clientX;
      const startY = touch.clientY;
      const rect = overlayEl.getBoundingClientRect();
      let left = rect.left;
      let top = rect.top;
      overlayEl.style.right = 'auto';
      overlayEl.style.bottom = 'auto';
      overlayEl.style.left = left + 'px';
      overlayEl.style.top = top + 'px';

      function onMove(e) {
        const t = e.touches?.[0] || e;
        left = rect.left + (t.clientX - startX);
        top = rect.top + (t.clientY - startY);
        overlayEl.style.left = left + 'px';
        overlayEl.style.top = top + 'px';
      }
      function onEnd() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onEnd);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onEnd);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onEnd);
      document.addEventListener('touchmove', onMove, { passive: true });
      document.addEventListener('touchend', onEnd);
    }

    return {
      id: definition.id,
      name: definition.name,
      icon: definition.icon || '🔬',
      description: definition.description || '',

      init() {
        overlayEl = document.createElement('div');
        overlayEl.id = 'void-debug-inspector';
        overlayEl.style.cssText = 'position:fixed;bottom:16px;right:16px;width:340px;background:#0f1923;border:1px solid #35506f;border-radius:10px;box-shadow:0 4px 24px rgba(0,0,0,.6);z-index:2147483647;overflow:hidden';
        document.body.appendChild(overlayEl);
        hookFetch();
        renderOverlay();
      },

      destroy() {
        if (originalFetch) { window.fetch = originalFetch; originalFetch = null; }
        if (overlayEl) { overlayEl.remove(); overlayEl = null; }
      },
    };
  }

  window.VoidIdleModules = window.VoidIdleModules || {};
  window.VoidIdleModules['debug-inspector'] = createDebugInspectorModule({
    id: 'debug-inspector',
    name: 'Debug Inspector',
    icon: '🔬',
    version: '2026-05-04.1',
    description: 'Dev-only overlay: dumps JWT payload, localStorage strings, and captured auth-endpoint responses.',
  });
})();
