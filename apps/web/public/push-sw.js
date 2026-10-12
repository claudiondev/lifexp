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
  const notificationData = { url: safeAppPath(data.url) };
  // Só o check-in (RF41) leva o token de ação; os outros avisos só abrem o app ao toque.
  if (typeof data.actionToken === 'string' && data.actionToken) {
    notificationData.token = data.actionToken;
  }
  const options = {
    body: typeof data.body === 'string' ? data.body : '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: notificationData,
  };
  // A mesma etiqueta substitui o aviso anterior em vez de empilhar.
  if (typeof data.tag === 'string' && data.tag) options.tag = data.tag;
  // Os botões "Cumpri"/"Pulei" só existem quando a API os mandou (check-in com token).
  if (Array.isArray(data.actions)) options.actions = data.actions;
  event.waitUntil(self.registration.showNotification(title, options));
});

/** Avisa as abas abertas para atualizarem Hoje, XP, quest e o resto depois de uma ação pelo push. */
function notifyClients() {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    for (const client of windows) {
      if ('postMessage' in client) client.postMessage({ type: 'lifexp-checkin' });
    }
  });
}

const FALLBACK_ACTION_TEXT = {
  title: 'Não consegui marcar',
  body: 'Abra o app para concluir ou pular.',
};

/** "Cumpri" ou "Pulei" no botão da notificação (RF41): marca pela API, sem abrir o app. */
async function runAction(notification, action) {
  const token = notification.data && notification.data.token;
  let result = FALLBACK_ACTION_TEXT;
  if (token) {
    try {
      const response = await fetch('/api/push-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action }),
      });
      if (response.ok) result = await response.json();
    } catch {
      // mantém o aviso de erro padrão (sem rede, API fora do ar etc.)
    }
  }
  // Troca o aviso original pela confirmação (ou erro), na mesma etiqueta, sem empilhar.
  await self.registration.showNotification(result.title, {
    body: result.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: notification.tag,
    data: { url: '/hoje' },
  });
  await notifyClients();
}

self.addEventListener('notificationclick', (event) => {
  const { action, notification } = event;
  notification.close();

  if (action === 'complete' || action === 'skip') {
    event.waitUntil(runAction(notification, action));
    return;
  }

  const url = safeAppPath(notification.data && notification.data.url);
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
