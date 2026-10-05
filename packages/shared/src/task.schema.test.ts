import { describe, expect, it } from 'vitest';
import {
  MAX_OPEN_TASKS,
  MAX_TASK_ITEMS,
  TASK_DAILY_XP_CAP,
  TASK_XP,
  createTaskItemSchema,
  createTaskSchema,
  creditableTaskXp,
  listTasksQuerySchema,
  taskXp,
  updateTaskItemSchema,
  updateTaskSchema,
} from './task.schema.js';

const area = '0192f1a0-7b3c-7000-8000-000000000001';

describe('XP das tarefas', () => {
  it('é fixo por prioridade: 10, 20 e 40', () => {
    expect(TASK_XP).toEqual({ low: 10, medium: 20, high: 40 });
    expect([taskXp('low'), taskXp('medium'), taskXp('high')]).toEqual([10, 20, 40]);
  });

  it('o teto diário é 100 e o limite de passos e de tarefas abertas são os combinados', () => {
    expect(TASK_DAILY_XP_CAP).toBe(100);
    expect(MAX_TASK_ITEMS).toBe(20);
    expect(MAX_OPEN_TASKS).toBe(500);
  });

  it('com espaço de sobra rende o XP cheio da prioridade', () => {
    expect(creditableTaskXp('high', 0)).toBe(40);
    expect(creditableTaskXp('medium', 60)).toBe(20);
    expect(creditableTaskXp('low', 90)).toBe(10);
  });

  it('perto do teto rende só o que cabe', () => {
    expect(creditableTaskXp('high', 80)).toBe(20);
    expect(creditableTaskXp('high', 99)).toBe(1);
    expect(creditableTaskXp('medium', 95)).toBe(5);
  });

  it('com o teto atingido (ou passado) rende 0, nunca negativo', () => {
    expect(creditableTaskXp('high', 100)).toBe(0);
    expect(creditableTaskXp('low', 100)).toBe(0);
    expect(creditableTaskXp('high', 250)).toBe(0);
  });

  it('uso negativo (não deveria existir) não abre espaço além do teto', () => {
    expect(creditableTaskXp('high', -50)).toBe(40);
  });

  it('o teto vale por soma: três de 40 rendem 40, 40 e 20', () => {
    let used = 0;
    const gained: number[] = [];
    for (let index = 0; index < 4; index += 1) {
      const xp = creditableTaskXp('high', used);
      gained.push(xp);
      used += xp;
    }
    expect(gained).toEqual([40, 40, 20, 0]);
  });
});

describe('createTaskSchema', () => {
  it('só o título já basta; a prioridade padrão é média', () => {
    const parsed = createTaskSchema.parse({ title: 'Comprar pão' });
    expect(parsed).toMatchObject({ title: 'Comprar pão', priority: 'medium' });
    expect(parsed.dueDate).toBeUndefined();
  });

  it('apara o título e a anotação; anotação vazia vira nula', () => {
    const parsed = createTaskSchema.parse({ title: '  a  ', note: '  b  ' });
    expect(parsed).toMatchObject({ title: 'a', note: 'b' });
    expect(createTaskSchema.parse({ title: 'a', note: '   ' }).note).toBeNull();
  });

  it('título de 1 a 120 caracteres', () => {
    expect(createTaskSchema.safeParse({ title: '' }).success).toBe(false);
    expect(createTaskSchema.safeParse({ title: '   ' }).success).toBe(false);
    expect(createTaskSchema.safeParse({ title: 'a'.repeat(121) }).success).toBe(false);
    expect(createTaskSchema.safeParse({ title: 'a'.repeat(120) }).success).toBe(true);
    expect(createTaskSchema.safeParse({}).success).toBe(false);
  });

  it('anotação de até 500 caracteres', () => {
    expect(createTaskSchema.safeParse({ title: 'a', note: 'x'.repeat(500) }).success).toBe(true);
    expect(createTaskSchema.safeParse({ title: 'a', note: 'x'.repeat(501) }).success).toBe(false);
  });

  it('aceita dia, área e meta, ou nulos', () => {
    expect(
      createTaskSchema.safeParse({
        title: 'a',
        dueDate: '2026-10-07',
        areaId: area,
        goalId: area,
        priority: 'high',
      }).success,
    ).toBe(true);
    expect(
      createTaskSchema.safeParse({ title: 'a', dueDate: null, areaId: null, goalId: null }).success,
    ).toBe(true);
  });

  it('recusa data inválida, prioridade desconhecida e ids que não são UUID', () => {
    for (const bad of [
      { dueDate: '2026-02-30' },
      { dueDate: '07/10/2026' },
      { priority: 'urgent' },
      { priority: 'HIGH' },
      { areaId: 'x' },
      { goalId: 'x' },
    ]) {
      expect([
        JSON.stringify(bad),
        createTaskSchema.safeParse({ title: 'a', ...bad }).success,
      ]).toEqual([JSON.stringify(bad), false]);
    }
  });

  it('recusa campos desconhecidos (RS07): userId, XP e conclusão não vêm do cliente', () => {
    for (const extra of [
      { userId: area },
      { xpAwarded: 40 },
      { completedAt: null },
      { id: area },
    ]) {
      expect(createTaskSchema.safeParse({ title: 'a', ...extra }).success).toBe(false);
    }
  });
});

