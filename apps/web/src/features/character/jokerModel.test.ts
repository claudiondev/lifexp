import { describe, expect, it } from 'vitest';
import { describeJoker } from './jokerModel';

describe('describeJoker', () => {
  it('disponível: explica o que ele faz', () => {
    expect(describeJoker({ weekStart: '2026-10-05', used: false, usedOn: null })).toBe(
      'Coringa da semana disponível: ele perdoa o primeiro dia perdido, sem custo.',
    );
  });

  it('usado: diz em que dia e que a sequência foi protegida', () => {
    expect(describeJoker({ weekStart: '2026-10-05', used: true, usedOn: '2026-10-06' })).toBe(
      'Coringa da semana usado em terça-feira (06/10): sua sequência foi protegida.',
    );
  });
});
