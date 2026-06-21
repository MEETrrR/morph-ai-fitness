// Service Worker - Morph.AI PWA
const CACHE = 'morph-ai-v1';
const ASSETS = ['/','/index.html','/style.css','/app.js','/ai.js','/manifest.json','/icon-192.png','/icon-512.png','/icon-512-maskable.png'];

// Install: cache core assets for offline use
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(() => {})));
});

// Activate: clean old caches
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
});

// Fetch: network-first with cache fallback
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(resp => {
        const clone = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return resp;
      })
      .catch(() => caches.match(e.request))
  );
});

// Push notifications
self.addEventListener('push', e => {
  let data = { title: '🔥 教练喊你打卡了', body: '今天的数据还没填，打开 Morph.AI 完成今日打卡' };
  if (e.data) { try { const d = e.data.json(); if (d.title) data = d; } catch (_) {} }
  e.waitUntil(self.registration.showNotification(data.title, {
    body: data.body, icon: '/icon-192.png', badge: '/icon-192.png',
    vibrate: [200, 100, 200], tag: 'daily-reminder'
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow('/'));
});
