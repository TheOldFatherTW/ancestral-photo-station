self.addEventListener("install", function (evt) {
  self.skipWaiting();
});
self.addEventListener("activate", function (evt) {
  evt.waitUntil(self.clients.claim());
});
self.addEventListener("fetch", function (evt) {
  // A picked photo lives only in the page's own process. Handing its request through
  // this worker gives the network a body no one here can read, so the upload leaves
  // empty and the vault turns it away. Reads are safe; anything carrying a body is not.
  if (evt.request.method !== "GET") return;
  evt.respondWith(fetch(evt.request));
});
