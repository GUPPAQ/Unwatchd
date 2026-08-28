// Bump this any time you change index.html — old caches get wiped automatically.
const CACHE_NAME = "private-screening-v9";
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
  "/icons/discoveryplus.png"
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
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
