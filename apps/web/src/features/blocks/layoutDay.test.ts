import { describe, expect, it } from 'vitest';
import { DEFAULT_HOUR_RANGE, layoutDay, visibleHourRange } from './layoutDay';

const block = (name: string, startTime: string, durationMin: number) => ({
  name,
  startTime,
  durationMin,
});
const laneOf = (laid: ReturnType<typeof layoutDay<ReturnType<typeof block>>>, name: string) =>
  laid.find((entry) => entry.item.name === name)!;

describe('layoutDay', () => {
  it('um bloco sozinho ocupa a largura toda', () => {
    const [only] = layoutDay([block('a', '09:00', 60)]);
    expect(only).toMatchObject({ lane: 0, lanes: 1 });
  });

  it('blocos em horários diferentes não dividem a largura', () => {
    const laid = layoutDay([block('a', '09:00', 60), block('b', '11:00', 60)]);
    expect(laid.map((entry) => entry.lanes)).toEqual([1, 1]);
  });

  it('blocos que apenas se encostam (fim = início) NÃO se sobrepõem', () => {
    const laid = layoutDay([block('a', '09:00', 60), block('b', '10:00', 60)]);
    expect(laid.map((entry) => [entry.lane, entry.lanes])).toEqual([
      [0, 1],
      [0, 1],
    ]);
  });

  it('um minuto de sobreposição já divide a largura', () => {
    const laid = layoutDay([block('a', '09:00', 65), block('b', '10:00', 60)]);
    expect(laid.map((entry) => entry.lanes)).toEqual([2, 2]);
    expect(laneOf(laid, 'a').lane).not.toBe(laneOf(laid, 'b').lane);
  });

  it('blocos idênticos ficam lado a lado, cada um na sua coluna', () => {
    const laid = layoutDay([
      block('a', '09:00', 60),
      block('b', '09:00', 60),
      block('c', '09:00', 60),
    ]);
    expect(laid.map((entry) => entry.lanes)).toEqual([3, 3, 3]);
    expect(new Set(laid.map((entry) => entry.lane)).size).toBe(3);
  });

  it('bloco que encosta no fim de um grupo de várias colunas volta a ter a largura toda', () => {
    const laid = layoutDay([
      block('A', '09:00', 60),
      block('B', '09:30', 60), // sobrepõe A: grupo de 2 colunas até 10:30
      block('C', '10:30', 30), // começa exatamente quando o grupo termina
    ]);
    expect(laneOf(laid, 'A').lanes).toBe(2);
    expect(laneOf(laid, 'B').lanes).toBe(2);
    expect(laneOf(laid, 'C')).toMatchObject({ lane: 0, lanes: 1 });
  });

  it('blocos que não se sobrepõem têm largura toda mesmo quando chegam fora de ordem', () => {
    const laid = layoutDay([
      block('tarde', '15:00', 60),
      block('manha', '09:00', 60),
      block('meio', '12:00', 30),
    ]);
    expect(laid.map((entry) => [entry.item.name, entry.lane, entry.lanes])).toEqual([
      ['manha', 0, 1],
      ['meio', 0, 1],
      ['tarde', 0, 1],
    ]);
  });

  it('reaproveita a coluna livre: A longo, B e C curtos em sequência dentro dele', () => {
    const laid = layoutDay([
      block('A', '09:00', 180),
      block('B', '09:00', 60),
      block('C', '10:00', 60),
    ]);
    expect(laid.every((entry) => entry.lanes === 2)).toBe(true);
    expect(laneOf(laid, 'B').lane).toBe(laneOf(laid, 'C').lane); // C reusa a coluna de B
    expect(laneOf(laid, 'A').lane).not.toBe(laneOf(laid, 'B').lane);
  });

  it('grupos separados dividem a largura de forma independente', () => {
    const laid = layoutDay([
      block('a', '08:00', 60),
      block('b', '08:30', 60), // sobrepõe a
      block('c', '12:00', 60), // sozinho
    ]);
    expect(laneOf(laid, 'a').lanes).toBe(2);
    expect(laneOf(laid, 'b').lanes).toBe(2);
    expect(laneOf(laid, 'c').lanes).toBe(1);
  });

  it('cadeia de sobreposições (A-B e B-C, sem A-C) forma um único grupo', () => {
    const laid = layoutDay([
      block('A', '08:00', 60),
      block('B', '08:30', 60),
      block('C', '09:15', 60),
    ]);
    expect(laid.every((entry) => entry.lanes === 2)).toBe(true);
    expect(laneOf(laid, 'A').lane).toBe(laneOf(laid, 'C').lane); // C cabe onde A já terminou
  });

  it('não depende da ordem de entrada', () => {
    const items = [block('a', '09:00', 120), block('b', '10:00', 60), block('c', '09:30', 30)];
    const normalize = (laid: ReturnType<typeof layoutDay<(typeof items)[number]>>) =>
      laid.map((entry) => `${entry.item.name}:${entry.lane}/${entry.lanes}`).sort();
    expect(normalize(layoutDay([...items].reverse()))).toEqual(normalize(layoutDay(items)));
  });

  it('lista vazia devolve vazio e não altera a entrada', () => {
    expect(layoutDay([])).toEqual([]);
    const items = [block('b', '10:00', 60), block('a', '09:00', 60)];
    layoutDay(items);
    expect(items.map((item) => item.name)).toEqual(['b', 'a']);
  });
});

describe('visibleHourRange', () => {
  it('usa 06h–22h quando os blocos cabem', () => {
    expect(visibleHourRange([block('a', '09:00', 60)])).toEqual(DEFAULT_HOUR_RANGE);
    expect(visibleHourRange([])).toEqual(DEFAULT_HOUR_RANGE);
  });

  it('amplia para cima e para baixo para não cortar blocos fora da faixa', () => {
    expect(visibleHourRange([block('madrugada', '04:30', 60)]).start).toBe(4);
    expect(visibleHourRange([block('noite', '22:30', 90)]).end).toBe(24);
    expect(visibleHourRange([block('noite', '21:00', 125)]).end).toBe(24); // 23:05 -> 24
  });

  it('termina exatamente à meia-noite sem passar de 24', () => {
    expect(visibleHourRange([block('fim', '23:00', 60)]).end).toBe(24);
  });

  it('bloco que termina na hora cheia não amplia a faixa', () => {
    expect(visibleHourRange([block('a', '20:00', 120)]).end).toBe(22);
  });
});
