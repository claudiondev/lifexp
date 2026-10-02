import type { HourRange } from './layoutDay';

/** Ao soltar, o início encaixa de 15 em 15 minutos. */
export const DRAG_SNAP_MIN = 15;
/** Movimento menor que isto ainda é um clique (abre o painel), não um arrasto. */
export const DRAG_THRESHOLD_PX = 5;

const MINUTES_PER_DAY = 24 * 60;
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export function isDrag(deltaX: number, deltaY: number): boolean {
  return Math.hypot(deltaX, deltaY) >= DRAG_THRESHOLD_PX;
}

export interface DragInput {
  /** Coluna de origem: 0 = segunda ... 6 = domingo. */
  dayIndex: number;
  /** Início original, em minutos desde 00:00. */
  startMinutes: number;
  durationMin: number;
  /** Quanto o ponteiro andou desde o início do arrasto, em pixels. */
  deltaX: number;
  deltaY: number;
  /** Largura de uma coluna de dia; 0 quando não foi possível medir (aí o dia não muda). */
  columnWidth: number;
  /** Altura de uma hora na grade. */
  hourPx: number;
  /** Horas visíveis: não dá para soltar fora delas. */
  range: HourRange;
}

export interface DropTarget {
  dayIndex: number;
  startMinutes: number;
}

/**
 * Converte o deslocamento do ponteiro no novo dia e horário (função pura: a grade tem geometria
 * fixa, então não é preciso medir o DOM para decidir onde o bloco cai).
 *
 * - o dia muda de coluna em coluna e nunca sai da semana (mover é só dentro da mesma semana);
 * - o início encaixa em múltiplos de 15 min;
 * - o bloco fica inteiro dentro das horas visíveis e nunca atravessa a meia-noite.
 */
export function computeDrop(input: DragInput): DropTarget {
  const dayShift = input.columnWidth > 0 ? Math.round(input.deltaX / input.columnWidth) : 0;
  const dayIndex = clamp(input.dayIndex + dayShift, 0, 6);

  const moved = input.startMinutes + (input.deltaY / input.hourPx) * 60;
  const snapped = Math.round(moved / DRAG_SNAP_MIN) * DRAG_SNAP_MIN;
  const earliest = input.range.start * 60;
  const latest = Math.min(input.range.end * 60, MINUTES_PER_DAY) - input.durationMin;
  const startMinutes = clamp(snapped, earliest, Math.max(earliest, latest));

  return { dayIndex, startMinutes };
}

/** O deslocamento visual (em pixels) do cartão até o destino já encaixado. */
export function dropOffset(
  input: Pick<DragInput, 'dayIndex' | 'startMinutes' | 'columnWidth' | 'hourPx'>,
  target: DropTarget,
): { x: number; y: number } {
  return {
    x: (target.dayIndex - input.dayIndex) * input.columnWidth,
    y: ((target.startMinutes - input.startMinutes) / 60) * input.hourPx,
  };
}
