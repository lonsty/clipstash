// ClipStash Desktop - Logger module
// Forwards frontend logs to Tauri log plugin for unified logging

const tauriLog = window.__TAURI__?.log;

// Snapshot native console methods BEFORE any overrides.
// Used by attachConsole() to print Rust-side logs into DevTools
// without triggering the forwardConsole() override (which would
// otherwise create an infinite loop:
//   forwardConsole → tauriLog.warn → Rust log → Webview target
//   → attachConsole listener → console.warn (overridden) → tauriLog.warn → ...)
const _nativeWarn = console.warn.bind(console);
const _nativeError = console.error.bind(console);

/**
 * Log a trace-level message.
 * @param {string} message
 */
export function trace(message) {
  if (tauriLog) {
    tauriLog.trace(message);
  }
}

/**
 * Log a debug-level message.
 * @param {string} message
 */
export function debug(message) {
  if (tauriLog) {
    tauriLog.debug(message);
  }
}

/**
 * Log an info-level message.
 * @param {string} message
 */
export function info(message) {
  if (tauriLog) {
    tauriLog.info(message);
  }
}

/**
 * Log a warn-level message.
 * @param {string} message
 */
export function warn(message) {
  if (tauriLog) {
    tauriLog.warn(message);
  }
}

/**
 * Log an error-level message.
 * @param {string} message
 */
export function error(message) {
  if (tauriLog) {
    tauriLog.error(message);
  }
}

/**
 * Attach Tauri log listener to receive Rust-side logs in Webview console.
 *
 * Uses the native (pre-override) console methods so that incoming Rust
 * logs are printed to DevTools but do NOT get re-forwarded back to Rust
 * by forwardConsole(), which would cause an infinite loop.
 *
 * @returns {Promise<Function>} detach function
 */
export async function attachConsole() {
  if (!tauriLog?.attachLogger) {
    return () => {};
  }

  return await tauriLog.attachLogger(({ level, message }) => {
    switch (level) {
      case 1: // Trace
      case 2: // Debug
        console.debug(message);
        break;
      case 3: // Info
        console.info(message);
        break;
      case 4: // Warn
        _nativeWarn(message);
        break;
      case 5: // Error
        _nativeError(message);
        break;
      default:
        console.log(message);
    }
  });
}

/**
 * Override console.warn/error to forward logs to Tauri log plugin.
 *
 * IMPORTANT: The original console.warn/error calls are intentionally
 * replaced (not preserved) to prevent re-entry via the WKWebView layer
 * and to avoid an infinite loop with attachConsole().
 *
 * Third-party vendor code (e.g. highlight.js) may produce high-frequency
 * console.warn output; only non-empty string messages are forwarded.
 *
 * - console.log/debug/info are left untouched.
 */
export function forwardConsole() {
  if (!tauriLog) return;

  const pairs = [
    ['warn', warn],
    ['error', error],
  ];

  for (const [method, logger] of pairs) {
    console[method] = (...args) => {
      // Serialize all arguments to a single string
      const message = args
        .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
        .join(' ');
      // Drop empty or non-textual messages (e.g. DOM elements from highlight.js)
      if (message.trim()) {
        logger(message);
      }
    };
  }
}
