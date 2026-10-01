/**
 * Regras de XP e nível (puras, sem framework). Vivem no `shared` para a API e a tela concordarem
 * sobre os mesmos números.
 *
 * Calibração em aberto no documento de requisitos: os valores abaixo são o ponto de partida e
 * ficam concentrados aqui para serem ajustados depois de algumas semanas de uso real.
 */

/** RN03: nenhuma conclusão rende mais que isso. */
export const XP_CAP_PER_COMPLETION = 300;
/** RN05: XP acumulado para atingir o nível n é 100 x n^1,5 (aqui deslocado: veja xpToReachLevel). */
export const LEVEL_XP_BASE = 100;
export const LEVEL_XP_EXPONENT = 1.5;
/** RN02: no MVP o multiplicador do bloco é sempre 1,0 (dificuldade/foco só após a fase 4). */
export const DEFAULT_BLOCK_MULTIPLIER = 1;

export interface XpInput {
  durationMin: number;
  /** Peso da atividade, de 0,5 a 2,0 (RN02). */
  xpWeight: number;
  multiplier?: number;
}

/**
 * RN01 + RN03: XP = duração em minutos x peso da atividade x multiplicador do bloco,
 * arredondado para inteiro e limitado a 300 por ocorrência.
 */
export function calculateXp({
  durationMin,
  xpWeight,
  multiplier = DEFAULT_BLOCK_MULTIPLIER,
}: XpInput): number {
  const raw = durationMin * xpWeight * multiplier;
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.min(XP_CAP_PER_COMPLETION, Math.round(raw));
}

/**
 * XP total necessário para ATINGIR o nível n. Todo personagem começa no nível 1 com 0 XP, então a
 * fórmula da RN05 é deslocada: o nível n (n >= 2) começa em round(100 x (n - 1)^1,5).
 * Ex.: nível 2 em 100 XP, nível 3 em 283, nível 4 em 520, nível 5 em 800.
 */
export function xpToReachLevel(level: number): number {
  if (!Number.isInteger(level) || level <= 1) return 0;
  return Math.round(LEVEL_XP_BASE * (level - 1) ** LEVEL_XP_EXPONENT);
}

/** O maior nível n tal que xpToReachLevel(n) <= totalXp. XP negativo conta como zero. */
export function levelForXp(totalXp: number): number {
  const xp = Math.max(0, Math.floor(totalXp));
  // Inversa da curva sem arredondar. Como os limites reais são arredondados (podem subir até 0,5),
  // a estimativa nunca passa do nível correto, mas às vezes fica um abaixo (364 casos em 2 milhões
  // de valores medidos); o laço abaixo corrige isso.
  let level = Math.floor((xp / LEVEL_XP_BASE) ** (1 / LEVEL_XP_EXPONENT)) + 1;
  while (xpToReachLevel(level + 1) <= xp) level += 1;
  return level;
}

export interface LevelProgress {
  /** XP total acumulado. */
  xp: number;
  level: number;
  /** XP ganho dentro do nível atual. */
  xpIntoLevel: number;
  /** XP que o nível atual exige para o próximo (tamanho do nível). */
  xpForNextLevel: number;
  /** De 0 a 1 dentro do nível atual (alimenta a barra de XP). */
  progress: number;
}

export function levelProgress(totalXp: number): LevelProgress {
  const xp = Math.max(0, Math.floor(totalXp));
  const level = levelForXp(xp);
  const floor = xpToReachLevel(level);
  const span = xpToReachLevel(level + 1) - floor;
  const xpIntoLevel = xp - floor;
  return { xp, level, xpIntoLevel, xpForNextLevel: span, progress: xpIntoLevel / span };
}
