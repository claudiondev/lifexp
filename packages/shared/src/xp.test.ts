import { describe, expect, it } from 'vitest';
import {
  XP_CAP_PER_COMPLETION,
  calculateXp,
  levelForXp,
  levelProgress,
  xpToReachLevel,
} from './xp.js';

describe('calculateXp (RN01, RN02, RN03)', () => {
  it('é a duração em minutos vezes o peso da atividade', () => {
    expect(calculateXp({ durationMin: 60, xpWeight: 1 })).toBe(60);
    expect(calculateXp({ durationMin: 30, xpWeight: 2 })).toBe(60);
    expect(calculateXp({ durationMin: 60, xpWeight: 0.5 })).toBe(30);
    expect(calculateXp({ durationMin: 15, xpWeight: 1 })).toBe(15);
  });

  it('arredonda para inteiro (meio vai para cima)', () => {
    expect(calculateXp({ durationMin: 45, xpWeight: 1.5 })).toBe(68); // 67,5
    expect(calculateXp({ durationMin: 25, xpWeight: 1.3 })).toBe(33); // 32,5
    expect(calculateXp({ durationMin: 20, xpWeight: 0.7 })).toBe(14); // 14,000000000000002
  });

  it('é imune a ruído de ponto flutuante nos pesos com decimais', () => {
    expect(calculateXp({ durationMin: 60, xpWeight: 1.1 })).toBe(66); // 66,00000000000001
    expect(calculateXp({ durationMin: 90, xpWeight: 1.2 })).toBe(108);
  });

  it('limita a 300 por ocorrência, inclusive no valor exato', () => {
    expect(calculateXp({ durationMin: 720, xpWeight: 2 })).toBe(XP_CAP_PER_COMPLETION);
    expect(calculateXp({ durationMin: 300, xpWeight: 1 })).toBe(300);
    expect(calculateXp({ durationMin: 301, xpWeight: 1 })).toBe(300);
    expect(calculateXp({ durationMin: 299, xpWeight: 1 })).toBe(299);
  });

  it('o multiplicador do bloco é 1,0 por padrão e pode ser informado', () => {
    expect(calculateXp({ durationMin: 60, xpWeight: 1, multiplier: 1 })).toBe(60);
    expect(calculateXp({ durationMin: 60, xpWeight: 1, multiplier: 1.5 })).toBe(90);
    expect(calculateXp({ durationMin: 600, xpWeight: 2, multiplier: 2 })).toBe(300); // o teto vale depois
  });

  it('nunca devolve XP negativo, nem NaN, para entradas inválidas', () => {
    expect(calculateXp({ durationMin: 0, xpWeight: 1 })).toBe(0);
    expect(calculateXp({ durationMin: -30, xpWeight: 1 })).toBe(0);
    expect(calculateXp({ durationMin: 60, xpWeight: 0 })).toBe(0);
    expect(calculateXp({ durationMin: Number.NaN, xpWeight: 1 })).toBe(0);
    expect(calculateXp({ durationMin: Number.POSITIVE_INFINITY, xpWeight: 1 })).toBe(0);
  });

  it('o resultado é sempre um inteiro entre 0 e 300', () => {
    for (let duration = 15; duration <= 720; duration += 5) {
      for (const weight of [0.5, 0.7, 1, 1.1, 1.3, 1.5, 1.7, 2]) {
        const xp = calculateXp({ durationMin: duration, xpWeight: weight });
        expect(Number.isInteger(xp)).toBe(true);
        expect(xp).toBeGreaterThanOrEqual(0);
        expect(xp).toBeLessThanOrEqual(300);
      }
    }
  });
});

describe('xpToReachLevel (RN05, deslocada para o nível 1 começar em 0 XP)', () => {
  it('o nível 1 e abaixo custam 0', () => {
    expect(xpToReachLevel(1)).toBe(0);
    expect(xpToReachLevel(0)).toBe(0);
    expect(xpToReachLevel(-3)).toBe(0);
  });

  it('segue 100 x (n-1)^1,5, arredondado', () => {
    expect(xpToReachLevel(2)).toBe(100);
    expect(xpToReachLevel(3)).toBe(283);
    expect(xpToReachLevel(4)).toBe(520);
    expect(xpToReachLevel(5)).toBe(800);
    expect(xpToReachLevel(11)).toBe(3162);
  });

  it('é estritamente crescente, com degraus cada vez maiores', () => {
    let previousGap = 0;
    for (let level = 2; level <= 100; level++) {
      const gap = xpToReachLevel(level) - xpToReachLevel(level - 1);
      expect(gap).toBeGreaterThan(0);
      expect(gap).toBeGreaterThanOrEqual(previousGap);
      previousGap = gap;
    }
  });

  it('não aceita nível fracionário como se fosse inteiro', () => {
    expect(xpToReachLevel(2.5)).toBe(0);
  });
});

