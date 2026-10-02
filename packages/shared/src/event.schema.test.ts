import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REMIND_BEFORE_MIN,
  MAX_EVENT_RANGE_DAYS,
  createEventSchema,
  eventSchema,
  groupEventsByDate,
  isReminderAllowed,
  listEventsQuerySchema,
  sortEvents,
  updateEventSchema,
  type CalendarEvent,
} from './event.schema.js';

const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success;

const base = { title: 'Consulta', date: '2026-10-20', category: 'medical' };

describe('createEventSchema', () => {
  it('aceita o mínimo: título, data e categoria', () => {
    expect(ok(createEventSchema, base)).toBe(true);
  });

  it('aceita evento completo', () => {
    expect(
      ok(createEventSchema, {
        ...base,
        notes: 'Levar exames',
        areaId: '0192f1a0-7b3c-7000-8000-0000000000b1',
        time: '14:30',
        remindBeforeMin: 60,
      }),
    ).toBe(true);
  });

  it('apara o título e rejeita vazio ou longo demais', () => {
    expect(createEventSchema.parse({ ...base, title: '  Dentista ' }).title).toBe('Dentista');
    expect(ok(createEventSchema, { ...base, title: ' ' })).toBe(false);
    expect(ok(createEventSchema, { ...base, title: 'x'.repeat(121) })).toBe(false);
    expect(ok(createEventSchema, { ...base, title: 'x'.repeat(120) })).toBe(true);
  });

  it('rejeita categoria desconhecida, data inválida, hora inválida e campo extra', () => {
    expect(ok(createEventSchema, { ...base, category: 'party' })).toBe(false);
    expect(ok(createEventSchema, { ...base, date: '2026-02-30' })).toBe(false);
    expect(ok(createEventSchema, { ...base, time: '25:00' })).toBe(false);
    expect(ok(createEventSchema, { ...base, xp: 10 })).toBe(false);
  });

  it('a categoria é obrigatória', () => {
    expect(ok(createEventSchema, { title: 'x', date: '2026-10-20' })).toBe(false);
  });

  it('só aceita as antecedências da lista, ou nulo (sem lembrete)', () => {
    for (const value of [0, 15, 60, 1440, 2880, null]) {
      expect(ok(createEventSchema, { ...base, time: '10:00', remindBeforeMin: value })).toBe(true);
    }
    for (const value of [5, 30, -15, 1.5, '60']) {
      expect(ok(createEventSchema, { ...base, time: '10:00', remindBeforeMin: value })).toBe(false);
    }
  });

  it('evento sem hora só aceita lembrete em dias', () => {
    expect(ok(createEventSchema, { ...base, remindBeforeMin: 1440 })).toBe(true);
    expect(ok(createEventSchema, { ...base, remindBeforeMin: 2880 })).toBe(true);
    expect(ok(createEventSchema, { ...base, remindBeforeMin: null })).toBe(true);
    expect(ok(createEventSchema, { ...base, remindBeforeMin: 60 })).toBe(false);
    expect(ok(createEventSchema, { ...base, remindBeforeMin: 0, time: null })).toBe(false);
  });
});

describe('lembrete padrão (RN24)', () => {
  it('é 1 dia antes, e vale também para evento sem hora', () => {
    expect(DEFAULT_REMIND_BEFORE_MIN).toBe(1440);
    expect(isReminderAllowed(null, DEFAULT_REMIND_BEFORE_MIN)).toBe(true);
  });
});

describe('isReminderAllowed', () => {
  it('sem lembrete vale sempre; sem hora, só em dias; com hora, qualquer um', () => {
    expect(isReminderAllowed(null, null)).toBe(true);
    expect(isReminderAllowed('10:00', null)).toBe(true);
    expect(isReminderAllowed(null, 1440)).toBe(true);
    expect(isReminderAllowed(null, 15)).toBe(false);
    expect(isReminderAllowed('10:00', 15)).toBe(true);
    expect(isReminderAllowed('10:00', 0)).toBe(true);
  });
});

