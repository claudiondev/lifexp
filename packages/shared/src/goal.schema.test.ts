import { describe, expect, it } from 'vitest';
import {
  createGoalSchema,
  createMilestoneSchema,
  goalSchema,
  listGoalsQuerySchema,
  setGoalStatusSchema,
  updateGoalSchema,
} from './goal.schema.js';

const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success;

describe('createGoalSchema', () => {
  it('aceita só o título', () => {
    expect(ok(createGoalSchema, { title: 'Ler 12 livros' })).toBe(true);
  });

  it('aceita meta completa com métrica, prazo e área', () => {
    expect(
      ok(createGoalSchema, {
        title: 'Correr 100 km',
        description: 'Até o fim do ano',
        areaId: '0192f1a0-7b3c-7000-8000-0000000000b1',
        deadline: '2026-12-31',
        targetValue: 100,
        currentValue: 12.5,
        unit: 'km',
      }),
    ).toBe(true);
  });

  it('apara o título e rejeita vazio ou muito longo', () => {
    expect(createGoalSchema.parse({ title: '  Meta  ' }).title).toBe('Meta');
    expect(ok(createGoalSchema, { title: '   ' })).toBe(false);
    expect(ok(createGoalSchema, { title: 'x'.repeat(121) })).toBe(false);
    expect(ok(createGoalSchema, { title: 'x'.repeat(120) })).toBe(true);
  });

  it('rejeita campo desconhecido (RS07), como o status, que tem rota própria', () => {
    expect(ok(createGoalSchema, { title: 'x', status: 'completed' })).toBe(false);
  });

  it('valor-alvo precisa ser positivo; valor atual não pode ser negativo', () => {
    expect(ok(createGoalSchema, { title: 'x', targetValue: 0 })).toBe(false);
    expect(ok(createGoalSchema, { title: 'x', targetValue: -1 })).toBe(false);
    expect(ok(createGoalSchema, { title: 'x', targetValue: 10, currentValue: -1 })).toBe(false);
    expect(ok(createGoalSchema, { title: 'x', targetValue: 10, currentValue: 0 })).toBe(true);
  });

  it('valor atual e unidade exigem valor-alvo', () => {
    expect(ok(createGoalSchema, { title: 'x', currentValue: 3 })).toBe(false);
    expect(ok(createGoalSchema, { title: 'x', unit: 'km' })).toBe(false);
    expect(ok(createGoalSchema, { title: 'x', currentValue: null, unit: null })).toBe(true);
  });

  it('prazo precisa ser uma data civil válida', () => {
    expect(ok(createGoalSchema, { title: 'x', deadline: '2026-02-30' })).toBe(false);
    expect(ok(createGoalSchema, { title: 'x', deadline: '31/12/2026' })).toBe(false);
  });

  it('áreaId precisa ser um uuid', () => {
    expect(ok(createGoalSchema, { title: 'x', areaId: 'abc' })).toBe(false);
  });
});

describe('updateGoalSchema', () => {
  it('exige ao menos um campo', () => {
    expect(ok(updateGoalSchema, {})).toBe(false);
    expect(ok(updateGoalSchema, { title: 'Novo' })).toBe(true);
  });

  it('aceita nulo para limpar prazo, área, descrição e métrica', () => {
    expect(
      ok(updateGoalSchema, {
        deadline: null,
        areaId: null,
        description: null,
        targetValue: null,
        currentValue: null,
        unit: null,
      }),
    ).toBe(true);
  });

  it('rejeita o status (rota própria) e título vazio', () => {
    expect(ok(updateGoalSchema, { status: 'paused' })).toBe(false);
    expect(ok(updateGoalSchema, { title: ' ' })).toBe(false);
  });
});

describe('demais schemas', () => {
  it('status aceita só os quatro valores', () => {
    for (const status of ['active', 'completed', 'paused', 'abandoned']) {
      expect(ok(setGoalStatusSchema, { status })).toBe(true);
    }
    expect(ok(setGoalStatusSchema, { status: 'ACTIVE' })).toBe(false);
    expect(ok(setGoalStatusSchema, {})).toBe(false);
  });

  it('o filtro da lista é opcional e valida o status', () => {
    expect(ok(listGoalsQuerySchema, {})).toBe(true);
    expect(ok(listGoalsQuerySchema, { status: 'paused' })).toBe(true);
    expect(ok(listGoalsQuerySchema, { status: 'x' })).toBe(false);
  });

  it('marco precisa de título', () => {
    expect(ok(createMilestoneSchema, { title: 'Terminar o capítulo 1' })).toBe(true);
    expect(ok(createMilestoneSchema, { title: '' })).toBe(false);
    expect(ok(createMilestoneSchema, { title: 'x', done: true })).toBe(false);
  });

  it('a resposta da meta traz progresso, atraso e minutos investidos', () => {
    expect(
      ok(goalSchema, {
        id: '0192f1a0-7b3c-7000-8000-0000000000c1',
        areaId: null,
        title: 'Meta',
        description: null,
        deadline: null,
        status: 'active',
        unit: null,
        targetValue: null,
        currentValue: null,
        completedAt: null,
        overdue: false,
        progress: { ratio: null, source: null },
        readyToComplete: false,
        milestones: [],
        investedMinutes: 0,
      }),
    ).toBe(true);
  });
});
