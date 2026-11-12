/* Offline support. precache.js (written by extract/build_app.py) sets self.VERSION and self.PRECACHE.
   The app shell is stored on install; each section file is stored the first time it is opened (or all at once
   with "Save all for offline"). A new build has a new VERSION, so the old copies are dropped and the new
   text is fetched: a corrected line never stays stale on the phone. PDFs are never stored. */
importScripts("precache.js");
var CACHE = "dg-" + self.VERSION;

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(self.PRECACHE.map(function (u) { return new Request(u, { cache: "reload" }); })); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf("dg-") === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || /\.pdf$/i.test(url.pathname)) return;
  var key = url.pathname.endsWith("/") ? url.pathname + "index.html" : url.pathname;
  e.respondWith(caches.open(CACHE).then(function (c) {
    return c.match(key).then(function (hit) {
      if (hit) return hit;
      return fetch(req.url, { cache: "no-cache" }).then(function (res) {  // never a stale HTTP-cache copy
        if (res.ok && res.type === "basic") c.put(key, res.clone());
        return res;
      });
    });
  }));
});
