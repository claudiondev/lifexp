import { describe, expect, it } from 'vitest';
import { dayOfMonth, formatWeekRange, longDate, weekdayLong, weekdayShort } from './civilFormat';

describe('civilFormat', () => {
  it('nomeia o dia da semana em português, sem ponto', () => {
    expect(weekdayShort('2026-10-05')).toBe('Seg');
    expect(weekdayShort('2026-10-07')).toBe('Qua');
    expect(weekdayShort('2026-10-11')).toBe('Dom');
    expect(weekdayLong('2026-10-07')).toBe('quarta-feira');
  });

  it('não desloca o dia por causa do fuso do navegador (data civil)', () => {
    expect(dayOfMonth('2026-10-07')).toBe(7);
    expect(longDate('2026-10-07')).toBe('7 de outubro de 2026');
    expect(longDate('2026-01-01')).toBe('1 de janeiro de 2026');
  });

  it('formata o intervalo da semana dentro do mesmo mês', () => {
    expect(formatWeekRange('2026-10-05')).toBe('5 – 11 out 2026');
  });

  it('formata o intervalo que cruza o mês', () => {
    expect(formatWeekRange('2026-09-28')).toBe('28 set – 4 out 2026');
  });

  it('formata o intervalo que cruza o ano, com os dois anos', () => {
    expect(formatWeekRange('2026-12-28')).toBe('28 dez 2026 – 3 jan 2027');
  });
});
