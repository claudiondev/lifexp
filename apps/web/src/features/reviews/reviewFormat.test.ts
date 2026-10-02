import { describe, expect, it } from 'vitest';
import {
  completedText,
  formatAdherence,
  hasPlans,
  minutesText,
  nextWeekOf,
  previousWeekOf,
  resolveReviewWeek,
  skippedText,
  xpText,
} from './reviewFormat';

describe('formatAdherence', () => {
  it('porcentagem arredondada, e traço quando nada foi planejado', () => {
    expect(formatAdherence(0.75)).toBe('75%');
    expect(formatAdherence(1)).toBe('100%');
    expect(formatAdherence(0)).toBe('0%');
    expect(formatAdherence(2 / 3)).toBe('67%');
    expect(formatAdherence(null)).toBe('—');
  });
});

describe('completedText', () => {
  it('singular e plural', () => {
    expect(completedText(4, 3)).toBe('3 de 4 blocos cumpridos');
    expect(completedText(1, 1)).toBe('1 de 1 bloco cumprido');
    expect(completedText(2, 0)).toBe('0 de 2 blocos cumpridos');
  });
});

describe('minutesText', () => {
  it('tempo cumprido sobre o planejado, em horas e minutos', () => {
    expect(minutesText(240, 90)).toBe('1 h 30 min de 4 h');
    expect(minutesText(45, 45)).toBe('45 min de 45 min');
    expect(minutesText(60, 0)).toBe('0 min de 1 h');
    expect(minutesText(0, 0)).toBe('0 min de 0 min');
  });
});

describe('xpText', () => {
  it('sempre com sinal; o estorno líquido usa o menos tipográfico', () => {
    expect(xpText(90)).toBe('+90 XP');
    expect(xpText(0)).toBe('+0 XP');
    expect(xpText(-60)).toBe('−60 XP');
  });
});

describe('skippedText', () => {
  it('informativo e sem culpa; nulo quando não houve pulados', () => {
    expect(skippedText(0)).toBeNull();
    expect(skippedText(1)).toBe('1 bloco foi pulado. Pular não pesa na sua aderência.');
    expect(skippedText(3)).toBe('3 blocos foram pulados. Pular não pesa na sua aderência.');
  });
});

describe('hasPlans', () => {
  it('só há resumo quando algo foi planejado', () => {
    const totals = {
      planned: 0,
      completed: 0,
      plannedMin: 0,
      completedMin: 0,
      skipped: 2,
      adherence: null,
      xp: 0,
    };
    expect(hasPlans(totals)).toBe(false);
    expect(hasPlans({ ...totals, planned: 1 })).toBe(true);
  });
});

describe('resolveReviewWeek', () => {
  const current = '2026-10-05';

  it('qualquer dia vira a segunda-feira da semana dele', () => {
    expect(resolveReviewWeek('2026-09-28', current)).toBe('2026-09-28');
    expect(resolveReviewWeek('2026-09-30', current)).toBe('2026-09-28');
    expect(resolveReviewWeek('2026-10-04', current)).toBe('2026-09-28'); // domingo
  });

  it('nunca depois da semana atual', () => {
    expect(resolveReviewWeek('2026-10-12', current)).toBe(current);
    expect(resolveReviewWeek('2030-01-07', current)).toBe(current);
  });

  it('ausente, vazio ou inválido vira a semana atual (sem lançar erro)', () => {
    for (const value of [null, '', 'hoje', '2026-02-30', '2026-13-01', '5/10/2026', '2026-10-5']) {
      expect(resolveReviewWeek(value, current)).toBe(current);
    }
  });

  it('atravessa a virada de ano', () => {
    expect(resolveReviewWeek('2027-01-01', '2027-01-04')).toBe('2026-12-28');
  });
});

describe('semana anterior e seguinte', () => {
  it('7 dias para cada lado, também na virada de mês e ano', () => {
    expect(previousWeekOf('2026-10-05')).toBe('2026-09-28');
    expect(nextWeekOf('2026-09-28')).toBe('2026-10-05');
    expect(previousWeekOf('2027-01-04')).toBe('2026-12-28');
    expect(nextWeekOf('2026-12-28')).toBe('2027-01-04');
  });
});
