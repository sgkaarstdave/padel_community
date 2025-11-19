const CACHE_VERSION = 'v1';
const CACHE_NAME = `padel-community-cache-${CACHE_VERSION}`;
const BASE_URL = new URL('./', self.location);
const toAbsoluteUrl = (path) => new URL(path, BASE_URL).toString();
const APP_SHELL_ASSETS = [
  'index.html',
  'manifest.json',
  'src/main.js',
  'src/styles/base.css',
  'src/styles/components.css',
  'src/styles/views.css',
  'src/styles/responsive.css',
  'assets/icons/icon-192.svg',
  'assets/icons/icon-512.svg',
].map(toAbsoluteUrl);
const OFFLINE_FALLBACK = toAbsoluteUrl('index.html');

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        const cloned = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
        return response;
      })
      .catch(async () => {
        const cacheMatch = await caches.match(event.request, { ignoreSearch: true });
        if (cacheMatch) {
          return cacheMatch;
        }
        if (event.request.mode === 'navigate') {
          const fallbackResponse = await caches.match(OFFLINE_FALLBACK);
          if (fallbackResponse) {
            return fallbackResponse;
          }
        }
        return new Response('Offline', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      })
  );
});
