import type { ConsistencyDay } from '@lifexp/shared';
import { describe, expect, it } from 'vitest';
import { buildGrid, cellTitle, levelOf, summarize, summaryText } from './heatmapModel';

const day = (date: string, planned = 0, completed = 0): ConsistencyDay => ({
  date,
  planned,
  completed,
});

describe('levelOf', () => {
  it.each([
    [0, 0, 'rest'],
    [3, 0, 'none'],
    [4, 1, 'low'],
    [4, 2, 'mid'],
    [4, 3, 'high'],
    [4, 4, 'full'],
    [1, 1, 'full'],
    [3, 1, 'low'],
    [3, 2, 'mid'],
  ] as const)('%i planejados, %i concluídos = %s', (planned, completed, level) => {
    expect(levelOf({ planned, completed })).toBe(level);
  });

  it('plano sem nada concluído NUNCA é tratado como falha: é só um aro vazio', () => {
    expect(levelOf({ planned: 5, completed: 0 })).toBe('none');
    expect(levelOf({ planned: 5, completed: 0 })).not.toBe('rest');
  });
});

describe('buildGrid', () => {
  // 2026-10-05 é segunda; hoje = quarta 2026-10-07; começa duas semanas antes.
  const days = [
    ...Array.from({ length: 14 }, (_, i) =>
      day(`2026-09-${String(21 + i).padStart(2, '0')}`),
    ).slice(0, 10),
    day('2026-10-01'),
    day('2026-10-02'),
    day('2026-10-03'),
    day('2026-10-04'),
    day('2026-10-05', 2, 2),
    day('2026-10-06', 1, 0),
    day('2026-10-07'),
  ];
  const columns = buildGrid({ start: '2026-09-21', days });

  it('uma coluna por semana, cada uma com 7 células de segunda a domingo', () => {
    expect(columns.map((column) => column.weekStart)).toEqual([
      '2026-09-21',
      '2026-09-28',
      '2026-10-05',
    ]);
    expect(columns.every((column) => column.cells.length === 7)).toBe(true);
    expect(columns[2]!.cells.map((cell) => cell.date)).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
    ]);
  });

  it('o resto da semana atual vira célula futura, sem nível', () => {
    const cells = columns[2]!.cells;
    expect(cells.slice(0, 3).every((cell) => cell.kind === 'day')).toBe(true);
    expect(cells.slice(3).every((cell) => cell.kind === 'future')).toBe(true);
  });

  it('calcula o nível de cada dia', () => {
    const [monday, tuesday, wednesday] = columns[2]!.cells;
    expect(monday).toMatchObject({ level: 'full', planned: 2, completed: 2 });
    expect(tuesday).toMatchObject({ level: 'none' });
    expect(wednesday).toMatchObject({ level: 'rest' });
  });

  it('o mês aparece só na primeira semana dele', () => {
    expect(columns.map((column) => column.monthLabel)).toEqual(['set', null, 'out']);
  });

  it('atravessa a virada de ano', () => {
    const grid = buildGrid({
      start: '2026-12-21',
      days: ['2026-12-21', '2026-12-28', '2027-01-04'].map((d) => day(d)),
    });
    expect(grid.map((column) => column.monthLabel)).toEqual(['dez', null, 'jan']);
  });
});

describe('summarize / summaryText', () => {
  const days = [
    day('2026-10-01', 2, 2),
    day('2026-10-02', 1, 0),
    day('2026-10-03', 3, 1),
    day('2026-10-04'),
  ];

  it('conta dias ativos, dias com plano e blocos concluídos', () => {
    expect(summarize(days)).toEqual({ activeDays: 2, plannedDays: 3, completedBlocks: 3 });
  });

  it('frase em tom de conquista, com singular e plural', () => {
    expect(summaryText(summarize(days))).toBe(
      '3 blocos concluídos em 2 dias (de 3 dias com plano).',
    );
    expect(summaryText({ activeDays: 1, plannedDays: 1, completedBlocks: 1 })).toBe(
      '1 bloco concluído em 1 dia (de 1 dia com plano).',
    );
  });

  it('sem plano ou sem conclusão, convida em vez de cobrar', () => {
    expect(summaryText({ activeDays: 0, plannedDays: 0, completedBlocks: 0 })).toContain(
      'Nenhum bloco planejado',
    );
    const text = summaryText({ activeDays: 0, plannedDays: 4, completedBlocks: 0 });
    expect(text).toContain('O primeiro acende o mapa');
    expect(text).not.toMatch(/falt|perdeu|nenhum dia/i);
  });
});

describe('cellTitle', () => {
  it('descreve cada tipo de dia', () => {
    const [monday, tuesday, wednesday, thursday] = buildGrid({
      start: '2026-10-05',
      days: [day('2026-10-05', 4, 3), day('2026-10-06', 1, 0), day('2026-10-07')],
    })[0]!.cells;
    expect(cellTitle(monday!)).toBe('05/10: 3 de 4 blocos concluídos');
    expect(cellTitle(tuesday!)).toBe('06/10: 0 de 1 bloco concluído');
    expect(cellTitle(wednesday!)).toBe('07/10: sem blocos planejados');
    expect(cellTitle(thursday!)).toBe('08/10');
  });
});
