import '@fontsource-variable/plus-jakarta-sans';
import './style.css';
import { zipSync } from 'fflate';
import { initLanguage, setLanguage, getLanguage, onLanguageChange, t, tn } from './i18n.js';
import {
  DEFAULT_TARGET_MB, TARGET_PRESETS_MB, formatSize, parseTargetMB, targetBytesFor, targetLabel,
  outputFileName, uniqueNames,
} from './engine/format.js';
import { openPdf } from './engine/pdfjs.js';
import { runJob } from './engine/pipeline.js';
import { toast, saveBlob } from './ui/dom.js';
import { renderFileGroups, forgetThumbnails } from './ui/workspace.js';
import { renderResults, revokeResultUrls, openCompare, initCompareDialog } from './ui/results.js';

const $ = (id) => document.getElementById(id);
const PREFS_KEY = 'pdfc.prefs';

const state = {
  view: 'upload',
  sources: new Map(), // id -> { id, name, kind, type, size, bytes, pageCount, pdf?, url? }
  order: [], // file order
  pages: new Map(), // id -> [{ index, rotation }]
  target: String(DEFAULT_TARGET_MB), // preset value or 'custom'
  customTarget: '',
  outputMode: 'merge',
  grayscale: false,
  photoPage: 'a4',
  job: null,
  results: [],
  resultTargetMB: DEFAULT_TARGET_MB,
  lastProgress: null,
};
let nextSourceId = 1;

/* ---------- Preferences ---------- */

function loadPrefs() {
  try {
    const prefs = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    if (prefs.target === 'custom' || TARGET_PRESETS_MB.map(String).includes(prefs.target)) state.target = prefs.target;
    if (typeof prefs.customTarget === 'string') state.customTarget = prefs.customTarget;
    if (typeof prefs.grayscale === 'boolean') state.grayscale = prefs.grayscale;
    if (prefs.photoPage === 'a4' || prefs.photoPage === 'fit') state.photoPage = prefs.photoPage;
  } catch { /* storage unavailable */ }
}

function savePrefs() {
  try {
    const { target, customTarget, grayscale, photoPage } = state;
    localStorage.setItem(PREFS_KEY, JSON.stringify({ target, customTarget, grayscale, photoPage }));
  } catch { /* storage unavailable */ }
}

function targetMB() {
  return state.target === 'custom' ? parseTargetMB(state.customTarget) : Number(state.target);
}

/* ---------- Views ---------- */

const VIEWS = { upload: 'uploadView', workspace: 'workspaceView', progress: 'progressView', results: 'resultsView' };
const STEP_OF_VIEW = { upload: 0, workspace: 1, progress: 2, results: 2 };

function showView(view) {
  state.view = view;
  for (const [name, id] of Object.entries(VIEWS)) $(id).classList.toggle('hidden', name !== view);
  const current = STEP_OF_VIEW[view];
  document.querySelectorAll('#stepper li').forEach((li, i) => {
    li.classList.toggle('is-current', i === current);
    li.classList.toggle('is-done', i < current);
    if (i === current) li.setAttribute('aria-current', 'step');
    else li.removeAttribute('aria-current');
  });
  if (view === 'workspace') renderWorkspace();
}

/* ---------- Importing files ---------- */

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif)$/i;
const MIME_BY_EXT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp', heic: 'image/heic', heif: 'image/heif', avif: 'image/avif' };

function isPdfBytes(bytes) {
  // "%PDF" may be preceded by a little junk; check the first KB.
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024));
  return head.includes('%PDF-');
}

async function readSource(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const id = `s${nextSourceId++}`;
  const base = { id, name: file.name || 'documento', size: bytes.length, bytes };

  if (isPdfBytes(bytes)) {
    const pdf = await openPdf(bytes);
    return { ...base, kind: 'pdf', type: 'application/pdf', pdf, pageCount: pdf.numPages };
  }

  if ((file.type && file.type.startsWith('image/')) || IMAGE_EXT.test(file.name)) {
    const ext = (file.name.match(IMAGE_EXT)?.[1] || '').toLowerCase();
    const type = file.type || MIME_BY_EXT[ext] || 'image/jpeg';
    const blob = new Blob([bytes], { type });
    try {
      const bitmap = await createImageBitmap(blob);
      bitmap.close?.();
    } catch {
      const err = new Error('Unsupported image');
      err.code = 'image-unsupported';
      throw err;
    }
    return { ...base, kind: 'image', type, pageCount: 1, url: URL.createObjectURL(blob) };
  }

  const err = new Error('Unsupported file');
  err.code = 'notSupported';
  throw err;
}

