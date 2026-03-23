// ClipStash Extension - Internationalization module
// Messages are sourced from shared/messages.js + Extension-specific overrides.

import { mergeMessages, EXT_MESSAGES } from '../shared/messages.js';

const LANG_KEY = 'clipstash-lang';
const MESSAGES = mergeMessages(EXT_MESSAGES);

let currentLang = 'en';

/**
 * initLang initializes the language from chrome.storage
 * @returns {Promise<string>} the resolved locale
 */
export async function initLang() {
  try {
    const data = await chrome.storage.local.get(LANG_KEY);
    currentLang = data[LANG_KEY] || 'en';
  } catch {
    currentLang = 'en';
  }
  return currentLang;
}

/**
 * setLang persists the language preference
 * @param {string} lang - 'en' or 'zh'
 */
export async function setLang(lang) {
  currentLang = lang;
  await chrome.storage.local.set({ [LANG_KEY]: lang });
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
