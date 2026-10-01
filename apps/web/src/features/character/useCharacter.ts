export interface Character {
  level: number;
  xp: number;
  /** Progresso de 0 a 1 dentro do nível atual. */
  levelProgress: number;
  streakDays: number;
}

/**
 * Estado inicial de toda conta nova: nível 1, 0 XP e sequência zerada. É verdadeiro hoje porque
 * ainda não existe como ganhar XP; passa a vir da API (ledger de XP e streak) no Marco 1d.
 */
export function useCharacter(): Character {
  return { level: 1, xp: 0, levelProgress: 0, streakDays: 0 };
}