async function importFiles(fileList) {
  const files = [...fileList].filter(Boolean);
  if (!files.length || state.view === 'progress') return;

  if (state.view === 'results') {
    // New files after a result start a fresh session.
    clearAll();
  }

  for (const file of files) {
    try {
      const source = await readSource(file);
      state.sources.set(source.id, source);
      state.order.push(source.id);
      state.pages.set(source.id, Array.from({ length: source.pageCount }, (_, index) => ({ index, rotation: 0 })));
    } catch (err) {
      showError(err, file.name);
    }
  }

  if (state.order.length) showView('workspace');
}

function disposeSource(source) {
  source.pdf?.destroy();
  if (source.url) URL.revokeObjectURL(source.url);
  forgetThumbnails(source.id);
}

function clearAll() {
  state.job?.abort();
  for (const source of state.sources.values()) disposeSource(source);
  state.sources.clear();
  state.pages.clear();
  state.order = [];
  state.results = [];
  revokeResultUrls();
  $('fileInput').value = '';
}

/* ---------- Workspace ---------- */

const workspaceActions = {
  rotatePage(id, pos) {
    const page = state.pages.get(id)[pos];
    page.rotation = (page.rotation + 90) % 360;
    renderWorkspace(`rot:${id}:${pos}`);
  },
  movePage(id, pos, delta) {
    const pages = state.pages.get(id);
    const to = pos + delta;
    if (to < 0 || to >= pages.length) return;
    [pages[pos], pages[to]] = [pages[to], pages[pos]];
    renderWorkspace(`${delta < 0 ? 'back' : 'fwd'}:${id}:${to}`);
  },
  deletePage(id, pos) {
    const pages = state.pages.get(id);
    pages.splice(pos, 1);
    if (pages.length === 0) return workspaceActions.removeFile(id);
    renderWorkspace(`del:${id}:${Math.min(pos, pages.length - 1)}`);
  },
  moveFile(id, delta) {
    const i = state.order.indexOf(id);
    const to = i + delta;
    if (to < 0 || to >= state.order.length) return;
    [state.order[i], state.order[to]] = [state.order[to], state.order[i]];
    renderWorkspace(`${delta < 0 ? 'fup' : 'fdown'}:${id}`);
  },
  removeFile(id) {
    disposeSource(state.sources.get(id));
    state.sources.delete(id);
    state.pages.delete(id);
    state.order = state.order.filter((x) => x !== id);
    if (state.order.length === 0) {
      showView('upload');
      return;
    }
    renderWorkspace();
  },
};

function totals() {
  let pages = 0;
  let size = 0;
  for (const id of state.order) {
    pages += state.pages.get(id).length;
    size += state.sources.get(id).size;
  }
  return { files: state.order.length, pages, size };
}

function renderWorkspace(focusKey) {
  const { files, pages, size } = totals();
  $('wsSummary').textContent = `${tn('ws.files', files)} · ${tn('ws.pages', pages)} · ${formatSize(size)}`;
  renderFileGroups($('fileGroups'), state, workspaceActions, focusKey);
  $('wsEmpty').classList.toggle('hidden', pages > 0);
  $('outputOption').classList.toggle('hidden', files < 2);
  $('photoOption').classList.toggle('hidden', ![...state.sources.values()].some((s) => s.kind === 'image'));
  renderOptions();
}

function renderOptions() {
  document.querySelectorAll('input[name="target"]').forEach((el) => { el.checked = el.value === state.target; });
  document.querySelectorAll('input[name="output"]').forEach((el) => { el.checked = el.value === state.outputMode; });
  document.querySelectorAll('input[name="photoPage"]').forEach((el) => { el.checked = el.value === state.photoPage; });
  $('grayscaleToggle').checked = state.grayscale;

  const custom = state.target === 'custom';
  const customInput = $('customTarget');
  $('customTargetWrap').classList.toggle('hidden', !custom);
  if (document.activeElement !== customInput) customInput.value = state.customTarget;

  const mb = targetMB();
  const invalid = custom && mb === null && state.customTarget.trim() !== '';
  customInput.setAttribute('aria-invalid', String(invalid));
  const hint = $('targetHint');
  hint.textContent = invalid ? t('opt.customInvalid') : t('opt.targetHint');
  hint.classList.toggle('is-error', invalid);

  const { pages, files } = totals();
  const merge = files > 1 && state.outputMode === 'merge';
  const label = mb ? t(merge ? 'cta.merge' : 'cta.compress', { size: targetLabel(mb) }) : t('cta.compress', { size: '…' });
  $('compressBtnLabel').textContent = label;
  $('compressBtn').disabled = !mb || pages === 0;
}

