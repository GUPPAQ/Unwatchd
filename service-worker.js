// Bump this any time you change index.html — old caches get wiped automatically.
const CACHE_NAME = "private-screening-v4";
const FILES_TO_CACHE = [
  "/Watchlist/",
  "/Watchlist/index.html",
  "/Watchlist/manifest.json",
  "/Watchlist/icons/netflix.png",
  "/Watchlist/icons/hbomax.png",
  "/Watchlist/icons/disneyplus.png",
  "/Watchlist/icons/primevideo.png",
  "/Watchlist/icons/appletv.png",
  "/Watchlist/icons/viaplay.png",
  "/Watchlist/icons/svtplay.png",
  "/Watchlist/icons/tv4play.png",
  "/Watchlist/icons/skyshowtime.png",
  "/Watchlist/icons/discoveryplus.png"
];

self.addEventListener("install", event => {
  // Don't wait for old tabs/instances to close — take over right away.
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
          .filter(key => key !== CACHE_NAME) // delete every old cache version
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim()) // control open pages immediately
  );
});

self.addEventListener("fetch", event => {
  // Network-first: always try to get the latest file. Only fall back to
  // cache if the device is offline. This is what makes future edits show
  // up right away instead of getting stuck on a stale cached version.
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
