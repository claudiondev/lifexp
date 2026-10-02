import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PREFERENCES,
  SCAN_LOOKBACK_MIN,
  STALE_GRACE_MIN,
  dayAndMonth,
  daysAheadText,
  inWindow,
  leadText,
  planNotifications,
  planWeeklyReport,
  reportNotificationText,
  scanWindow,
  type NotificationPreferences,
  type PlannedEvent,
  type PlannedOccurrence,
  type PlanInput,
} from './notification-plan.js';

const TZ = 'America/Sao_Paulo'; // UTC-3 (sem horário de verão desde 2019)
const at = (iso: string) => new Date(iso);

const occurrence = (overrides: Partial<PlannedOccurrence> = {}): PlannedOccurrence => ({
  blockId: 'block-1',
  occurrenceDate: '2026-10-07',
  date: '2026-10-07',
  startTime: '09:00',
  durationMin: 60,
  activityName: 'Corrida',
  skipped: false,
  completed: false,
  ...overrides,
});

const event = (overrides: Partial<PlannedEvent> = {}): PlannedEvent => ({
  id: 'event-1',
  title: 'Consulta',
  date: '2026-10-07',
  time: '14:30',
  remindBeforeMin: 60,
  ...overrides,
});

type PlanParts = Partial<Omit<PlanInput, 'window' | 'prefs'>> & {
  prefs?: Partial<NotificationPreferences>;
};

const plan = (now: string, parts: PlanParts = {}) =>
  planNotifications({
    window: scanWindow(at(now)),
    timezone: TZ,
    occurrences: [],
    events: [],
    ...parts,
    prefs: { ...DEFAULT_PREFERENCES, ...parts.prefs },
  });

describe('scanWindow / inWindow', () => {
  it('olha os últimos 60 minutos até agora: início exclusivo, fim inclusivo', () => {
    const now = at('2026-10-07T12:00:00.000Z');
    const window = scanWindow(now);

    expect(SCAN_LOOKBACK_MIN).toBe(60);
    expect(window.to).toEqual(now);
    expect(window.from).toEqual(at('2026-10-07T11:00:00.000Z'));
    expect(inWindow(at('2026-10-07T11:00:00.000Z'), window)).toBe(false);
    expect(inWindow(at('2026-10-07T11:00:00.001Z'), window)).toBe(true);
    expect(inWindow(now, window)).toBe(true);
    expect(inWindow(at('2026-10-07T12:00:00.001Z'), window)).toBe(false);
  });

  it('aceita uma janela de outro tamanho', () => {
    const window = scanWindow(at('2026-10-07T12:00:00.000Z'), 5);
    expect(window.from).toEqual(at('2026-10-07T11:55:00.000Z'));
  });
});

describe('textos', () => {
  it('leadText: minutos, hora e agora', () => {
    expect(leadText(0)).toBe('agora');
    expect(leadText(15)).toBe('em 15 minutos');
    expect(leadText(60)).toBe('em 1 hora');
    expect(leadText(120)).toBe('em 2 horas');
  });

  it('daysAheadText: amanhã e em N dias', () => {
    expect(daysAheadText(1)).toBe('amanhã');
    expect(daysAheadText(2)).toBe('em 2 dias');
  });

  it('dayAndMonth', () => {
    expect(dayAndMonth('2026-10-07')).toBe('7 de outubro');
    expect(dayAndMonth('2026-03-01')).toBe('1 de março');
    expect(dayAndMonth('2026-12-31')).toBe('31 de dezembro');
  });
});

