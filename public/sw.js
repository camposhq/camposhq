var CACHE = 'mh-v20';
var ASSETS = ['/', '/index.html'];

self.addEventListener('install', function(e){
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function(c){ return c.addAll(ASSETS); })
  );
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k!==CACHE; }).map(function(k){ return caches.delete(k); }));
    }).then(function(){ return clients.claim(); })
  );
});

self.addEventListener('fetch', function(e){
  var url = e.request.url;
  // navegação: network-first — versão nova aparece já na primeira abertura; cache só offline
  if(e.request.mode==='navigate'){
    e.respondWith(
      fetch(e.request).then(function(response){
        if(response && response.status===200 && response.type!=='opaque'){
          var clone = response.clone();
          caches.open(CACHE).then(function(c){ c.put(e.request, clone); });
        }
        return response;
      }).catch(function(){ return caches.match(e.request); })
    );
    return;
  }
  // demais assets same-origin: cache-first com atualização em segundo plano
  if(url.indexOf(self.location.origin)===0 && url.indexOf('/api/')===-1){
    e.respondWith(
      caches.match(e.request).then(function(cached){
        var fetchPromise = fetch(e.request).then(function(response){
          if(response && response.status===200 && response.type!=='opaque'){
            var clone = response.clone();
            caches.open(CACHE).then(function(c){ c.put(e.request, clone); });
          }
          return response;
        }).catch(function(){ return cached; });
        return cached || fetchPromise;
      })
    );
  }
});

// Push notifications
self.addEventListener('message', function(e){
  if(e.data && e.data.type==='SHOW_NOTIFICATION'){
    self.registration.showNotification(e.data.title,{
      body:e.data.body, icon:'/icon-192.png', badge:'/icon-192.png',
      tag:e.data.tag||'mh-notif', renotify:true, vibrate:[200,100,200]
    });
  }
});
