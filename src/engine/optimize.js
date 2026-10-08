import {
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFStream,
  PDFDict,
  PDFArray,
  PDFRef,
  PDFBool,
} from 'pdf-lib';
import { unzlibSync, zlibSync } from 'fflate';
import { unpredictPng } from './png.js';

const N = (name) => PDFName.of(name);

/**
 * Image re-encoding steps, best quality first. `maxDim` caps the longest edge
 * in pixels (2400 px ≈ 200 dpi on an A4 page).
 */
export const IMAGE_STEPS = [
  { maxDim: 2400, quality: 0.8 },
  { maxDim: 2000, quality: 0.72 },
  { maxDim: 1700, quality: 0.65 },
  { maxDim: 1400, quality: 0.58 },
  { maxDim: 1150, quality: 0.5 },
  { maxDim: 950, quality: 0.42 },
  { maxDim: 800, quality: 0.35 },
];

/** Images smaller than this are not worth re-encoding. */
const MIN_IMAGE_BYTES = 16 * 1024;

const SAVE_OPTIONS = { useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false };

export class EngineError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

/** Load a PDF with pdf-lib without touching its metadata. */
export async function loadPdf(bytes) {
  try {
    return await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: false });
  } catch (err) {
    if (/encrypt/i.test(err?.message || '')) throw new EngineError('encrypted', err.message);
    throw new EngineError('unreadable', err?.message);
  }
}

export function savePdf(doc) {
  return doc.save(SAVE_OPTIONS);
}

/**
 * Remove objects that nothing references any more (left behind by
 * incremental saves and editors). Lossless.
 * @returns {number} number of objects removed
 */
export function removeUnreachableObjects(doc) {
  const { context } = doc;
  const reachable = new Set();
  const stack = [];
  const { Root, Info } = context.trailerInfo;
  if (Root) stack.push(Root);
  if (Info) stack.push(Info);

  while (stack.length) {
    const obj = stack.pop();
    if (!obj) continue;
    if (obj instanceof PDFRef) {
      const key = obj.tag;
      if (reachable.has(key)) continue;
      reachable.add(key);
      stack.push(context.lookup(obj));
    } else if (obj instanceof PDFDict) {
      for (const [, value] of obj.entries()) stack.push(value);
    } else if (obj instanceof PDFArray) {
      for (const value of obj.asArray()) stack.push(value);
    } else if (obj instanceof PDFStream) {
      stack.push(obj.dict);
    }
  }

  let removed = 0;
  for (const [ref] of context.enumerateIndirectObjects()) {
    if (!reachable.has(ref.tag)) {
      context.delete(ref);
      removed++;
    }
  }
  return removed;
}

/**
 * Flate-compress streams that are stored without any filter. Lossless.
 * @returns {number} bytes saved (approximate)
 */
export function compressPlainStreams(doc) {
  const { context } = doc;
  let saved = 0;
  for (const [ref, obj] of context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const { dict, contents } = obj;
    if (dict.get(N('Filter')) || contents.length < 128) continue;
    if (dict.get(N('Type')) === N('Metadata')) continue; // XMP should stay readable

    const packed = zlibSync(contents, { level: 9 });
    if (packed.length >= contents.length * 0.9) continue;

    const newDict = dict.clone(context);
    newDict.set(N('Filter'), N('FlateDecode'));
    newDict.delete(N('DecodeParms'));
    context.assign(ref, PDFRawStream.of(newDict, packed));
    saved += contents.length - packed.length;
  }
  return saved;
}

function single(value) {
  if (value instanceof PDFArray) return value.size() === 1 ? value.get(0) : undefined;
  return value;
}

function num(context, value, fallback = undefined) {
  const v = context.lookup(value);
  return v instanceof PDFNumber ? v.asNumber() : fallback;
}

/** Resolve an image colour space to a component count we can handle (1 or 3). */
function colorComponents(context, csValue) {
  const cs = context.lookup(csValue);
  if (cs === N('DeviceRGB') || cs === N('CalRGB')) return 3;
  if (cs === N('DeviceGray') || cs === N('CalGray')) return 1;
  if (cs instanceof PDFArray && cs.size() >= 1) {
    const family = cs.get(0);
    if (family === N('CalRGB')) return 3;
    if (family === N('CalGray')) return 1;
    if (family === N('ICCBased') && cs.size() >= 2) {
      const profile = context.lookup(cs.get(1));
      const n = profile instanceof PDFStream ? num(context, profile.dict.get(N('N'))) : undefined;
      if (n === 3 || n === 1) return n;
    }
  }
  return null; // CMYK, Indexed, Lab, Separation, DeviceN… left untouched
}

