// Retired service worker. The site no longer registers one (scanning needs the network
// anyway), but browsers of people who visited an older version may still have one
// installed. When those browsers check for an update they get this file, which deletes
// the old caches and unregisters itself. Keep this file deployed; don't add anything to it.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(key => caches.delete(key)));
    await self.registration.unregister();
  })());
});
