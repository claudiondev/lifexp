import { todayIn, type SessionInfo } from '@lifexp/shared';
import { longDate } from '@/lib/civilFormat';

/** "1 sessão encerrada" / "3 sessões encerradas". */
export function revokedMessage(count: number): string {
  return count === 1 ? '1 sessão encerrada' : `${count} sessões encerradas`;
}

/** "1 de outubro de 2026": o dia em que a sessão foi aberta, no fuso da pessoa. */
export function startedOn(session: SessionInfo, timezone: string): string {
  return longDate(todayIn(timezone, new Date(session.createdAt)));
}

/** Quantas sessões além da atual (as que o botão "encerrar todas as outras" derruba). */
export function otherSessions(sessions: readonly SessionInfo[]): SessionInfo[] {
  return sessions.filter((session) => !session.current);
}
