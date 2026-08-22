self.addEventListener("install", function (evt) {
  self.skipWaiting();
});
self.addEventListener("activate", function (evt) {
  evt.waitUntil(self.clients.claim());
});
self.addEventListener("fetch", function (evt) {
  evt.respondWith(fetch(evt.request));
});
