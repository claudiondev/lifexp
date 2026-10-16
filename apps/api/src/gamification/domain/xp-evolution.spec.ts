import { describe, expect, it } from 'vitest';
import {
  buildEvolution,
  evolutionWeekStarts,
  type EvolutionArea,
  type EvolutionRow,
  type WeekRange,
} from './xp-evolution.js';

const at = (iso: string) => new Date(iso);
const range = (weekStart: string, from: string, to: string): WeekRange => ({
  weekStart,
  from: at(from),
  to: at(to),
});
// Duas semanas em UTC, para os testes não dependerem de fuso.
const W1 = range('2026-10-05', '2026-10-05T00:00:00Z', '2026-10-12T00:00:00Z');
const W2 = range('2026-10-12', '2026-10-12T00:00:00Z', '2026-10-19T00:00:00Z');

const STUDY: EvolutionArea = { id: 'a-study', name: 'Estudo', color: 'violet' };
const HEALTH: EvolutionArea = { id: 'a-health', name: 'Saúde', color: 'moss' };
const row = (areaId: string | null, amount: number, createdAt: string): EvolutionRow => ({
  areaId,
  amount,
  createdAt: at(createdAt),
});

describe('evolutionWeekStarts', () => {
  it('lista da mais antiga para a atual, de 7 em 7 dias', () => {
    expect(evolutionWeekStarts('2026-10-19', 3)).toEqual([
      '2026-10-05',
      '2026-10-12',
      '2026-10-19',
    ]);
  });

  it('com 2 semanas: a anterior e a atual', () => {
    expect(evolutionWeekStarts('2026-10-12', 2)).toEqual(['2026-10-05', '2026-10-12']);
  });

  it('atravessa a virada de ano', () => {
    expect(evolutionWeekStarts('2026-01-05', 3)).toEqual([
      '2025-12-22',
      '2025-12-29',
      '2026-01-05',
    ]);
  });

  it('a última é sempre a semana atual', () => {
    expect(evolutionWeekStarts('2026-10-12', 8).at(-1)).toBe('2026-10-12');
    expect(evolutionWeekStarts('2026-10-12', 8)).toHaveLength(8);
  });
});

describe('buildEvolution', () => {
  it('sem lançamentos: semanas zeradas, nenhuma some', () => {
    expect(buildEvolution([], [W1, W2], [STUDY])).toEqual([
      { weekStart: '2026-10-05', gained: 0, reverted: 0, net: 0, byArea: [] },
      { weekStart: '2026-10-12', gained: 0, reverted: 0, net: 0, byArea: [] },
    ]);
  });

  it('soma ganhos e estornos e calcula o líquido', () => {
    const [week] = buildEvolution(
      [row('a-study', 100, '2026-10-06T10:00:00Z'), row('a-study', -30, '2026-10-07T10:00:00Z')],
      [W1],
      [STUDY],
    );
    expect(week).toMatchObject({ gained: 100, reverted: 30, net: 70 });
    expect(week!.byArea).toEqual([
      { areaId: 'a-study', name: 'Estudo', color: 'violet', amount: 70 },
    ]);
  });

  it('o intervalo é [início, fim): o início entra e o fim vai para a semana seguinte', () => {
    const rows = [
      row('a-study', 10, '2026-10-05T00:00:00Z'),
      row('a-study', 20, '2026-10-12T00:00:00Z'),
    ];
    const [first, second] = buildEvolution(rows, [W1, W2], [STUDY]);
    expect(first!.net).toBe(10);
    expect(second!.net).toBe(20);
  });

  it('estorno cai na semana do estorno, não na do ganho', () => {
    const rows = [
      row('a-study', 60, '2026-10-08T10:00:00Z'),
      row('a-study', -60, '2026-10-13T10:00:00Z'),
    ];
    const [first, second] = buildEvolution(rows, [W1, W2], [STUDY]);
    expect(first).toMatchObject({ gained: 60, reverted: 0, net: 60 });
    expect(second).toMatchObject({ gained: 0, reverted: 60, net: -60 });
  });

  it('área que zerou no líquido some da lista, mas os totais continuam', () => {
    const [week] = buildEvolution(
      [row('a-study', 50, '2026-10-06T10:00:00Z'), row('a-study', -50, '2026-10-07T10:00:00Z')],
      [W1],
      [STUDY],
    );
    expect(week!.byArea).toEqual([]);
    expect(week).toMatchObject({ gained: 50, reverted: 50, net: 0 });
  });

  it('ordena as áreas da maior para a menor e desempata pelo nome', () => {
    const [week] = buildEvolution(
      [
        row('a-health', 40, '2026-10-06T10:00:00Z'),
        row('a-study', 40, '2026-10-06T11:00:00Z'),
        row('a-health', 20, '2026-10-06T12:00:00Z'),
      ],
      [W1],
      [STUDY, HEALTH],
    );
    expect(week!.byArea.map((area) => area.name)).toEqual(['Saúde', 'Estudo']);
    const [tie] = buildEvolution(
      [row('a-health', 40, '2026-10-06T10:00:00Z'), row('a-study', 40, '2026-10-06T11:00:00Z')],
      [W1],
      [STUDY, HEALTH],
    );
    expect(tie!.byArea.map((area) => area.name)).toEqual(['Estudo', 'Saúde']);
  });

  it('lançamento sem área aparece como "Sem área", sem cor', () => {
    const [week] = buildEvolution([row(null, 25, '2026-10-06T10:00:00Z')], [W1], [STUDY]);
    expect(week!.byArea).toEqual([{ areaId: null, name: 'Sem área', color: null, amount: 25 }]);
  });

  it('área que não está mais na lista vira "Área excluída", sem cor', () => {
    const [week] = buildEvolution([row('a-gone', 25, '2026-10-06T10:00:00Z')], [W1], [STUDY]);
    expect(week!.byArea).toEqual([
      { areaId: 'a-gone', name: 'Área excluída', color: null, amount: 25 },
    ]);
  });

  it('ignora lançamento fora de todas as semanas', () => {
    const rows = [
      row('a-study', 99, '2026-09-30T10:00:00Z'),
      row('a-study', 99, '2026-10-20T10:00:00Z'),
    ];
    const weeks = buildEvolution(rows, [W1, W2], [STUDY]);
    expect(weeks.map((week) => week.net)).toEqual([0, 0]);
  });
});
