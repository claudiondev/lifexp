import { describe, expect, it } from 'vitest';
import {
  formatCountdown,
  formatLeisure,
  remainingMinutesText,
  remainingSeconds,
} from './leisureFormat';

describe('formatLeisure', () => {
  it.each([
    [0, '0 min'],
    [5, '5 min'],
    [59, '59 min'],
    [60, '1h'],
    [90, '1h30'],
    [125, '2h05'],
    [600, '10h'],
  ])('%i min vira "%s"', (minutes, text) => {
    expect(formatLeisure(minutes)).toBe(text);
  });
});

describe('remainingSeconds', () => {
  const session = { endsAt: '2026-10-07T15:30:00.000Z' };
  const at = (iso: string) => new Date(iso).getTime();

  it('arredonda para cima: com 0,2 s de sobra ainda falta 1 s', () => {
    expect(remainingSeconds(session, at('2026-10-07T15:29:59.800Z'))).toBe(1);
  });
  it('conta os segundos que faltam', () => {
    expect(remainingSeconds(session, at('2026-10-07T15:00:00.000Z'))).toBe(1800);
  });
  it('nunca fica negativo depois do fim', () => {
    expect(remainingSeconds(session, at('2026-10-07T18:00:00.000Z'))).toBe(0);
  });
});

describe('formatCountdown', () => {
  it.each([
    [0, '00:00'],
    [7, '00:07'],
    [307, '05:07'],
    [3599, '59:59'],
    [3600, '1:00:00'],
    [3907, '1:05:07'],
  ])('%i s vira "%s"', (seconds, text) => {
    expect(formatCountdown(seconds)).toBe(text);
  });
});

describe('remainingMinutesText (leitor de tela)', () => {
  it('muda só quando o minuto muda', () => {
    expect(remainingMinutesText(1800)).toBe('Faltam 30 minutos');
    expect(remainingMinutesText(1741)).toBe('Faltam 30 minutos');
    expect(remainingMinutesText(1740)).toBe('Faltam 29 minutos');
  });
  it('no último minuto diz "menos de 1 minuto"', () => {
    expect(remainingMinutesText(60)).toBe('Falta menos de 1 minuto');
    expect(remainingMinutesText(1)).toBe('Falta menos de 1 minuto');
  });
});
