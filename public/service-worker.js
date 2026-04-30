// Dhobiq Laundry - Service Worker
// Caches the app shell (static assets) for fast loading and basic offline support.
// Dynamic Firestore data is NOT cached to avoid stale data issues.

const CACHE_NAME = 'dhobiq-app-shell-v1';

// App shell assets to cache on install
const APP_SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/app_icon.png',
];

// ─── Install ────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching app shell');
      return cache.addAll(APP_SHELL_ASSETS);
    })
  );
  // Activate immediately — don't wait for existing tabs to close
  self.skipWaiting();
});

// ─── Activate ────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      )
    )
  );
  // Take control of all pages immediately
  self.clients.claim();
});

// ─── Fetch ───────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // ── Skip non-GET requests ──────────────────────────────────────────────────
  if (request.method !== 'GET') return;

  // ── Skip Firebase / Firestore / Google API calls (always fetch fresh) ──────
  if (
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('firebase.googleapis.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com') ||
    url.hostname.includes('securetoken.googleapis.com') ||
    url.pathname.startsWith('/__/')
  ) {
    return; // Let the browser handle these directly
  }

  // ── Navigation requests: Network-first, fallback to cached index.html ──────
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache a fresh copy of index.html on each successful navigation
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          return response;
        })
        .catch(() => {
          // Offline fallback: serve cached index.html so the app shell loads
          return caches.match('/index.html');
        })
    );
    return;
  }

  // ── Static assets (JS/CSS/images/fonts): Cache-first strategy ────────────
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      // Not in cache — fetch from network and cache the response
      return fetch(request).then((networkResponse) => {
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          networkResponse.type !== 'opaque'
        ) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
        }
        return networkResponse;
      });
    })
  );
});
