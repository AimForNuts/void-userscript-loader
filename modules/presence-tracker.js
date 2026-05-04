(function () {
  'use strict';

  function createPresenceTrackerModule(definition) {
    let appRef;
    let heartbeatInterval = null;
    let refreshInterval = null;

    const WORKER_URL = 'https://void-presence.josepsloliveira.workers.dev';
    const WRITE_SECRET = 'vp_w_0b34abb6aa390c112968735060164d73';
    const READ_SECRET = 'vp_r_c7d5a05bd4e73ab2450fe061c83dc820';
    const OWNER = 'AimForNuts';

    const state = {
      username: null,
      playerId: null,
      users: [],
      loading: false,
      error: '',
      lastRefresh: null,
    };

    async function getCurrentUser() {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          if (data.username) return { username: data.username, playerId: data.playerId || null };
        }
      } catch {}
      return null;
    }

    const LIVE_THRESHOLD_MS = 2 * 60 * 60 * 1000;
    function isLive(user) { return user.lastSeen && (Date.now() - user.lastSeen) < LIVE_THRESHOLD_MS; }

    async function sendHeartbeat() {
      if (!state.username || WORKER_URL === 'YOUR_WORKER_URL') return;
      try {
        await fetch(WORKER_URL + '/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + WRITE_SECRET },
          body: JSON.stringify({ username: state.username, playerId: state.playerId, version: definition.version }),
        });
      } catch {}
    }

    async function fetchPresence() {
      if (WORKER_URL === 'YOUR_WORKER_URL') { state.error = 'Worker URL not configured.'; renderIntoPanel(); return; }
      state.loading = true;
      state.error = '';
      renderIntoPanel();
      try {
        const res = await fetch(WORKER_URL + '/presence', {
          headers: { 'Authorization': 'Bearer ' + READ_SECRET },
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const fresh = await res.json();
        const map = new Map(state.users.map(u => [u.username, u]));
        for (const u of fresh) {
          const existing = map.get(u.username);
          if (!existing || u.lastSeen > (existing.lastSeen || 0)) map.set(u.username, u);
        }
        state.users = [...map.values()];
        state.lastRefresh = new Date();
      } catch (e) {
        state.error = 'Failed to load: ' + (e.message || e);
      } finally {
        state.loading = false;
        renderIntoPanel();
      }
    }

    async function clearPresence() {
      try {
        const res = await fetch(WORKER_URL + '/clear', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + WRITE_SECRET },
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        state.users = [];
        state.lastRefresh = new Date();
      } catch (e) {
        state.error = 'Failed to clear: ' + (e.message || e);
      } finally {
        renderIntoPanel();
      }
    }

    function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
    function timeAgo(ts) { const s = Math.floor((Date.now() - ts) / 1000); if (s < 60) return s + 's ago'; if (s < 3600) return Math.floor(s / 60) + 'm ago'; return Math.floor(s / 3600) + 'h ago'; }

    function render() {
      if (state.loading) {
        return '<div style="padding:10px;color:#aab8ce;font-size:12px">Loading...</div>';
      }
      if (state.error) {
        return '<div style="padding:10px;color:#ffd1d1;font-size:12px">' + esc(state.error) + '</div>';
      }
      const users = state.users.slice().sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
      const liveCount = users.filter(isLive).length;
      const refreshedAt = state.lastRefresh ? state.lastRefresh.toLocaleTimeString() : 'never';
      const rows = users.map(u => {
        const live = isLive(u);
        return '<tr>'
          + '<td style="padding:6px 8px;border-bottom:1px solid rgba(255,255,255,.07)">'
          + '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:' + (live ? '#7dffb2' : '#4a5568') + ';margin-right:6px;vertical-align:middle"></span>'
          + esc(u.username) + '</td>'
          + '<td style="padding:6px 8px;border-bottom:1px solid rgba(255,255,255,.07);color:#aab8ce;font-size:10px">' + esc(u.playerId || '—') + '</td>'
          + '<td style="padding:6px 8px;border-bottom:1px solid rgba(255,255,255,.07);color:#aab8ce;font-size:10px">' + esc(u.version || '—') + '</td>'
          + '<td style="padding:6px 8px;border-bottom:1px solid rgba(255,255,255,.07);color:' + (live ? '#7dffb2' : '#aab8ce') + ';font-size:10px">' + (u.lastSeen ? esc(timeAgo(u.lastSeen)) : '—') + '</td>'
          + '</tr>';
      }).join('') || '<tr><td colspan="4" style="padding:8px;color:#92a3bd;font-size:12px">No users seen yet</td></tr>';

      return '<div style="padding:10px;font:12px/1.35 system-ui,sans-serif;color:#eaf4ff">'
        + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap">'
        + '<span style="font-weight:900">' + users.length + ' seen</span>'
        + '<span style="color:#7dffb2;font-size:11px">(' + liveCount + ' live)</span>'
        + '<button data-act="refresh" style="background:#111c31;border:1px solid #35506f;color:#eaf4ff;border-radius:8px;padding:3px 10px;font-size:11px;font-weight:800;cursor:pointer">Refresh</button>'
        + '<button data-act="clear" style="background:#1c1118;border:1px solid #6f3545;color:#ffd1d1;border-radius:8px;padding:3px 10px;font-size:11px;font-weight:800;cursor:pointer">Clear All</button>'
        + '<span style="font-size:10px;color:#aab8ce;margin-left:auto">Updated ' + esc(refreshedAt) + '</span>'
        + '</div>'
        + '<table style="width:100%;border-collapse:collapse">'
        + '<thead><tr>'
        + '<th style="font-size:10px;text-transform:uppercase;color:#a9bddb;padding:4px 8px;text-align:left;border-bottom:1px solid rgba(255,255,255,.12)">Username</th>'
        + '<th style="font-size:10px;text-transform:uppercase;color:#a9bddb;padding:4px 8px;text-align:left;border-bottom:1px solid rgba(255,255,255,.12)">Player ID</th>'
        + '<th style="font-size:10px;text-transform:uppercase;color:#a9bddb;padding:4px 8px;text-align:left;border-bottom:1px solid rgba(255,255,255,.12)">Version</th>'
        + '<th style="font-size:10px;text-transform:uppercase;color:#a9bddb;padding:4px 8px;text-align:left;border-bottom:1px solid rgba(255,255,255,.12)">Last Seen</th>'
        + '</tr></thead>'
        + '<tbody>' + rows + '</tbody>'
        + '</table>'
        + '</div>';
    }

    function renderIntoPanel() {
      if (!appRef) return;
      const panel = appRef.ui.getPanel(definition.id);
      if (!panel) return;
      const bodyEl = panel.querySelector('.vim-body');
      if (!bodyEl) return;
      bodyEl.innerHTML = render();
      bindEvents(panel);
    }

    function bindEvents(panel) {
      panel.querySelectorAll('[data-act]').forEach(btn => {
        btn.onclick = () => {
          if (btn.dataset.act === 'refresh') fetchPresence();
          else if (btn.dataset.act === 'clear') clearPresence();
        };
      });
    }

    return {
      id: definition.id,
      name: definition.name,
      icon: definition.icon || '👁️',
      description: definition.description || '',

      init(app) {
        appRef = app;

        getCurrentUser().then(user => {
          if (!user) return;
          state.username = user.username;
          state.playerId = user.playerId;
          sendHeartbeat();
          heartbeatInterval = setInterval(sendHeartbeat, 60 * 60 * 1000);

          if (state.username === OWNER) {
            app.ui.registerPanel({
              id: definition.id,
              title: definition.name,
              icon: definition.icon || '👁️',
              render: () => render(),
            });
            fetchPresence();
            refreshInterval = setInterval(fetchPresence, 30 * 60 * 1000);
          }
        });
      },

      destroy() {
        if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
        if (refreshInterval) { clearInterval(refreshInterval); refreshInterval = null; }
      },
    };
  }

  window.VoidIdleModules = window.VoidIdleModules || {};
  window.VoidIdleModules['presence-tracker'] = createPresenceTrackerModule({
    id: 'presence-tracker',
    name: 'Presence Tracker',
    icon: '👁️',
    version: '2026-05-04.1',
    description: 'Tracks who is using the tool (AimForNuts only).',
  });
})();
