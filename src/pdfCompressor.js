import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';

// Configure pdfjs worker for Vite
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export const TARGET_MAX_BYTES = 1.9 * 1024 * 1024; // 1.9 MB safety target

/**
 * Format bytes to readable MB string
 */
export function formatMB(bytes) {
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

/**
 * Compress PDF File or ArrayBuffer to target size < 2 MB
 * @param {ArrayBuffer} arrayBuffer - Input PDF buffer
 * @param {Function} onProgress - Callback (percent, statusText)
 * @returns {Promise<{ pdfBytes: Uint8Array, originalSize: number, compressedSize: number, pages: number }>}
 */
export async function compressPdf(arrayBuffer, onProgress = () => {}) {
  const originalSize = arrayBuffer.byteLength;
  onProgress(5, 'A carregar PDF...');

  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;

  onProgress(10, `PDF carregado (${numPages} páginas). A analisar...`);

  // Target estimation based on file size and page count
  // We start with high quality settings and adaptively scale down if needed
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

    // If still larger than 1.9 MB, lower resolution scale and quality factor aggressively
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

    // Fill white background for crisp document rendering
    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvasContext: context,
      viewport: viewport,
      intent: 'print'
    }).promise;

    // Export canvas directly as compressed JPEG blob/Uint8Array
    const jpegDataUrl = canvas.toDataURL('image/jpeg', quality);
    const jpegBytes = dataURLToUint8Array(jpegDataUrl);

    // Embed into pdf-lib document
    const embeddedImage = await newPdf.embedJpg(jpegBytes);
    
    // Maintain original page aspect ratio in PDF points
    const pdfPage = newPdf.addPage([viewport.width / scale, viewport.height / scale]);
    pdfPage.drawImage(embeddedImage, {
      x: 0,
      y: 0,
      width: viewport.width / scale,
      height: viewport.height / scale,
    });

    // Cleanup canvas reference for memory garbage collection
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
