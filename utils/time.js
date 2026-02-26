// ClipStash - Relative time formatting utility

import { t } from './i18n.js';

/**
 * formatRelativeTime formats a timestamp as a relative time string
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {string} relative time string
 */
export function formatRelativeTime(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 10) return t('justNow');
  if (seconds < 60) return t('secondsAgo', { n: seconds });
  if (minutes < 60) return t('minutesAgo', { n: minutes });
  if (hours < 24) return t('hoursAgo', { n: hours });
  if (days === 1) return t('yesterday');
  if (days < 30) return t('daysAgo', { n: days });

  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * formatFullTime formats a timestamp as a full datetime string
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {string} full datetime string
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
