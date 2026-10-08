import { t } from '../i18n.js';

/**
 * Tiny element helper: h('button', { class: 'x', onclick }, child, 'text').
 * `html` sets innerHTML (only used with the static icon strings below).
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'html') el.innerHTML = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key === 'style') Object.assign(el.style, value);
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

const svg = (body, size = 16) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const icons = {
  rotate: svg('<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>'),
  left: svg('<path d="m15 18-6-6 6-6"/>'),
  right: svg('<path d="m9 18 6-6-6-6"/>'),
  up: svg('<path d="m18 15-6-6-6 6"/>'),
  down: svg('<path d="m6 9 6 6 6-6"/>'),
  trash: svg('<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'),
  close: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  download: svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>', 18),
  compare: svg('<rect x="3" y="4" width="8" height="16" rx="1.5"/><rect x="13" y="4" width="8" height="16" rx="1.5"/>', 18),
};

const toastTimer = new WeakMap();

/** Show a dismissible notice; errors stay on screen longer. */
export function toast(message, { type = 'info', timeout = type === 'error' ? 10000 : 5000 } = {}) {
  const region = document.getElementById('toasts');
  const close = () => {
    clearTimeout(toastTimer.get(el));
    el.remove();
  };
  const el = h('div', { class: `toast${type === 'error' ? ' is-error' : ''}`, role: type === 'error' ? 'alert' : 'status' },
    h('p', {}, message),
    h('button', { type: 'button', 'aria-label': t('toast.close'), onclick: close, html: icons.close }),
  );
  region.append(el);
  while (region.children.length > 3) region.firstElementChild.remove();
  toastTimer.set(el, setTimeout(close, timeout));
}

/** Trigger a download of `blob` as `name`. */
export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name, class: 'hidden' });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
