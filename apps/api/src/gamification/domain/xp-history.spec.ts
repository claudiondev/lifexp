import { xpHistoryEntrySchema } from '@lifexp/shared';
import {
  TYPE_TO_LEDGER,
  collectSourceIds,
  cutPage,
  toHistoryEntries,
  type LedgerRow,
  type SourceLabels,
} from './xp-history.js';

const row = (over: Partial<LedgerRow> & Pick<LedgerRow, 'id'>): LedgerRow => ({
  type: 'COMPLETION',
  amount: 60,
  areaId: '0192f1a0-7b3c-7000-8000-0000000000a1',
  areaName: 'Saúde',
  sourceId: 'c1',
  createdAt: new Date('2026-10-07T12:00:00.000Z'),
  reversedType: null,
  ...over,
});
const labels = (over: Partial<SourceLabels> = {}): SourceLabels => ({
  completion: new Map(),
  milestone: new Map(),
  goal: new Map(),
  ...over,
});
const uuid = (n: number) => `0192f1a0-7b3c-7000-8000-00000000000${n}`;

describe('collectSourceIds', () => {
  it('separa as origens por tipo, sem repetir', () => {
    const ids = collectSourceIds([
      row({ id: '1', sourceId: 'c1' }),
      row({ id: '2', sourceId: 'c1' }),
      row({ id: '3', sourceId: 'c2' }),
      row({ id: '4', type: 'MILESTONE', sourceId: 'm1' }),
      row({ id: '5', type: 'GOAL', sourceId: 'g1' }),
    ]);
    expect(ids).toEqual({ completion: ['c1', 'c2'], milestone: ['m1'], goal: ['g1'] });
  });

  it('o estorno busca a origem pelo tipo do lançamento original', () => {
    const ids = collectSourceIds([
      row({ id: '1', type: 'REVERSAL', amount: -100, sourceId: 'm1', reversedType: 'MILESTONE' }),
      row({ id: '2', type: 'REVERSAL', amount: -500, sourceId: 'g1', reversedType: 'GOAL' }),
    ]);
    expect(ids).toEqual({ completion: [], milestone: ['m1'], goal: ['g1'] });
  });

  it('ignora lançamento sem origem e estorno sem original conhecido', () => {
    const ids = collectSourceIds([
      row({ id: '1', sourceId: null }),
      row({ id: '2', type: 'REVERSAL', amount: -1, sourceId: 'x', reversedType: null }),
      row({ id: '3', type: 'REVERSAL', amount: -1, sourceId: 'y', reversedType: 'REVERSAL' }),
    ]);
    expect(ids).toEqual({ completion: [], milestone: [], goal: [] });
  });
});

describe('toHistoryEntries', () => {
  it('traduz o tipo, mantém a ordem e resolve o nome da origem pelo tipo certo', () => {
    const entries = toHistoryEntries(
      [
        row({ id: uuid(3), type: 'GOAL', amount: 500, sourceId: 'same' }),
        row({ id: uuid(2), type: 'MILESTONE', amount: 100, sourceId: 'same' }),
        row({ id: uuid(1), sourceId: 'same' }),
      ],
      labels({
        completion: new Map([['same', 'Corrida']]),
        milestone: new Map([['same', 'Primeiro capítulo']]),
        goal: new Map([['same', 'Escrever o livro']]),
      }),
    );
    expect(entries.map((e) => [e.id, e.type, e.sourceLabel, e.reversedType])).toEqual([
      [uuid(3), 'goal', 'Escrever o livro', null],
      [uuid(2), 'milestone', 'Primeiro capítulo', null],
      [uuid(1), 'completion', 'Corrida', null],
    ]);
    expect(entries[2]).toEqual({
      id: uuid(1),
      type: 'completion',
      amount: 60,
      areaId: '0192f1a0-7b3c-7000-8000-0000000000a1',
      areaName: 'Saúde',
      createdAt: '2026-10-07T12:00:00.000Z',
      sourceLabel: 'Corrida',
      reversedType: null,
    });
    for (const entry of entries) expect(xpHistoryEntrySchema.safeParse(entry).success).toBe(true);
  });

  it('o estorno mostra a origem estornada e o nome dela', () => {
    const [entry] = toHistoryEntries(
      [
        row({
          id: uuid(1),
          type: 'REVERSAL',
          amount: -100,
          sourceId: 'm1',
          reversedType: 'MILESTONE',
        }),
      ],
      labels({
        milestone: new Map([['m1', 'Primeiro capítulo']]),
        completion: new Map([['m1', 'errado']]),
      }),
    );
    expect(entry).toMatchObject({
      type: 'reversal',
      amount: -100,
      reversedType: 'milestone',
      sourceLabel: 'Primeiro capítulo',
    });
    expect(xpHistoryEntrySchema.safeParse(entry).success).toBe(true);
  });

  it('origem excluída, ou lançamento sem origem, fica sem nome (o lançamento continua lá)', () => {
    const entries = toHistoryEntries(
      [
        row({
          id: uuid(1),
          type: 'GOAL',
          amount: 500,
          sourceId: 'apagada',
          areaId: null,
          areaName: null,
        }),
        row({ id: uuid(2), sourceId: null }),
        row({ id: uuid(3), type: 'REVERSAL', amount: -5, sourceId: 'x', reversedType: null }),
      ],
      labels({ goal: new Map([['outra', 'Outra meta']]) }),
    );
    expect(entries.map((e) => e.sourceLabel)).toEqual([null, null, null]);
    expect(entries[0]).toMatchObject({ areaId: null, areaName: null, amount: 500 });
    expect(entries[2]!.reversedType).toBeNull();
  });
});

describe('TYPE_TO_LEDGER', () => {
  it('leva o filtro da API ao tipo do banco', () => {
    expect(TYPE_TO_LEDGER).toEqual({
      completion: 'COMPLETION',
      milestone: 'MILESTONE',
      goal: 'GOAL',
      reversal: 'REVERSAL',
    });
  });
});

describe('cutPage', () => {
  const rows = ['e', 'd', 'c'].map((id) => ({ id }));

  it('com uma linha a mais do que o limite, há próxima página e o cursor é o último item', () => {
    expect(cutPage(rows, 2)).toEqual({ page: [{ id: 'e' }, { id: 'd' }], nextCursor: 'd' });
  });

  it('página exatamente cheia, incompleta ou vazia não promete outra', () => {
    expect(cutPage(rows, 3)).toEqual({ page: rows, nextCursor: null });
    expect(cutPage(rows, 10)).toEqual({ page: rows, nextCursor: null });
    expect(cutPage([], 10)).toEqual({ page: [], nextCursor: null });
  });
});
