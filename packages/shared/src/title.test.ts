import { describe, expect, it } from 'vitest';
import { LEVEL_TITLES, levelTitle } from './title.js';

describe('levelTitle', () => {
  it('muda no nível mínimo de cada faixa e não antes', () => {
    expect(levelTitle(1)).toBe('Aprendiz');
    expect(levelTitle(4)).toBe('Aprendiz');
    expect(levelTitle(5)).toBe('Explorador');
    expect(levelTitle(9)).toBe('Explorador');
    expect(levelTitle(10)).toBe('Aventureiro');
    expect(levelTitle(19)).toBe('Aventureiro');
    expect(levelTitle(20)).toBe('Veterano');
    expect(levelTitle(30)).toBe('Mestre');
    expect(levelTitle(49)).toBe('Mestre');
    expect(levelTitle(50)).toBe('Lenda');
    expect(levelTitle(999)).toBe('Lenda');
  });

  it('todo nível tem título, inclusive um valor absurdo abaixo de 1', () => {
    expect(levelTitle(0)).toBe('Aprendiz');
  });

  it('a lista começa no nível 1 e é estritamente crescente', () => {
    expect(LEVEL_TITLES[0]!.minLevel).toBe(1);
    for (let i = 1; i < LEVEL_TITLES.length; i++) {
      expect(LEVEL_TITLES[i]!.minLevel).toBeGreaterThan(LEVEL_TITLES[i - 1]!.minLevel);
    }
  });
});
