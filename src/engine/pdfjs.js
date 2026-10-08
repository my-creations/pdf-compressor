import * as pdfjsLib from 'pdfjs-dist';

let configured = false;

function configure() {
  if (configured) return;
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();
  configured = true;
}

/**
 * Open a PDF with pdf.js (used for thumbnails, previews and rasterisation).
 * The input is copied because pdf.js transfers the buffer to its worker.
 */
export async function openPdf(bytes) {
  configure();
  try {
    return await pdfjsLib.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise;
  } catch (err) {
    const e = new Error(err?.message || 'Invalid PDF');
    e.code = err?.name === 'PasswordException' ? 'password' : 'unreadable';
    throw e;
  }
}

/**
 * Render a page into a canvas element, fitted to `cssWidth` CSS pixels.
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function renderPageToCanvas(pdfDoc, pageNumber, cssWidth, canvas = document.createElement('canvas')) {
  const page = await pdfDoc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const viewport = page.getViewport({ scale: (cssWidth / base.width) * dpr });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.aspectRatio = `${viewport.width} / ${viewport.height}`;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  page.cleanup();
  return canvas;
}
