/* service worker de la versión de prueba: precachea todo el juego y
   responde cache-first, para instalar y jugar sin conexión */
const CACHE = 'banquero-prueba-v1';
const FILES = [
  './', './index.html', './manifest.json',
  './js/data.js', './js/engine.js', './js/aurora.js', './js/ui.js',
  './js/online.js', './js/flow.js', './js/main.js', './js/trial.js',
  './css/base.css', './css/board.css', './css/modals.css',
  './fonts/poppins.css', './fonts/marcellus.css',
  './fonts/marcellus-1.woff2', './fonts/marcellus-2.woff2',
  './fonts/poppins-latin-400.woff2', './fonts/poppins-latin-500.woff2',
  './fonts/poppins-latin-600.woff2', './fonts/poppins-latin-700.woff2',
  './fonts/poppins-latin-800.woff2', './fonts/poppins-latin-900.woff2',
  './img/favicon.svg', './img/bcp.png', './img/ueno.png',
  './sfx/carcel.mp3', './sfx/dados.mp3',
  './icons/icon-192.png', './icons/icon-512.png'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks =>
    Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if(e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, {ignoreSearch: true}).then(r => r || fetch(e.request)));
});
