export interface Point {
  x: number;
  y: number;
}

/**
 * Posição do eixo `index` de `count` num radar centrado em (`cx`, `cy`): o primeiro eixo aponta para cima
 * e os demais seguem no sentido horário. `ratio` (0 a 1) é a distância do centro como fração do `radius`.
 */
export function radarPoint(
  index: number,
  count: number,
  ratio: number,
  radius: number,
  cx: number,
  cy: number,
): Point {
  const angle = -Math.PI / 2 + (2 * Math.PI * index) / count;
  const distance = radius * Math.min(1, Math.max(0, ratio));
  return { x: cx + distance * Math.cos(angle), y: cy + distance * Math.sin(angle) };
}

/** Pontos do polígono no formato do atributo `points` do SVG (duas casas, sem ruído de ponto flutuante). */
export const toPolygonPoints = (points: readonly Point[]): string =>
  points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');

/** O radar só faz sentido com 3 ou mais eixos; com menos, só a lista aparece. */
export const MIN_RADAR_AXES = 3;
