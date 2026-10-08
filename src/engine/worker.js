import { optimizePdf } from './optimize.js';
import { assemblePdf } from './assemble.js';
import { browserCodec } from './codec.js';

const handlers = {
  assemble: (payload, progress) => assemblePdf(payload, browserCodec, progress),
  optimize: (payload, progress) => optimizePdf(payload.bytes, payload.options, browserCodec, progress),
};

function transferable(bytes) {
  return bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes : bytes.slice();
}

self.onmessage = async ({ data }) => {
  const { id, type, payload } = data;
  const progress = (fraction, message) => self.postMessage({ id, type: 'progress', fraction, message });
  try {
    const result = await handlers[type](payload, progress);
    result.bytes = transferable(result.bytes);
    self.postMessage({ id, type: 'done', result }, [result.bytes.buffer]);
  } catch (err) {
    self.postMessage({
      id,
      type: 'error',
      error: { code: err.code || 'failed', message: err.message, source: err.source },
    });
  }
};
