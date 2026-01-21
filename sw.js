/* =========================================================
   OpenKalba — sw.js (OFFLINE MODE v1)
   - Precaches app shell
   - Runtime cache for courses/audio/assets
   - Network-first for navigations (HTML)
   - Cache-first for audio/assets/courses
   - Never cache 3rd-party (Upscope etc.)
========================================================= */

"use strict";

const VERSION = "ok-sw-v1.0.0";
const SHELL_CACHE = `ok-shell-${VERSION}`;
const RUNTIME_CACHE = `ok-runtime-${VERSION}`;

// App shell files you want always available offline.
// Keep this list small and stable.
const PRECACHE_URLS = [
  "/",               // allows navigation fallback in some setups
  "/index.html",
  "/styles.css",
  "/app.js",

  // If these exist in your root:
  "/favicon.ico",

  // Common assets (only include if you actually have them)
  "/assets/openkalba-logo.png",
  "/assets/icons/star.png",
  "/assets/icons/empty_star.png",
  "/assets/icons/locked.png",
  "/assets/icons/trophy.png",
  "/assets/icons/mikas_on.png",
  "/assets/icons/mikas_off.png",
];

// Helper: same-origin only
function isSameOrigin(url) {
  try {
    return new URL(url).origin === self.location.origin;
  } catch {
    return false;
  }
}

// Helper: should we cache this request?
function shouldCacheRequest(req) {
  // Only cache GET
  if (!req || req.method !== "GET") return false;

  const url = req.url || "";
  if (!url) return false;

  // Never cache 3rd party (Upscope etc.)
  if (!isSameOrigin(url)) return false;

  // Never cache chrome-extension requests
  if (url.startsWith("chrome-extension://")) return false;

  return true;
}

// Cache strategies
async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;

  const res = await fetch(req);
  // Only cache good responses
  if (res && res.ok) cache.put(req, res.clone());
  return res;
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const cached = await cache.match(req);
    if (cached) return cached;
    throw new Error("NetworkFirst: no network and no cache");
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);

  const fetchPromise = fetch(req)
    .then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);

  // Return cache immediately if present; otherwise wait for network
  return cached || (await fetchPromise) || new Response("", { status: 504 });
}

// Install: precache shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Best-effort: if any file 404s, we still install.
      await Promise.all(
        PRECACHE_URLS.map(async (u) => {
          try {
            const req = new Request(u, { cache: "reload" });
            const res = await fetch(req);
            if (res && res.ok) await cache.put(req, res.clone());
          } catch {}
        })
      );
      self.skipWaiting();
    })()
  );
});

// Activate: cleanup old caches + claim clients
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((k) => {
          if (k !== SHELL_CACHE && k !== RUNTIME_CACHE) return caches.delete(k);
        })
      );
      self.clients.claim();
    })()
  );
});

// Fetch routing
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (!shouldCacheRequest(req)) return;

  const url = new URL(req.url);
  const pathname = url.pathname;

  // HTML navigation (page loads)
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          // Prefer network for fresh HTML
          return await networkFirst(req, SHELL_CACHE);
        } catch {
          // Offline fallback to cached index
          const cache = await caches.open(SHELL_CACHE);
          const cachedIndex = await cache.match("/index.html");
          return cachedIndex || new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
        }
      })()
    );
    return;
  }

  // App core files (js/css) — SWR feels best during dev
  if (pathname.endsWith(".js") || pathname.endsWith(".css")) {
    event.respondWith(staleWhileRevalidate(req, SHELL_CACHE));
    return;
  }

  // Audio (mp3/wav) — cache-first
  if (pathname.startsWith("/audio/") || pathname.endsWith(".mp3") || pathname.endsWith(".wav")) {
    event.respondWith(cacheFirst(req, RUNTIME_CACHE));
    return;
  }

  // Course content (lessons, overlays, manifests) — cache-first
  if (pathname.startsWith("/courses/")) {
    event.respondWith(cacheFirst(req, RUNTIME_CACHE));
    return;
  }

  // Assets (icons/flags/images) — cache-first
  if (pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(req, RUNTIME_CACHE));
    return;
  }

  // Default: try cache-first as a safe offline behavior
  event.respondWith(cacheFirst(req, RUNTIME_CACHE));
});
