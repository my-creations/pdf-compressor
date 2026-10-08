import { h, icons } from './dom.js';
import { t, tn } from '../i18n.js';
import { formatSize } from '../engine/format.js';
import { renderPageToCanvas } from '../engine/pdfjs.js';

const THUMB_WIDTH = 150;

/** Rendered thumbnails, keyed "sourceId:pageIndex". Reused across re-renders. */
const thumbs = new Map();
const inFlight = new Map();
let observer = null;

// pdf.js renders are queued so a 200-page document doesn't start 200 renders at once.
const queue = [];
let active = 0;
function enqueue(task) {
  return new Promise((resolve, reject) => {
    queue.push({ task, resolve, reject });
    pump();
  });
}
function pump() {
  while (active < 2 && queue.length) {
    const { task, resolve, reject } = queue.shift();
    active++;
    task().then(resolve, reject).finally(() => { active--; pump(); });
  }
}

export function forgetThumbnails(sourceId) {
  for (const key of [...thumbs.keys()]) if (key.startsWith(`${sourceId}:`)) thumbs.delete(key);
}

function renderThumb(source, index) {
  const key = `${source.id}:${index}`;
  if (!inFlight.has(key)) {
    const promise = enqueue(() => renderPageToCanvas(source.pdf, index + 1, THUMB_WIDTH)).then((canvas) => {
      thumbs.set(key, canvas);
      return canvas;
    });
    promise.finally(() => inFlight.delete(key)).catch(() => {});
    inFlight.set(key, promise);
  }
  return inFlight.get(key);
}

function lazyThumb(inner, source, index, rotation) {
  observer ||= new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      entry.target._load?.();
    }
  }, { rootMargin: '300px' });

  inner._load = () => {
    renderThumb(source, index).then((canvas) => {
      if (!inner.isConnected) return;
      inner.replaceChildren(canvas);
      applyRotation(inner, canvas, rotation);
    }).catch(() => {});
  };
  observer.observe(inner);
}

/** Rotate a thumbnail, shrinking it for quarter turns so it still fits the 3:4 frame. */
function applyRotation(inner, content, rotation) {
  let scale = 1;
  if (rotation % 180 !== 0) {
    const w = content.width || content.naturalWidth || 3;
    const h = content.height || content.naturalHeight || 4;
    const fit = Math.min(0.75 / w, 1 / h);
    const fitRotated = Math.min(0.75 / h, 1 / w);
    scale = fitRotated / fit;
  }
  inner.style.transform = rotation ? `rotate(${rotation}deg) scale(${scale})` : '';
}

function thumbContent(source, index, rotation, inner) {
  const key = `${source.id}:${index}`;
  if (source.kind === 'image') {
    let img = thumbs.get(key);
    if (!img) {
      img = h('img', { src: source.url, alt: '', decoding: 'async' });
      thumbs.set(key, img);
    }
    if (img.complete) applyRotation(inner, img, rotation);
    else img.addEventListener('load', () => applyRotation(inner, img, rotation), { once: true });
    return img;
  }
  const cached = thumbs.get(key);
  if (cached) {
    applyRotation(inner, cached, rotation);
    return cached;
  }
  lazyThumb(inner, source, index, rotation);
  return h('div', { class: 'thumb-loading', 'aria-hidden': 'true' });
}

function toolButton(icon, label, onclick, { disabled = false, danger = false, focusKey } = {}) {
  return h('button', {
    type: 'button',
    class: `tool-btn${danger ? ' is-danger' : ''}`,
    'aria-label': label,
    title: label,
    disabled,
    dataset: focusKey ? { focus: focusKey } : undefined,
    onclick,
    html: icon,
  });
}

function pageCard(source, page, pos, count, actions) {
  const n = pos + 1;
  const inner = h('div', { class: 'thumb-inner' });
  inner.append(thumbContent(source, page.index, page.rotation, inner));
  const id = source.id;

  return h('li', { class: 'page-card' },
    h('div', { class: 'thumb' }, inner),
    h('div', { class: 'page-tools' },
      toolButton(icons.rotate, t('page.rotate', { n }), () => actions.rotatePage(id, pos), { focusKey: `rot:${id}:${pos}` }),
      toolButton(icons.left, t('page.moveBack', { n }), () => actions.movePage(id, pos, -1), { disabled: pos === 0, focusKey: `back:${id}:${pos}` }),
      toolButton(icons.right, t('page.moveForward', { n }), () => actions.movePage(id, pos, 1), { disabled: pos === count - 1, focusKey: `fwd:${id}:${pos}` }),
      toolButton(icons.trash, t('page.delete', { n }), () => actions.deletePage(id, pos), { danger: true, focusKey: `del:${id}:${pos}` }),
    ),
    h('span', { class: 'page-label' }, t('page.label', { n })),
  );
}

function fileGroup(source, pages, fileIndex, fileCount, actions) {
  const name = source.name;
  const multi = fileCount > 1;
  return h('section', { class: 'file-group', dataset: { source: source.id } },
    h('header', { class: 'file-head' },
      h('span', { class: `file-badge${source.kind === 'image' ? ' is-image' : ''}`, 'aria-hidden': 'true' },
        source.kind === 'image' ? 'IMG' : 'PDF'),
      h('div', { class: 'file-meta' },
        h('p', { class: 'file-name', title: name }, name),
        h('p', { class: 'file-sub' }, `${formatSize(source.size)} · ${tn('ws.pages', pages.length)}`),
      ),
      h('div', { class: 'file-actions' },
        multi && h('button', {
          type: 'button', class: 'icon-btn', html: icons.up,
          'aria-label': t('file.moveUp', { name }), title: t('file.moveUp', { name }),
          disabled: fileIndex === 0, dataset: { focus: `fup:${source.id}` },
          onclick: () => actions.moveFile(source.id, -1),
        }),
        multi && h('button', {
          type: 'button', class: 'icon-btn', html: icons.down,
          'aria-label': t('file.moveDown', { name }), title: t('file.moveDown', { name }),
          disabled: fileIndex === fileCount - 1, dataset: { focus: `fdown:${source.id}` },
          onclick: () => actions.moveFile(source.id, 1),
        }),
        h('button', {
          type: 'button', class: 'icon-btn', html: icons.trash,
          'aria-label': t('file.remove', { name }), title: t('file.remove', { name }),
          onclick: () => actions.removeFile(source.id),
        }),
      ),
    ),
    h('ol', { class: 'page-grid' }, pages.map((page, pos) => pageCard(source, page, pos, pages.length, actions))),
  );
}

/**
 * Render the file groups and page thumbnails.
 * @param {{sources: Map, order: string[], pages: Map}} state
 * @param {object} actions - rotatePage, movePage, deletePage, moveFile, removeFile
 * @param {string} [focusKey] - data-focus value to restore keyboard focus to
 */
export function renderFileGroups(container, state, actions, focusKey) {
  const groups = state.order.map((id, i) =>
    fileGroup(state.sources.get(id), state.pages.get(id), i, state.order.length, actions));
  container.replaceChildren(...groups);
  if (focusKey) {
    const target = container.querySelector(`[data-focus="${CSS.escape(focusKey)}"]`);
    (target && !target.disabled ? target : container.querySelector('button:not(:disabled)'))?.focus();
  }
}