function buildOutputs(mb) {
  const ids = state.order.filter((id) => state.pages.get(id).length);
  const pagesOf = (id) => state.pages.get(id).map((p) => ({ sourceId: id, index: p.index, rotation: p.rotation }));

  let outputs;
  if (ids.length > 1 && state.outputMode === 'merge') {
    const first = state.sources.get(ids[0]);
    const suffix = getLanguage() === 'pt' ? '_junto' : '_merged';
    outputs = [{ name: outputFileName(first.name, mb, suffix), displayName: first.name, pages: ids.flatMap(pagesOf) }];
  } else {
    outputs = ids.map((id) => {
      const source = state.sources.get(id);
      return { name: outputFileName(source.name, mb), displayName: source.name, pages: pagesOf(id) };
    });
  }
  const names = uniqueNames(outputs.map((o) => o.name));
  outputs.forEach((o, i) => { o.name = names[i]; });
  return outputs;
}

/* ---------- Compression ---------- */

function renderProgress() {
  const p = state.lastProgress;
  if (!p) return;
  const percent = Math.round(Math.min(1, p.fraction) * 100);
  $('progressFill').style.width = `${percent}%`;
  $('progressPercent').textContent = `${percent}%`;
  $('progressBar').setAttribute('aria-valuenow', String(percent));
  $('progressStatus').textContent = p.message ? t(p.message.key, p.message.params) : '';
  $('progressFile').textContent = p.outputs > 1 ? t('progress.file', { n: p.output + 1, total: p.outputs }) : '';
}

async function startCompression() {
  const mb = targetMB();
  if (!mb) return;
  const outputs = buildOutputs(mb);
  if (outputs.length === 0) {
    toast(t('error.noPages'), { type: 'error' });
    return;
  }

  const sources = {};
  for (const [id, s] of state.sources) {
    sources[id] = { kind: s.kind, bytes: s.bytes, type: s.type, name: s.name, pageCount: s.pageCount };
  }

  const controller = new AbortController();
  state.job = controller;
  state.lastProgress = { fraction: 0, output: 0, outputs: outputs.length, message: { key: 'progress.starting' } };
  showView('progress');
  renderProgress();
  $('cancelBtn').focus();

  try {
    const results = await runJob(
      { sources, outputs, targetBytes: targetBytesFor(mb), grayscale: state.grayscale, imagePageSize: state.photoPage },
      {
        signal: controller.signal,
        onProgress: (p) => {
          state.lastProgress = p;
          renderProgress();
        },
      }
    );
    if (controller.signal.aborted) return;
    state.results = results;
    state.resultTargetMB = mb;
    showView('results');
    renderResults(results, mb, { onCompare: openCompare });
    document.querySelector('#resultList .download-link')?.focus();
    if (results.every((r) => r.met)) celebrate();
  } catch (err) {
    if (err.name === 'AbortError') return;
    console.error(err);
    showError(err);
    showView('workspace');
  } finally {
    if (state.job === controller) state.job = null;
  }
}

async function celebrate() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const { default: confetti } = await import('canvas-confetti');
  confetti({ particleCount: 90, spread: 70, origin: { y: 0.55 }, disableForReducedMotion: true });
}

function showError(err, fallbackName = '') {
  const code = err?.code;
  const name = err?.source || fallbackName;
  const key = code && t(`error.${code}`) !== `error.${code}` ? `error.${code}` : 'error.failed';
  toast(t(key, { name, message: err?.message || '' }), { type: 'error' });
}

/* ---------- Results actions ---------- */

function downloadZip() {
  const entries = {};
  for (const r of state.results) entries[r.name] = [r.bytes, { level: 0 }];
  const zip = zipSync(entries);
  const suffix = getLanguage() === 'pt' ? 'comprimidos' : 'compressed';
  saveBlob(new Blob([zip], { type: 'application/zip' }), `pdf_${suffix}.zip`);
}

async function shareResults() {
  const files = state.results.map((r) => new File([r.bytes], r.name, { type: 'application/pdf' }));
  try {
    await navigator.share({ files });
  } catch (err) {
    if (err.name !== 'AbortError') showError(err);
  }
}

/* ---------- Drag & drop, paste, share target ---------- */

