// ClipStash Desktop - Trash panel module

import { t } from '../../utils/i18n.js';
import { formatRelativeTime } from '../../utils/time.js';
import { ICON_RESTORE, ICON_PERM_DELETE } from '../../shared/icons.js';
import { escapeHtml } from '../../shared/dom-utils.js';
import { TRASH_TTL_MS, MS_PER_DAY } from '../../shared/constants.js';
import {
  getDeletedCaches, restoreCache, permanentDeleteCache,
  restoreAllCaches, permanentDeleteAllCaches,
} from '../../utils/storage.js';

// DOM references
const btnTrash = document.getElementById('btn-trash');
const trashCountEl = document.getElementById('trash-count');
const trashOverlay = document.getElementById('trash-overlay');
const btnTrashClose = document.getElementById('btn-trash-close');
const trashListEl = document.getElementById('trash-list');
const trashEmptyEl = document.getElementById('trash-empty');
const trashActionsEl = document.getElementById('trash-batch-actions');
const btnRestoreAll = document.getElementById('btn-trash-restore-all');
const btnEmptyTrash = document.getElementById('btn-trash-empty-all');

// External callbacks (set via init)
let showConfirm = null;
let hideConfirm = null;
let onRefresh = null;

/**
 * initTrashPanel wires up the trash panel with external dependencies
 * @param {Object} callbacks
 */
export function initTrashPanel(callbacks) {
  showConfirm = callbacks.showConfirm;
  hideConfirm = callbacks.hideConfirm;
  onRefresh = callbacks.onRefresh;

  btnTrash.addEventListener('click', async () => {
    await renderTrashPanel();
    trashOverlay.style.display = 'flex';
  });

  btnTrashClose.addEventListener('click', () => {
    trashOverlay.style.display = 'none';
  });

  trashOverlay.addEventListener('click', (e) => {
    if (e.target === trashOverlay) {
      trashOverlay.style.display = 'none';
    }
  });

  // Batch: Restore All
  btnRestoreAll.addEventListener('click', () => {
    showConfirm(
      t('confirmRestoreAllTitle'),
      t('confirmRestoreAllDesc'),
      t('confirmRestoreAllOk'),
      async () => {
        hideConfirm();
        await restoreAllCaches();
        await renderTrashPanel();
        await updateTrashButton();
        await onRefresh();
      }
    );
  });

  // Batch: Empty Trash
  btnEmptyTrash.addEventListener('click', () => {
    showConfirm(
      t('confirmEmptyTrashTitle'),
      t('confirmEmptyTrashDesc'),
      t('confirmEmptyTrashOk'),
      async () => {
        hideConfirm();
        await permanentDeleteAllCaches();
        await renderTrashPanel();
        await updateTrashButton();
      }
    );
  });
}

/**
 * updateTrashButton refreshes the trash button visibility and count badge
 */
export async function updateTrashButton() {
  try {
    const deleted = await getDeletedCaches();
    if (deleted.length > 0) {
      btnTrash.style.display = 'inline-flex';
      trashCountEl.textContent = t('trashItemCount', { n: deleted.length });
      btnTrash.title = t('trashBin');
    } else {
      btnTrash.style.display = 'none';
    }
  } catch {
    btnTrash.style.display = 'none';
  }
}

/**
 * renderTrashPanel renders the trash list with countdown and action buttons
 */
async function renderTrashPanel() {
  const deleted = await getDeletedCaches();
  trashListEl.innerHTML = '';

  if (deleted.length === 0) {
    trashEmptyEl.style.display = 'flex';
    trashListEl.style.display = 'none';
    trashActionsEl.style.display = 'none';
    return;
  }

  trashEmptyEl.style.display = 'none';
  trashListEl.style.display = 'flex';
  trashActionsEl.style.display = 'flex';

  deleted.sort((a, b) => b.deletedAt - a.deletedAt);

  const now = Date.now();

  for (const item of deleted) {
    const elapsed = now - item.deletedAt;
    const remaining = Math.max(0, TRASH_TTL_MS - elapsed);
    const daysLeft = Math.ceil(remaining / MS_PER_DAY);

    let previewHtml = '';
    const isTrashImage = item.type === 'image' && item.imageDataUrl;
    if (isTrashImage) {
      previewHtml = `<img class="trash-image-thumb" alt="${t('typeImage')}">`;
    } else if (item.type === 'image') {
      previewHtml = `<div class="trash-item__text">${escapeHtml(t('typeImage'))}</div>`;
    } else {
      const preview = (item.content || '').slice(0, 200).replace(/\n/g, ' ');
      previewHtml = `<div class="trash-item__text">${escapeHtml(preview)}</div>`;
    }

    // For image type, show "Image" label instead of "0 chars"
    const metaText = item.type === 'image'
      ? t('typeImage')
      : `${item.contentLength || 0} ${t('chars')}`;

    const el = document.createElement('div');
    el.className = 'trash-item';
    el.innerHTML = `
      <div class="trash-item__content">
        ${previewHtml}
        <div class="trash-item__meta">
          <span class="trash-item__countdown">${t('trashDaysLeft', { n: daysLeft })}</span>
          <span>${metaText}</span>
          <span>${formatRelativeTime(item.createdAt)}</span>
        </div>
      </div>
      <div class="trash-item__actions">
        <button class="btn-icon restore-btn" title="${t('trashRestore')}">${ICON_RESTORE}</button>
        <button class="btn-icon perm-delete-btn" title="${t('trashPermanentDelete')}">${ICON_PERM_DELETE}</button>
      </div>
    `;

    if (isTrashImage) {
      const img = el.querySelector('.trash-image-thumb');
      if (img) img.src = item.imageDataUrl;
    }

    el.querySelector('.restore-btn').addEventListener('click', () => {
      showConfirm(
        t('confirmRestoreTitle'),
        t('confirmRestoreDesc'),
        t('confirmRestoreOk'),
        async () => {
          hideConfirm();
          await restoreCache(item.id);
          await renderTrashPanel();
          await updateTrashButton();
          await onRefresh();
        }
      );
    });

    el.querySelector('.perm-delete-btn').addEventListener('click', () => {
      showConfirm(
        t('confirmPermanentDeleteTitle'),
        t('confirmPermanentDeleteDesc'),
        t('confirmPermanentDeleteOk'),
        async () => {
          hideConfirm();
          await permanentDeleteCache(item.id);
          await renderTrashPanel();
          await updateTrashButton();
        }
      );
    });

    trashListEl.appendChild(el);
  }
}

/**
 * isTrashOpen returns whether the trash panel is currently displayed
 * @returns {boolean}
 */
export function isTrashOpen() {
  return trashOverlay.style.display !== 'none';
}

/**
 * closeTrash hides the trash panel
 */
export function closeTrash() {
  trashOverlay.style.display = 'none';
}
