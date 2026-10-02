import { DisabledPushSender } from './log-push.sender.js';
import type { PushSender } from './push-sender.js';
import { WebPushSender } from './web-push.sender.js';

/** Com as duas chaves VAPID: push de verdade. Sem alguma delas: desligado (a tela mostra "indisponível"). */
export function createPushSender(vapid: {
  publicKey?: string | undefined;
  privateKey?: string | undefined;
  subject: string;
}): PushSender {
  if (!vapid.publicKey || !vapid.privateKey) return new DisabledPushSender();
  return new WebPushSender({
    publicKey: vapid.publicKey,
    privateKey: vapid.privateKey,
    subject: vapid.subject,
  });
}