function initDropTargets() {
  const overlay = $('dropOverlay');
  const dropZone = $('dropZone');
  let depth = 0;
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');

  window.addEventListener('dragenter', (e) => {
    if (!hasFiles(e) || state.view === 'progress') return;
    e.preventDefault();
    depth++;
    if (state.view === 'upload') dropZone.classList.add('is-over');
    else overlay.classList.remove('hidden');
  });
  window.addEventListener('dragover', (e) => {
    if (hasFiles(e)) e.preventDefault();
  });
  window.addEventListener('dragleave', () => {
    depth = Math.max(0, depth - 1);
    if (depth === 0) {
      dropZone.classList.remove('is-over');
      overlay.classList.add('hidden');
    }
  });
  window.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    dropZone.classList.remove('is-over');
    overlay.classList.add('hidden');
    importFiles(e.dataTransfer.files);
  });

  window.addEventListener('paste', (e) => {
    const files = [...(e.clipboardData?.files || [])];
    if (files.length && !(e.target instanceof HTMLInputElement)) {
      e.preventDefault();
      importFiles(files);
    }
  });
}

/** Files shared to the installed app (Web Share Target) are stashed by the service worker. */
async function receiveSharedFiles() {
  const params = new URLSearchParams(location.search);
  if (!params.has('shared') || !('caches' in window)) return;
  history.replaceState(null, '', location.pathname);
  try {
    const cache = await caches.open('share-target');
    const requests = await cache.keys();
    const files = [];
    for (const request of requests) {
      const response = await cache.match(request);
      const blob = await response.blob();
      const name = decodeURIComponent(response.headers.get('X-File-Name') || 'documento');
      files.push(new File([blob], name, { type: blob.type }));
      await cache.delete(request);
    }
    await importFiles(files);
  } catch (err) {
    showError(err);
  }
}

/* ---------- PWA ---------- */

function initPwa() {
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    $('installBtn').classList.remove('hidden');
  });
  $('installBtn').addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => {});
    deferredPrompt = null;
    $('installBtn').classList.add('hidden');
  });
  window.addEventListener('appinstalled', () => $('installBtn').classList.add('hidden'));

  // "Open with…" from the desktop when installed (File Handling API).
  if ('launchQueue' in window) {
    window.launchQueue.setConsumer(async ({ files }) => {
      if (files?.length) importFiles(await Promise.all(files.map((handle) => handle.getFile())));
    });
  }
}

/* ---------- Wiring ---------- */

function initControls() {
  $('fileInput').addEventListener('change', (e) => {
    importFiles(e.target.files);
    e.target.value = '';
  });

  $('addMoreBtn').addEventListener('click', () => $('fileInput').click());
  $('clearBtn').addEventListener('click', () => {
    clearAll();
    showView('upload');
  });

  document.querySelectorAll('input[name="target"]').forEach((el) => el.addEventListener('change', () => {
    state.target = el.value;
    savePrefs();
    renderOptions();
    if (el.value === 'custom') $('customTarget').focus();
  }));
  $('customTarget').addEventListener('input', (e) => {
    state.customTarget = e.target.value;
    savePrefs();
    renderOptions();
  });
  $('customTarget').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !$('compressBtn').disabled) startCompression();
  });
  document.querySelectorAll('input[name="output"]').forEach((el) => el.addEventListener('change', () => {
    state.outputMode = el.value;
    renderOptions();
  }));
  document.querySelectorAll('input[name="photoPage"]').forEach((el) => el.addEventListener('change', () => {
    state.photoPage = el.value;
    savePrefs();
  }));
  $('grayscaleToggle').addEventListener('change', (e) => {
    state.grayscale = e.target.checked;
    savePrefs();
  });

  $('compressBtn').addEventListener('click', startCompression);
  $('cancelBtn').addEventListener('click', () => {
    state.job?.abort();
    state.job = null;
    showView('workspace');
  });

  $('zipBtn').addEventListener('click', downloadZip);
  $('shareBtn').addEventListener('click', shareResults);
  $('backBtn').addEventListener('click', () => showView('workspace'));
  $('againBtn').addEventListener('click', () => {
    clearAll();
    showView('upload');
  });

  document.querySelectorAll('.lang-btn').forEach((btn) => btn.addEventListener('click', () => setLanguage(btn.dataset.lang)));
}

function onLanguage(lang) {
  document.querySelectorAll('.lang-btn').forEach((btn) => btn.setAttribute('aria-pressed', String(btn.dataset.lang === lang)));
  if (state.view === 'workspace') renderWorkspace();
  if (state.view === 'progress') renderProgress();
  if (state.view === 'results') renderResults(state.results, state.resultTargetMB, { onCompare: openCompare });
}

loadPrefs();
onLanguageChange(onLanguage);
initLanguage();
initControls();
initDropTargets();
initCompareDialog();
initPwa();
receiveSharedFiles();
