import { PDFDocument, PDFName, degrees } from 'pdf-lib';
import { loadPdf, savePdf, removeUnreachableObjects, EngineError } from './optimize.js';

export const A4 = [595.28, 841.89];
const PHOTO_MARGIN = 24;

/** True when `pages` is exactly the unmodified page list of one PDF source. */
export function isPassThrough(pages, sources) {
  if (pages.length === 0) return false;
  const source = sources[pages[0].sourceId];
  if (!source || source.kind !== 'pdf' || source.pageCount !== pages.length) return false;
  return pages.every((p, i) => p.sourceId === pages[0].sourceId && p.index === i && !p.rotation);
}

/** Page box and image placement for a photo page. */
export function photoLayout(width, height, pageSize) {
  if (pageSize === 'fit') {
    // Treat the photo as 150 dpi.
    const w = (width * 72) / 150;
    const h = (height * 72) / 150;
    return { page: [w, h], x: 0, y: 0, width: w, height: h };
  }
  const landscape = width > height;
  const [pw, ph] = landscape ? [A4[1], A4[0]] : A4;
  const scale = Math.min((pw - 2 * PHOTO_MARGIN) / width, (ph - 2 * PHOTO_MARGIN) / height);
  const w = width * scale;
  const h = height * scale;
  return { page: [pw, ph], x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h };
}

/**
 * Build one PDF from a list of pages drawn from PDF and image sources.
 * @param {{sources: Record<string, {kind: 'pdf'|'image', bytes: Uint8Array, type: string, name: string, pageCount?: number}>,
 *          pages: {sourceId: string, index: number, rotation: number}[],
 *          imagePageSize: 'a4'|'fit'}} job
 * @returns {Promise<{bytes: Uint8Array, edited: boolean}>}
 */
export async function assemblePdf(job, codec, onProgress = () => {}) {
  const { sources, pages, imagePageSize = 'a4' } = job;
  if (isPassThrough(pages, sources)) {
    return { bytes: sources[pages[0].sourceId].bytes, edited: false };
  }

  onProgress(0, { key: 'progress.assembling' });
  const loaded = new Map();

  const loadSource = async (id) => {
    if (!loaded.has(id)) {
      try {
        loaded.set(id, await loadPdf(sources[id].bytes));
      } catch (err) {
        const e = new EngineError(err.code || 'unreadable', err.message);
        e.source = sources[id].name;
        throw e;
      }
      if (loaded.get(id).isEncrypted) {
        const e = new EngineError('encrypted');
        e.source = sources[id].name;
        throw e;
      }
    }
    return loaded.get(id);
  };

  // Edit one source PDF in place rather than copying its pages into a new document:
  // copyPages() leaves the catalog behind, which would drop form fields (AcroForm),
  // bookmarks and metadata. Prefer the PDF with a form, else the first; pages from
  // the other sources are copied in.
  const pdfIds = [...new Set(pages.map((p) => p.sourceId))].filter((id) => sources[id].kind === 'pdf');
  let baseId = pdfIds[0];
  for (const id of pdfIds) {
    if ((await loadSource(id)).catalog.has(PDFName.of('AcroForm'))) {
      baseId = id;
      break;
    }
  }
  let out;
  let basePages = [];
  if (baseId) {
    out = await loadSource(baseId);
    basePages = out.getPages();
    for (let k = basePages.length - 1; k >= 0; k--) out.removePage(k);
  } else {
    out = await PDFDocument.create();
  }
  out.setProducer('PDF Compressor');

  const rotate = (page, rotation) => {
    if (rotation) page.setRotation(degrees((page.getRotation().angle + rotation) % 360));
  };

  let i = 0;
  while (i < pages.length) {
    const spec = pages[i];
    const source = sources[spec.sourceId];

    if (source.kind === 'image') {
      let photo;
      try {
        photo = await codec.encodePhoto(source.bytes, source.type);
      } catch (err) {
        const e = new EngineError(err.code || 'image-unsupported', err.message);
        e.source = source.name;
        throw e;
      }
      const image = await out.embedJpg(photo.bytes);
      const layout = photoLayout(photo.width, photo.height, imagePageSize);
      const page = out.addPage(layout.page);
      page.drawImage(image, { x: layout.x, y: layout.y, width: layout.width, height: layout.height });
      rotate(page, spec.rotation);
      i++;
    } else {
      // Copy consecutive pages from the same PDF in one call so shared resources stay shared.
      let j = i;
      while (j < pages.length && pages[j].sourceId === spec.sourceId) j++;
      const run = pages.slice(i, j);
      const runPages = spec.sourceId === baseId
        ? run.map((p) => basePages[p.index])
        : await out.copyPages(await loadSource(spec.sourceId), run.map((p) => p.index));
      runPages.forEach((page, k) => {
        out.addPage(page);
        rotate(page, run[k].rotation);
      });
      i = j;
    }
    onProgress(i / pages.length, { key: 'progress.assembling' });
  }

  removeUnreachableObjects(out); // drops deleted pages nothing else points to
  return { bytes: await savePdf(out), edited: true };
}
