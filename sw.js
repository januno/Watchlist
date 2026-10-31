// Lets the app open offline. Change CACHE's version number whenever you edit the files.
var CACHE = 'watchlist-manager-v3';
var FILES = [
    './', './index.html', './style.css', './app.js',
    './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', function (e) {
    e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); })
        .then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
    e.waitUntil(caches.keys().then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== CACHE; })
            .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); }));
});

// Network first, cache as fallback, and only for this app's own files
self.addEventListener('fetch', function (e) {
    var req = e.request;
    if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
    e.respondWith(
        fetch(req).then(function (res) {
            var copy = res.clone();
            caches.open(CACHE).then(function (c) { c.put(req, copy); });
            return res;
        }).catch(function () { return caches.match(req); })
    );
});