/**
 * Describe an image XObject, or return null when it cannot be safely re-encoded.
 */
export function describeImage(context, stream) {
  const { dict } = stream;
  if (dict.get(N('Subtype')) !== N('Image')) return null;
  if (context.lookup(dict.get(N('ImageMask'))) === PDFBool.True) return null;
  if (dict.get(N('Decode'))) return null;
  if (context.lookup(dict.get(N('Mask'))) instanceof PDFArray) return null; // colour-key masks need exact samples
  if (stream.contents.length < MIN_IMAGE_BYTES) return null;

  const width = num(context, dict.get(N('Width')));
  const height = num(context, dict.get(N('Height')));
  if (!width || !height) return null;

  const filter = context.lookup(single(context.lookup(dict.get(N('Filter')))));
  const colors = colorComponents(context, dict.get(N('ColorSpace')));
  if (!colors) return null;

  if (filter === N('DCTDecode')) {
    return { kind: 'jpeg', width, height, colors };
  }

  if (filter === N('FlateDecode')) {
    const bpc = num(context, dict.get(N('BitsPerComponent')));
    if (bpc !== 8) return null;
    const parms = context.lookup(single(context.lookup(dict.get(N('DecodeParms')))));
    let predictor = 1;
    if (parms instanceof PDFDict) {
      predictor = num(context, parms.get(N('Predictor')), 1);
      const pc = num(context, parms.get(N('Colors')), colors);
      const pb = num(context, parms.get(N('BitsPerComponent')), 8);
      const pcol = num(context, parms.get(N('Columns')), width);
      if (pc !== colors || pb !== 8 || pcol !== width) return null;
    }
    if (predictor !== 1 && predictor < 10) return null; // TIFF predictor: rare, skip
    return { kind: 'raw', width, height, colors, predictor };
  }

  return null; // JPX, JBIG2, CCITT, chains: already efficient or unsupported
}

/** List the images in a document that the hybrid engine can re-encode. */
export function collectImages(doc) {
  const { context } = doc;
  const images = [];
  for (const [ref, obj] of context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const info = describeImage(context, obj);
    if (info) images.push({ ref, stream: obj, bytes: obj.contents.length, ...info });
  }
  return images;
}

/** Decode a "raw" (Flate) image to 8-bit samples with `colors` components per pixel. */
export function decodeRawSamples(image) {
  let data = unzlibSync(image.stream.contents);
  if (image.predictor >= 10) data = unpredictPng(data, image.width, image.colors, 8);
  const expected = image.width * image.height * image.colors;
  if (data.length < expected) throw new Error('Truncated image data');
  return data.subarray(0, expected);
}

