const VERSION = 'klask-offline-v1';
const APP_CACHE = `${VERSION}:app`;
const ASSET_CACHE = `${VERSION}:assets`;
const SAME_ORIGIN_ASSET_TYPES = new Set(['font', 'image', 'script', 'style', 'worker']);
const CROSS_ORIGIN_CACHE_TYPES = new Set(['font', 'style']);

function scopedUrl(path) {
  return new URL(path, self.registration.scope).toString();
}

async function cacheOptional(cache, request) {
  try {
    const response = await fetch(request, { cache: 'no-cache' });

    if (response && (response.ok || response.type === 'opaque')) {
      await cache.put(request, response.clone());
    }

    return response;
  } catch {
    return undefined;
  }
}

async function precacheAppShell() {
  const appCache = await caches.open(APP_CACHE);
  const assetCache = await caches.open(ASSET_CACHE);
  const rootUrl = scopedUrl('./');
  const coreUrls = [
    rootUrl,
    scopedUrl('./index.html'),
    scopedUrl('./manifest.webmanifest'),
    scopedUrl('./icons/klask-icon-192.png'),
    scopedUrl('./icons/klask-icon-512.png'),
    scopedUrl('./icons/klask-icon.svg'),
  ];

  await Promise.all(coreUrls.map((url) => cacheOptional(appCache, url)));

  const shell = await appCache.match(rootUrl) || await appCache.match(scopedUrl('./index.html'));

  if (!shell) {
    return;
  }

  const html = await shell.clone().text();
  const assetUrls = Array.from(html.matchAll(/\b(?:href|src)="([^"]+)"/g))
    .map((match) => new URL(match[1], rootUrl).toString())
    .filter((url) => url.startsWith(scopedUrl('./assets/')));

  await Promise.all(assetUrls.map((url) => cacheOptional(assetCache, url)));
}

async function deleteOldCaches() {
  const keys = await caches.keys();

  await Promise.all(
    keys
      .filter((key) => key.startsWith('klask-offline-') && !key.startsWith(VERSION))
      .map((key) => caches.delete(key)),
  );
}

async function navigationResponse(request) {
  const appCache = await caches.open(APP_CACHE);

  try {
    const response = await fetch(request);

    if (response.ok) {
      await appCache.put(scopedUrl('./'), response.clone());
      await appCache.put(scopedUrl('./index.html'), response.clone());
    }

    return response;
  } catch {
    return (
      await appCache.match(scopedUrl('./'))
      || await appCache.match(scopedUrl('./index.html'))
      || Response.error()
    );
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchAndCache = fetch(request)
    .then((response) => {
      if (response && (response.ok || response.type === 'opaque')) {
        void cache.put(request, response.clone());
      }

      return response;
    })
    .catch(() => undefined);

  return cached || await fetchAndCache || Response.error();
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheAppShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(deleteOldCaches().then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(navigationResponse(request));
    return;
  }

  if (url.origin === self.location.origin && url.href.startsWith(self.registration.scope)) {
    if (SAME_ORIGIN_ASSET_TYPES.has(request.destination) || url.pathname.includes('/assets/')) {
      event.respondWith(staleWhileRevalidate(request, ASSET_CACHE));
    }

    return;
  }

  if (CROSS_ORIGIN_CACHE_TYPES.has(request.destination)) {
    event.respondWith(staleWhileRevalidate(request, ASSET_CACHE));
  }
});
