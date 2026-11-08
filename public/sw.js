// The app's service worker (scope /house-ops/): keeps the app itself on the
// phone, so the installed app opens without a connection — e.g. the
// shopping list in a shop with bad signal. Data still comes from Firestore,
// which keeps working on what's already loaded and sends writes once back
// online; this only caches the app's own files, never API traffic.

const CACHE = 'houseops-shell-v1';
const MAX_ASSETS = 80;
const BASE = new URL(self.registration.scope).pathname; // "/house-ops/"

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll([BASE, `${BASE}manifest.webmanifest`])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('houseops-shell-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function trim(cache) {
  const keys = await cache.keys();
  const assets = keys.filter((r) => new URL(r.url).pathname.startsWith(`${BASE}assets/`));
  for (const r of assets.slice(0, Math.max(assets.length - MAX_ASSETS, 0))) await cache.delete(r);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;

  // The page itself: always the newest when online, the saved copy offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(BASE, res.clone()));
          return res;
        })
        .catch(() => caches.match(BASE)),
    );
    return;
  }

  // Built files have their content hash in the name, so a saved copy is
  // always right; everything else (icons, manifest) is refreshed behind.
  const immutable = url.pathname.startsWith(`${BASE}assets/`);
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req);
      const refresh = fetch(req)
        .then(async (res) => {
          if (res.ok) {
            await cache.put(req, res.clone());
            if (immutable) await trim(cache);
          }
          return res;
        })
        .catch(() => hit);
      if (hit && immutable) return hit;
      return hit ?? refresh;
    }),
  );
});
