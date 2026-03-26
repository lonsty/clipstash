// ClipStash — CM6 lazy loader
// Loads cm6.min.js on demand to avoid blocking page load.

let _loading = null;
let _loaded = false;

/**
 * Resolves the absolute URL for cm6.min.js.
 * Uses chrome.runtime.getURL for extension context, relative path for desktop.
 */
function resolveCM6Url() {
  // Chrome extension context
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
    return chrome.runtime.getURL('vendor/cm6.min.js');
  }
  // Desktop (Tauri) — relative to current page
  return 'vendor/cm6.min.js';
}

/**
 * ensureCM6 lazy-loads the CM6 bundle if not already loaded.
 * Returns a promise that resolves to window.CM6.
 * @returns {Promise<object|null>}
 */
export function ensureCM6() {
  if (_loaded && window.CM6) return Promise.resolve(window.CM6);
  if (_loading) return _loading;

  _loading = new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = resolveCM6Url();
    script.onload = () => {
      _loaded = true;
      _loading = null;
      // Notify the app that CM6 is ready — cards can be re-rendered with highlighting
      window.dispatchEvent(new CustomEvent('cm6-ready'));
      resolve(window.CM6 || null);
    };
    script.onerror = () => {
      _loading = null;
      console.warn('[CM6] Failed to load cm6.min.js from:', script.src);
      resolve(null);
    };
    document.head.appendChild(script);
  });

  return _loading;
}

/**
 * getCM6Sync returns window.CM6 if already loaded, or null.
 * Does NOT trigger loading — use ensureCM6() for that.
 */
export function getCM6Sync() {
  return (typeof window !== 'undefined' && window.CM6) ? window.CM6 : null;
}
