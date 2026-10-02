import { describe, expect, it } from 'vitest';
import {
  DEFAULT_XP_HISTORY_PAGE,
  MAX_XP_HISTORY_PAGE,
  xpHistoryEntrySchema,
  xpHistoryPageSchema,
  xpHistoryQuerySchema,
} from './xp-history.schema.js';

const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success;

const id = '0192f1a0-7b3c-7000-8000-0000000000a1';
const entry = {
  id,
  type: 'completion',
  amount: 60,
  areaId: id,
  areaName: 'Saúde',
  createdAt: '2026-10-07T12:00:00.000Z',
  sourceLabel: 'Corrida',
  reversedType: null,
};
const reversal = { ...entry, type: 'reversal', amount: -60, reversedType: 'completion' };

describe('xpHistoryEntrySchema', () => {
  it('aceita ganho de bloco, marco e meta, e estorno', () => {
    expect(ok(xpHistoryEntrySchema, entry)).toBe(true);
    expect(ok(xpHistoryEntrySchema, { ...entry, type: 'milestone', amount: 100 })).toBe(true);
    expect(ok(xpHistoryEntrySchema, { ...entry, type: 'goal', amount: 500 })).toBe(true);
    expect(ok(xpHistoryEntrySchema, { ...entry, type: 'quest', amount: 120 })).toBe(true);
    expect(ok(xpHistoryEntrySchema, reversal)).toBe(true);
    expect(ok(xpHistoryEntrySchema, { ...reversal, reversedType: 'quest', amount: -120 })).toBe(
      true,
    );
  });

  it('aceita meta sem área e origem excluída', () => {
    expect(
      ok(xpHistoryEntrySchema, {
        ...entry,
        type: 'goal',
        areaId: null,
        areaName: null,
        sourceLabel: null,
      }),
    ).toBe(true);
  });

  it('recusa origem desconhecida e valor zero', () => {
    expect(ok(xpHistoryEntrySchema, { ...entry, type: 'conquista' })).toBe(false);
    expect(ok(xpHistoryEntrySchema, { ...entry, amount: 0 })).toBe(false);
    expect(ok(xpHistoryEntrySchema, { ...entry, amount: 1.5 })).toBe(false);
  });

  it('só o estorno é negativo e só ele aponta para a origem estornada', () => {
    expect(ok(xpHistoryEntrySchema, { ...entry, amount: -60 })).toBe(false);
    expect(ok(xpHistoryEntrySchema, { ...reversal, amount: 60 })).toBe(false);
    expect(ok(xpHistoryEntrySchema, { ...reversal, reversedType: null })).toBe(false);
    expect(ok(xpHistoryEntrySchema, { ...entry, reversedType: 'goal' })).toBe(false);
    // um estorno nunca estorna outro estorno
    expect(ok(xpHistoryEntrySchema, { ...reversal, reversedType: 'reversal' })).toBe(false);
  });
});

describe('xpHistoryQuerySchema', () => {
  it('sem parâmetros: página padrão, sem filtro nem cursor', () => {
    expect(xpHistoryQuerySchema.parse({})).toEqual({ limit: DEFAULT_XP_HISTORY_PAGE });
  });

  it('converte o limite da query string e aceita filtro e cursor', () => {
    expect(xpHistoryQuerySchema.parse({ limit: '5', type: 'reversal', before: id })).toEqual({
      limit: 5,
      type: 'reversal',
      before: id,
    });
  });

  it('recusa limite fora da faixa, tipo desconhecido e cursor que não é UUID', () => {
    expect(ok(xpHistoryQuerySchema, { limit: '0' })).toBe(false);
    expect(ok(xpHistoryQuerySchema, { limit: String(MAX_XP_HISTORY_PAGE + 1) })).toBe(false);
    expect(ok(xpHistoryQuerySchema, { limit: String(MAX_XP_HISTORY_PAGE) })).toBe(true);
    expect(ok(xpHistoryQuerySchema, { limit: 'abc' })).toBe(false);
    expect(ok(xpHistoryQuerySchema, { type: 'conquista' })).toBe(false);
    expect(ok(xpHistoryQuerySchema, { before: '123' })).toBe(false);
  });
});

describe('xpHistoryPageSchema', () => {
  it('aceita página com e sem próxima', () => {
    expect(ok(xpHistoryPageSchema, { items: [entry, reversal], nextCursor: id })).toBe(true);
    expect(ok(xpHistoryPageSchema, { items: [], nextCursor: null })).toBe(true);
  });
});
