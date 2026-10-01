import { addDays, localDateTimeToUtc, type CivilDate, type OccurrenceStatus } from '@lifexp/shared';

export interface CompletionWindow {
  /** Início do bloco: a partir daqui a ocorrência pode ser concluída (RN10: bloco futuro não). */
  opensAt: Date;
  /** Último instante da janela: 23:59:59.999 do dia seguinte ao do bloco (RN08). */
  closesAt: Date;
}

const ONE_MS = 1;

/**
 * Janela em que uma ocorrência pode ser concluída (e desfeita, RN09): do início do bloco até
 * 23:59 do dia civil seguinte, no fuso da pessoa. O fim é calculado como "meia-noite do dia
 * depois do seguinte, menos 1 ms": assim dias de 23 ou 25 horas (horário de verão) saem certos.
 *
 * `occurrenceDate` e `startTime` são os valores EFETIVOS da ocorrência (já com um eventual override).
 */
export function completionWindow(
  occurrenceDate: CivilDate,
  startTime: string,
  timezone: string,
): CompletionWindow {
  return {
    opensAt: localDateTimeToUtc(occurrenceDate, startTime, timezone),
    closesAt: new Date(
      localDateTimeToUtc(addDays(occurrenceDate, 2), '00:00', timezone).getTime() - ONE_MS,
    ),
  };
}

export type WindowPhase = 'upcoming' | 'open' | 'closed';

export function windowPhase(now: Date, window: CompletionWindow): WindowPhase {
  if (now.getTime() < window.opensAt.getTime()) return 'upcoming';
  if (now.getTime() > window.closesAt.getTime()) return 'closed';
  return 'open';
}

export interface OccurrenceFacts {
  skipped: boolean;
  completed: boolean;
  now: Date;
  window: CompletionWindow;
}

/**
 * Estado de uma ocorrência na tela Hoje. Pular e concluir vencem a janela: uma ocorrência
 * concluída continua "concluída" mesmo depois que a janela fecha.
 */
export function occurrenceStatus({
  skipped,
  completed,
  now,
  window,
}: OccurrenceFacts): OccurrenceStatus {
  if (completed) return 'completed';
  if (skipped) return 'skipped';
  const phase = windowPhase(now, window);
  return phase === 'open' ? 'open' : phase;
}

export type CompleteBlockedReason = 'skipped' | 'not_started' | 'window_closed';
export type UndoBlockedReason = 'window_closed';

/** Pode concluir agora? Quando não, diz por quê (a API traduz o motivo em mensagem e status). */
export function checkCanComplete({
  skipped,
  now,
  window,
}: Pick<OccurrenceFacts, 'skipped' | 'now' | 'window'>):
  { ok: true } | { ok: false; reason: CompleteBlockedReason } {
  if (skipped) return { ok: false, reason: 'skipped' };
  const phase = windowPhase(now, window);
  if (phase === 'upcoming') return { ok: false, reason: 'not_started' };
  if (phase === 'closed') return { ok: false, reason: 'window_closed' };
  return { ok: true };
}

/** RN09: desfazer só é permitido dentro da mesma janela em que se pode concluir. */
export function checkCanUndo({
  now,
  window,
}: Pick<OccurrenceFacts, 'now' | 'window'>):
  { ok: true } | { ok: false; reason: UndoBlockedReason } {
  return windowPhase(now, window) === 'closed'
    ? { ok: false, reason: 'window_closed' }
    : { ok: true };
}

export interface DayBounds {
  /** Primeiro instante do dia local (inclusive). */
  startsAt: Date;
  /** Primeiro instante do dia seguinte (exclusivo). */
  endsAt: Date;
}

/** Os limites de um dia civil no fuso da pessoa (para somar o XP "de hoje"). */
export function dayBounds(date: CivilDate, timezone: string): DayBounds {
  return {
    startsAt: localDateTimeToUtc(date, '00:00', timezone),
    endsAt: localDateTimeToUtc(addDays(date, 1), '00:00', timezone),
  };
}
