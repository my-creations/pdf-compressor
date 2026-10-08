import { PDFDocument } from 'pdf-lib';
import { openPdf } from './pdfjs.js';
import { canvasToJpeg, grayscaleCanvas } from './codec.js';
import { abortError } from './client.js';

/**
 * Starting render scale (1 = 72 dpi) and JPEG quality for a per-page byte budget.
 */
export function initialRasterSettings(targetBytes, numPages) {
  const perPage = targetBytes / Math.max(1, numPages);
  if (perPage >= 400 * 1024) return { scale: 2, quality: 0.8 };
  if (perPage >= 200 * 1024) return { scale: 1.6, quality: 0.75 };
  if (perPage >= 100 * 1024) return { scale: 1.35, quality: 0.7 };
  if (perPage >= 50 * 1024) return { scale: 1.1, quality: 0.6 };
  return { scale: 0.9, quality: 0.5 };
}

/** Next settings after an attempt produced `size` bytes against `targetBytes`. */
export function nextRasterSettings({ scale, quality }, size, targetBytes) {
  const ratio = targetBytes / size;
  return {
    scale: Math.max(0.6, scale * Math.sqrt(ratio) * 0.95),
    quality: Math.max(0.3, quality * Math.min(1, ratio * 1.1) * 0.92),
  };
}

/**
 * Last-resort compression: render every page to a JPEG and rebuild the PDF.
 * Text is no longer selectable afterwards, so this only runs when the hybrid
 * engine cannot reach the target.
 */
export async function rasterizePdf(bytes, { targetBytes, grayscale = false }, onProgress = () => {}, signal) {
  const pdfDoc = await openPdf(bytes);
  const numPages = pdfDoc.numPages;
  let settings = initialRasterSettings(targetBytes, numPages);
  let best = null;

  try {
    for (let attempt = 1; attempt <= 4; attempt++) {
      const out = await PDFDocument.create();
      out.setProducer('PDF Compressor');

      for (let i = 1; i <= numPages; i++) {
        if (signal?.aborted) throw abortError();
        const page = await pdfDoc.getPage(i);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: settings.scale });

        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: grayscale });
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport, intent: 'print' }).promise;
        if (grayscale) grayscaleCanvas(ctx, canvas.width, canvas.height);

        const jpeg = await canvasToJpeg(canvas, settings.quality);
        canvas.width = 0;
        canvas.height = 0;
        page.cleanup();

        const image = await out.embedJpg(jpeg);
        const pdfPage = out.addPage([base.width, base.height]);
        pdfPage.drawImage(image, { x: 0, y: 0, width: base.width, height: base.height });

        onProgress((attempt - 1 + i / numPages) / 4, {
          key: 'progress.raster',
          params: { page: i, total: numPages },
        });
      }

      const result = await out.save({ useObjectStreams: true });
      if (!best || result.length < best.length) best = result;
      if (result.length <= targetBytes) break;
      settings = nextRasterSettings(settings, result.length, targetBytes);
    }
  } finally {
    pdfDoc.destroy();
  }

  return { bytes: best, mode: 'raster', met: best.length <= targetBytes };
}
