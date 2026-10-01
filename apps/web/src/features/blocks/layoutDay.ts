import { timeToMinutes } from '@lifexp/shared';

export interface Positionable {
  startTime: string;
  durationMin: number;
}

export interface Laid<T extends Positionable> {
  item: T;
  /** Coluna dentro do grupo de blocos que se sobrepõem (0, 1, 2...). */
  lane: number;
  /** Quantas colunas o grupo tem; a largura do bloco é 1/lanes. */
  lanes: number;
}

/**
 * Distribui blocos sobrepostos lado a lado (sobreposição é permitida, decisão do produto).
 * Blocos que apenas se encostam (um termina quando o outro começa) NÃO se sobrepõem.
 * Cada grupo de blocos encadeados por sobreposição divide a largura igualmente.
 */
export function layoutDay<T extends Positionable>(items: readonly T[]): Laid<T>[] {
  const sorted = [...items].sort(
    (a, b) =>
      timeToMinutes(a.startTime) - timeToMinutes(b.startTime) || b.durationMin - a.durationMin,
  );

  const result: Laid<T>[] = [];
  let cluster: { item: T; lane: number }[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;

  const flush = () => {
    for (const entry of cluster) result.push({ ...entry, lanes: laneEnds.length });
    cluster = [];
    laneEnds = [];
  };

  for (const item of sorted) {
    const start = timeToMinutes(item.startTime);
    const end = start + item.durationMin;

    if (cluster.length > 0 && start >= clusterEnd) flush();

    const free = laneEnds.findIndex((laneEnd) => laneEnd <= start);
    const lane = free === -1 ? laneEnds.length : free;
    laneEnds[lane] = end;
    cluster.push({ item, lane });
    clusterEnd = Math.max(clusterEnd, end);
  }
  flush();

  return result;
}

export interface HourRange {
  /** Primeira hora exibida (inclusive). */
  start: number;
  /** Hora final exibida (exclusive): a grade vai até o fim da hora anterior a ela. */
  end: number;
}

export const DEFAULT_HOUR_RANGE: HourRange = { start: 6, end: 22 };

/** Faixa padrão 06h–22h, ampliada para nunca cortar um bloco fora desse intervalo. */
export function visibleHourRange(items: readonly Positionable[]): HourRange {
  let { start, end } = DEFAULT_HOUR_RANGE;
  for (const item of items) {
    const itemStart = timeToMinutes(item.startTime);
    start = Math.min(start, Math.floor(itemStart / 60));
    end = Math.max(end, Math.ceil((itemStart + item.durationMin) / 60));
  }
  return { start, end };
}
