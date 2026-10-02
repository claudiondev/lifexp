import type { PushSubscriptionInput } from '@lifexp/shared';

/**
 * Tudo o que o push usa do navegador fica aqui, em funções pequenas: o resto do app não toca em `navigator` nem em
 * `Notification`, o que deixa a lógica testável e isola as diferenças entre navegadores.
 */

/** O navegador sabe fazer push? (No iPhone/iPad só com o app instalado na Tela de Início, iOS 16.4+.) */
export function isPushSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export const notificationPermission = (): NotificationPermission => Notification.permission;

export const requestNotificationPermission = (): Promise<NotificationPermission> =>
  Notification.requestPermission();

/** A inscrição DESTE aparelho, se houver. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

/** A chave pública VAPID chega em base64url; o navegador quer bytes. */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  // `atob` aceita base64 sem o preenchimento "=" (decodificação tolerante da especificação).
  const raw = atob(base64Url.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** Cria (ou reaproveita) a inscrição deste aparelho. `userVisibleOnly` é exigência dos navegadores. */
export async function subscribeThisDevice(publicKey: string): Promise<PushSubscription> {
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
}

/** Cancela a inscrição deste aparelho e devolve o endereço dela (para a API apagar a cópia), ou nulo se não havia. */
export async function unsubscribeThisDevice(): Promise<string | null> {
  const subscription = await currentSubscription();
  if (!subscription) return null;
  const { endpoint } = subscription;
  await subscription.unsubscribe();
  return endpoint;
}

/** Só o que a API aceita (endpoint e chaves): o `toJSON()` do navegador traz também `expirationTime`. */
export function toSubscriptionInput(subscription: PushSubscription): PushSubscriptionInput {
  const { endpoint, keys } = subscription.toJSON();
  if (!endpoint || !keys?.['p256dh'] || !keys['auth']) {
    throw new Error('O navegador devolveu uma inscrição incompleta.');
  }
  return { endpoint, keys: { p256dh: keys['p256dh'], auth: keys['auth'] } };
}
