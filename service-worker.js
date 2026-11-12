// Bump this any time you change index.html — old caches get wiped automatically.
const CACHE_NAME = "private-screening-v43";
const FILES_TO_CACHE = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icons/netflix.png",
  "/icons/hbomax.png",
  "/icons/disneyplus.png",
  "/icons/primevideo.png",
  "/icons/appletv.png",
  "/icons/viaplay.png",
  "/icons/svtplay.png",
  "/icons/tv4play.png",
  "/icons/skyshowtime.png",
  "/icons/discoveryplus.png",
  "/icons/tmdb.png",
  "/icons/letterboxd.png",
  "/icons/imdb.png",
  "/icons/youtube.png",
  "/icons/instagram.png",
  "/icons/x.png",
  "/icons/tiktok.png",
  "/icons/facebook.png"
];

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(FILES_TO_CACHE))
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  const url = new URL(req.url);
  // Only handle our own static files. Everything else (TMDB API calls, poster
  // images, /api/ proxy calls, POST requests) goes straight to the network and
  // is never stored, so the cache can't grow without limit on users' devices.
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    return;
  }
  // Network first, fall back to the cached copy when offline.
  event.respondWith(
    fetch(req)
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        }
        return response;
      })
      .catch(() => caches.match(req))
  );
});
