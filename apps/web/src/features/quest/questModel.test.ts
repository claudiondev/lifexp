import { describe, expect, it } from 'vitest';
import type { Quest } from '@lifexp/shared';
import { describeQuest, hasQuest } from './questModel';

const quest = (over: Partial<Quest> = {}): Quest => ({
  weekStart: '2026-10-05',
  status: 'active',
  eligible: 5,
  completed: 1,
  target: 4,
  ratio: 0.2,
  bonusXp: 120,
  tiers: [
    { percent: 80, requiredCount: 4, reached: false },
    { percent: 90, requiredCount: 5, reached: false },
    { percent: 100, requiredCount: 5, reached: false },
  ],
  completedAt: null,
  ...over,
});

describe('hasQuest', () => {
  it('só há cartão com quest ativa ou cumprida', () => {
    expect(hasQuest(undefined)).toBe(false);
    expect(hasQuest(quest({ status: 'none' }))).toBe(false);
    expect(hasQuest(quest())).toBe(true);
    expect(hasQuest(quest({ status: 'completed' }))).toBe(true);
  });
});

describe('describeQuest', () => {
  it('ativa: diz quantos blocos faltam para o bônus', () => {
    expect(describeQuest(quest())).toEqual({
      headline: 'Quest da semana',
      detail: 'Faltam 3 blocos para o bônus de 120 XP (1 concluído de 5).',
      progress: 0.2,
    });
  });

  it('usa o singular quando falta um só', () => {
    expect(describeQuest(quest({ completed: 3, ratio: 0.6 })).detail).toBe(
      'Faltam 1 bloco para o bônus de 120 XP (3 concluídos de 5).',
    );
  });

  it('cumprida: comemora e mostra o bônus', () => {
    const view = describeQuest(quest({ status: 'completed', completed: 4, ratio: 0.8 }));
    expect(view.headline).toBe('Quest da semana cumprida!');
    expect(view.detail).toContain('120 XP');
    expect(view.progress).toBe(0.8);
  });

  it('com tudo pulado não cobra nada e a barra fica vazia', () => {
    const view = describeQuest(quest({ eligible: 0, completed: 0, target: 0, ratio: null }));
    expect(view.detail).toBe('Todos os blocos da quest foram pulados: nada a cobrar nesta semana.');
    expect(view.progress).toBe(0);
  });

  it('nunca mostra falta negativa', () => {
    expect(describeQuest(quest({ completed: 5, ratio: 1, target: 4 })).detail).toContain(
      'Faltam 0 blocos',
    );
  });
});
