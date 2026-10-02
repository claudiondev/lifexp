import { EVENT_CATEGORIES, type CalendarEvent, type EventCategory } from '@lifexp/shared';

export const CATEGORY_LABEL: Record<EventCategory, string> = {
  appointment: 'Compromisso',
  birthday: 'Aniversário',
  medical: 'Consulta',
  trip: 'Viagem',
  deadline: 'Prazo',
  other: 'Outro',
};

export const CATEGORY_OPTIONS = EVENT_CATEGORIES.map((value) => ({
  value,
  label: CATEGORY_LABEL[value],
}));

type Reminder = CalendarEvent['remindBeforeMin'];

export const REMINDER_LABEL: Record<string, string> = {
  none: 'Sem lembrete',
  '0': 'No horário',
  '15': '15 minutos antes',
  '60': '1 hora antes',
  '1440': '1 dia antes',
  '2880': '2 dias antes',
};

export const reminderLabel = (value: Reminder): string => REMINDER_LABEL[String(value ?? 'none')]!;

/** Opções de lembrete que fazem sentido: sem hora ("dia todo"), só em dias. */
export function reminderOptions(allDay: boolean): { value: string; label: string }[] {
  const values = allDay ? ['none', '1440', '2880'] : ['none', '0', '15', '60', '1440', '2880'];
  return values.map((value) => ({ value, label: REMINDER_LABEL[value]! }));
}

/** "14:30" ou "Dia todo". */
export const timeLabel = (event: Pick<CalendarEvent, 'time'>): string => event.time ?? 'Dia todo';
