// ClipStash - Internationalization module

const LANG_KEY = 'clipstash-lang';

/**
 * MESSAGES holds all translatable strings keyed by locale.
 * Default locale is 'en'.
 */
const MESSAGES = {
  en: {
    appName: 'ClipStash',
    clearAll: 'Clear All',
    searchPlaceholder: 'Search content or tags…',
    emptyTitle: 'No cached records',
    emptyDesc: 'Copy something and click the extension icon to cache',
    noResultsTitle: 'No matching content',
    noResultsDesc: 'Try different search keywords',
    viewDetail: 'View Detail',
    tags: 'Tags',
    addTag: '+ Add',
    tagInputPlaceholder: 'Tag name, press Enter',
    noTags: 'No tags',
    copy: 'Copy',
    copied: 'Copied ✓',
    pin: 'Pin',
    unpin: 'Unpin',
    delete: 'Delete',
    chars: 'chars',
    justNow: 'just now',
    secondsAgo: '{n}s ago',
    minutesAgo: '{n}m ago',
    hoursAgo: '{n}h ago',
    yesterday: 'yesterday',
    daysAgo: '{n}d ago',
    items: 'items',
    found: 'found {n}',
    confirmDeleteTitle: 'Delete this cache?',
    confirmDeleteDesc: 'This action cannot be undone.',
    confirmDeleteOk: 'Delete',
    confirmClearTitle: 'Clear all cached records?',
    confirmClearDesc: 'This action cannot be undone.',
    confirmClearOk: 'Clear All',
    cancel: 'Cancel',
    settings: 'Settings',
    settingMaxCache: 'Cache Limit',
    settingMaxCacheDesc: 'Max records to keep (10 – 999)',
    settingUnit: 'items',
    settingTheme: 'Theme',
    settingThemeDesc: 'Choose color scheme',
    themeSystem: 'System',
    themeLight: 'Light',
    themeDark: 'Dark',
    settingLang: 'Language',
    settingLangDesc: 'Interface language',
    settingShortcut: 'Shortcut',
    settingShortcutDesc: 'Open extension shortcut key',
    settingShortcutHint: 'Configure in chrome://extensions/shortcuts',
    save: 'Save',
    exportData: 'Export',
    importData: 'Import',
    importSuccess: 'Imported {n} records',
    importFail: 'Import failed: invalid file',
    importDuplicate: '{n} new, {d} duplicates skipped',
    typeImage: 'Image',
    typeHtml: 'Rich Text',
    imageAlt: 'Cached image',
    fullscreen: 'Fullscreen',
  },
  zh: {
    appName: 'ClipStash',
    clearAll: '清空全部',
    searchPlaceholder: '搜索内容或标签…',
    emptyTitle: '暂无缓存记录',
    emptyDesc: '复制内容后点击插件图标即可缓存',
    noResultsTitle: '未找到匹配内容',
    noResultsDesc: '尝试更换搜索关键词',
    viewDetail: '查看详情',
    tags: '标签',
    addTag: '+ 添加',
    tagInputPlaceholder: '输入标签名，回车确认',
    noTags: '暂无标签',
    copy: '复制',
    copied: '已复制 ✓',
    pin: '置顶',
    unpin: '取消置顶',
    delete: '删除',
    chars: '字符',
    justNow: '刚刚',
    secondsAgo: '{n} 秒前',
    minutesAgo: '{n} 分钟前',
    hoursAgo: '{n} 小时前',
    yesterday: '昨天',
    daysAgo: '{n} 天前',
    items: '条',
    found: '找到 {n} 条',
    confirmDeleteTitle: '确定要删除这条缓存吗？',
    confirmDeleteDesc: '删除后不可恢复。',
    confirmDeleteOk: '确定删除',
    confirmClearTitle: '确定要清空所有缓存记录吗？',
    confirmClearDesc: '此操作不可撤销。',
    confirmClearOk: '确定清空',
    cancel: '取消',
    settings: '设置',
    settingMaxCache: '缓存上限',
    settingMaxCacheDesc: '最多保存的缓存条数（10 ~ 999）',
    settingUnit: '条',
    settingTheme: '主题',
    settingThemeDesc: '选择配色方案',
    themeSystem: '跟随系统',
    themeLight: '浅色',
    themeDark: '深色',
    settingLang: '语言',
    settingLangDesc: '界面语言',
    settingShortcut: '快捷键',
    settingShortcutDesc: '唤起插件的快捷键',
    settingShortcutHint: '在 chrome://extensions/shortcuts 中配置',
    save: '保存',
    exportData: '导出',
    importData: '导入',
    importSuccess: '已导入 {n} 条记录',
    importFail: '导入失败：文件格式无效',
    importDuplicate: '新增 {n} 条，跳过 {d} 条重复',
    typeImage: '图片',
    typeHtml: '富文本',
    imageAlt: '缓存图片',
    fullscreen: '全屏展示',
  }
};

let currentLang = 'en';

/**
 * initLang initializes the language from storage
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
