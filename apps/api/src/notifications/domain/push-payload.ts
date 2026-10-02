import type { CivilDate } from '@lifexp/shared';
import type { PushPayload } from '../../push/push-sender.js';
import type { NotificationKind } from './notification-plan.js';

/** Um pouco abaixo do limite do protocolo, e curto o bastante para caber numa notificação do celular. */
export const MAX_PUSH_TITLE = 80;
export const MAX_PUSH_BODY = 180;

const cut = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;

/**
 * Para onde o toque no aviso leva (RF41): o mesmo destino de abrir o aviso dentro do app. Sempre um caminho do
 * próprio app, nunca uma URL de fora.
 */
export function pushUrl(kind: NotificationKind, occurrenceDate: CivilDate | null): string {
  if (kind === 'BLOCK' && occurrenceDate) return `/semana?inicio=${occurrenceDate}`;
  if (kind === 'EVENT') return '/calendario';
  if (kind === 'REPORT') return '/revisao';
  return '/hoje';
}

export function toPushPayload(notification: {
  kind: NotificationKind;
  title: string;
  body: string;
  dedupeKey: string;
  occurrenceDate: CivilDate | null;
}): PushPayload {
  return {
    title: cut(notification.title, MAX_PUSH_TITLE),
    body: cut(notification.body, MAX_PUSH_BODY),
    url: pushUrl(notification.kind, notification.occurrenceDate),
    // A mesma etiqueta substitui o aviso anterior: se o push for reenviado, não empilha.
    tag: notification.dedupeKey,
  };
}
