import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';

export const TARGET_MAX_BYTES = 1.9 * 1024 * 1024; // 1.9 MB safety target

/**
 * Configure worker safely for browser environment
 */
export function initPdfWorker() {
  if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();
  }
}

/**
 * Format bytes to readable MB string
 */
export function formatMB(bytes) {
  if (typeof bytes !== 'number' || isNaN(bytes) || bytes < 0) return '0.00 MB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

/**
 * Calculate reduction percentage
 */
export function calculateReduction(originalSize, compressedSize) {
  if (!originalSize || originalSize <= 0) return 0;
  const reduction = Math.round((1 - compressedSize / originalSize) * 100);
  return Math.max(0, reduction);
}

/**
 * Compress PDF File or ArrayBuffer to target size < 2 MB
 * @param {ArrayBuffer} arrayBuffer - Input PDF buffer
 * @param {Function} onProgress - Callback (percent, statusText)
 * @returns {Promise<{ pdfBytes: Uint8Array, originalSize: number, compressedSize: number, pages: number }>}
 */
export async function compressPdf(arrayBuffer, onProgress = () => {}) {
  initPdfWorker();
  const originalSize = arrayBuffer.byteLength;
  onProgress(5, 'A carregar PDF...');

  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;

  onProgress(10, `PDF carregado (${numPages} páginas). A analisar...`);

  let scale = 1.5;
  let quality = 0.80;

  if (originalSize > 15 * 1024 * 1024) {
    scale = 1.2;
    quality = 0.65;
  } else if (originalSize > 8 * 1024 * 1024) {
    scale = 1.35;
    quality = 0.72;
  } else if (originalSize > 4 * 1024 * 1024) {
    scale = 1.4;
    quality = 0.78;
  }

  let attempt = 0;
  let resultPdfBytes = null;
  let resultSize = Infinity;

  while (attempt < 4 && resultSize > TARGET_MAX_BYTES) {
    attempt++;
    const statusMsg = attempt === 1 
      ? `A otimizar páginas (Qualidade ${Math.round(quality * 100)}%)...`
      : `Ajuste de compressão #${attempt} para garantir < 2 MB...`;
    
    onProgress(15 + (attempt - 1) * 20, statusMsg);

    resultPdfBytes = await processPages(pdfDoc, numPages, scale, quality, (p) => {
      const stepProgress = 15 + Math.round((p / 100) * 70);
      onProgress(stepProgress, `A processar página (${p}%)...`);
    });

    resultSize = resultPdfBytes.byteLength;

    // If still larger than 1.9 MB, lower resolution scale and quality factor adaptively
    if (resultSize > TARGET_MAX_BYTES) {
      const ratio = TARGET_MAX_BYTES / resultSize;
      scale = Math.max(0.75, scale * Math.sqrt(ratio) * 0.95);
      quality = Math.max(0.45, quality * ratio * 0.9);
    }
  }

  onProgress(100, 'Concluído com sucesso!');

  return {
    pdfBytes: resultPdfBytes,
    originalSize,
    compressedSize: resultPdfBytes.byteLength,
    pages: numPages
  };
}

/**
 * Render pages onto canvas and rebuild PDF using JPEG stream compression
 */
async function processPages(pdfDoc, numPages, scale, quality, onPageProgress) {
  const newPdf = await PDFDocument.create();

  for (let i = 1; i <= numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { alpha: false, willReadFrequently: false });

    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvasContext: context,
      viewport: viewport,
      intent: 'print'
    }).promise;

    const jpegDataUrl = canvas.toDataURL('image/jpeg', quality);
    const jpegBytes = dataURLToUint8Array(jpegDataUrl);

    const embeddedImage = await newPdf.embedJpg(jpegBytes);
    
    const pdfPage = newPdf.addPage([viewport.width / scale, viewport.height / scale]);
    pdfPage.drawImage(embeddedImage, {
      x: 0,
      y: 0,
      width: viewport.width / scale,
      height: viewport.height / scale,
    });

    canvas.width = 0;
    canvas.height = 0;

    onPageProgress(Math.round((i / numPages) * 100));
  }

  return await newPdf.save();
}

function dataURLToUint8Array(dataURL) {
  const base64 = dataURL.split(',')[1];
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
