/**
 * Main-thread wrapper around the engine worker. Cancelling a call terminates
 * the worker; a fresh one is started for the next call.
 */
export class EngineClient {
  constructor() {
    this.worker = null;
    this.nextId = 1;
    this.pending = new Map();
  }

  ensureWorker() {
    if (this.worker) return this.worker;
    this.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = ({ data }) => {
      const call = this.pending.get(data.id);
      if (!call) return;
      if (data.type === 'progress') {
        call.onProgress(data.fraction, data.message);
      } else if (data.type === 'done') {
        this.pending.delete(data.id);
        call.resolve(data.result);
      } else if (data.type === 'error') {
        this.pending.delete(data.id);
        const err = new Error(data.error.message);
        err.code = data.error.code;
        err.source = data.error.source;
        call.reject(err);
      }
    };
    this.worker.onerror = (event) => {
      const err = new Error(event.message || 'Worker failed');
      err.code = 'failed';
      this.reset(err);
    };
    return this.worker;
  }

  reset(reason) {
    this.worker?.terminate();
    this.worker = null;
    for (const call of this.pending.values()) call.reject(reason);
    this.pending.clear();
  }

  call(type, payload, { onProgress = () => {}, signal, transfer = [] } = {}) {
    if (signal?.aborted) return Promise.reject(abortError());
    const worker = this.ensureWorker();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onProgress });
      signal?.addEventListener('abort', () => this.reset(abortError()), { once: true });
      worker.postMessage({ id, type, payload }, transfer);
    });
  }
}

export function abortError() {
  const err = new Error('Cancelled');
  err.name = 'AbortError';
  return err;
}
