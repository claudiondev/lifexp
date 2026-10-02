import { describe, expect, it } from 'vitest';
import type { XpHistoryEntry } from '@lifexp/shared';
import { progressKey } from '../character/useProgress';
import { xpHistoryKey } from './useXpHistory';
import {
  dayHeading,
  entryKind,
  entryTime,
  entryTitle,
  formatAmount,
  groupByDay,
} from './xpHistoryFormat';

const entry = (over: Partial<XpHistoryEntry> = {}): XpHistoryEntry => ({
  id: '0192f1a0-7b3c-7000-8000-0000000000a1',
  type: 'completion',
  amount: 60,
  areaId: null,
  areaName: null,
  createdAt: '2026-10-07T15:00:00.000Z',
  sourceLabel: 'Corrida',
  reversedType: null,
  ...over,
});
const reversal = (reversedType: XpHistoryEntry['reversedType'], over = {}) =>
  entry({ type: 'reversal', amount: -60, reversedType, ...over });

describe('entryTitle', () => {
  it('usa o nome da origem quando ela existe', () => {
    expect(entryTitle(entry())).toBe('Corrida');
    expect(entryTitle(reversal('goal', { sourceLabel: 'Escrever o livro' }))).toBe(
      'Escrever o livro',
    );
  });

  it('origem excluída: diz o que era, sem inventar nome', () => {
    expect(entryTitle(entry({ type: 'milestone', sourceLabel: null }))).toBe('Marco excluído');
    expect(entryTitle(entry({ type: 'goal', sourceLabel: null }))).toBe('Meta excluída');
    expect(entryTitle(entry({ sourceLabel: null }))).toBe('Bloco concluído');
    // no estorno, o que foi excluído é a origem do lançamento estornado
    expect(entryTitle(reversal('goal', { sourceLabel: null }))).toBe('Meta excluída');
    expect(entryTitle(reversal('milestone', { sourceLabel: null }))).toBe('Marco excluído');
    expect(entryTitle(entry({ type: 'quest', sourceLabel: null }))).toBe('Quest da semana');
    expect(entryTitle(reversal('quest', { sourceLabel: null }))).toBe('Quest da semana');
  });
});

describe('entryKind', () => {
  it('nomeia a origem e, no estorno, o que foi estornado', () => {
    expect(entryKind(entry())).toBe('Bloco');
    expect(entryKind(entry({ type: 'milestone' }))).toBe('Marco');
    expect(entryKind(entry({ type: 'goal' }))).toBe('Meta');
    expect(entryKind(reversal('completion'))).toBe('Estorno de bloco');
    expect(entryKind(reversal('milestone'))).toBe('Estorno de marco');
    expect(entryKind(reversal('goal'))).toBe('Estorno de meta');
    expect(entryKind(entry({ type: 'quest' }))).toBe('Quest');
    expect(entryKind(reversal('quest'))).toBe('Estorno de quest');
  });
});

describe('formatAmount', () => {
  it('mostra o sinal sempre', () => {
    expect(formatAmount(60)).toBe('+60 XP');
    expect(formatAmount(-500)).toBe('−500 XP');
    expect(formatAmount(0)).toBe('+0 XP');
  });
});

describe('entryTime', () => {
  it('mostra a hora no fuso da pessoa, não no do navegador', () => {
    expect(entryTime('2026-10-07T15:05:00.000Z', 'America/Sao_Paulo')).toBe('12:05');
    expect(entryTime('2026-10-07T15:05:00.000Z', 'Asia/Tokyo')).toBe('00:05');
  });
});

describe('groupByDay', () => {
  const entries = [
    entry({ id: 'e4', createdAt: '2026-10-08T02:30:00.000Z', amount: 100 }), // 07/10 23:30 em SP
    entry({ id: 'e3', createdAt: '2026-10-07T15:00:00.000Z', amount: -60 }),
    entry({ id: 'e2', createdAt: '2026-10-07T03:10:00.000Z', amount: 60 }), // 07/10 00:10 em SP
    entry({ id: 'e1', createdAt: '2026-10-07T02:50:00.000Z', amount: 30 }), // 06/10 23:50 em SP
  ];

  it('agrupa pelo dia local, mantém a ordem e soma o saldo do dia', () => {
    const days = groupByDay(entries, 'America/Sao_Paulo');
    expect(days.map((d) => [d.date, d.entries.map((e) => e.id), d.total])).toEqual([
      ['2026-10-07', ['e4', 'e3', 'e2'], 100],
      ['2026-10-06', ['e1'], 30],
    ]);
  });

  it('o mesmo instante cai em dias diferentes conforme o fuso', () => {
    const days = groupByDay(entries, 'UTC');
    expect(days.map((d) => [d.date, d.entries.length])).toEqual([
      ['2026-10-08', 1],
      ['2026-10-07', 3],
    ]);
  });

  it('lista vazia não tem dias', () => {
    expect(groupByDay([], 'UTC')).toEqual([]);
  });
});

describe('dayHeading', () => {
  it('"Hoje", "Ontem" e a data por extenso, inclusive na virada de mês', () => {
    expect(dayHeading('2026-10-01', '2026-10-01')).toBe('Hoje');
    expect(dayHeading('2026-09-30', '2026-10-01')).toBe('Ontem');
    expect(dayHeading('2026-09-29', '2026-10-01')).toBe('29 de setembro de 2026');
    expect(dayHeading('2026-10-02', '2026-10-01')).toBe('2 de outubro de 2026');
  });
});

describe('xpHistoryKey', () => {
  it('fica dentro da chave de progresso: o que invalida o XP invalida o histórico', () => {
    expect(xpHistoryKey.slice(0, progressKey.length)).toEqual([...progressKey]);
    expect(xpHistoryKey.length).toBeGreaterThan(progressKey.length);
  });
});
