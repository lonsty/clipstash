// ClipStash - Shared DOM utility functions
// Platform-agnostic DOM helpers used by both Extension and Desktop.

import { ICON_TAG_REMOVE, ICON_CHECK } from './icons.js';
import {
  TAG_HINT_DURATION,
  COPY_FEEDBACK_DURATION,
} from './constants.js';
import { ensureCM6, getCM6Sync } from './cm6-loader.js';

/**
 * escapeHtml escapes HTML special characters in a string
 * @param {string} text
 * @returns {string}
 */
export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * highlightCode applies syntax highlighting via CodeMirror 6.
 * Synchronous — returns plain text if CM6 is not yet loaded.
 * Triggers background loading so subsequent calls will have CM6 available.
 * @param {string} text
 * @param {string} language
 * @returns {string} HTML string
 */
export function highlightCode(text, language) {
  if (!language) return escapeHtml(text);
  const cm6 = getCM6Sync();
  if (!cm6 || !cm6.highlightToHtml) {
    // Trigger background load for next time
    ensureCM6();
    return escapeHtml(text);
  }
  try {
    const html = cm6.highlightToHtml(text, language);
    return html !== null ? html : escapeHtml(text);
  } catch {
    return escapeHtml(text);
  }
}

/**
 * truncateText truncates text for card previews
 * @param {string} text
 * @param {number} maxLines
 * @param {number} maxLineLength
 * @returns {string}
 */
export function truncateText(text, maxLines = 3, maxLineLength = 80) {
  const lines = text.split('\n');
  const truncatedLines = lines.slice(0, maxLines).map(line =>
    line.length > maxLineLength ? line.slice(0, maxLineLength) + '…' : line
  );
  let result = truncatedLines.join('\n');
  if (lines.length > maxLines) result += '\n…';
  return result;
}

/**
 * debounce returns a debounced version of the given function
 * @param {Function} fn
 * @param {number} delay
 * @returns {Function}
 */
export function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/**
 * estimateDataUrlBytes estimates byte size from a data URL
 * @param {string} dataUrl
 * @returns {number}
 */
export function estimateDataUrlBytes(dataUrl) {
  if (!dataUrl) return 0;
  const base64Idx = dataUrl.indexOf(',');
  if (base64Idx === -1) return dataUrl.length;
  const base64Str = dataUrl.substring(base64Idx + 1);
  return Math.floor(base64Str.length * 3 / 4);
}

/**
 * formatBytes formats bytes to a human-readable string
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * sanitizeHtml sanitizes HTML to prevent XSS
 * @param {string} html
 * @returns {string}
 */
export function sanitizeHtml(html) {
  if (typeof DOMPurify !== 'undefined') {
    return DOMPurify.sanitize(html);
  }
  // Fallback: strip script tags
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<script\b/gi, '&lt;script');
}

// ===== i18n DOM Binding =====

/**
 * applyI18n applies i18n translations to all [data-i18n*] elements
 * @param {Function} tFn - the translation function t(key)
 * @param {Function} getLangFn - returns current language code
 */
export function applyI18n(tFn, getLangFn) {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = tFn(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = tFn(el.getAttribute('data-i18n-placeholder'));
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = tFn(el.getAttribute('data-i18n-title'));
  });
  document.documentElement.lang = getLangFn() === 'zh' ? 'zh-CN' : 'en';
}

// ===== Confirm Dialog =====

/**
 * createConfirmController creates a reusable confirm dialog controller
 * @param {Object} elements - { overlay, titleEl, descEl, cancelBtn, okBtn }
 * @returns {{ show, hide }}
 */
export function createConfirmController(elements) {
  const { overlay, titleEl, descEl, cancelBtn, okBtn } = elements;
  let callback = null;

  const hide = () => {
    overlay.style.display = 'none';
    callback = null;
  };

  const show = (title, desc, okText, cb) => {
    titleEl.textContent = title;
    descEl.textContent = desc;
    okBtn.textContent = okText;
    callback = cb;
    overlay.style.display = 'flex';
  };

  cancelBtn.addEventListener('click', hide);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) hide();
  });
  okBtn.addEventListener('click', () => {
    if (callback) callback();
  });

  return { show, hide };
}

// ===== Tag Badge =====

/**
 * renderTagBadge creates a tag badge DOM element
 * @param {string} tagName
 * @param {boolean} removable
 * @param {Function} onRemove
 * @returns {HTMLElement}
 */
export function renderTagBadge(tagName, removable, onRemove) {
  const span = document.createElement('span');
  span.className = 'tag';
  span.title = tagName;

  const textSpan = document.createElement('span');
  textSpan.className = 'tag-text';
  textSpan.textContent = tagName;
  span.appendChild(textSpan);

  if (removable && onRemove) {
    const removeBtn = document.createElement('span');
    removeBtn.className = 'tag-remove';
    removeBtn.innerHTML = ICON_TAG_REMOVE;
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onRemove(tagName);
    });
    span.appendChild(removeBtn);
  }
  return span;
}

