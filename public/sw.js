// Lets phones install Tuye Bites like an app. Pages always come fresh from the internet;
// only when there is no connection is the last saved copy of the menu page shown.
const CACHE = "tuye-v8";
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(["/"])).catch(() => {})); self.skipWaiting(); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  // Food photos never change at the same address: keep them on the phone (saves data, works offline)
  if (url.pathname.startsWith("/api/img/")) {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return r;
    })));
    return;
  }
  // Orders, logins and prices are never stored on the phone
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/f/") || url.pathname.startsWith("/admin")) return;
  if (e.request.mode === "navigate") {
    if (url.pathname !== "/") return;
    e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put("/", copy)); return r; })
      .catch(() => caches.match("/")));
    return;
  }
  // Page files (styles, code, logo): fresh from the internet, the saved copy when offline
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request)));
});

// New-order alerts for admins and riders, even when the phone is locked
self.addEventListener("push", e => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch (err) { m = { title: "Tuye Bites", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(m.title || "Tuye Bites", {
    body: m.body || "", tag: m.tag || undefined, renotify: !!m.tag, icon: "/icon-192.png", badge: "/icon-192.png",
    vibrate: [200, 100, 200, 100, 300], requireInteraction: true, data: { url: m.url || "/admin.html#orders" }
  }));
});
// Tapping the alert opens the admin page (or brings it to the front)
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/admin.html#orders", location.origin).href;
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    const admin = url.includes("/admin.html");
    const open = list.find(c => c.url === url) || (admin && list.find(c => c.url.startsWith(location.origin + "/admin.html")));
    return open ? open.focus().then(c => c.url !== url && c.navigate ? c.navigate(url) : c) : clients.openWindow(url);
  }));
});
