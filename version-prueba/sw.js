/* service worker de la versión de prueba: precachea todo el juego y
   responde cache-first, para instalar y jugar sin conexión.
   Estrategia anti-caché-viejo (el problema real de las ?v=):
   · El DOCUMENTO va network-first: una actualización publicada
     (index.html con nuevas ?v= en css/js) se ve en la primera recarga.
   · Los RECURSOS se casan ESTRICTO (con su ?v=): una URL nueva pasa a
     la red y queda en cache; una URL vieja no vuelve a servirse nunca.
   · Al instalar, la lista de precache se deriva del index.html VIGENTE:
     se leen sus css/js con ?v= para que el modo offline funcione desde
     el primer momento con los archivos correctos. */
const CACHE = 'banquero-prueba-v5';
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
  './apple-touch-icon.png',
  './icons/icon-192.png', './icons/icon-512.png'
];
/* arma la lista completa: base + los css/js versionados del HTML real */
async function precacheList(){
  const list = [...FILES];
  try{
    const doc = await fetch('./index.html', {cache:'no-store'});
    const html = await doc.text();
    const re = /(?:src|href)="([^"]+?\.(?:js|css)\?v=[^"]+)"/g;
    let m;
    while((m = re.exec(html))) list.push(new URL(m[1], self.registration.scope).href);
  }catch(err){ /* sin red al instalar: queda la lista base */ }
  return list;
}
self.addEventListener('install', e => {
  e.waitUntil(precacheList().then(list =>
    caches.open(CACHE).then(c => c.addAll(list))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks =>
    Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if(e.request.method !== 'GET') return;
  /* el HTML (navegación) llega fresco de la red cuando hay conexión;
     sin conexión cae al cache: la app instalada sigue funcionando */
  if(e.request.mode === 'navigate' || e.request.destination === 'document'){
    e.respondWith(
      fetch(e.request).then(r => {
        const cp = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, cp));
        return r;
      }).catch(() => caches.match(e.request, {ignoreSearch:true}).then(r => r ||
        caches.match('./index.html', {ignoreSearch:true})))
    );
    return;
  }
  /* recursos: cache ESTRICTO por URL completa (incluye ?v=) — una
     versión nueva de css/js nunca queda atrapada en el cache viejo */
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => {
    if(res.ok && (e.request.destination === 'script' || e.request.destination === 'style')){
      const cp = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, cp));
    }
    return res;
  })));
});
