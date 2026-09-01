const VERSION="fwm-v3.8.0-operations-center";
const STATIC=`${VERSION}-static`,RUNTIME=`${VERSION}-runtime`;
const SHELL=["./","./index.html","./admin.html","./manifest.webmanifest","./css/app.css","./js/config.js","./js/offline-store.js","./js/data-service.js","./js/push-v376.js","./js/access-v35.js","./js/support-v35.js","./js/messages-v36.js","./js/map-message-alerts-v372.js","./js/public-app.js","./js/public-submission.js","./js/live-crews.js","./js/public-ui.js","./js/pwa.js","./js/admin-app.js","./js/admin-submissions.js","./js/admin-live-crews.js","./set-password.html","./js/admin-audit.js","./js/admin-users.js","./js/admin-directory.js","./js/admin-support-v35.js","./js/admin-messages-v36.js","./js/admin-ui.js"];
self.addEventListener("install",e=>e.waitUntil(caches.open(STATIC).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>!k.startsWith(VERSION)).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET")return;
  const u=new URL(e.request.url);
  if(u.hostname.includes("tile.openstreetmap.org")){
    e.respondWith(caches.open(RUNTIME).then(async c=>{
      const hit=await c.match(e.request);if(hit)return hit;
      try{const r=await fetch(e.request);if(r.ok)c.put(e.request,r.clone());return r;}catch{return new Response("",{status:503});}
    }));
    return;
  }
  e.respondWith(fetch(e.request,{cache:"no-store"}).then(r=>{
    const clone=r.clone();caches.open(RUNTIME).then(c=>c.put(e.request,clone));return r;
  }).catch(()=>caches.match(e.request).then(r=>r||caches.match("./index.html"))));
});

// v3.7.6 Web Push
self.addEventListener("push", event => {
  let data={};
  try{data=event.data?.json()||{};}catch{data={body:event.data?.text()||"Νέο μήνυμα"};}
  const urgent=!!data.urgent;
  event.waitUntil(self.registration.showNotification(data.title||"Fire Water Map",{
    body:data.body||"Νέο επιχειρησιακό μήνυμα",
    icon:"./icons/app-icon-192.png",
    badge:"./icons/app-icon-96.png",
    tag:data.tag||"fwm-message",
    renotify:true,
    requireInteraction:urgent,
    vibrate:urgent?[600,220,600,220,1100]:[250],
    data:{url:data.url||"./index.html",conversationId:data.conversationId||null,urgent}
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url=new URL(event.notification.data?.url||"./index.html",self.registration.scope).href;
  event.waitUntil((async()=>{
    const all=await clients.matchAll({type:"window",includeUncontrolled:true});
    for(const c of all){
      if("focus" in c){
        try{await c.navigate(url);}catch{}
        return c.focus();
      }
    }
    return clients.openWindow(url);
  })());
});
