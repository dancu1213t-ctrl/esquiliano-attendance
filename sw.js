const CACHE='esquiliano-shell-v21';
const SHELL=[...new Set(['./','./index.html','./app.css?v=18','./app.js?v=21','./workspace.js?v=17','./workspace.css?v=14','./attendance-state.js?v=15','./config.js','./staff.js?v=21','./staff-week.js?v=20','./staff.css?v=20','./assets/favicon.png?v=10','./manifest.webmanifest','./vendor/supabase.js','./vendor/jsqr.js','./vendor/qrcode.js','./assets/icon-192.png?v=10','./assets/icon-512.png?v=10'])];
self.addEventListener('install',e=>{
 const precache=caches.open(CACHE).then(c=>Promise.allSettled(SHELL.map(path=>c.add(path)))).catch(()=>{});
 let timer;e.waitUntil(Promise.race([precache,new Promise(resolve=>timer=setTimeout(resolve,8000))]).finally(()=>clearTimeout(timer)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('esquiliano-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).catch(()=>{}).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;e.respondWith(fetch(e.request).then(r=>{if(r.ok&&SHELL.some(p=>new URL(p,self.location).href===e.request.url)){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{})}return r}).catch(()=>caches.match(e.request).then(r=>r||new Response('Offline',{status:503}))));});
self.addEventListener('push',e=>{let data={title:'Esquiliano',body:'You have a new notification.'};try{data={...data,...e.data.json()}}catch{}e.waitUntil(self.registration.showNotification(data.title,{body:data.body,icon:'assets/icon-192.png?v=10',badge:'assets/icon-192.png?v=10',tag:data.id||'esquiliano',data:{url:'./?view=inbox'}}))});
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(async list=>{for(const c of list){if(new URL(c.url).origin===self.location.origin){await c.focus();c.postMessage({type:'open-inbox'});return}}return clients.openWindow('./?view=inbox')}))});

