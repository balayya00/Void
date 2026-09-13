/**
 * Offline service worker.
 *
 * Strategy: cache-first for same-origin GET requests, with a network fallback
 * that quietly refreshes the cache. The game needs no network at all once it
 * has been loaded, so a missing network is never an error state.
 *
 * Bump CACHE_VERSION when shipping changes — old caches are deleted on activate.
 */

const CACHE_VERSION = 'neurovoid-v1';
const PRECACHE = ['./', './index.html', './manifest.webmanifest', './icons/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE).catch(() => undefined))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        // Refresh in the background so the next launch has the newest bundle.
        event.waitUntil(
          fetch(request).then((response) => {
            if (response && response.ok) return caches.open(CACHE_VERSION).then((cache) => cache.put(request, response.clone()));
            return undefined;
          }).catch(() => undefined)
        );
        return cached;
      }
      return fetch(request).then((response) => {
        if (!response || !response.ok) return response;
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy)).catch(() => undefined));
        return response;
      }).catch(() => {
        // Offline and not cached: navigations get the shell, which boots the game.
        if (request.mode === 'navigate') return caches.match('./index.html');
        return new Response('', { status: 504, statusText: 'Offline' });
      });
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});
