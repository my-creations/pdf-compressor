/* Service worker: offline support and the Web Share Target.
 * Built by the `service-worker` plugin in vite.config.js, which fills in the
 * cache version and the precache list with the hashed build output. */

const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const CACHE = `pdfc-${VERSION}`;
const SHARE_CACHE = 'share-target';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('pdfc-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    event.respondWith(receiveShare(request));
    return;
  }
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // Network first so updates arrive; the cached shell keeps the app working offline.
    event.respondWith(
      fetch(request).catch(() => caches.match('./index.html', { ignoreSearch: true, ignoreVary: true }).then((r) => r || caches.match('./')))
    );
    return;
  }

  event.respondWith(
    // ignoreVary: module scripts are CORS requests, and servers often send `Vary: Origin`.
    caches.match(request, { ignoreVary: true }).then((hit) => hit || fetch(request).then((response) => {
      if (response.ok && response.type === 'basic') {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    }))
  );
});

async function receiveShare(request) {
  const form = await request.formData();
  const files = form.getAll('files').filter((f) => typeof f === 'object' && 'name' in f);
  const cache = await caches.open(SHARE_CACHE);
  for (const old of await cache.keys()) await cache.delete(old);
  await Promise.all(files.map((file, i) => cache.put(
    new Request(`./shared/${Date.now()}-${i}`),
    new Response(file, {
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        'X-File-Name': encodeURIComponent(file.name),
      },
    })
  )));
  return Response.redirect(new URL('./?shared=1', self.registration.scope).href, 303);
}
