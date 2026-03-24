// ClipStash Extension - Card renderer module

import { t } from '../../utils/i18n.js';
import { formatRelativeTime } from '../../utils/time.js';
import {
  ICON_COPY, ICON_DELETE, ICON_PIN, ICON_PIN_FILLED,
} from '../../shared/icons.js';
import {
  escapeHtml, highlightCode, truncateText,
  estimateDataUrlBytes, formatBytes, convertToPngBlob,
  showCopyFeedback,
} from '../../shared/dom-utils.js';
import { removeCache, togglePin } from '../../utils/storage.js';

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
        <span>${metaText} · <span data-relative-time="${item.createdAt}">${metaTime}</span></span>
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
 * copyToClipboard copies the cache item's content to clipboard
 * @param {Object} data - cache record
 * @param {HTMLElement} btnEl - button element for feedback
 */
export async function copyToClipboard(data, btnEl) {
  try {
    if (data.type === 'image' && data.imageDataUrl) {
      const resp = await fetch(data.imageDataUrl);
      const blob = await resp.blob();
      const pngBlob = blob.type === 'image/png'
        ? blob
        : await convertToPngBlob(data.imageDataUrl);
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': pngBlob })
      ]);
    } else if (data.type === 'html' && data.htmlContent) {
      const htmlBlob = new Blob([data.htmlContent], { type: 'text/html' });
      const textBlob = new Blob([data.content || ''], { type: 'text/plain' });
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': htmlBlob,
          'text/plain': textBlob,
        })
      ]);
    } else {
      await navigator.clipboard.writeText(data.content || '');
    }
    showCopyFeedback(btnEl, t);
  } catch {
    try {
      await navigator.clipboard.writeText(data.content || '');
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = data.content || '';
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    showCopyFeedback(btnEl, t);
  }
}
