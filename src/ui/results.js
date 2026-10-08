import { h, icons } from './dom.js';
import { t, tn } from '../i18n.js';
import { formatSize, calculateReduction, targetLabel } from '../engine/format.js';
import { openPdf, renderPageToCanvas } from '../engine/pdfjs.js';

let blobUrls = [];

export function revokeResultUrls() {
  blobUrls.forEach((url) => URL.revokeObjectURL(url));
  blobUrls = [];
}

function resultItem(result, targetMB, onCompare) {
  const size = targetLabel(targetMB);
  const reduction = calculateReduction(result.originalSize, result.size);
  const url = URL.createObjectURL(new Blob([result.bytes], { type: 'application/pdf' }));
  blobUrls.push(url);

  return h('li', { class: 'result-item' },
    h('div', {},
      h('p', { class: 'result-name' }, result.name),
      h('p', { class: `result-mode${result.mode === 'raster' ? ' is-raster' : ''}` },
        h('span', { 'aria-hidden': 'true' }, result.mode === 'raster' ? '⚠' : '✓'),
        h('span', {}, t(`mode.${result.mode}`))),
    ),
    h('div', { class: 'result-stats' },
      h('div', { class: 'stat' },
        h('span', { class: 'stat-label' }, t('result.original')),
        h('span', { class: `stat-value${reduction > 0 ? ' is-old' : ''}` }, formatSize(result.originalSize))),
      h('span', { class: 'stat-arrow', 'aria-hidden': 'true' }, '→'),
      h('div', { class: 'stat' },
        h('span', { class: 'stat-label' }, t('result.new')),
        h('span', { class: `stat-value ${result.met ? 'is-ok' : 'is-bad'}`, dataset: { testid: 'new-size' } }, formatSize(result.size))),
      h('span', { class: 'reduction-badge', 'aria-label': `${t('result.reduction')}: ${reduction}%` }, `−${reduction}%`),
    ),
    h('div', { class: 'result-foot' },
      h('span', { class: `status-pill${result.met ? '' : ' is-warning'}`, dataset: { testid: 'status' } },
        result.met ? `✓ ${t('result.ok', { size })}` : `⚠ ${t('result.fail', { size })}`),
      h('div', { class: 'result-item-actions' },
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => onCompare(result) },
          h('span', { html: icons.compare }), t('result.compare')),
        h('a', { class: 'btn btn-primary btn-sm download-link', href: url, download: result.name },
          h('span', { html: icons.download }), `${t('result.download')} (${formatSize(result.size)})`),
      ),
    ),
  );
}

/** Fill the results view. */
export function renderResults(results, targetMB, { onCompare }) {
  revokeResultUrls();
  const allMet = results.every((r) => r.met);
  const size = targetLabel(targetMB);

  const banner = document.getElementById('resultBanner');
  banner.classList.toggle('is-warning', !allMet);
  document.getElementById('resultTitle').textContent = allMet ? t('result.okTitle') : t('result.failTitle');
  document.getElementById('resultBody').textContent = allMet
    ? tn('result.okBody', results.length, { size })
    : t('result.failBody', { size });

  document.getElementById('resultList').replaceChildren(...results.map((r) => resultItem(r, targetMB, onCompare)));
  document.getElementById('zipBtn').classList.toggle('hidden', results.length < 2);

  const shareBtn = document.getElementById('shareBtn');
  const files = results.map((r) => new File([r.bytes], r.name, { type: 'application/pdf' }));
  shareBtn.classList.toggle('hidden', !(navigator.canShare && navigator.canShare({ files })));
}

/* ---------- Before / after comparison ---------- */

const compare = { before: null, after: null, page: 1, total: 1, token: 0 };

async function drawComparePage() {
  const token = ++compare.token;
  const dialog = document.getElementById('compareDialog');
  const paneWidth = Math.max(240, Math.min(460, (dialog.clientWidth - 60) / (window.innerWidth < 560 ? 1 : 2)));
  document.getElementById('comparePage').textContent = t('compare.page', { n: compare.page, total: compare.total });
  document.getElementById('comparePrev').disabled = compare.page <= 1;
  document.getElementById('compareNext').disabled = compare.page >= compare.total;

  const [before, after] = await Promise.all([
    renderPageToCanvas(compare.before, Math.min(compare.page, compare.before.numPages), paneWidth),
    renderPageToCanvas(compare.after, Math.min(compare.page, compare.after.numPages), paneWidth),
  ]);
  if (token !== compare.token) return;
  document.getElementById('compareBefore').replaceChildren(before);
  document.getElementById('compareAfter').replaceChildren(after);
}

export async function openCompare(result) {
  const dialog = document.getElementById('compareDialog');
  document.getElementById('compareName').textContent = result.name;
  document.getElementById('compareBeforeSize').textContent = `· ${formatSize(result.originalSize)}`;
  document.getElementById('compareAfterSize').textContent = `· ${formatSize(result.size)}`;
  const loading = () => h('div', { class: 'thumb-loading', style: { width: '70%', height: '260px' } });
  document.getElementById('compareBefore').replaceChildren(loading());
  document.getElementById('compareAfter').replaceChildren(loading());
  dialog.showModal();

  [compare.before, compare.after] = await Promise.all([openPdf(result.sourceBytes), openPdf(result.bytes)]);
  compare.page = 1;
  compare.total = Math.max(compare.before.numPages, compare.after.numPages);
  await drawComparePage();
}

export function initCompareDialog() {
  const dialog = document.getElementById('compareDialog');
  document.getElementById('compareClose').addEventListener('click', () => dialog.close());
  document.getElementById('comparePrev').addEventListener('click', () => {
    if (compare.page > 1) { compare.page--; drawComparePage(); }
  });
  document.getElementById('compareNext').addEventListener('click', () => {
    if (compare.page < compare.total) { compare.page++; drawComparePage(); }
  });
  dialog.addEventListener('click', (e) => {
    // Close on backdrop clicks only (they target the dialog but land outside its box).
    const r = dialog.getBoundingClientRect();
    const outside = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    if (e.target === dialog && outside) dialog.close();
  });
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') document.getElementById('comparePrev').click();
    if (e.key === 'ArrowRight') document.getElementById('compareNext').click();
  });
  dialog.addEventListener('close', () => {
    compare.token++;
    compare.before?.destroy();
    compare.after?.destroy();
    compare.before = compare.after = null;
  });
}