describe('updateEventSchema', () => {
  it('exige ao menos um campo e aceita nulo para limpar', () => {
    expect(ok(updateEventSchema, {})).toBe(false);
    expect(
      ok(updateEventSchema, { time: null, notes: null, areaId: null, remindBeforeMin: null }),
    ).toBe(true);
    expect(ok(updateEventSchema, { title: 'Novo' })).toBe(true);
  });

  it('rejeita campo desconhecido e título vazio', () => {
    expect(ok(updateEventSchema, { xp: 1 })).toBe(false);
    expect(ok(updateEventSchema, { title: ' ' })).toBe(false);
  });
});

describe('listEventsQuerySchema', () => {
  it('aceita um período válido, de um dia ao máximo', () => {
    expect(ok(listEventsQuerySchema, { from: '2026-10-01', to: '2026-10-01' })).toBe(true);
    expect(ok(listEventsQuerySchema, { from: '2026-10-01', to: '2026-12-31' })).toBe(true); // 92 dias
  });

  it(`rejeita fim antes do início e período maior que ${MAX_EVENT_RANGE_DAYS} dias`, () => {
    expect(ok(listEventsQuerySchema, { from: '2026-10-02', to: '2026-10-01' })).toBe(false);
    // 2026-10-01 a 2027-01-01 são 93 dias contando os dois (o limite); um dia a mais passa
    expect(ok(listEventsQuerySchema, { from: '2026-10-01', to: '2027-01-01' })).toBe(true);
    expect(ok(listEventsQuerySchema, { from: '2026-10-01', to: '2027-01-02' })).toBe(false);
  });

  it('rejeita data inválida e exige os dois lados', () => {
    expect(ok(listEventsQuerySchema, { from: 'x', to: '2026-10-01' })).toBe(false);
    expect(ok(listEventsQuerySchema, { from: '2026-10-01', to: '2026-02-30' })).toBe(false);
    expect(ok(listEventsQuerySchema, { from: '2026-10-01' })).toBe(false);
  });
});

const event = (overrides: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: crypto.randomUUID(),
  areaId: null,
  title: 'Evento',
  notes: null,
  date: '2026-10-20',
  time: null,
  category: 'other',
  remindBeforeMin: 1440,
  ...overrides,
});

describe('sortEvents', () => {
  it('ordena por data primeiro, mesmo com "dia todo" e horários misturados', () => {
    const lateDay = event({ date: '2026-10-21' });
    const earlyDayTimed = event({ date: '2026-10-20', time: '23:00' });
    expect(sortEvents([lateDay, earlyDayTimed])).toEqual([earlyDayTimed, lateDay]);
  });

  it('"dia todo" vem primeiro, depois por horário', () => {
    const late = event({ title: 'Tarde', time: '18:00' });
    const early = event({ title: 'Cedo', time: '07:30' });
    const allDay = event({ title: 'Dia todo' });

    expect(sortEvents([late, allDay, early])).toEqual([allDay, early, late]);
  });

  it('empate de horário desempata por título, de forma estável', () => {
    const b = event({ title: 'Banco', time: '09:00' });
    const a = event({ title: 'Aula', time: '09:00' });
    expect(sortEvents([b, a])).toEqual([a, b]);
    expect(sortEvents([a, b])).toEqual([a, b]);
  });

  it('não altera a lista recebida', () => {
    const items = [event({ time: '18:00' }), event({ time: '07:00' })];
    const copy = [...items];
    sortEvents(items);
    expect(items).toEqual(copy);
  });
});

describe('groupEventsByDate', () => {
  it('agrupa por data, cada dia ordenado', () => {
    const a = event({ date: '2026-10-20', time: '10:00', title: 'A' });
    const b = event({ date: '2026-10-21', title: 'B' });
    const c = event({ date: '2026-10-20', title: 'C' });

    const groups = groupEventsByDate([a, b, c]);

    expect([...groups.keys()]).toEqual(['2026-10-20', '2026-10-21']);
    expect(groups.get('2026-10-20')).toEqual([c, a]);
    expect(groups.get('2026-10-21')).toEqual([b]);
  });

  it('sem eventos, sem grupos', () => {
    expect(groupEventsByDate([]).size).toBe(0);
  });
});

describe('eventSchema', () => {
  it('descreve a resposta da API', () => {
    expect(ok(eventSchema, event({ time: '09:00', remindBeforeMin: null }))).toBe(true);
    expect(ok(eventSchema, { ...event(), category: 'x' })).toBe(false);
  });
});