describe('levelForXp', () => {
  it('começa no nível 1 com 0 XP', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(1)).toBe(1);
    expect(levelForXp(99)).toBe(1);
  });

  it('sobe exatamente no XP que o nível exige (limite inclusivo)', () => {
    expect(levelForXp(99)).toBe(1);
    expect(levelForXp(100)).toBe(2);
    expect(levelForXp(282)).toBe(2);
    expect(levelForXp(283)).toBe(3);
    expect(levelForXp(519)).toBe(3);
    expect(levelForXp(520)).toBe(4);
  });

  it('é a inversa exata de xpToReachLevel: no limite, e um XP antes dele', () => {
    for (let level = 1; level <= 300; level++) {
      expect(levelForXp(xpToReachLevel(level))).toBe(level);
      if (level > 1) expect(levelForXp(xpToReachLevel(level) - 1)).toBe(level - 1);
    }
  });

  it('a invariante vale para todo XP de 0 a 300 mil: o nível começa em ou antes do XP e o próximo, depois', () => {
    for (let xp = 0; xp <= 300_000; xp++) {
      const level = levelForXp(xp);
      expect(xpToReachLevel(level)).toBeLessThanOrEqual(xp);
      expect(xpToReachLevel(level + 1)).toBeGreaterThan(xp);
    }
  });

  it('nunca diminui quando o XP aumenta', () => {
    let previous = 1;
    for (let xp = 0; xp <= 20_000; xp += 7) {
      const level = levelForXp(xp);
      expect(level).toBeGreaterThanOrEqual(previous);
      previous = level;
    }
  });

  it('trata XP negativo como zero e ignora a parte fracionária', () => {
    expect(levelForXp(-50)).toBe(1);
    expect(levelForXp(99.9)).toBe(1);
    expect(levelForXp(100.4)).toBe(2);
  });

  it('funciona para valores muito grandes sem travar', () => {
    expect(levelForXp(10_000_000)).toBeGreaterThan(1000);
  });
});

describe('levelProgress', () => {
  it('no começo: nível 1, nada ganho, barra vazia', () => {
    expect(levelProgress(0)).toEqual({
      xp: 0,
      level: 1,
      xpIntoLevel: 0,
      xpForNextLevel: 100,
      progress: 0,
    });
  });

  it('dentro do nível: quanto já ganhou, o tamanho do nível e a fração', () => {
    expect(levelProgress(60)).toEqual({
      xp: 60,
      level: 1,
      xpIntoLevel: 60,
      xpForNextLevel: 100,
      progress: 0.6,
    });
    const mid = levelProgress(191); // nível 2 vai de 100 a 283 (183 XP)
    expect(mid).toMatchObject({ level: 2, xpIntoLevel: 91, xpForNextLevel: 183 });
    expect(mid.progress).toBeCloseTo(91 / 183, 10);
  });

  it('ao atingir o nível, a barra zera no nível novo', () => {
    expect(levelProgress(100)).toMatchObject({ level: 2, xpIntoLevel: 0, progress: 0 });
    expect(levelProgress(99)).toMatchObject({ level: 1, xpIntoLevel: 99 });
  });

  it('a fração fica sempre entre 0 (inclusive) e 1 (exclusive)', () => {
    for (let xp = 0; xp <= 15_000; xp += 13) {
      const { progress, xpIntoLevel, xpForNextLevel } = levelProgress(xp);
      expect(progress).toBeGreaterThanOrEqual(0);
      expect(progress).toBeLessThan(1);
      expect(xpIntoLevel).toBeLessThan(xpForNextLevel);
    }
  });

  it('a soma dos níveis fecha com o XP total', () => {
    for (const xp of [0, 50, 100, 283, 1234, 9999]) {
      const { level, xpIntoLevel } = levelProgress(xp);
      expect(xpToReachLevel(level) + xpIntoLevel).toBe(xp);
    }
  });
});
