// ClipStash Desktop - Card renderer module

import { t } from '../../utils/i18n.js';
import { formatRelativeTime } from '../../utils/time.js';
import {
  ICON_COPY, ICON_DELETE, ICON_PIN, ICON_PIN_FILLED,
} from '../../shared/icons.js';
import {
  escapeHtml, highlightCode, truncateText,
  estimateDataUrlBytes, formatBytes, showCopyFeedback,
} from '../../shared/dom-utils.js';
import { removeCache, togglePin } from '../../utils/storage.js';
import { writeClipboard } from '../../utils/bridge.js';

/**
 * createCacheCard builds a cache card DOM element
 * @param {Object} item - cache record
 * @param {Object} callbacks - { onRefresh, onOpenModal, onShowConfirm, onHideConfirm }
 * @returns {HTMLElement}
 */
export function createCacheCard(item, callbacks) {
  const { onRefresh, onOpenModal, onShowConfirm, onHideConfirm } = callbacks;
  const card = document.createElement('div');
  card.className = 'cache-card' + (item.pinned ? ' pinned' : '');
  card.dataset.id = item.id;

  const type = item.type || 'text';
  const tags = item.tags || [];

  let contentHtml = '';
  const isImageWithData = type === 'image' && item.imageDataUrl;
  if (isImageWithData) {
    contentHtml = `<img class="cache-image-thumb" alt="${t('imageAlt')}">`;
  } else {
    const preview = truncateText(item.content || '');
    if (item.language) {
      contentHtml = `<pre class="cache-text"><code class="hljs">${highlightCode(preview, item.language)}</code></pre>`;
    } else {
      contentHtml = `<div class="cache-text">${escapeHtml(preview)}</div>`;
    }
  }

  let typeBadge = '';
  if (type === 'image') {
    typeBadge = `<span class="cache-type-badge type-image">${t('typeImage')}</span>`;
  } else if (type === 'html') {
    typeBadge = `<span class="cache-type-badge type-html">${t('typeHtml')}</span>`;
  }
  if (item.language) {
    typeBadge += `<span class="cache-lang-badge">${escapeHtml(item.language)}</span>`;
  }

  let tagsHtml = '';
  if (tags.length > 0) {
    tagsHtml = `<div class="cache-tags-row">${tags.map(tg => `<span class="tag" title="${escapeHtml(tg)}"><span class="tag-text">${escapeHtml(tg)}</span></span>`).join('')}</div>`;
  }

  const metaText = type === 'image'
    ? formatBytes(estimateDataUrlBytes(item.imageDataUrl))
    : `${item.contentLength} ${t('chars')}`;
  const metaTime = formatRelativeTime(item.createdAt);

  card.innerHTML = `
    <div class="cache-content">
      ${contentHtml}
    </div>
    ${tagsHtml}
    <div class="cache-footer">
      <div class="cache-meta">
        ${typeBadge}
        <span>${metaText} · ${metaTime}</span>
      </div>
      <div class="cache-actions">
        <button class="btn-icon copy-btn" title="${t('copy')}">${ICON_COPY}</button>
        <button class="btn-icon pin-btn ${item.pinned ? 'is-pinned' : ''}" title="${item.pinned ? t('unpin') : t('pin')}">${item.pinned ? ICON_PIN_FILLED : ICON_PIN}</button>
        <span class="cache-actions-sep"></span>
        <button class="btn-icon delete-btn" title="${t('delete')}">${ICON_DELETE}</button>
      </div>
    </div>
  `;

  // Set image src via DOM API to avoid issues with long data URLs in innerHTML
  if (isImageWithData) {
    const img = card.querySelector('.cache-image-thumb');
    if (img) img.src = item.imageDataUrl;
  }

  card.querySelector('.cache-content').addEventListener('click', () => onOpenModal(item));

  card.querySelector('.pin-btn').addEventListener('click', async (e) => {
    e.stopPropagation();
    await togglePin(item.id);
    await onRefresh();
  });

  card.querySelector('.copy-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    copyToClipboard(item, card.querySelector('.copy-btn'));
  });

  card.querySelector('.delete-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    onShowConfirm(
      t('confirmDeleteTitle'),
      t('confirmDeleteDesc'),
      t('confirmDeleteOk'),
      async () => {
        onHideConfirm();
        card.style.maxHeight = card.offsetHeight + 'px';
        card.offsetHeight;
        card.classList.add('removing');
        await removeCache(item.id);
        setTimeout(() => onRefresh(), 300);
      }
    );
  });

  return card;
}

/**
 * copyToClipboard copies the cache item's content to clipboard via Tauri bridge
 * @param {Object} data - cache record
 * @param {HTMLElement} btnEl - button element for feedback
 */
export async function copyToClipboard(data, btnEl) {
  try {
    const type = data.type || 'text';
    await writeClipboard(
      type,
      data.content || '',
      data.htmlContent || null,
      data.imageDataUrl || null
    );
    showCopyFeedback(btnEl, t);
  } catch {
    // Fallback
    try {
      await navigator.clipboard.writeText(data.content || '');
      showCopyFeedback(btnEl, t);
    } catch {
      // Silent fail
    }
  }
}
