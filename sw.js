/* ==========================================================
   Service worker — cache-first, 100 % sin conexión.
   IMPORTANTE: sube la versión de CACHE cada vez que cambies
   cualquier archivo de la app (ver CLAUDE.md).
   ========================================================== */
'use strict';

const CACHE = 'mis-gastos-v1';
const PREFIJO = 'mis-gastos-';

const ARCHIVOS = [
  './',
  './index.html',
  './css/styles.css',
  './js/db.js',
  './js/app.js',
  './manifest.json',
  './icons/icon-180.png',
  './icons/icon-512.png',
  './icons/splash-1290x2796.png',
];

// Safari no acepta respuestas "redirected" para navegaciones: se copian limpias.
async function limpiar(resp) {
  if (!resp.redirected) return resp;
  const cuerpo = await resp.blob();
  return new Response(cuerpo, { status: resp.status, statusText: resp.statusText, headers: resp.headers });
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(ARCHIVOS.map(async url => {
      // cache: 'reload' evita que la caché HTTP (GitHub Pages) entregue archivos viejos
      const resp = await fetch(new Request(url, { cache: 'reload' }));
      if (!resp.ok) throw new Error(`No se pudo guardar ${url} (${resp.status})`);
      await cache.put(url, await limpiar(resp));
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Solo borra cachés de esta app: en usuario.github.io el origen es compartido con otros proyectos.
    const claves = await caches.keys();
    await Promise.all(claves.filter(k => k.startsWith(PREFIJO) && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (!url.href.startsWith(self.registration.scope)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const guardado = await cache.match(req, { ignoreSearch: true });
    if (guardado) return guardado;

    if (req.mode === 'navigate') {
      const inicio = await cache.match('./index.html');
      if (inicio) return inicio;
    }

    try {
      const resp = await fetch(req);
      if (resp.ok && resp.type === 'basic') cache.put(req, resp.clone());
      return resp;
    } catch (err) {
      return new Response('Sin conexión', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
