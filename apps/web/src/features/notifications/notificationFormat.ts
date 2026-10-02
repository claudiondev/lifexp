import type { AppNotification } from '@lifexp/shared';

/** Para onde um aviso leva: o bloco na semana certa, o calendário, a revisão (relatório) ou o dia de hoje. */
export function notificationTarget(notification: AppNotification): string {
  if (notification.kind === 'block' && notification.occurrenceDate) {
    return `/semana?inicio=${notification.occurrenceDate}`;
  }
  if (notification.kind === 'event') return '/calendario';
  if (notification.kind === 'report') return '/revisao';
  return '/hoje';
}

/** "agora", "há 5 min", "há 3 h", "há 2 dias": o suficiente para uma lista de avisos. */
export function relativeTime(iso: string, now: Date): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'agora';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'há 1 dia' : `há ${days} dias`;
}

/** O número do selo do sino: some em zero e para em 99+. */
export function badgeText(count: number): string | null {
  if (count <= 0) return null;
  return count > 99 ? '99+' : String(count);
}

/** "15 minutos antes", "1 hora antes" (opções de lembrete de bloco). */
export function leadLabel(minutes: number): string {
  return minutes === 60 ? '1 hora antes' : `${minutes} minutos antes`;
}
