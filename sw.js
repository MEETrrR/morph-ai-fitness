// Service Worker - Morph.AI PWA
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))));
});
self.addEventListener('fetch', e => {
  e.respondWith(fetch(e.request));
});

// Push notifications
self.addEventListener('push', e => {
  let data = { title: '🔥 教练喊你打卡了', body: '今天的数据还没填，打开 Morph.AI 完成今日打卡' };
  if (e.data) {
    try { data = e.data.json(); } catch (_) {}
  }
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      vibrate: [200, 100, 200],
      tag: 'daily-reminder',
      requireInteraction: true
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow('/'));
});
