(function () {
  'use strict';

  function createLifeskillTrackerModule(definition) {
    const state = {
      stopTimer: null,
    };

    // Format milliseconds as "001d 04h 25m 35s"
    function formatTTL(ms) {
      if (!Number.isFinite(ms) || ms <= 0) return '---';
      const totalSec = Math.floor(ms / 1000);
      const d = Math.floor(totalSec / 86400);
      const h = Math.floor((totalSec % 86400) / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;
      return [
        String(d).padStart(3, '0') + 'd',
        String(h).padStart(2, '0') + 'h',
        String(m).padStart(2, '0') + 'm',
        String(s).padStart(2, '0') + 's',
      ].join(' ');
    }

    // Format a future Date as local "at HH:MM AM/PM"
    function formatETA(ms) {
      if (!Number.isFinite(ms) || ms <= 0) return '';
      const eta = new Date(Date.now() + ms);
      return 'at ' + eta.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }

    return {
      ...definition,
      init(_app) {},
      destroy() {
        if (state.stopTimer) {
          clearTimeout(state.stopTimer);
          state.stopTimer = null;
        }
      },
    };
  }

  window.VoidIdleModules = window.VoidIdleModules || {};
  window.VoidIdleModules['lifeskill-tracker'] = createLifeskillTrackerModule({
    id:          'lifeskill-tracker',
    name:        'Lifeskill Tracker',
    icon:        '⛏',
    version:     '2026-05-27.1',
    description: 'Shows time to next level and ETA in the active skill header.',
  });
})();
