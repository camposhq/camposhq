self.addEventListener('install', function(e){ self.skipWaiting(); });
self.addEventListener('activate', function(e){ e.waitUntil(clients.claim()); });

self.addEventListener('message', function(e){
  if(e.data && e.data.type === 'SHOW_NOTIFICATION'){
    self.registration.showNotification(e.data.title, {
      body: e.data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: e.data.tag||'mh-notif',
      renotify: true,
      vibrate: [200,100,200]
    });
  }
});
