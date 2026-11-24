// Human Doing service worker: network-first for the app shell (so updates
// land right away), cached copy when offline. Database calls always go to the
// network — the app keeps its own offline copy in localStorage.
//
// Caches are named "doing-…" so they never touch Human Being's ("tend-…")
// if both apps are served from the same site.

const CACHE = 'doing-v27';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/app.css', './css/doing.css',
  './js/main.js', './js/config.js', './js/util.js', './js/ui.js', './js/store.js', './js/docs.js',
  './js/stickers.js', './js/sticker-ui.js', './js/track.js', './js/cycle.js', './js/own.js', './js/picker.js', './js/month.js', './js/work.js', './js/workyear.js', './js/cyclepage.js', './js/todo.js', './js/plan.js', './js/actions.js', './js/widgets.js', './js/widget-preview.js', './js/iphone.js', './scriptable/human-doing.js', './js/walk.js', './js/moodsleep.js', './js/buttons.js', './js/cyclelog.js',
  './js/us.js', './js/onboarding.js', './js/native.js', './js/avatars.js', './js/moods.js', './js/custom.js', './js/gifts.js', './js/bionic.js', './js/icons.js', './js/richtext.js', './js/feedback.js', './js/about.js', './js/nudges.js', './js/remind.js', './js/spacemove.js', './js/dates.js',
  './icons/icon.svg', './icons/hb-icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(SHELL.map(async url => {
      try {
        const r = await fetch(url, { cache: 'no-cache' });
        if (r.ok) await cache.put(url, r);
      } catch (e) { /* skip — cached on next visit */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('doing-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.pathname.includes('/rest/v1/')) return;
  const sameOrigin = url.origin === self.location.origin;
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!sameOrigin && !isFont) return;

  event.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      if (fresh && (fresh.ok || fresh.type === 'opaque')) {
        const copy = fresh.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      }
      return fresh;
    } catch (err) {
      const cached = await caches.match(req, { ignoreSearch: req.mode === 'navigate' });
      if (cached) return cached;
      if (req.mode === 'navigate') {
        const shell = await caches.match('./index.html');
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
