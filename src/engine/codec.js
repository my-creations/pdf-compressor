import { decodeRawSamples, scaledSize } from './optimize.js';

/**
 * Browser image codec used by the engine. Works on the main thread and inside
 * a Web Worker (via OffscreenCanvas).
 */

export function createCanvas(width, height) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export async function canvasToJpeg(canvas, quality) {
  const blob = canvas.convertToBlob
    ? await canvas.convertToBlob({ type: 'image/jpeg', quality })
    : await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error('JPEG encoding failed');
  return new Uint8Array(await blob.arrayBuffer());
}

/** Convert the canvas contents to grayscale in place (Rec. 601 luma). */
export function grayscaleCanvas(ctx, width, height) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const y = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
    d[i] = d[i + 1] = d[i + 2] = y;
  }
  ctx.putImageData(imageData, 0, 0);
}

/** Draw `source` onto a white canvas of the given size. */
export function drawToCanvas(source, width, height, grayscale = false) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: grayscale });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);
  if (grayscale) grayscaleCanvas(ctx, width, height);
  return canvas;
}

function releaseCanvas(canvas) {
  canvas.width = 0;
  canvas.height = 0;
}

async function decodeImage(image) {
  if (image.kind === 'jpeg') {
    return createImageBitmap(new Blob([image.stream.contents], { type: 'image/jpeg' }));
  }
  const samples = decodeRawSamples(image);
  const { width, height, colors } = image;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let p = 0, s = 0, d = 0; p < width * height; p++, d += 4) {
    if (colors === 1) {
      rgba[d] = rgba[d + 1] = rgba[d + 2] = samples[s++];
    } else {
      rgba[d] = samples[s++];
      rgba[d + 1] = samples[s++];
      rgba[d + 2] = samples[s++];
    }
    rgba[d + 3] = 255;
  }
  return createImageBitmap(new ImageData(rgba, width, height));
}

export const browserCodec = {
  /** Re-encode an embedded PDF image at an IMAGE_STEPS step. */
  async encodeImage(image, step, grayscale) {
    const bitmap = await decodeImage(image);
    const { width, height } = scaledSize(bitmap.width, bitmap.height, step.maxDim);
    const canvas = drawToCanvas(bitmap, width, height, grayscale);
    bitmap.close?.();
    const bytes = await canvasToJpeg(canvas, step.quality);
    releaseCanvas(canvas);
    return { bytes, width, height };
  },

  /**
   * Prepare a photo or picture file for embedding as a PDF page.
   * Applies EXIF orientation and caps the resolution.
   */
  async encodePhoto(bytes, type, maxDim = 2400, quality = 0.85) {
    let bitmap;
    try {
      bitmap = await createImageBitmap(new Blob([bytes], { type }), { imageOrientation: 'from-image' });
    } catch {
      const err = new Error('Unsupported image');
      err.code = 'image-unsupported';
      throw err;
    }
    const { width, height } = scaledSize(bitmap.width, bitmap.height, maxDim);
    const canvas = drawToCanvas(bitmap, width, height);
    bitmap.close?.();
    const jpeg = await canvasToJpeg(canvas, quality);
    releaseCanvas(canvas);
    return { bytes: jpeg, width, height };
  },
};
