import { useProgress } from './useProgress';

export interface Character {
  level: number;
  xp: number;
  /** Progresso de 0 a 1 dentro do nível atual. */
  levelProgress: number;
  /** XP ganho dentro do nível atual e quanto o nível pede ao todo (para "40 / 183"). */
  xpIntoLevel: number;
  xpForNextLevel: number;
  /** Dias planejados seguidos com ao menos um bloco cumprido (dia sem bloco é neutro). */
  streakDays: number;
  /** O maior streak que a pessoa já teve. */
  streakBest: number;
  /** Falso enquanto o progresso real não chegou da API (os números abaixo são o ponto de partida). */
  ready: boolean;
}

/** Estado de uma conta nova: nível 1 e 0 XP. É o que se mostra até a API responder. */
const STARTING_POINT: Character = {
  level: 1,
  xp: 0,
  levelProgress: 0,
  xpIntoLevel: 0,
  xpForNextLevel: 100,
  streakDays: 0,
  streakBest: 0,
  ready: false,
};

export function useCharacter(): Character {
  const { data } = useProgress();
  if (!data) return STARTING_POINT;
  const { total } = data;
  return {
    level: total.level,
    xp: total.xp,
    levelProgress: total.progress,
    xpIntoLevel: total.xpIntoLevel,
    xpForNextLevel: total.xpForNextLevel,
    streakDays: data.streak.current,
    streakBest: data.streak.best,
    ready: true,
  };
}
