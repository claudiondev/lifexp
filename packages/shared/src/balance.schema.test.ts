import { describe, expect, it } from 'vitest';
import { balanceAreaSchema, balanceSchema } from './balance.schema.js';

const area = {
  areaId: '0192f1a0-7b3c-7000-8000-0000000000a1',
  name: 'Saúde',
  color: 'moss',
  icon: 'heart-pulse',
  planned: 10,
  completed: 7,
  score: 70,
};
const ok = (value: unknown) => balanceAreaSchema.safeParse(value).success;

describe('balanceAreaSchema', () => {
  it('aceita área com nota e área sem blocos planejados (sem nota)', () => {
    expect(ok(area)).toBe(true);
    expect(ok({ ...area, planned: 0, completed: 0, score: null })).toBe(true);
  });

  it('a nota fica nula só quando nada foi planejado', () => {
    expect(ok({ ...area, score: null })).toBe(false);
    expect(ok({ ...area, planned: 0, completed: 0, score: 0 })).toBe(false);
  });

  it('não aceita mais concluídos do que planejados, nem nota fora de 0 a 100', () => {
    expect(ok({ ...area, completed: 11 })).toBe(false);
    expect(ok({ ...area, score: 101 })).toBe(false);
    expect(ok({ ...area, score: -1 })).toBe(false);
    expect(ok({ ...area, score: 66.5 })).toBe(false);
  });

  it('aceita nota 0 quando houve planejado e nada concluído', () => {
    expect(ok({ ...area, completed: 0, score: 0 })).toBe(true);
  });
});

describe('balanceSchema', () => {
  it('traz a janela e as áreas', () => {
    expect(
      balanceSchema.safeParse({ windowStart: '2026-09-11', windowEnd: '2026-10-08', areas: [area] })
        .success,
    ).toBe(true);
    expect(
      balanceSchema.safeParse({ windowStart: '2026-02-30', windowEnd: '2026-10-08', areas: [] })
        .success,
    ).toBe(false);
  });
});
