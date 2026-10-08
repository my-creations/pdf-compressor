import { EngineClient, abortError } from './client.js';

const client = new EngineClient();

/** Errors where the hybrid engine cannot work but rasterising may still succeed. */
const RASTER_FALLBACK_CODES = new Set(['encrypted', 'unreadable']);

/**
 * Run a compression job: for each output, assemble its pages, run the hybrid
 * optimiser in the worker, and rasterise as a last resort if the target is missed.
 *
 * @param {object} job
 * @param {Record<string, {kind, bytes, type, name, pageCount}>} job.sources
 * @param {{name: string, pages: {sourceId, index, rotation}[]}[]} job.outputs
 * @param {number} job.targetBytes
 * @param {boolean} job.grayscale
 * @param {'a4'|'fit'} job.imagePageSize
 * @param {{onProgress: Function, signal: AbortSignal}} hooks
 */
export async function runJob(job, { onProgress = () => {}, signal } = {}) {
  const { sources, outputs, targetBytes, grayscale, imagePageSize } = job;
  const results = [];

  for (let o = 0; o < outputs.length; o++) {
    if (signal?.aborted) throw abortError();
    const output = outputs[o];
    const stage = (start, span) => (fraction, message) =>
      onProgress({
        output: o,
        outputs: outputs.length,
        fraction: (o + start + span * Math.min(1, fraction)) / outputs.length,
        message,
      });

    const used = {};
    for (const page of output.pages) used[page.sourceId] = sources[page.sourceId];
    const originalSize = Object.values(used).reduce((sum, s) => sum + s.bytes.length, 0);

    const assembled = await client.call(
      'assemble',
      { sources: used, pages: output.pages, imagePageSize },
      { onProgress: stage(0, 0.1), signal }
    );

    let result = null;
    try {
      const copy = assembled.bytes.slice();
      result = await client.call(
        'optimize',
        { bytes: copy, options: { targetBytes, grayscale, edited: assembled.edited } },
        { onProgress: stage(0.1, 0.6), signal, transfer: [copy.buffer] }
      );
    } catch (err) {
      if (err.name === 'AbortError' || !RASTER_FALLBACK_CODES.has(err.code)) throw withSource(err, output);
    }

    if (!result || !result.met) {
      try {
        const { rasterizePdf } = await import('./rasterize.js');
        const raster = await rasterizePdf(assembled.bytes, { targetBytes, grayscale }, stage(0.7, 0.3), signal);
        if (!result || raster.met || raster.bytes.length < result.bytes.length) result = raster;
      } catch (err) {
        if (err.name === 'AbortError' || !result) throw withSource(err, output);
      }
    }

    results.push({
      name: output.name,
      originalSize,
      sourceBytes: assembled.bytes,
      bytes: result.bytes,
      size: result.bytes.length,
      // Photos are always re-encoded when they become pages, so "lossless" would be misleading.
      mode: result.mode !== 'raster' && output.pages.some((p) => sources[p.sourceId].kind === 'image') ? 'photos' : result.mode,
      met: result.met,
    });
  }

  onProgress({ output: outputs.length - 1, outputs: outputs.length, fraction: 1, message: { key: 'progress.saving' } });
  return results;
}

function withSource(err, output) {
  if (!err.source) err.source = output.displayName || output.name;
  return err;
}
