// Lets the app open, and its in-browser tools run, when the local server is not running.
// Pages and scripts are copied into the browser's cache while the server is up. Nothing is
// sent anywhere: every request stays on this computer. Registered in production builds only
// (src/components/ServiceWorkerRegister.tsx); a development server changes its files on every
// edit and must never be served from a cache.

const CACHE = "local-file-toolkit-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

// The home page links to every tool, so its HTML is the list of pages worth keeping.
async function precache() {
  const cache = await caches.open(CACHE);
  try {
    const home = await fetch("/", { cache: "reload" });
    if (!home.ok) return;
    const html = await home.clone().text();
    await cache.put("/", home);
    const pages = new Set(html.match(/\/tools\/[a-z0-9-]+/g) || []);
    for (const page of pages) {
      try {
        const response = await fetch(page, { cache: "reload" });
        if (!response.ok) continue;
        const text = await response.clone().text();
        await cache.put(page, response);
        // The script and style files this page needs, so the tool works when first opened offline.
        const assets = new Set(text.match(/\/_next\/static\/[^"'\\\s)<>]+/g) || []);
        await Promise.all([...assets].map((asset) => cache.add(asset).catch(() => {})));
      } catch {
        // One page failing must not stop the rest from being kept.
      }
    }
  } catch {
    // Server not reachable during install: the cache fills from normal use instead.
  }
}

async function put(request, response) {
  if (response && response.status === 200 && response.type === "basic") {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request) {
  try {
    return await put(request, await fetch(request));
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === "navigate") {
      const home = await caches.match("/");
      if (home) return home;
    }
    throw error;
  }
}

// Files under /_next/static/ have a content hash in their name, so a cached copy never goes stale.
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  return put(request, await fetch(request));
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const refresh = fetch(request)
    .then((response) => put(request, response))
    .catch(() => cached);
  return cached || refresh;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // The converters (LibreOffice, Ghostscript) run on the server; their answers are never kept.
  if (url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
  } else if (request.mode === "navigate" || request.headers.get("RSC")) {
    event.respondWith(networkFirst(request));
  } else {
    event.respondWith(staleWhileRevalidate(request));
  }
});