/**
 * showTagExistsHint shows a "tag already exists" visual hint
 * @param {HTMLElement} inputEl
 * @param {HTMLElement} wrapEl
 * @param {Function} tFn - translation function
 */
export function showTagExistsHint(inputEl, wrapEl, tFn) {
  const oldHint = wrapEl.querySelector('.tag-exists-hint');
  if (oldHint) oldHint.remove();

  inputEl.classList.remove('tag-exists');
  void inputEl.offsetWidth; // force reflow to re-trigger animation
  inputEl.classList.add('tag-exists');

  const hint = document.createElement('div');
  hint.className = 'tag-exists-hint';
  hint.textContent = tFn('tagExists');
  wrapEl.appendChild(hint);

  setTimeout(() => {
    inputEl.classList.remove('tag-exists');
    hint.remove();
  }, TAG_HINT_DURATION);
}

// ===== Copy Feedback =====

/**
 * showCopyFeedback shows a brief "copied" feedback on a button
 * @param {HTMLElement} btnEl
 * @param {Function} tFn - translation function
 */
export function showCopyFeedback(btnEl, tFn) {
  const original = btnEl.innerHTML;
  const originalTitle = btnEl.title;
  const wasBtn = btnEl.classList.contains('btn');

  if (wasBtn) {
    btnEl.textContent = tFn('copied');
    btnEl.classList.add('btn-success');
  } else {
    btnEl.innerHTML = ICON_CHECK;
    btnEl.title = tFn('copied');
  }

  setTimeout(() => {
    btnEl.innerHTML = original;
    btnEl.title = originalTitle;
    if (wasBtn) btnEl.classList.remove('btn-success');
  }, COPY_FEEDBACK_DURATION);
}

/**
 * convertToPngBlob converts a data URL to a PNG Blob via canvas
 * @param {string} dataUrl
 * @returns {Promise<Blob>}
 */
export function convertToPngBlob(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    };
    img.src = dataUrl;
  });
}

// ===== Theme =====

/**
 * applyThemeToDocument sets theme attribute on the document root
 * @param {string} theme - 'system' | 'light' | 'dark'
 * @returns {boolean} whether dark mode is active
 */
export function applyThemeToDocument(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const isDark = theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  return isDark;
}

// ===== Sync Time Formatting =====

/**
 * formatSyncTime formats a sync timestamp for display
 * @param {number} ts - milliseconds since epoch
 * @param {string} neverText - text to show when ts is 0
 * @returns {string}
 */
export function formatSyncTime(ts, neverText = 'never') {
  if (!ts || ts === 0) return neverText;
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60000) return '< 1m ago';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  const d = new Date(ts);
  return d.toLocaleDateString();
}

// ===== Relative Time Formatting =====

/**
 * formatRelativeTime formats a timestamp as a relative time string
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @param {Function} tFn - translation function
 * @returns {string}
 */
export function formatRelativeTime(timestamp, tFn) {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 10) return tFn('justNow');
  if (seconds < 60) return tFn('secondsAgo', { n: seconds });
  if (minutes < 60) return tFn('minutesAgo', { n: minutes });
  if (hours < 24) return tFn('hoursAgo', { n: hours });
  if (days === 1) return tFn('yesterday');
  if (days < 30) return tFn('daysAgo', { n: days });

  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * formatFullTime formats a timestamp as a full datetime string
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {string}
 */
export function formatFullTime(timestamp) {
  const date = new Date(timestamp);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${d} ${h}:${min}:${s}`;
}

// ===== Adaptive Refresh Interval =====

/**
 * getAdaptiveRefreshInterval returns the refresh interval (ms) for relative-time
 * displays based on the newest visible timestamp. The newest card changes fastest,
 * so it drives the refresh frequency.
 *
 * Strategy:
 *  - age < 1min  → 5s   (fast — "just now" / "Xs ago" changes rapidly)
 *  - age < 1h    → 30s  (medium — "Xm ago" changes every minute)
 *  - age < 1d    → 5min (slow — "Xh ago" changes every hour)
 *  - age < 30d   → 1h   (very slow — "Xd ago" changes daily)
 *  - age >= 30d  → 0    (stop — displays fixed "YYYY-MM-DD")
 *
 * @param {number} newestTimestamp - the most recent timestamp among visible items (ms)
 * @returns {number} interval in ms, or 0 to stop refreshing
 */
export function getAdaptiveRefreshInterval(newestTimestamp) {
  if (!newestTimestamp || newestTimestamp <= 0) return 0;
  const age = Date.now() - newestTimestamp;
  if (age < 60 * 1000) return 5 * 1000;           // < 1min → 5s
  if (age < 60 * 60 * 1000) return 30 * 1000;     // < 1h   → 30s
  if (age < 24 * 60 * 60 * 1000) return 5 * 60 * 1000; // < 1d → 5min
  if (age < 30 * 24 * 60 * 60 * 1000) return 60 * 60 * 1000; // < 30d → 1h
  return 0; // >= 30d — fixed date, no refresh needed
}
