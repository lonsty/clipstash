// ClipStash Desktop - Internationalization module
// Messages are sourced from shared/messages.js + Desktop-specific overrides.

import { mergeMessages, DESKTOP_MESSAGES } from '../shared/messages.js';

const MESSAGES = mergeMessages(DESKTOP_MESSAGES);

let currentLang = 'en';

/**
 * initLang initializes the language (Desktop uses settings, not chrome.storage)
 * @param {string} lang - language code
 * @returns {string} the resolved locale
 */
export function initLang(lang) {
  currentLang = lang || 'en';
  return currentLang;
}

/**
 * setLang sets the current language in-memory
 * @param {string} lang - 'en' or 'zh'
 */
export function setLang(lang) {
  currentLang = lang;
}

/**
 * getLang returns the current language code
 * @returns {string}
 */
export function getLang() {
  return currentLang;
}

/**
 * t returns a translated string with optional interpolation
 * @param {string} key - message key
 * @param {Object} [params] - interpolation values, e.g. {n: 5}
 * @returns {string}
 */
export function t(key, params) {
  const dict = MESSAGES[currentLang] || MESSAGES.en;
  let text = dict[key] || MESSAGES.en[key] || key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(`{${k}}`, v);
    }
  }
  return text;
}
