import { describe, it, expect } from 'bun:test';
import { PDFDocument, PDFName, PDFRawStream, StandardFonts, degrees } from 'pdf-lib';
import { zlibSync } from 'fflate';
import { unpredictPng } from '../../src/engine/png.js';
import {
  removeUnreachableObjects, compressPlainStreams, collectImages, decodeRawSamples,
  scaledSize, optimizePdf, IMAGE_STEPS,
} from '../../src/engine/optimize.js';
import { isPassThrough, photoLayout, assemblePdf, A4 } from '../../src/engine/assemble.js';
import { initialRasterSettings, nextRasterSettings } from '../../src/engine/rasterize.js';

const MB = 1024 * 1024;

/** Minimal PNG (RGB, 8-bit) so pdf-lib embeds a Flate image. */
function makePng(width, height, pixel) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (bytes) => {
    let c = 0xffffffff;
    for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    out.set(new TextEncoder().encode(type), 4);
    out.set(data, 8);
    view.setUint32(8 + data.length, crc(out.subarray(4, 8 + data.length)));
    return out;
  };
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const raw = new Uint8Array(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) raw.set(pixel(x, y), y * (1 + width * 3) + 1 + x * 3);
  }
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlibSync(raw)), chunk('IEND', new Uint8Array())];
  const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { png.set(p, o); o += p.length; }
  return png;
}

let seed = 7;
const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
const noisy = (x, y) => [(x * 7 + rand() * 255) & 255, (y * 3 + rand() * 255) & 255, rand() * 255];

async function pdfWithImage(width, height) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const image = await doc.embedPng(makePng(width, height, noisy));
  const page = doc.addPage([595, 842]);
  page.drawImage(image, { x: 0, y: 100, width: 595, height: 700 });
  page.drawText('Texto que deve continuar selecionável', { x: 40, y: 50, size: 14, font });
  return doc.save();
}

/** Stand-in codec: returns a small fake JPEG whose size depends on the step. */
const fakeCodec = {
  calls: [],
  async encodeImage(image, step, grayscale) {
    this.calls.push({ step, grayscale });
    const { width, height } = scaledSize(image.width, image.height, step.maxDim);
    const bytes = new Uint8Array(Math.round(width * height * step.quality * 0.1));
    return { bytes, width, height };
  },
};

describe('unpredictPng', () => {
  it('reverses Sub, Up and Paeth filters', () => {
    // 2 columns, 1 component: row 1 Sub, row 2 Up, row 3 Paeth.
    const data = new Uint8Array([1, 10, 5, 2, 1, 1, 4, 0, 0]);
    expect([...unpredictPng(data, 2, 1, 8)]).toEqual([10, 15, 11, 16, 11, 16]);
  });

  it('rejects unknown filters', () => {
    expect(() => unpredictPng(new Uint8Array([9, 1]), 1, 1, 8)).toThrow();
  });
});

describe('lossless clean-up', () => {
  it('removes unreferenced objects', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const orphan = doc.context.register(doc.context.obj({ Junk: 'Yes' }));
    expect(removeUnreachableObjects(doc)).toBeGreaterThanOrEqual(1);
    expect(doc.context.lookup(orphan)).toBeUndefined();
    expect(doc.getPageCount()).toBe(1);
  });

  it('compresses streams stored without a filter', async () => {
    const doc = await PDFDocument.create();
    const contents = new TextEncoder().encode('BT /F1 12 Tf (repeat) Tj ET\n'.repeat(200));
    const ref = doc.context.register(PDFRawStream.of(doc.context.obj({}), contents));
    doc.catalog.set(PDFName.of('Extra'), ref);
    expect(compressPlainStreams(doc)).toBeGreaterThan(0);
    const stream = doc.context.lookup(ref);
    expect(stream.dict.get(PDFName.of('Filter'))).toBe(PDFName.of('FlateDecode'));
    expect(stream.contents.length).toBeLessThan(contents.length);
  });
});

describe('image discovery', () => {
  it('finds Flate images and decodes their samples', async () => {
    const doc = await PDFDocument.load(await pdfWithImage(200, 150));
    const images = collectImages(doc);
    expect(images.length).toBe(1);
    expect(images[0]).toMatchObject({ kind: 'raw', width: 200, height: 150, colors: 3 });
    expect(decodeRawSamples(images[0]).length).toBe(200 * 150 * 3);
  });

  it('ignores tiny images', async () => {
    const doc = await PDFDocument.load(await pdfWithImage(8, 8));
    expect(collectImages(doc).length).toBe(0);
  });

  it('caps the long edge', () => {
    expect(scaledSize(4000, 3000, 2000)).toEqual({ width: 2000, height: 1500 });
    expect(scaledSize(800, 600, 2000)).toEqual({ width: 800, height: 600 });
  });
});

