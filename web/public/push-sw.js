self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload = { title: "ArbetsYtan", body: "", url: "/" };
  try {
    payload = JSON.parse(event.data.text());
  } catch (error) {
    console.error("[push-sw] Invalid payload", error);
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      data: { url: payload.url || "/" },
      badge: "/next.svg",
      icon: "/next.svg",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(url) && "focus" in client) {
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(url);
      }
      return undefined;
    })
  );
});
