import {
  BLOCK_LEAD_OPTIONS,
  DEFAULT_BLOCK_LEAD_MIN,
  DEFAULT_DIGEST_TIME,
  addDays,
  localDateTimeToUtc,
  todayIn,
  type CivilDate,
} from '@lifexp/shared';

/** Quanto tempo para trás a varredura olha: recupera lembretes de uma queda curta da API. */
export const SCAN_LOOKBACK_MIN = 60;
/** Um lembrete cujo alvo já passou há mais que isso é velho demais para avisar. */
export const STALE_GRACE_MIN = 5;

export type BlockLead = (typeof BLOCK_LEAD_OPTIONS)[number];

export interface NotificationPreferences {
  blockRemindersEnabled: boolean;
  blockLeadMin: BlockLead;
  eventRemindersEnabled: boolean;
  digestEnabled: boolean;
  /** Hora de relógio (no fuso da pessoa) em que o resumo do dia sai. */
  digestTime: string;
  digestEmailEnabled: boolean;
}

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  blockRemindersEnabled: true,
  blockLeadMin: DEFAULT_BLOCK_LEAD_MIN,
  eventRemindersEnabled: true,
  digestEnabled: true,
  digestTime: DEFAULT_DIGEST_TIME,
  digestEmailEnabled: false,
};

/** Uma ocorrência de bloco já resolvida (exceções aplicadas), pronta para virar lembrete. */
export interface PlannedOccurrence {
  blockId: string;
  /** Data original da ocorrência na série (a identidade dela, RN32). */
  occurrenceDate: CivilDate;
  /** Dia efetivo (muda se a ocorrência foi movida). */
  date: CivilDate;
  startTime: string;
  durationMin: number;
  activityName: string;
  skipped: boolean;
  completed: boolean;
}

export interface PlannedEvent {
  id: string;
  title: string;
  date: CivilDate;
  time: string | null;
  remindBeforeMin: number | null;
}

export type NotificationKind = 'BLOCK' | 'EVENT' | 'DIGEST';

export interface NotificationCandidate {
  kind: NotificationKind;
  /** Chave lógica única por pessoa: rodar a varredura de novo nunca duplica (RF55, RN25). */
  dedupeKey: string;
  title: string;
  body: string;
  /** Quando o aviso deveria sair (o instante do lembrete). */
  scheduledFor: Date;
  blockId?: string;
  occurrenceDate?: CivilDate;
  eventId?: string;
}

export interface ScanWindow {
  /** Exclusivo. */
  from: Date;
  /** Inclusivo. */
  to: Date;
}

/** Janela de uma varredura: os últimos SCAN_LOOKBACK_MIN minutos até agora. */
export function scanWindow(now: Date, lookbackMin: number = SCAN_LOOKBACK_MIN): ScanWindow {
  return { from: new Date(now.getTime() - lookbackMin * 60_000), to: now };
}

/** O instante está na janela (início exclusivo, fim inclusivo)? */
export const inWindow = (instant: Date, window: ScanWindow): boolean =>
  instant.getTime() > window.from.getTime() && instant.getTime() <= window.to.getTime();

const minutesBefore = (instant: Date, minutes: number): Date =>
  new Date(instant.getTime() - minutes * 60_000);

/**
 * O alvo (início do bloco/evento) já passou? Então o lembrete é velho ("começa em 15 minutos"
 * para algo que já começou seria mentira). A única tolerância é o lembrete "no horário": ele
 * sai na primeira varredura depois do início, então aceita alguns minutos de atraso.
 */
const isStale = (target: Date, now: Date, graceMin = 0): boolean =>
  target.getTime() < now.getTime() - graceMin * 60_000;

const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

/** "7 de outubro" a partir de uma data civil. */
export function dayAndMonth(date: CivilDate): string {
  return `${Number(date.slice(8, 10))} de ${MONTHS[Number(date.slice(5, 7)) - 1]}`;
}

/** "em 15 minutos", "em 1 hora", "agora". */
export function leadText(minutes: number): string {
  if (minutes === 0) return 'agora';
  if (minutes < 60) return `em ${minutes} minutos`;
  if (minutes === 60) return 'em 1 hora';
  if (minutes % 60 === 0 && minutes < 1440) return `em ${minutes / 60} horas`;
  return `em ${minutes} minutos`;
}

