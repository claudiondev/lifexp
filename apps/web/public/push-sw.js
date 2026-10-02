// Tratamento de push do service worker (RF41). O Workbox gera o sw.js e carrega este arquivo com importScripts.
// Roda no contexto do service worker: sem DOM, sem módulos. Tudo aqui é pequeno de propósito.

/** Só abre caminhos do próprio app: "/hoje", nunca "//outro.site" nem "https://...". */
function safeAppPath(value) {
  if (typeof value !== 'string') return '/hoje';
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/hoje';
  return value;
}

/** O corpo do push como objeto; vazio ou inválido vira {} (o aviso sai mesmo assim, com o título padrão). */
function readPayload(event) {
  try {
    return event.data ? event.data.json() : {};
  } catch {
    return {};
  }
}

self.addEventListener('push', (event) => {
  const data = readPayload(event);
  const title = typeof data.title === 'string' && data.title.trim() ? data.title : 'LifeXP';
  const options = {
    body: typeof data.body === 'string' ? data.body : '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: safeAppPath(data.url) },
  };
  // A mesma etiqueta substitui o aviso anterior em vez de empilhar.
  if (typeof data.tag === 'string' && data.tag) options.tag = data.tag;
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = safeAppPath(event.notification.data && event.notification.data.url);
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      // Já tem o app aberto? Leva essa janela ao destino em vez de abrir outra.
      for (const client of windows) {
        if ('focus' in client && 'navigate' in client) {
          return client.focus().then(() => client.navigate(url));
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
