// ClipStash Desktop - Relative time formatting utility
// Delegates to shared/dom-utils.js for logic, binds to local i18n.

import { t } from './i18n.js';
import {
  formatRelativeTime as _formatRelativeTime,
  formatFullTime,
} from '../shared/dom-utils.js';

/**
 * formatRelativeTime formats a timestamp as a relative time string
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {string} relative time string
 */
export function formatRelativeTime(timestamp) {
  return _formatRelativeTime(timestamp, t);
}

export { formatFullTime };
