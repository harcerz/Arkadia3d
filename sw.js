// Service worker: szybki start offline. Powłoka aplikacji cache-first,
// dane krain dociągane i cache'owane w locie. WebSocket nie przechodzi
// przez SW, więc rozgrywka nie jest dotknięta.
const VERSION = 'arkadia3d-v2';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/base.css',
  './css/layout.css',
  './css/components.css',
  './js/main.js',
  './js/config.js',
  './js/core/eventBus.js',
  './js/core/settings.js',
  './js/net/transport.js',
  './js/net/telnet.js',
  './js/net/lineAssembler.js',
  './js/net/connection.js',
  './js/net/mockTransport.js',
  './js/gmcp/codec.js',
  './js/gmcp/state.js',
  './js/ui/ansi.js',
  './js/ui/console.js',
  './js/ui/input.js',
  './js/ui/statusBars.js',
  './js/ui/quickButtons.js',
  './js/ui/connectScreen.js',
  './js/ui/viewToggle.js',
  './js/ui/commandParser.js',
  './js/ui/charCreator.js',
  './js/ui/autoLogin.js',
  './js/world/moveMapper.js',
  './js/world/mapIndex.js',
  './js/world/areaModel.js',
  './js/world/scene.js',
  './js/world/dioramaView.js',
  './js/world/roomView.js',
  './js/world/daylight.js',
  './js/world/worldController.js',
  './js/vendor/three.module.min.js',
  './js/vendor/three.core.min.js',
  './js/vendor/OrbitControls.js',
  './data/index.json',
  './data/colors.json',
  './data/npcs.json',
  './icons/favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || !request.url.startsWith(self.location.origin)) return;
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