describe('lembrete de bloco (RN24: 15 min antes)', () => {
  // bloco às 09:00 em São Paulo = 12:00Z; lembrete às 11:45Z
  it('gera o aviso quando o lembrete cai na janela', () => {
    const result = plan('2026-10-07T11:45:20.000Z', { occurrences: [occurrence()] });

    expect(result).toEqual([
      {
        kind: 'BLOCK',
        dedupeKey: 'block:block-1:2026-10-07:15',
        title: 'Corrida começa em 15 minutos',
        body: 'Das 09:00 às 10:00.',
        scheduledFor: at('2026-10-07T11:45:00.000Z'),
        blockId: 'block-1',
        occurrenceDate: '2026-10-07',
      },
    ]);
  });

  it('não gera antes da hora do lembrete', () => {
    expect(plan('2026-10-07T11:44:59.000Z', { occurrences: [occurrence()] })).toEqual([]);
  });

  it('o instante exato do lembrete conta (fim da janela é inclusivo)', () => {
    expect(plan('2026-10-07T11:45:00.000Z', { occurrences: [occurrence()] })).toHaveLength(1);
  });

  it('recupera um lembrete perdido numa queda curta, enquanto o bloco ainda não começou', () => {
    // varredura só às 11:50Z (5 min depois do lembrete); o bloco começa às 12:00Z
    expect(plan('2026-10-07T11:50:00.000Z', { occurrences: [occurrence()] })).toHaveLength(1);
  });

  it('descarta o lembrete se o bloco já começou (seria mentira)', () => {
    expect(plan('2026-10-07T12:00:01.000Z', { occurrences: [occurrence()] })).toEqual([]);
    expect(plan('2026-10-07T12:30:00.000Z', { occurrences: [occurrence()] })).toEqual([]);
  });

  it('descarta lembretes mais velhos que a janela de 60 minutos', () => {
    // lembrete às 11:45Z; varredura às 12:46Z já não olha tão para trás
    expect(plan('2026-10-07T12:46:00.000Z', { occurrences: [occurrence()] })).toEqual([]);
  });

  it('bloco pulado ou concluído não avisa', () => {
    expect(
      plan('2026-10-07T11:45:20.000Z', { occurrences: [occurrence({ skipped: true })] }),
    ).toEqual([]);
    expect(
      plan('2026-10-07T11:45:20.000Z', { occurrences: [occurrence({ completed: true })] }),
    ).toEqual([]);
  });

  it('respeita a antecedência configurada e ela entra na chave', () => {
    const now = '2026-10-07T11:30:30.000Z'; // 30 min antes
    const [notification] = plan(now, {
      occurrences: [occurrence()],
      prefs: { blockLeadMin: 30 },
    });

    expect(notification).toMatchObject({
      dedupeKey: 'block:block-1:2026-10-07:30',
      title: 'Corrida começa em 30 minutos',
      scheduledFor: at('2026-10-07T11:30:00.000Z'),
    });
    // antes da hora do lembrete de 30 min, nada
    expect(
      plan('2026-10-07T11:29:50.000Z', {
        occurrences: [occurrence()],
        prefs: { blockLeadMin: 30 },
      }),
    ).toEqual([]);
  });

  it('uma hora antes diz "em 1 hora"', () => {
    const [notification] = plan('2026-10-07T11:00:10.000Z', {
      occurrences: [occurrence()],
      prefs: { blockLeadMin: 60 },
    });
    expect(notification!.title).toBe('Corrida começa em 1 hora');
  });

  it('desligado nas preferências não gera nada', () => {
    expect(
      plan('2026-10-07T11:45:20.000Z', {
        occurrences: [occurrence()],
        prefs: { blockRemindersEnabled: false },
      }),
    ).toEqual([]);
  });

  it('usa o dia EFETIVO da ocorrência movida, mas a chave usa a data original', () => {
    // movida de 07 para 08; bloco às 09:00 do dia 08 = 12:00Z do dia 08
    const moved = occurrence({ date: '2026-10-08' });
    const [notification] = plan('2026-10-08T11:45:20.000Z', { occurrences: [moved] });

    expect(notification).toMatchObject({
      dedupeKey: 'block:block-1:2026-10-07:15',
      occurrenceDate: '2026-10-07',
      scheduledFor: at('2026-10-08T11:45:00.000Z'),
    });
    expect(plan('2026-10-07T11:45:20.000Z', { occurrences: [moved] })).toEqual([]);
  });

  it('o horário é do fuso da pessoa', () => {
    // 09:00 em Tóquio (UTC+9) = 00:00Z; lembrete às 23:45Z do dia anterior
    const result = planNotifications({
      window: scanWindow(at('2026-10-06T23:45:20.000Z')),
      timezone: 'Asia/Tokyo',
      prefs: DEFAULT_PREFERENCES,
      occurrences: [occurrence()],
      events: [],
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.scheduledFor).toEqual(at('2026-10-06T23:45:00.000Z'));
  });

  it('o fim do bloco que passa da meia-noite local mostra a hora certa', () => {
    const late = occurrence({ startTime: '23:30', durationMin: 30 });
    // 23:30 em São Paulo = 02:30Z do dia seguinte; lembrete 02:15Z
    const [notification] = plan('2026-10-08T02:15:30.000Z', { occurrences: [late] });
    expect(notification!.body).toBe('Das 23:30 às 00:00.');
  });
});

describe('lembrete de evento com hora (RF36)', () => {
  // evento às 14:30 em São Paulo = 17:30Z
  it('1 hora antes: sai às 16:30Z', () => {
    const result = plan('2026-10-07T16:30:10.000Z', { events: [event()] });

    expect(result).toEqual([
      {
        kind: 'EVENT',
        dedupeKey: 'event:event-1:2026-10-07:14:30:60',
        title: 'Consulta começa em 1 hora',
        body: '7 de outubro, às 14:30.',
        scheduledFor: at('2026-10-07T16:30:00.000Z'),
        eventId: 'event-1',
      },
    ]);
  });

  it('1 dia antes diz "amanhã, às HH:mm" e sai 24 h antes', () => {
    const [notification] = plan('2026-10-06T17:30:10.000Z', {
      events: [event({ remindBeforeMin: 1440 })],
    });

    expect(notification).toMatchObject({
      title: 'Consulta amanhã, às 14:30',
      scheduledFor: at('2026-10-06T17:30:00.000Z'),
    });
  });

  it('2 dias antes diz "em 2 dias"', () => {
    const [notification] = plan('2026-10-05T17:30:10.000Z', {
      events: [event({ remindBeforeMin: 2880 })],
    });
    expect(notification!.title).toBe('Consulta em 2 dias, às 14:30');
  });

  it('"no horário" sai quando o evento começa e tolera poucos minutos de atraso', () => {
    const now = '2026-10-07T17:30:20.000Z';
    expect(plan(now, { events: [event({ remindBeforeMin: 0 })] })[0]!.title).toBe(
      'Consulta começa agora',
    );
    expect(STALE_GRACE_MIN).toBe(5);
    expect(
      plan('2026-10-07T17:34:59.000Z', { events: [event({ remindBeforeMin: 0 })] }),
    ).toHaveLength(1);
    expect(plan('2026-10-07T17:35:01.000Z', { events: [event({ remindBeforeMin: 0 })] })).toEqual(
      [],
    );
  });

  it('descarta o lembrete se o evento já começou (com antecedência > 0)', () => {
    expect(plan('2026-10-07T17:31:00.000Z', { events: [event({ remindBeforeMin: 15 })] })).toEqual(
      [],
    );
  });

  it('sem lembrete (nulo) nunca avisa', () => {
    expect(
      plan('2026-10-07T16:30:10.000Z', { events: [event({ remindBeforeMin: null })] }),
    ).toEqual([]);
  });

  it('desligado nas preferências não gera nada', () => {
    expect(
      plan('2026-10-07T16:30:10.000Z', {
        events: [event()],
        prefs: { eventRemindersEnabled: false },
      }),
    ).toEqual([]);
  });

  it('mudar a data ou a hora do evento gera uma chave nova (o aviso acompanha a edição)', () => {
    const key = (e: PlannedEvent, now: string) => plan(now, { events: [e] })[0]!.dedupeKey;
    const a = key(event(), '2026-10-07T16:30:10.000Z');
    const b = key(event({ time: '15:30' }), '2026-10-07T17:30:10.000Z');
    expect(a).not.toBe(b);
  });
});

describe('lembrete de evento de dia todo', () => {
  // 1 dia antes, na hora do resumo (07:00 local = 10:00Z) do dia anterior
  const allDay = event({
    date: '2026-10-20',
    time: null,
    remindBeforeMin: 1440,
    title: 'Aniversário da mãe',
  });

  it('sai na hora do resumo, N dias antes', () => {
    const [notification] = plan('2026-10-19T10:00:30.000Z', { events: [allDay] });

    expect(notification).toEqual({
      kind: 'EVENT',
      dedupeKey: 'event:event-1:2026-10-20:all-day:1440',
      title: 'Aniversário da mãe amanhã',
      body: '20 de outubro, dia todo.',
      scheduledFor: at('2026-10-19T10:00:00.000Z'),
      eventId: 'event-1',
    });
  });

  it('2 dias antes: "em 2 dias", saindo dois dias antes às 07:00 locais', () => {
    const [notification] = plan('2026-10-18T10:00:30.000Z', {
      events: [{ ...allDay, remindBeforeMin: 2880 }],
    });
    expect(notification!.title).toBe('Aniversário da mãe em 2 dias');
  });

  it('acompanha a hora do resumo escolhida pela pessoa', () => {
    expect(
      plan('2026-10-19T10:00:30.000Z', { events: [allDay], prefs: { digestTime: '09:00' } }),
    ).toEqual([]);
    expect(
      plan('2026-10-19T12:00:30.000Z', { events: [allDay], prefs: { digestTime: '09:00' } }),
    ).toHaveLength(1);
  });

  it('descarta se o dia do evento já começou', () => {
    // varredura tardia, já no dia do evento
    expect(plan('2026-10-20T03:30:00.000Z', { events: [allDay] })).toEqual([]);
  });

  it('não sai antes da hora', () => {
    expect(plan('2026-10-19T09:59:00.000Z', { events: [allDay] })).toEqual([]);
  });

  it('com resumo marcado para o fim da noite, não avisa depois que o dia do evento começou', () => {
    const late = { digestTime: '23:30' };
    // 23:30 de 19/10 em São Paulo = 02:30Z de 20/10
    expect(plan('2026-10-20T02:40:00.000Z', { events: [allDay], prefs: late })).toHaveLength(1);
    // 00:20 de 20/10 local: o dia do evento já começou, o aviso de "amanhã" ficou velho
    expect(plan('2026-10-20T03:20:00.000Z', { events: [allDay], prefs: late })).toEqual([]);
  });
});

describe('resumo do dia (RF37)', () => {
  // 07:00 local = 10:00Z
  it('lista a quantidade de blocos e eventos e o primeiro bloco', () => {
    const result = plan('2026-10-07T10:00:20.000Z', {
      occurrences: [
        occurrence({ blockId: 'b2', startTime: '14:00', activityName: 'Leitura' }),
        occurrence({ blockId: 'b1', startTime: '08:00', activityName: 'Corrida' }),
      ],
      events: [event({ time: '19:00', remindBeforeMin: null })],
    });

    expect(result).toEqual([
      {
        kind: 'DIGEST',
        dedupeKey: 'digest:2026-10-07',
        title: 'Seu dia',
        body: 'Hoje: 2 blocos e 1 evento. O primeiro bloco é Corrida, às 08:00.',
        scheduledFor: at('2026-10-07T10:00:00.000Z'),
      },
    ]);
  });

  it('singular e só eventos', () => {
    const [onlyBlock] = plan('2026-10-07T10:00:20.000Z', { occurrences: [occurrence()] });
    expect(onlyBlock!.body).toBe('Hoje: 1 bloco. O primeiro bloco é Corrida, às 09:00.');

    const [onlyEvents] = plan('2026-10-07T10:00:20.000Z', {
      events: [event({ remindBeforeMin: null }), event({ id: 'e2', remindBeforeMin: null })],
    });
    expect(onlyEvents!.body).toBe('Hoje: 2 eventos.');
  });

  it('dia sem blocos nem eventos não gera resumo vazio', () => {
    expect(plan('2026-10-07T10:00:20.000Z')).toEqual([]);
  });

  it('blocos pulados não contam, e dia só com pulados não gera resumo', () => {
    expect(
      plan('2026-10-07T10:00:20.000Z', { occurrences: [occurrence({ skipped: true })] }),
    ).toEqual([]);
    const [result] = plan('2026-10-07T10:00:20.000Z', {
      occurrences: [
        occurrence({ skipped: true }),
        occurrence({ blockId: 'b2', activityName: 'Leitura' }),
      ],
    });
    expect(result!.body).toContain('1 bloco');
  });

  it('só conta o dia de HOJE (não amanhã nem ontem)', () => {
    const result = plan('2026-10-07T10:00:20.000Z', {
      occurrences: [
        occurrence({ date: '2026-10-08' }),
        occurrence({ blockId: 'b0', date: '2026-10-06' }),
      ],
      events: [event({ date: '2026-10-08', remindBeforeMin: null })],
    });
    expect(result).toEqual([]);
  });

  it('só sai na hora escolhida; antes ou depois da janela, não', () => {
    const parts = { occurrences: [occurrence()] };
    expect(plan('2026-10-07T09:59:59.000Z', parts)).toEqual([]);
    expect(plan('2026-10-07T10:00:00.000Z', parts)).toHaveLength(1);
    expect(plan('2026-10-07T10:59:59.000Z', parts)).toHaveLength(1); // ainda dentro dos 60 min
    expect(plan('2026-10-07T11:00:00.000Z', parts)).toEqual([]); // início da janela é exclusivo
  });

  it('acompanha a hora de preferência e o fuso', () => {
    const parts = { occurrences: [occurrence()], prefs: { digestTime: '06:30' } };
    expect(plan('2026-10-07T09:30:10.000Z', parts)).toHaveLength(1);
  });

  it('desligado nas preferências não gera nada', () => {
    expect(
      plan('2026-10-07T10:00:20.000Z', {
        occurrences: [occurrence()],
        prefs: { digestEnabled: false },
      }),
    ).toEqual([]);
  });

  it('"hoje" é o dia local: às 02:00Z ainda é o dia anterior em São Paulo', () => {
    const result = planNotifications({
      window: scanWindow(at('2026-10-08T02:30:00.000Z')),
      timezone: TZ,
      prefs: { ...DEFAULT_PREFERENCES, digestTime: '23:30' },
      occurrences: [occurrence()],
      events: [],
    });
    expect(result[0]).toMatchObject({ dedupeKey: 'digest:2026-10-07' });
  });
});

describe('planNotifications: juntando tudo', () => {
  it('lembrete e resumo na mesma janela saem juntos, em ordem', () => {
    const result = plan('2026-10-07T10:15:00.000Z', {
      occurrences: [occurrence({ startTime: '07:30', blockId: 'b' })],
    });
    expect(result.map((r) => r.kind)).toEqual(['DIGEST', 'BLOCK']);
  });

  it('ordena por horário do lembrete e depois pela chave', () => {
    const result = plan('2026-10-07T10:15:00.000Z', {
      occurrences: [occurrence({ startTime: '07:30', blockId: 'b-late' })],
      events: [event({ time: '07:10', remindBeforeMin: 0, id: 'e-early', date: '2026-10-07' })],
      prefs: { digestEnabled: false },
    });
    // evento 07:10 "no horário" = 10:10Z; bloco 07:30 com lembrete de 15 min = 10:15Z
    expect(result.map((r) => r.kind)).toEqual(['EVENT', 'BLOCK']);
    expect(result.map((r) => r.scheduledFor.toISOString())).toEqual([
      '2026-10-07T10:10:00.000Z',
      '2026-10-07T10:15:00.000Z',
    ]);
  });

  it('o mesmo cálculo repetido dá exatamente as mesmas chaves (base da idempotência)', () => {
    const input = {
      occurrences: [occurrence()],
      events: [event({ remindBeforeMin: 15 })],
    };
    const first = plan('2026-10-07T11:45:20.000Z', input).map((n) => n.dedupeKey);
    const second = plan('2026-10-07T11:46:20.000Z', input).map((n) => n.dedupeKey);
    expect(first).toEqual(second);
    expect(new Set(first).size).toBe(first.length);
  });

  it('chaves nunca colidem entre tipos diferentes', () => {
    const keys = plan('2026-10-07T10:00:20.000Z', {
      occurrences: [occurrence()],
      events: [event({ remindBeforeMin: null })],
    }).map((n) => n.dedupeKey);
    expect(keys.filter((key) => key.startsWith('digest:'))).toHaveLength(1);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('planWeeklyReport', () => {
  // Segunda 2026-10-12, 07:00 em São Paulo (UTC-3) = 10:00Z. A semana que acabou começou em 2026-10-05.
  const MONDAY_Z = '2026-10-12T10:00:20.000Z';
  const input = (now: string, over: Partial<Parameters<typeof planWeeklyReport>[0]> = {}) => ({
    window: scanWindow(new Date(now)),
    timezone: 'America/Sao_Paulo',
    prefs: { weeklyReportEnabled: true, digestTime: '07:00' },
    ...over,
  });

  it('na segunda, na hora do resumo, planeja o relatório da semana anterior', () => {
    expect(planWeeklyReport(input(MONDAY_Z))).toEqual({
      weekStart: '2026-10-05',
      scheduledFor: new Date('2026-10-12T10:00:00.000Z'),
    });
  });

  it('em qualquer outro dia da semana não há relatório', () => {
    for (const day of [
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
      '2026-10-18',
    ]) {
      expect(planWeeklyReport(input(`${day}T10:00:20.000Z`)), day).toBeNull();
    }
  });

  it('só quando a hora do resumo cai na janela da varredura (recupera até 1 h de queda, não antes)', () => {
    expect(planWeeklyReport(input('2026-10-12T09:59:59.000Z'))).toBeNull();
    expect(planWeeklyReport(input('2026-10-12T10:00:00.000Z'))).not.toBeNull();
    expect(planWeeklyReport(input('2026-10-12T10:59:59.000Z'))).not.toBeNull();
    expect(planWeeklyReport(input('2026-10-12T11:00:01.000Z'))).toBeNull();
  });

  it('desligado nas preferências, não planeja', () => {
    expect(
      planWeeklyReport(
        input(MONDAY_Z, { prefs: { weeklyReportEnabled: false, digestTime: '07:00' } }),
      ),
    ).toBeNull();
  });

  it('usa a hora do resumo da pessoa e o fuso dela', () => {
    // 08:30 em São Paulo = 11:30Z
    const plan = planWeeklyReport(
      input('2026-10-12T11:30:20.000Z', {
        prefs: { weeklyReportEnabled: true, digestTime: '08:30' },
      }),
    );
    expect(plan?.scheduledFor).toEqual(new Date('2026-10-12T11:30:00.000Z'));
    // em Honolulu (UTC-10) são 00:00 de segunda: a hora do resumo (07:00) ainda não chegou
    expect(planWeeklyReport(input(MONDAY_Z, { timezone: 'Pacific/Honolulu' }))).toBeNull();
    // em Kiritimati (UTC+14) já é terça: não é segunda
    expect(planWeeklyReport(input(MONDAY_Z, { timezone: 'Pacific/Kiritimati' }))).toBeNull();
  });

  it('a segunda é a do fuso da pessoa, mesmo que em UTC ainda seja domingo', () => {
    // 07:00 de segunda em Tóquio (UTC+9) = 22:00Z de domingo
    const plan = planWeeklyReport(input('2026-10-11T22:00:20.000Z', { timezone: 'Asia/Tokyo' }));
    expect(plan).toEqual({
      weekStart: '2026-10-05',
      scheduledFor: new Date('2026-10-11T22:00:00.000Z'),
    });
    // e para quem está em São Paulo, no mesmo instante, ainda é domingo à noite: nada
    expect(planWeeklyReport(input('2026-10-11T22:00:20.000Z'))).toBeNull();
  });

  it('a segunda cruza a virada do mês e do ano', () => {
    const plan = planWeeklyReport(input('2026-12-28T10:00:20.000Z'));
    expect(plan?.weekStart).toBe('2026-12-21');
    const newYear = planWeeklyReport(input('2027-01-04T10:00:20.000Z'));
    expect(newYear?.weekStart).toBe('2026-12-28');
  });
});

describe('reportNotificationText', () => {
  const report = (blocks: object, net = 640) =>
    ({
      weekStart: '2026-10-05',
      blocks: { planned: 15, completed: 12, skipped: 0, open: 0, adherence: 80, ...blocks },
      xp: { gained: 700, reverted: 60, net, byArea: [] },
    }) as Parameters<typeof reportNotificationText>[0];

  it('conta o que foi cumprido, com a aderência e o XP', () => {
    expect(reportNotificationText(report({}))).toEqual({
      title: 'Seu relatório da semana',
      body: 'Semana de 05/10: 12 de 15 blocos (80%) e +640 XP. Veja o relatório completo.',
    });
  });

  it('singular, e sem XP líquido positivo não menciona XP', () => {
    expect(
      reportNotificationText(report({ planned: 1, completed: 1, adherence: 100 }, 0))?.body,
    ).toBe('Semana de 05/10: 1 de 1 bloco (100%). Veja o relatório completo.');
    expect(reportNotificationText(report({}, -20))?.body).not.toContain('XP');
  });

  it('semana sem nenhum bloco contado não vira aviso', () => {
    expect(
      reportNotificationText(report({ planned: 0, completed: 0, adherence: null })),
    ).toBeNull();
  });

  it('semana cheia de blocos pulados (nada contado) também não', () => {
    expect(
      reportNotificationText(report({ planned: 0, completed: 0, skipped: 5, adherence: null })),
    ).toBeNull();
  });
});
