/* =========================================================
   APIS AI — theme.js
   Handles light/dark theme switching + persistence.
   ========================================================= */

const ApisTheme = (() => {
  function getStoredTheme() {
    const user = (typeof ApisDB !== 'undefined') ? ApisDB.currentUser() : null;
    if (user) {
      const settings = ApisDB.getSettings(user.email);
      if (settings.theme) return settings.theme;
    }
    return localStorage.getItem('apis_theme_guest') || 'light';
  }

  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.colorScheme = theme;
    const switchEl = document.querySelector('.theme-switch');
    if (switchEl) switchEl.setAttribute('aria-checked', theme === 'dark');
  }

  function set(theme) {
    const persist = () => {
      const user = (typeof ApisDB !== 'undefined') ? ApisDB.currentUser() : null;
      if (user) {
        ApisDB.saveSettings(user.email, { theme });
      } else {
        localStorage.setItem('apis_theme_guest', theme);
      }
    };

    // Smooth whole-page crossfade via the View Transitions API where supported.
    if (document.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.startViewTransition(() => {
        apply(theme);
        persist();
      });
    } else {
      apply(theme);
      persist();
    }
  }

  function toggle() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'light' ? 'dark' : 'light';
    set(next);
    return next;
  }

  function init() {
    apply(getStoredTheme());
    document.querySelectorAll('.theme-switch').forEach(sw => {
      sw.addEventListener('click', () => toggle());
    });
  }

  return { init, toggle, set, apply };
})();

document.addEventListener('DOMContentLoaded', ApisTheme.init);
