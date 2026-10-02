import { describe, expect, it } from 'vitest';
import {
  DRAG_SNAP_MIN,
  DRAG_THRESHOLD_PX,
  computeDrop,
  dropOffset,
  isDrag,
  type DragInput,
} from './dragGeometry';

/** Quarta (índice 2), 09:00, 60 min, colunas de 100 px, 48 px por hora, grade 06h–22h. */
const base: DragInput = {
  dayIndex: 2,
  startMinutes: 9 * 60,
  durationMin: 60,
  deltaX: 0,
  deltaY: 0,
  columnWidth: 100,
  hourPx: 48,
  range: { start: 6, end: 22 },
};
const drop = (over: Partial<DragInput>) => computeDrop({ ...base, ...over });
const at = (hours: number, minutes = 0) => hours * 60 + minutes;

describe('isDrag', () => {
  it('abaixo do limiar é clique; a partir dele, em qualquer direção, é arrasto', () => {
    expect(DRAG_THRESHOLD_PX).toBe(5);
    expect(isDrag(0, 0)).toBe(false);
    expect(isDrag(3, 3)).toBe(false);
    expect(isDrag(4.9, 0)).toBe(false);
    expect(isDrag(5, 0)).toBe(true);
    expect(isDrag(0, -5)).toBe(true);
    expect(isDrag(-4, -4)).toBe(true);
  });
});

describe('computeDrop: horário', () => {
  it('sem movimento fica onde está', () => {
    expect(drop({})).toEqual({ dayIndex: 2, startMinutes: at(9) });
  });

  it('uma hora de altura move uma hora, para baixo e para cima', () => {
    expect(drop({ deltaY: 48 }).startMinutes).toBe(at(10));
    expect(drop({ deltaY: -96 }).startMinutes).toBe(at(7));
  });

  it('encaixa de 15 em 15 minutos, arredondando para o mais próximo', () => {
    expect(DRAG_SNAP_MIN).toBe(15);
    expect(drop({ deltaY: 12 }).startMinutes).toBe(at(9, 15)); // 15 min exatos
    expect(drop({ deltaY: 5 }).startMinutes).toBe(at(9)); // ~6 min: volta
    expect(drop({ deltaY: 7 }).startMinutes).toBe(at(9, 15)); // ~9 min: avança
    expect(drop({ deltaY: -7 }).startMinutes).toBe(at(8, 45));
  });

  it('um início "quebrado" (09:05) encaixa no múltiplo de 15 ao ser movido', () => {
    expect(drop({ startMinutes: at(9, 5), deltaY: 48 }).startMinutes).toBe(at(10));
  });

  it('respeita a altura da hora informada', () => {
    expect(drop({ hourPx: 96, deltaY: 96 }).startMinutes).toBe(at(10));
  });

  it('não sobe além da primeira hora visível', () => {
    expect(drop({ deltaY: -1000 }).startMinutes).toBe(at(6));
  });

  it('não desce além do fim da grade: o bloco inteiro continua visível', () => {
    expect(drop({ deltaY: 5000 }).startMinutes).toBe(at(21));
    expect(drop({ deltaY: 5000, durationMin: 50 }).startMinutes).toBe(at(21, 10));
    expect(drop({ deltaY: 5000, durationMin: 180 }).startMinutes).toBe(at(19));
  });

  it('nunca atravessa a meia-noite, mesmo com a grade indo até 24h', () => {
    const range = { start: 0, end: 24 };
    const target = drop({ range, deltaY: 5000, durationMin: 90 });
    expect(target.startMinutes).toBe(at(22, 30));
    expect(target.startMinutes + 90).toBeLessThanOrEqual(24 * 60);
    expect(drop({ range, deltaY: -5000 }).startMinutes).toBe(0);
  });

  it('bloco do tamanho da grade inteira não se move no horário', () => {
    const range = { start: 6, end: 18 };
    expect(drop({ range, startMinutes: at(6), durationMin: 720, deltaY: 300 }).startMinutes).toBe(
      at(6),
    );
  });
});

describe('computeDrop: dia', () => {
  it('muda de coluna só depois de passar da metade dela', () => {
    expect(drop({ deltaX: 49 }).dayIndex).toBe(2);
    expect(drop({ deltaX: 51 }).dayIndex).toBe(3);
    expect(drop({ deltaX: -51 }).dayIndex).toBe(1);
    expect(drop({ deltaX: 200 }).dayIndex).toBe(4);
  });

  it('nunca sai da semana (segunda a domingo)', () => {
    expect(drop({ deltaX: -5000 }).dayIndex).toBe(0);
    expect(drop({ deltaX: 5000 }).dayIndex).toBe(6);
    expect(drop({ dayIndex: 0, deltaX: -120 }).dayIndex).toBe(0);
    expect(drop({ dayIndex: 6, deltaX: 120 }).dayIndex).toBe(6);
  });

  it('sem largura medida, o dia não muda (mas o horário sim)', () => {
    expect(drop({ columnWidth: 0, deltaX: 300, deltaY: 48 })).toEqual({
      dayIndex: 2,
      startMinutes: at(10),
    });
  });

  it('dia e horário mudam juntos num arrasto na diagonal', () => {
    expect(drop({ deltaX: 210, deltaY: -72 })).toEqual({ dayIndex: 4, startMinutes: at(7, 30) });
  });
});

describe('dropOffset', () => {
  it('é o deslocamento até o destino encaixado, não o do ponteiro', () => {
    expect(dropOffset(base, { dayIndex: 4, startMinutes: at(7, 30) })).toEqual({ x: 200, y: -72 });
    expect(dropOffset(base, { dayIndex: 2, startMinutes: at(9) })).toEqual({ x: 0, y: 0 });
  });
});
