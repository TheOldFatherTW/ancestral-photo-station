self.addEventListener("install", function (evt) {
  self.skipWaiting();
});
self.addEventListener("activate", function (evt) {
  evt.waitUntil(self.clients.claim());
});
self.addEventListener("fetch", function (evt) {
  // Uploads must not pass through this worker: Safari hands it a body nobody can
  // reread, so the vault gets an empty POST. GET photos must not either — wrapping
  // them in respondWith(fetch) skipped the HTTP cache and added a hop on every tile.
  if (evt.request.method !== "GET") return;
  var path = new URL(evt.request.url).pathname;
  if (path.slice(-20) === "manifest.webmanifest") {
    evt.respondWith(new Response("", { status: 404 }));
  }
});
