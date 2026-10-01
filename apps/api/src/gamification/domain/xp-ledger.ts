import { levelForXp } from '@lifexp/shared';

export interface LedgerEntry {
  areaId: string | null;
  /** Positivo para conclusões, negativo para estornos. */
  amount: number;
}

export interface LedgerTotals {
  total: number;
  /** XP por área (só as áreas que aparecem no livro-caixa). */
  byArea: Map<string, number>;
}

/**
 * Soma o livro-caixa (RN29): a fonte da verdade. Os caches (XP total, XP por área) precisam sempre
 * bater com este resultado e podem ser reconstruídos a partir dele.
 */
export function sumLedger(entries: readonly LedgerEntry[]): LedgerTotals {
  const byArea = new Map<string, number>();
  let total = 0;
  for (const { areaId, amount } of entries) {
    total += amount;
    if (areaId !== null) byArea.set(areaId, (byArea.get(areaId) ?? 0) + amount);
  }
  return { total, byArea };
}

export interface XpChange {
  before: number;
  after: number;
  levelBefore: number;
  levelAfter: number;
}

/**
 * Aplica uma variação ao XP e informa os níveis antes e depois (para comemorar a subida).
 * Nunca deixa o XP ficar negativo: isso indicaria um estorno sem a conclusão correspondente (bug).
 */
export function applyXpDelta(currentXp: number, delta: number): XpChange {
  const after = currentXp + delta;
  if (after < 0) {
    throw new RangeError(`O XP não pode ficar negativo (atual ${currentXp}, variação ${delta})`);
  }
  return {
    before: currentXp,
    after,
    levelBefore: levelForXp(currentXp),
    levelAfter: levelForXp(after),
  };
}
