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

    // Find the .gv-skill-header whose .gv-skill-name matches the skill name (case-insensitive)
    function findSkillHeader(skillName) {
      const headers = document.querySelectorAll('.gv-skill-header');
      for (const header of headers) {
        const nameEl = header.querySelector('.gv-skill-name');
        if (nameEl && nameEl.textContent.trim().toLowerCase() === skillName.toLowerCase()) {
          return header;
        }
      }
      return null;
    }

    // Get (or create and insert) the TTL span inside a header
    function getOrCreateSpan(header) {
      let span = header.querySelector('.gv-ttl-inline');
      if (!span) {
        const xphrEl = header.querySelector('.gv-xphr-inline');
        span = document.createElement('span');
        span.className = 'gv-ttl-inline';
        span.style.cssText = 'font-size:inherit;color:#aaa;margin-left:8px;';
        if (xphrEl) {
          xphrEl.insertAdjacentElement('afterend', span);
        } else {
          header.appendChild(span);
        }
      }
      return span;
    }

    // Remove TTL span from a header if present
    function removeSpan(header) {
      const span = header && header.querySelector('.gv-ttl-inline');
      if (span) span.remove();
    }

    return {
      ...definition,
      init(app) {
        app.events.on('socket:any', (msg) => {
          if (msg.type !== 'gatherTick') return;

          const { skill, skillXp, skillXpToNext, xpGain, tickMs } = msg;

          // Skip ticks with no XP gain (avoids division by zero)
          if (!xpGain || !tickMs) return;

          const xpPerMs = xpGain / tickMs;
          const xpRemaining = skillXpToNext - skillXp;
          const msRemaining = xpRemaining / xpPerMs;

          const header = findSkillHeader(skill);
          if (header) {
            const span = getOrCreateSpan(header);
            span.textContent = `→ ${formatTTL(msRemaining)}  ${formatETA(msRemaining)}`;
          }

          // Reset stop-detection timer: remove span if no tick arrives within 2.5× tickMs
          if (state.stopTimer) clearTimeout(state.stopTimer);
          state.stopTimer = setTimeout(() => {
            const h = findSkillHeader(skill);
            removeSpan(h);
            state.stopTimer = null;
          }, tickMs * 2.5);
        });
      },
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
