import {
  canStart,
  earnedLeisure,
  isRunning,
  leisureWeek,
  sessionEnd,
  usedMinutes,
  weekBalance,
  type SessionTimes,
} from './leisure-rules.js';

const at = (iso: string) => new Date(iso);
const session = (overrides: Partial<SessionTimes> = {}): SessionTimes => ({
  startedAt: at('2026-10-12T12:00:00Z'),
  limitMin: 30,
  stoppedAt: null,
  ...overrides,
});

describe('earnedLeisure', () => {
  it.each([
    [120, 50, 60],
    [60, 100, 60],
    [240, 25, 60],
    [60, 25, 15],
    [90, 50, 45],
  ])('%i min a %i%% rendem %i min', (duration, percent, expected) => {
    expect(earnedLeisure(duration, percent)).toBe(expected);
  });
  it('arredonda para baixo', () => {
    expect(earnedLeisure(15, 25)).toBe(3); // 3,75
    expect(earnedLeisure(5, 25)).toBe(1); // 1,25
    expect(earnedLeisure(1, 25)).toBe(0);
  });
  it('atividade que não gera lazer rende 0', () => {
    expect(earnedLeisure(120, null)).toBe(0);
  });
});

describe('sessionEnd', () => {
  it('sem parar, acaba no limite', () => {
    expect(sessionEnd(session()).toISOString()).toBe('2026-10-12T12:30:00.000Z');
  });
  it('parando antes do limite, acaba quando parou', () => {
    expect(sessionEnd(session({ stoppedAt: at('2026-10-12T12:10:00Z') })).toISOString()).toBe(
      '2026-10-12T12:10:00.000Z',
    );
  });
  it('parar depois do limite não estende a sessão', () => {
    expect(sessionEnd(session({ stoppedAt: at('2026-10-12T14:00:00Z') })).toISOString()).toBe(
      '2026-10-12T12:30:00.000Z',
    );
  });
});

describe('usedMinutes', () => {
  it('conta minutos inteiros decorridos, para baixo', () => {
    expect(usedMinutes(session(), at('2026-10-12T12:10:59Z'))).toBe(10);
    expect(usedMinutes(session(), at('2026-10-12T12:00:59Z'))).toBe(0);
  });
  it('nunca passa do limite, mesmo sem parar', () => {
    expect(usedMinutes(session(), at('2026-10-12T20:00:00Z'))).toBe(30);
  });
  it('sessão parada usa só até parar', () => {
    const stopped = session({ stoppedAt: at('2026-10-12T12:20:30Z') });
    expect(usedMinutes(stopped, at('2026-10-12T13:00:00Z'))).toBe(20);
  });
  it('relógio antes do início não dá valor negativo', () => {
    expect(usedMinutes(session(), at('2026-10-12T11:59:00Z'))).toBe(0);
  });
});

describe('isRunning', () => {
  it('corre entre o início e o limite', () => {
    expect(isRunning(session(), at('2026-10-12T12:29:59Z'))).toBe(true);
  });
  it('acaba exatamente no limite', () => {
    expect(isRunning(session(), at('2026-10-12T12:30:00Z'))).toBe(false);
  });
  it('parada não corre', () => {
    expect(
      isRunning(session({ stoppedAt: at('2026-10-12T12:05:00Z') }), at('2026-10-12T12:06:00Z')),
    ).toBe(false);
  });
});

describe('weekBalance', () => {
  const now = at('2026-10-12T13:00:00Z');
  it('soma o uso das sessões e desconta do ganho', () => {
    const sessions = [
      session({ stoppedAt: at('2026-10-12T12:15:00Z') }),
      session({ startedAt: at('2026-10-12T12:30:00Z'), limitMin: 20, stoppedAt: null }),
    ];
    expect(weekBalance({ earnedMin: 90, sessions, now })).toEqual({
      earnedMin: 90,
      usedMin: 35,
      rawBalanceMin: 55,
      balanceMin: 55,
    });
  });
  it('sem sessões o saldo é o ganho', () => {
    expect(weekBalance({ earnedMin: 45, sessions: [], now }).balanceMin).toBe(45);
  });
  it('estorno depois do uso: o saldo mostrado é 0, o bruto fica negativo', () => {
    const result = weekBalance({ earnedMin: 10, sessions: [session()], now });
    expect(result.rawBalanceMin).toBe(-20);
    expect(result.balanceMin).toBe(0);
  });
});

describe('canStart', () => {
  it('exige saldo e nenhuma sessão correndo', () => {
    expect(canStart(1, false)).toBe(true);
    expect(canStart(0, false)).toBe(false);
    expect(canStart(30, true)).toBe(false);
  });
});

describe('leisureWeek', () => {
  it('a semana vai de segunda 00:00 local à segunda seguinte', () => {
    const week = leisureWeek(at('2026-10-14T15:00:00Z'), 'America/Sao_Paulo');
    expect(week.weekStart).toBe('2026-10-12');
    expect(week.from.toISOString()).toBe('2026-10-12T03:00:00.000Z');
    expect(week.to.toISOString()).toBe('2026-10-19T03:00:00.000Z');
  });
  it('domingo à noite local ainda é a semana que acaba, mesmo já sendo segunda em UTC', () => {
    // 2026-10-19 02:00 UTC = domingo 23:00 em São Paulo
    const week = leisureWeek(at('2026-10-19T02:00:00Z'), 'America/Sao_Paulo');
    expect(week.weekStart).toBe('2026-10-12');
  });
  it('segunda 00:00 local começa a semana nova (o saldo zera)', () => {
    const week = leisureWeek(at('2026-10-19T03:00:00Z'), 'America/Sao_Paulo');
    expect(week.weekStart).toBe('2026-10-19');
  });
  it('vira a semana no fuso mais adiantado (Kiritimati, UTC+14)', () => {
    // 2026-10-18 10:00 UTC = segunda 2026-10-19 00:00 em Kiritimati
    const week = leisureWeek(at('2026-10-18T10:00:00Z'), 'Pacific/Kiritimati');
    expect(week.weekStart).toBe('2026-10-19');
    expect(week.from.toISOString()).toBe('2026-10-18T10:00:00.000Z');
  });
  it('tem 167 h na semana em que o horário de verão começa (Los Angeles, março)', () => {
    const week = leisureWeek(at('2026-03-05T12:00:00Z'), 'America/Los_Angeles');
    expect(week.weekStart).toBe('2026-03-02');
    expect((week.to.getTime() - week.from.getTime()) / 3_600_000).toBe(167);
  });
  it('tem 169 h na semana em que o horário de verão termina (Los Angeles, novembro)', () => {
    const week = leisureWeek(at('2026-10-28T12:00:00Z'), 'America/Los_Angeles');
    expect(week.weekStart).toBe('2026-10-26');
    expect((week.to.getTime() - week.from.getTime()) / 3_600_000).toBe(169);
  });
});