/** Pixel size after capping the long edge at `maxDim`. */
export function scaledSize(width, height, maxDim) {
  const scale = Math.min(1, maxDim / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Re-encode every candidate image at a given step.
 * @param codec - { encodeImage(image, step, grayscale) => Promise<Uint8Array|null> }
 * @returns {Promise<Map<string, {bytes: Uint8Array, width: number, height: number}>>}
 */
async function encodeStep(images, step, grayscale, codec, onImage) {
  const results = new Map();
  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    try {
      const encoded = await codec.encodeImage(image, step, grayscale);
      if (encoded && (encoded.bytes.length < image.bytes || grayscale)) {
        results.set(image.ref.tag, encoded);
      }
    } catch {
      // Leave images we fail to decode as they are.
    }
    onImage(i + 1, images.length);
  }
  return results;
}

function estimateSize(fixedBytes, images, encoded) {
  let total = fixedBytes;
  for (const image of images) {
    const e = encoded.get(image.ref.tag);
    total += e ? Math.min(e.bytes.length, image.bytes) : image.bytes;
  }
  return total;
}

function applyEncoded(doc, images, encoded) {
  const { context } = doc;
  for (const image of images) {
    const e = encoded.get(image.ref.tag);
    if (!e) continue;
    const old = image.stream.dict;
    const dict = context.obj({
      Type: 'XObject',
      Subtype: 'Image',
      Width: e.width,
      Height: e.height,
      ColorSpace: 'DeviceRGB',
      BitsPerComponent: 8,
      Filter: 'DCTDecode',
    });
    for (const key of ['SMask', 'Mask', 'Interpolate', 'Intent', 'OC', 'Metadata', 'Name']) {
      const value = old.get(N(key));
      if (value) dict.set(N(key), value);
    }
    context.assign(image.ref, PDFRawStream.of(dict, e.bytes));
  }
}

/**
 * Smart hybrid optimisation:
 *   1. lossless clean-up (unreferenced objects, uncompressed streams, object streams)
 *   2. re-encode embedded photos/scans as JPEG, stepping quality down until the target fits
 * Text, links, forms and bookmarks are preserved. Page rasterisation (the last resort)
 * lives in rasterize.js because it needs pdf.js.
 *
 * @param {Uint8Array} bytes
 * @param {{targetBytes: number, grayscale?: boolean, edited?: boolean}} options
 * @param codec - image codec (see codec.js)
 * @param {(fraction: number, message: {key: string, params?: object}) => void} onProgress
 * @returns {Promise<{bytes: Uint8Array, mode: 'original'|'lossless'|'images', met: boolean}>}
 */
export async function optimizePdf(bytes, options, codec, onProgress = () => {}) {
  const { targetBytes, grayscale = false, edited = false } = options;
  onProgress(0.02, { key: 'progress.reading' });

  const doc = await loadPdf(bytes);
  if (doc.isEncrypted) throw new EngineError('encrypted');

  onProgress(0.08, { key: 'progress.lossless' });
  removeUnreachableObjects(doc);
  compressPlainStreams(doc);
  const lossless = await savePdf(doc);

  // An untouched file that is already small enough is returned byte-for-byte.
  let best = { bytes: lossless, mode: 'lossless' };
  if (!edited && bytes.length <= lossless.length) best = { bytes, mode: 'original' };
  if (best.bytes.length <= targetBytes && !grayscale) return { ...best, met: true };

  const images = collectImages(doc);
  if (images.length === 0) return { ...best, met: best.bytes.length <= targetBytes };

  const imageBytes = images.reduce((sum, img) => sum + img.bytes, 0);
  const fixedBytes = Math.max(0, lossless.length - imageBytes);
  const safeTarget = targetBytes * 0.97;

  // Order of steps to try: best quality first, then binary search the rest.
  const tried = new Map();
  let attempt = 0;
  const tryStep = async (index) => {
    if (tried.has(index)) return tried.get(index);
    attempt++;
    const step = IMAGE_STEPS[index];
    const encoded = await encodeStep(images, step, grayscale, codec, (done, total) => {
      const base = 0.1 + Math.min(attempt - 1, 3) * 0.2;
      onProgress(Math.min(0.9, base + 0.2 * (done / total)), {
        key: 'progress.images',
        params: { done, total, quality: Math.round(step.quality * 100) },
      });
    });
    const result = { index, encoded, estimate: estimateSize(fixedBytes, images, encoded) };
    tried.set(index, result);
    return result;
  };

  let chosen = await tryStep(0);
  if (chosen.estimate > safeTarget) {
    let lo = 1;
    let hi = IMAGE_STEPS.length - 1;
    let fit = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const r = await tryStep(mid);
      if (r.estimate <= safeTarget) { fit = r; hi = mid - 1; } else { lo = mid + 1; }
    }
    chosen = fit || (await tryStep(IMAGE_STEPS.length - 1));
  }

  // Apply, save, and step down further if the estimate was optimistic.
  for (;;) {
    onProgress(0.92, { key: 'progress.saving' });
    const working = await loadPdf(lossless);
    const workingImages = collectImages(working);
    applyEncoded(working, workingImages, chosen.encoded);
    removeUnreachableObjects(working);
    const out = await savePdf(working);

    // Re-encoding never makes a file bigger unless grayscale was explicitly requested.
    const pick = !grayscale && out.length >= best.bytes.length
      ? { ...best, met: best.bytes.length <= targetBytes }
      : { bytes: out, mode: 'images', met: out.length <= targetBytes };

    if (pick.met || chosen.index >= IMAGE_STEPS.length - 1) return pick;
    chosen = await tryStep(chosen.index + 1);
  }
}