describe('updateTaskSchema', () => {
  it('exige ao menos um campo', () => {
    expect(updateTaskSchema.safeParse({}).success).toBe(false);
    expect(updateTaskSchema.safeParse({ title: 'novo' }).success).toBe(true);
  });

  it('nulo é um valor válido (limpa) e vazio na anotação também limpa', () => {
    const parsed = updateTaskSchema.parse({
      note: null,
      dueDate: null,
      areaId: null,
      goalId: null,
    });
    expect(parsed).toEqual({ note: null, dueDate: null, areaId: null, goalId: null });
    expect(updateTaskSchema.parse({ note: '  ' }).note).toBeNull();
  });

  it('campo ausente continua ausente (mantém o valor atual)', () => {
    expect(updateTaskSchema.parse({ title: 'a' })).not.toHaveProperty('note');
  });

  it('recusa título vazio, campo desconhecido e tentar mexer em XP ou conclusão', () => {
    expect(updateTaskSchema.safeParse({ title: ' ' }).success).toBe(false);
    expect(updateTaskSchema.safeParse({ title: 'a', xpAwarded: 1 }).success).toBe(false);
    expect(updateTaskSchema.safeParse({ completedAt: null }).success).toBe(false);
  });
});

describe('passos do checklist', () => {
  it('criar: título de 1 a 120, aparado, e nada além disso', () => {
    expect(createTaskItemSchema.parse({ title: '  malas ' }).title).toBe('malas');
    expect(createTaskItemSchema.safeParse({ title: '' }).success).toBe(false);
    expect(createTaskItemSchema.safeParse({ title: 'a'.repeat(121) }).success).toBe(false);
    expect(createTaskItemSchema.safeParse({ title: 'a', done: true }).success).toBe(false);
  });

  it('editar: título e/ou done, ao menos um', () => {
    expect(updateTaskItemSchema.safeParse({}).success).toBe(false);
    expect(updateTaskItemSchema.safeParse({ done: false }).success).toBe(true);
    expect(updateTaskItemSchema.safeParse({ title: 'novo' }).success).toBe(true);
    expect(updateTaskItemSchema.safeParse({ title: ' ' }).success).toBe(false);
    expect(updateTaskItemSchema.safeParse({ done: 'sim' }).success).toBe(false);
  });
});

describe('listTasksQuerySchema', () => {
  it('o padrão é Hoje; aceita inbox; recusa outro valor', () => {
    expect(listTasksQuerySchema.parse({}).scope).toBe('today');
    expect(listTasksQuerySchema.parse({ scope: 'inbox' }).scope).toBe('inbox');
    expect(listTasksQuerySchema.safeParse({ scope: 'tudo' }).success).toBe(false);
  });
});
