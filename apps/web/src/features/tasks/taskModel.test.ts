import { describe, expect, it } from 'vitest';
import type { TaskCompletionResult } from '@lifexp/shared';
import {
  PRIORITY_OPTIONS,
  carriedText,
  completionNotice,
  priorityLabel,
  stepProgress,
  taskCounts,
  xpTodayText,
} from './taskModel';
import { itemId, makeTask } from './testing';

const result = (over: Partial<TaskCompletionResult> = {}): TaskCompletionResult => ({
  task: makeTask({ title: 'Pagar a conta' }),
  alreadyCompleted: false,
  xpAwarded: 20,
  capped: false,
  levelBefore: 1,
  levelAfter: 1,
  total: { xp: 20, level: 1, xpIntoLevel: 20, xpForNextLevel: 100, progress: 0.2 },
  area: null,
  ...over,
});

describe('priorityLabel', () => {
  it('nomeia as três prioridades, em ordem', () => {
    expect(PRIORITY_OPTIONS.map((option) => option.value)).toEqual(['low', 'medium', 'high']);
    expect(['low', 'medium', 'high'].map((p) => priorityLabel(p as 'low'))).toEqual([
      'Simples',
      'Média',
      'Importante',
    ]);
  });
});

describe('carriedText ("vinda de")', () => {
  it('mostra o dia original, sem a palavra atrasada', () => {
    const text = carriedText({ carriedFrom: '2026-10-03' });
    expect(text).toBe('vinda de 3 de outubro de 2026');
    expect(text).not.toMatch(/atras/i);
  });

  it('nada quando a tarefa não ficou para trás', () => {
    expect(carriedText({ carriedFrom: null })).toBeNull();
  });
});

describe('stepProgress e taskCounts', () => {
  it('conta passos feitos e total', () => {
    const task = makeTask({
      items: [
        { id: itemId(1), title: 'a', done: true, doneAt: '2026-10-07T15:00:00.000Z', position: 0 },
        { id: itemId(2), title: 'b', done: false, doneAt: null, position: 1 },
        { id: itemId(3), title: 'c', done: true, doneAt: '2026-10-07T15:00:00.000Z', position: 2 },
      ],
    });
    expect(stepProgress(task)).toEqual({ done: 2, total: 3 });
    expect(stepProgress(makeTask())).toEqual({ done: 0, total: 0 });
  });

  it('conta tarefas concluídas e total', () => {
    expect(
      taskCounts([makeTask({ completedAt: '2026-10-07T15:00:00.000Z' }), makeTask(), makeTask()]),
    ).toEqual({ done: 1, total: 3 });
    expect(taskCounts([])).toEqual({ done: 0, total: 0 });
  });
});

describe('completionNotice (sempre em tom positivo)', () => {
  it('conclusão normal: o XP e o nome da tarefa', () => {
    expect(completionNotice(result())).toEqual({
      title: '+20 XP',
      description: '“Pagar a conta” feita.',
    });
  });

  it('já estava concluída: nada a avisar', () => {
    expect(completionNotice(result({ alreadyCompleted: true, xpAwarded: 0 }))).toBeNull();
  });

  it('o teto diário reduziu o XP: avisa o ganho parcial e explica o limite', () => {
    const notice = completionNotice(result({ xpAwarded: 20, capped: true }))!;
    expect(notice.title).toBe('+20 XP');
    expect(notice.description).toContain('máximo de XP de tarefas de hoje (100)');
    expect(notice.description).toContain('Amanhã');
  });

  it('teto atingido (0 XP): a tarefa conta como feita, sem soar como erro', () => {
    const notice = completionNotice(result({ xpAwarded: 0, capped: true }))!;
    expect(notice.title).toBe('Tarefa feita!');
    expect(notice.description).toContain('“Pagar a conta” feita.');
    expect(notice.description).not.toMatch(/erro|falh|não foi possível/i);
  });
});

describe('xpTodayText', () => {
  it('mostra o XP de tarefas do dia e o teto', () => {
    expect(xpTodayText(40, 100)).toBe('40 / 100 XP de tarefas hoje');
  });
});
