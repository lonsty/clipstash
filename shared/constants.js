// ClipStash - Shared constants across Extension and Desktop

// ===== Storage Keys =====
export const STORAGE_KEY = 'clipstash-caches';
export const SETTINGS_KEY = 'clipstash-settings';
export const THEME_KEY = 'clipstash-theme';
export const SYNC_SETTINGS_KEY = 'clipstash-sync';
export const PENDING_DELETED_KEY = 'clipstash-pending-deleted';
export const PENDING_RESTORED_KEY = 'clipstash-pending-restored';

// ===== Default Settings =====
export const DEFAULT_MAX_CACHE_SIZE = 300;
export const DEFAULT_LANGUAGE = 'en';
export const DEFAULT_THEME = 'system';
export const DEFAULT_HOTKEY = 'Alt+Shift+C';
export const DEFAULT_AUTOSTART = false;
export const DEFAULT_CLIPBOARD_MONITOR = false;
export const DEFAULT_SHOW_NOTIFICATION = true;
export const DEFAULT_AUTO_SYNC = false;
export const DEFAULT_SYNC_IMAGES = false;

// ===== UI Constants =====
export const PAGE_SIZE = 12;
export const MAX_TAG_LENGTH = 20;

// ===== Debounce / Duration (ms) =====
export const SEARCH_DEBOUNCE_DELAY = 250;
export const FEEDBACK_DISPLAY_DURATION = 1500;
export const TAG_HINT_DURATION = 2000;
export const COPY_FEEDBACK_DURATION = 1500;

// ===== Sync Constants =====
export const SYNC_PUSH_DEBOUNCE_DELAY = 3000;
export const SYNC_MIN_INTERVAL_MS = 60 * 1000; // 60s — skip auto-sync if last sync was within this window
export const SYNC_PERIODIC_PULL_INTERVAL = 5; // minutes (for chrome.alarms)
export const SYNC_PERIODIC_PULL_MS = 5 * 60 * 1000; // 5 minutes (for setInterval)
export const SYNC_TOAST_DURATION = 3000;
export const SYNC_AUTH_PATTERN = /HTTP\s*(401|403)|Unauthorized|Forbidden/i;
export const SYNC_PASSWORD_MIN_LENGTH = 4;
export const SYNC_PASSWORD_MAX_LENGTH = 64;

// ===== Trash / Soft Delete =====
export const TRASH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const DELETED_IDS_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ===== GitHub Gist Sync =====
export const GIST_DATA_FILE = 'clipstash-data.json';
export const GIST_META_FILE = 'clipstash-meta.json';
export const GIST_DESCRIPTION = 'ClipStash Cloud Sync Data (do not delete)';

// ===== Image Sync =====
export const SYNC_IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB per image (original data URL)
export const SYNC_IMAGE_TOTAL_MAX_BYTES = 50 * 1024 * 1024; // 50 MB total image quota