/** "amanhã", "em 2 dias" (lembretes de evento em dias). */
export function daysAheadText(days: number): string {
  return days === 1 ? 'amanhã' : `em ${days} dias`;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

const endTime = (start: string, durationMin: number): string => {
  const total = Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5)) + durationMin;
  const hours = Math.floor(total / 60) % 24;
  return `${String(hours).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

function blockReminders(input: PlanInput, prefs: NotificationPreferences): NotificationCandidate[] {
  if (!prefs.blockRemindersEnabled) return [];
  const result: NotificationCandidate[] = [];
  for (const occurrence of input.occurrences) {
    if (occurrence.skipped || occurrence.completed) continue;
    const start = localDateTimeToUtc(occurrence.date, occurrence.startTime, input.timezone);
    const at = minutesBefore(start, prefs.blockLeadMin);
    if (!inWindow(at, input.window) || isStale(start, input.window.to)) continue;
    result.push({
      kind: 'BLOCK',
      dedupeKey: `block:${occurrence.blockId}:${occurrence.occurrenceDate}:${prefs.blockLeadMin}`,
      title: `${occurrence.activityName} começa ${leadText(prefs.blockLeadMin)}`,
      body: `Das ${occurrence.startTime} às ${endTime(occurrence.startTime, occurrence.durationMin)}.`,
      scheduledFor: at,
      blockId: occurrence.blockId,
      occurrenceDate: occurrence.occurrenceDate,
    });
  }
  return result;
}

function eventReminders(input: PlanInput, prefs: NotificationPreferences): NotificationCandidate[] {
  if (!prefs.eventRemindersEnabled) return [];
  const result: NotificationCandidate[] = [];
  for (const event of input.events) {
    if (event.remindBeforeMin === null) continue;

    if (event.time !== null) {
      const start = localDateTimeToUtc(event.date, event.time, input.timezone);
      const at = minutesBefore(start, event.remindBeforeMin);
      if (
        !inWindow(at, input.window) ||
        isStale(start, input.window.to, event.remindBeforeMin === 0 ? STALE_GRACE_MIN : 0)
      ) {
        continue;
      }
      const days = event.remindBeforeMin / 1440;
      result.push({
        kind: 'EVENT',
        dedupeKey: `event:${event.id}:${event.date}:${event.time}:${event.remindBeforeMin}`,
        title:
          event.remindBeforeMin >= 1440
            ? `${event.title} ${daysAheadText(days)}, às ${event.time}`
            : `${event.title} começa ${leadText(event.remindBeforeMin)}`,
        body: `${dayAndMonth(event.date)}, às ${event.time}.`,
        scheduledFor: at,
        eventId: event.id,
      });
      continue;
    }

    // Dia todo: o lembrete (sempre em dias) sai na hora do resumo do dia, N dias antes.
    const days = event.remindBeforeMin / 1440;
    const at = localDateTimeToUtc(addDays(event.date, -days), prefs.digestTime, input.timezone);
    const dayStart = localDateTimeToUtc(event.date, '00:00', input.timezone);
    if (!inWindow(at, input.window) || isStale(dayStart, input.window.to)) continue;
    result.push({
      kind: 'EVENT',
      dedupeKey: `event:${event.id}:${event.date}:all-day:${event.remindBeforeMin}`,
      title: `${event.title} ${daysAheadText(days)}`,
      body: `${dayAndMonth(event.date)}, dia todo.`,
      scheduledFor: at,
      eventId: event.id,
    });
  }
  return result;
}

function digest(input: PlanInput, prefs: NotificationPreferences): NotificationCandidate[] {
  if (!prefs.digestEnabled) return [];
  const today = todayIn(input.timezone, input.window.to);
  const at = localDateTimeToUtc(today, prefs.digestTime, input.timezone);
  if (!inWindow(at, input.window)) return [];

  const blocks = input.occurrences
    .filter((occurrence) => occurrence.date === today && !occurrence.skipped)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const events = input.events.filter((event) => event.date === today);
  if (blocks.length === 0 && events.length === 0) return [];

  const parts: string[] = [];
  if (blocks.length > 0) parts.push(plural(blocks.length, 'bloco', 'blocos'));
  if (events.length > 0) parts.push(plural(events.length, 'evento', 'eventos'));
  const first = blocks[0];
  return [
    {
      kind: 'DIGEST',
      dedupeKey: `digest:${today}`,
      title: 'Seu dia',
      body:
        `Hoje: ${parts.join(' e ')}.` +
        (first ? ` O primeiro bloco é ${first.activityName}, às ${first.startTime}.` : ''),
      scheduledFor: at,
    },
  ];
}

export interface PlanInput {
  window: ScanWindow;
  timezone: string;
  prefs: NotificationPreferences;
  occurrences: readonly PlannedOccurrence[];
  events: readonly PlannedEvent[];
}

/**
 * Decide, sem tocar em banco nem relógio, quais notificações a janela da varredura deve gerar
 * (RF37): lembretes de bloco e de evento e o resumo do dia. Cada candidata traz uma chave lógica
 * única (RF55, RN25): quem grava usa essa chave para não duplicar se a varredura repetir.
 *
 * Tudo é calculado no fuso da pessoa (RN37). Blocos pulados ou concluídos não avisam; lembretes
 * de coisas que já começaram há mais de alguns minutos (API fora do ar) são descartados.
 */
export function planNotifications(input: PlanInput): NotificationCandidate[] {
  return [
    ...blockReminders(input, input.prefs),
    ...eventReminders(input, input.prefs),
    ...digest(input, input.prefs),
  ].sort(
    (a, b) =>
      a.scheduledFor.getTime() - b.scheduledFor.getTime() || a.dedupeKey.localeCompare(b.dedupeKey),
  );
}
