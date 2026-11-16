// COMRADE service worker (THU-2451): Web Push delivery for MMO notifications.
// The payload is the JSON built by apps/service/src/mmo/push.ts.
self.addEventListener('push', event => {
  let data = { title: 'COMRADE', body: 'New notification', tag: 'comrade', url: '/world' };
  try {
    const parsed = event.data ? event.data.json() : null;
    if (parsed && typeof parsed === 'object') {
      data = {
        title: 'COMRADE',
        body: parsed.summary || 'New notification',
        tag: parsed.tag || 'comrade',
        url: '/world',
        notificationId: parsed.notificationId,
      };
    }
  } catch {
    // Non-JSON payload — show the generic notification rather than dropping it.
  }
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    tag: data.tag,
    renotify: false,
    icon: '/favicon.ico',
    data: { url: data.url, notificationId: data.notificationId },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/world';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes('/world') && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
