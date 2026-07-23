self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Network-only service worker. Required by some PWA install checks, without caching private app data.
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data?.text() || "Tienes una nueva notificación." };
  }

  const title = data.title || "NoteCode";
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || "Tienes una nueva notificación.",
    icon: data.icon || "/icons/icon-192.png",
    badge: data.badge || "/icons/favicon-64.png",
    tag: data.tag || "notecode",
    renotify: Boolean(data.tag),
    data: { url: data.url || "/notificaciones" },
    vibrate: data.severity === "critical" ? [180, 80, 180, 80, 260] : [140, 70, 140],
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/notificaciones", self.location.origin).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("focus" in client) {
        if ("navigate" in client) await client.navigate(target);
        return client.focus();
      }
    }
    return self.clients.openWindow(target);
  })());
});
