import type { TaskFacts } from './task-lists.js';
import {
  belongsToInbox,
  belongsToToday,
  carriedFrom,
  compareTasks,
  sortTasks,
} from './task-lists.js';

const TODAY = '2026-10-07';
const task = (over: Partial<TaskFacts> = {}): TaskFacts => ({
  dueDate: TODAY,
  priority: 'medium',
  archived: false,
  completedOn: null,
  completedAtMs: null,
  createdAtMs: 1,
  ...over,
});
const done = (over: Partial<TaskFacts> = {}) =>
  task({ completedOn: TODAY, completedAtMs: 100, ...over });

describe('carriedFrom ("vinda de")', () => {
  it('em aberto com dia anterior a hoje devolve o dia original', () => {
    expect(carriedFrom(task({ dueDate: '2026-10-03' }), TODAY)).toBe('2026-10-03');
    expect(carriedFrom(task({ dueDate: '2026-10-06' }), TODAY)).toBe('2026-10-06');
  });

  it('a tarefa de hoje, de amanhã ou sem dia não é "vinda de"', () => {
    expect(carriedFrom(task({ dueDate: TODAY }), TODAY)).toBeNull();
    expect(carriedFrom(task({ dueDate: '2026-10-08' }), TODAY)).toBeNull();
    expect(carriedFrom(task({ dueDate: null }), TODAY)).toBeNull();
  });

  it('tarefa concluída nunca é "vinda de", mesmo com dia antigo', () => {
    expect(carriedFrom(done({ dueDate: '2026-10-03' }), TODAY)).toBeNull();
  });

  it('vira o dia: ontem em aberto passa a "vinda de" hoje', () => {
    const open = task({ dueDate: '2026-10-07' });
    expect(carriedFrom(open, '2026-10-07')).toBeNull();
    expect(carriedFrom(open, '2026-10-08')).toBe('2026-10-07');
  });
});

describe('belongsToToday', () => {
  it('em aberto: o dia de hoje e os anteriores entram (as atrasadas passam sozinhas)', () => {
    expect(belongsToToday(task({ dueDate: TODAY }), TODAY)).toBe(true);
    expect(belongsToToday(task({ dueDate: '2026-10-06' }), TODAY)).toBe(true);
    expect(belongsToToday(task({ dueDate: '2026-01-01' }), TODAY)).toBe(true);
  });

  it('dia futuro e sem dia não entram em Hoje', () => {
    expect(belongsToToday(task({ dueDate: '2026-10-08' }), TODAY)).toBe(false);
    expect(belongsToToday(task({ dueDate: null }), TODAY)).toBe(false);
  });

  it('concluída entra só se foi concluída hoje, qualquer que seja o dia da tarefa', () => {
    expect(belongsToToday(done({ dueDate: '2026-10-01' }), TODAY)).toBe(true);
    expect(belongsToToday(done({ dueDate: null }), TODAY)).toBe(true);
    expect(belongsToToday(done({ completedOn: '2026-10-06' }), TODAY)).toBe(false);
  });

  it('arquivada nunca entra, aberta ou concluída', () => {
    expect(belongsToToday(task({ archived: true }), TODAY)).toBe(false);
    expect(belongsToToday(done({ archived: true }), TODAY)).toBe(false);
  });
});

describe('belongsToInbox (Pendentes)', () => {
  it('só tarefa em aberto, sem dia e não arquivada', () => {
    expect(belongsToInbox(task({ dueDate: null }))).toBe(true);
    expect(belongsToInbox(task({ dueDate: TODAY }))).toBe(false);
    expect(belongsToInbox(done({ dueDate: null }))).toBe(false);
    expect(belongsToInbox(task({ dueDate: null, archived: true }))).toBe(false);
  });
});

describe('ordem da lista', () => {
  it('em aberto antes das concluídas', () => {
    const list = sortTasks([done(), task()]);
    expect(list[0]!.completedOn).toBeNull();
  });

  it('entre as em aberto, o dia mais antigo primeiro', () => {
    const list = sortTasks([
      task({ dueDate: TODAY, createdAtMs: 1 }),
      task({ dueDate: '2026-10-03', createdAtMs: 2 }),
      task({ dueDate: '2026-10-05', createdAtMs: 3 }),
    ]);
    expect(list.map((t) => t.dueDate)).toEqual(['2026-10-03', '2026-10-05', TODAY]);
  });

  it('no mesmo dia, prioridade alta antes da média e da simples', () => {
    const list = sortTasks([
      task({ priority: 'low', createdAtMs: 1 }),
      task({ priority: 'high', createdAtMs: 3 }),
      task({ priority: 'medium', createdAtMs: 2 }),
    ]);
    expect(list.map((t) => t.priority)).toEqual(['high', 'medium', 'low']);
  });

  it('mesmo dia e prioridade: ordem de criação', () => {
    const list = sortTasks([task({ createdAtMs: 9 }), task({ createdAtMs: 4 })]);
    expect(list.map((t) => t.createdAtMs)).toEqual([4, 9]);
  });

  it('sem dia vem depois das que têm dia', () => {
    const list = sortTasks([task({ dueDate: null }), task({ dueDate: TODAY })]);
    expect(list.map((t) => t.dueDate)).toEqual([TODAY, null]);
  });

  it('concluídas: a mais recente primeiro', () => {
    const list = sortTasks([done({ completedAtMs: 100 }), done({ completedAtMs: 300 })]);
    expect(list.map((t) => t.completedAtMs)).toEqual([300, 100]);
  });

  it('não altera a lista original e é estável para iguais', () => {
    const original = [task({ createdAtMs: 2 }), task({ createdAtMs: 1 })];
    const sorted = sortTasks(original);
    expect(original.map((t) => t.createdAtMs)).toEqual([2, 1]);
    expect(sorted).not.toBe(original);
    expect(compareTasks(task(), task())).toBe(0);
  });
});
