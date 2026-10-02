import type { XpEntryType, XpHistoryEntry, XpSourceType } from '@lifexp/shared';

export type LedgerType = 'COMPLETION' | 'MILESTONE' | 'GOAL' | 'QUEST' | 'REVERSAL';
type SourceLedgerType = Exclude<LedgerType, 'REVERSAL'>;

const TYPE_TO_API = {
  COMPLETION: 'completion',
  MILESTONE: 'milestone',
  GOAL: 'goal',
  QUEST: 'quest',
  REVERSAL: 'reversal',
} as const satisfies Record<LedgerType, XpEntryType>;

export const TYPE_TO_LEDGER = {
  completion: 'COMPLETION',
  milestone: 'MILESTONE',
  goal: 'GOAL',
  quest: 'QUEST',
  reversal: 'REVERSAL',
} as const satisfies Record<XpEntryType, LedgerType>;

/** Um lançamento do livro-caixa como o banco entrega (com a área e, no estorno, o original). */
export interface LedgerRow {
  id: string;
  type: LedgerType;
  amount: number;
  areaId: string | null;
  areaName: string | null;
  sourceId: string | null;
  createdAt: Date;
  /** Tipo do lançamento estornado; só existe no estorno. */
  reversedType: LedgerType | null;
}

/** Ids das origens a buscar, separados por tipo (uma consulta por tipo, nunca uma por linha). */
export type SourceIds = Record<XpSourceType, string[]>;
/** Nome de cada origem encontrada: `labels.goal.get(id)`; ausente = origem excluída. */
export type SourceLabels = Record<XpSourceType, ReadonlyMap<string, string>>;

/**
 * A origem "de verdade" de um lançamento: no estorno é a do lançamento original (o `sourceId` do
 * estorno repete o do original). Estorno sem original, ou de outro estorno, não tem origem.
 */
function sourceTypeOf(row: LedgerRow): SourceLedgerType | null {
  const type = row.type === 'REVERSAL' ? row.reversedType : row.type;
  return type === null || type === 'REVERSAL' ? null : type;
}

export function collectSourceIds(rows: readonly LedgerRow[]): SourceIds {
  const sets: Record<XpSourceType, Set<string>> = {
    completion: new Set(),
    milestone: new Set(),
    goal: new Set(),
    quest: new Set(),
  };
  for (const row of rows) {
    const type = sourceTypeOf(row);
    if (type !== null && row.sourceId !== null) sets[TYPE_TO_API[type]].add(row.sourceId);
  }
  return {
    completion: [...sets.completion],
    milestone: [...sets.milestone],
    goal: [...sets.goal],
    quest: [...sets.quest],
  };
}

/** Monta o histórico legível (RF53): origem, data, área e estornos. */
export function toHistoryEntries(
  rows: readonly LedgerRow[],
  labels: SourceLabels,
): XpHistoryEntry[] {
  return rows.map((row) => {
    const sourceType = sourceTypeOf(row);
    const source = sourceType === null ? null : TYPE_TO_API[sourceType];
    return {
      id: row.id,
      type: TYPE_TO_API[row.type],
      amount: row.amount,
      areaId: row.areaId,
      areaName: row.areaName,
      createdAt: row.createdAt.toISOString(),
      sourceLabel:
        source !== null && row.sourceId !== null
          ? (labels[source].get(row.sourceId) ?? null)
          : null,
      reversedType: row.type === 'REVERSAL' ? source : null,
    };
  });
}

/** Corta a página pedida de `limit + 1` linhas e diz se há uma próxima (RNF08). */
export function cutPage<T extends { id: string }>(
  rows: readonly T[],
  limit: number,
): { page: T[]; nextCursor: string | null } {
  const page = rows.slice(0, limit);
  return { page, nextCursor: rows.length > limit ? page[page.length - 1]!.id : null };
}
