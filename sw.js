const C='planner-v22',F=['./','index.html','manifest.json','icon.svg','budget.js','budget.css','summary.js','assistant.js','assistant.css'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(C).then(c=>c.addAll(F)))});
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C).map(k=>caches.delete(k)))).then(()=>clients.claim())));
// רק קבצי היומן עצמו (GET מאותו אתר). בקשות לשרת העוזר (/api) לא עוברות דרך ה-Service Worker ולא נשמרות במטמון
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==self.location.origin||u.pathname.includes('/api/'))return;e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)))});
self.addEventListener('notificationclick',e=>{e.notification.close();const url=(e.notification.data&&e.notification.data.url)||'./',sum=url.includes('summary='),which=(url.match(/summary=(\w+)/)||[])[1]||'week';
 e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{const c=cs[0];if(c){if(sum)c.postMessage({type:'summary',which});return c.focus()}return clients.openWindow(url)}))});
