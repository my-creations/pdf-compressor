import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

function listFiles(dir, root = dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path, root) : [relative(root, path).split('\\').join('/')];
  });
}

/**
 * Emits sw.js with a precache list of every built file, so the app works
 * offline after the first visit. The cache version changes whenever any
 * hashed file name changes.
 */
function serviceWorker() {
  return {
    name: 'service-worker',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const built = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      const publicFiles = listFiles('public');
      const precache = ['./', ...[...built, ...publicFiles].sort().map((f) => `./${f}`)];
      const version = createHash('sha256').update(precache.join('\n')).update(
        bundle['index.html']?.source ?? ''
      ).digest('hex').slice(0, 12);

      const source = readFileSync('src/sw.js', 'utf8')
        .replace('__VERSION__', version)
        .replace('__PRECACHE__', JSON.stringify(precache, null, 2));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [serviceWorker()],
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 0,
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'es2022',
    },
  },
});
