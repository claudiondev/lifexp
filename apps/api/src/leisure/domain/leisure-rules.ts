import { todayIn, weekStartOf, type CivilDate } from '@lifexp/shared';
import { weekRangeUtc } from '../../reviews/domain/week-summary.js';

const MS_PER_MIN = 60_000;

/** O que as regras precisam de uma sessão do cronômetro. */
export interface SessionTimes {
  startedAt: Date;
  /** Saldo no instante em que começou: a sessão acaba sozinha ao chegar nele. */
  limitMin: number;
  /** Quando a pessoa parou; nulo = ainda não parou. */
  stoppedAt: Date | null;
}

/** Minutos de lazer que um bloco cumprido rende: a proporção da atividade sobre a duração, sempre para baixo. */
export function earnedLeisure(durationMin: number, leisurePercent: number | null): number {
  if (leisurePercent === null) return 0;
  return Math.floor((durationMin * leisurePercent) / 100);
}

/** O instante em que a sessão acaba (ou acabou): o que vier primeiro entre parar e atingir o limite. */
export function sessionEnd(session: SessionTimes): Date {
  const limitAt = session.startedAt.getTime() + session.limitMin * MS_PER_MIN;
  return new Date(session.stoppedAt ? Math.min(session.stoppedAt.getTime(), limitAt) : limitAt);
}

/** Minutos usados até `now` (ou no total, se já acabou), em minutos inteiros e nunca acima do limite. */
export function usedMinutes(session: SessionTimes, now: Date): number {
  const until = Math.min(sessionEnd(session).getTime(), now.getTime());
  const elapsed = until - session.startedAt.getTime();
  return Math.max(0, Math.floor(elapsed / MS_PER_MIN));
}

/** Ainda correndo: não parou e o limite não chegou. */
export function isRunning(session: SessionTimes, now: Date): boolean {
  return session.stoppedAt === null && now.getTime() < sessionEnd(session).getTime();
}

export interface WeekBalance {
  earnedMin: number;
  usedMin: number;
  /** Ganho menos usado, podendo ser negativo (um estorno depois do uso). Não mostrar à pessoa. */
  rawBalanceMin: number;
  /** O que a pessoa vê e pode gastar: nunca negativo, não vira dívida. */
  balanceMin: number;
}

export function weekBalance(input: {
  earnedMin: number;
  sessions: readonly SessionTimes[];
  now: Date;
}): WeekBalance {
  const usedMin = input.sessions.reduce((sum, s) => sum + usedMinutes(s, input.now), 0);
  const rawBalanceMin = input.earnedMin - usedMin;
  return {
    earnedMin: input.earnedMin,
    usedMin,
    rawBalanceMin,
    balanceMin: Math.max(0, rawBalanceMin),
  };
}

/** Só se inicia uma sessão com saldo e sem outra correndo. */
export function canStart(balanceMin: number, hasRunningSession: boolean): boolean {
  return balanceMin > 0 && !hasRunningSession;
}

/** A semana do saldo: segunda-feira do fuso da pessoa e o intervalo [segunda 00:00, próxima segunda 00:00) em UTC. */
export function leisureWeek(
  now: Date,
  timezone: string,
): { weekStart: CivilDate; from: Date; to: Date } {
  const weekStart = weekStartOf(todayIn(timezone, now));
  return { weekStart, ...weekRangeUtc(weekStart, timezone) };
}
