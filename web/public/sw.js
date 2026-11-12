// Minimal service worker: makes the app installable and keeps the shell available offline.
//
// What it may keep: the HTML shell (the same file for everybody, no account data in it) and the
// hashed bundles under /assets. What it must never keep: anything dynamic (/api, MCP and OAuth
// endpoints) and any response that says not to be stored. API answers carry the account's data,
// so a copy of them here would survive signing out on a shared device.
const CACHE = 'mealmcp-shell-v2';
const NETWORK_ONLY = ['/api', '/mcp', '/authorize', '/token', '/register', '/revoke', '/.well-known', '/health', '/sw.js'];

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// The page asks for this when someone signs out: nothing stays behind.
self.addEventListener('message', (event) => {
  if (event.data === 'clear-caches') event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))));
});

/** Only successful, cacheable responses are worth keeping. */
const storable = (res) => {
  if (!res.ok || res.type === 'opaque' || res.redirected) return false;
  const control = (res.headers.get('cache-control') || '').toLowerCase();
  return !/no-store|private/.test(control) && !res.headers.has('set-cookie');
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (NETWORK_ONLY.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`))) return;

  // Pages: network first so a new version shows up at once, cached shell when offline.
  // Every page is the same single-page shell, so one copy under "/" serves them all (/consent included).
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (storable(res) && (res.headers.get('content-type') || '').includes('text/html')) {
            const copy = res.clone();
            void caches.open(CACHE).then((c) => c.put('/', copy));
          }
          return res;
        })
        .catch(() => caches.match('/').then((r) => r ?? Response.error())),
    );
    return;
  }

  // Hashed bundles and fonts never change under the same name: cache first.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((res) => {
            if (storable(res)) {
              const copy = res.clone();
              void caches.open(CACHE).then((c) => c.put(request, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }
  // Anything else (icons, manifest): straight to the network, so updates are never hidden by an old copy.
});