describe('optimizePdf', () => {
  it('returns a small, untouched file byte-for-byte', async () => {
    const doc = await PDFDocument.create();
    doc.addPage().drawText('ola');
    const bytes = await doc.save();
    const result = await optimizePdf(bytes, { targetBytes: 2 * MB }, fakeCodec);
    expect(result.met).toBe(true);
    expect(['original', 'lossless']).toContain(result.mode);
    expect(result.bytes.length).toBeLessThanOrEqual(bytes.length);
  });

  it('re-encodes images until the target fits and keeps text', async () => {
    const bytes = await pdfWithImage(1400, 1000);
    expect(bytes.length).toBeGreaterThan(3 * MB);
    fakeCodec.calls = [];
    const result = await optimizePdf(bytes, { targetBytes: 100 * 1024 }, fakeCodec);
    expect(result.mode).toBe('images');
    expect(result.met).toBe(true);
    expect(result.bytes.length).toBeLessThanOrEqual(100 * 1024);

    const out = await PDFDocument.load(result.bytes);
    const images = [...out.context.enumerateIndirectObjects()]
      .map(([, o]) => o)
      .filter((o) => o instanceof PDFRawStream && o.dict.get(PDFName.of('Subtype')) === PDFName.of('Image'));
    expect(images.length).toBe(1);
    expect(images[0].dict.get(PDFName.of('Filter'))).toBe(PDFName.of('DCTDecode'));
    expect(out.getPage(0).node.Resources().lookup(PDFName.of('Font'))).toBeDefined();
    // Started at best quality and searched downwards.
    expect(fakeCodec.calls[0].step).toBe(IMAGE_STEPS[0]);
  });

  it('applies grayscale even when the file already fits', async () => {
    const bytes = await pdfWithImage(400, 300);
    fakeCodec.calls = [];
    const result = await optimizePdf(bytes, { targetBytes: 10 * MB, grayscale: true }, fakeCodec);
    expect(result.mode).toBe('images');
    expect(fakeCodec.calls.length).toBeGreaterThan(0);
    expect(fakeCodec.calls.every((c) => c.grayscale)).toBe(true);
  });

  it('reports when the target cannot be met', async () => {
    const bytes = await pdfWithImage(1400, 1000);
    const result = await optimizePdf(bytes, { targetBytes: 1024 }, fakeCodec);
    expect(result.met).toBe(false);
  });
});

describe('assemble', () => {
  async function textDoc(n) {
    const doc = await PDFDocument.create();
    for (let i = 0; i < n; i++) doc.addPage([300 + i, 400]);
    return doc.save();
  }

  it('detects untouched single documents', () => {
    const sources = { a: { kind: 'pdf', pageCount: 2 } };
    expect(isPassThrough([{ sourceId: 'a', index: 0, rotation: 0 }, { sourceId: 'a', index: 1, rotation: 0 }], sources)).toBe(true);
    expect(isPassThrough([{ sourceId: 'a', index: 1, rotation: 0 }, { sourceId: 'a', index: 0, rotation: 0 }], sources)).toBe(false);
    expect(isPassThrough([{ sourceId: 'a', index: 0, rotation: 90 }, { sourceId: 'a', index: 1, rotation: 0 }], sources)).toBe(false);
    expect(isPassThrough([{ sourceId: 'a', index: 0, rotation: 0 }], sources)).toBe(false);
  });

  it('merges, reorders and rotates pages', async () => {
    const a = await textDoc(3);
    const b = await textDoc(1);
    const sources = {
      a: { kind: 'pdf', bytes: a, name: 'a.pdf', pageCount: 3 },
      b: { kind: 'pdf', bytes: b, name: 'b.pdf', pageCount: 1 },
    };
    const pages = [
      { sourceId: 'a', index: 2, rotation: 0 },
      { sourceId: 'b', index: 0, rotation: 90 },
      { sourceId: 'a', index: 0, rotation: 180 },
    ];
    const { bytes, edited } = await assemblePdf({ sources, pages }, fakeCodec);
    expect(edited).toBe(true);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(3);
    expect(doc.getPage(0).getWidth()).toBe(302);
    expect(doc.getPage(1).getRotation()).toEqual(degrees(90));
    expect(doc.getPage(2).getRotation()).toEqual(degrees(180));
  });

  it('fits photos on A4 in the right orientation', () => {
    const landscape = photoLayout(4000, 3000, 'a4');
    expect(landscape.page).toEqual([A4[1], A4[0]]);
    expect(landscape.width).toBeLessThanOrEqual(A4[1]);
    const portrait = photoLayout(3000, 4000, 'a4');
    expect(portrait.page).toEqual(A4);
    expect(photoLayout(1500, 1500, 'fit').page).toEqual([720, 720]);
  });
});

describe('raster fallback settings', () => {
  it('starts sharper when there is more budget per page', () => {
    expect(initialRasterSettings(2 * MB, 2).scale).toBeGreaterThan(initialRasterSettings(2 * MB, 40).scale);
  });

  it('steps down after an oversized attempt, with floors', () => {
    const next = nextRasterSettings({ scale: 1.5, quality: 0.8 }, 4 * MB, 2 * MB);
    expect(next.scale).toBeLessThan(1.5);
    expect(next.quality).toBeLessThan(0.8);
    const floor = nextRasterSettings({ scale: 0.6, quality: 0.3 }, 100 * MB, MB);
    expect(floor).toEqual({ scale: 0.6, quality: 0.3 });
  });
});
