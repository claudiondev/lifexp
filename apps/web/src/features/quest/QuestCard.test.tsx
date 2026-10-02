import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Quest } from '@lifexp/shared';
import { QuestCard } from './QuestCard';

const quest = (over: Partial<Quest> = {}): Quest => ({
  weekStart: '2026-10-05',
  status: 'active',
  eligible: 5,
  completed: 4,
  target: 4,
  ratio: 0.8,
  bonusXp: 120,
  tiers: [
    { percent: 80, requiredCount: 4, reached: true },
    { percent: 90, requiredCount: 5, reached: false },
    { percent: 100, requiredCount: 5, reached: false },
  ],
  completedAt: null,
  ...over,
});

describe('QuestCard', () => {
  it('mostra o bônus, o progresso acessível e as faixas alcançadas', () => {
    render(<QuestCard quest={quest()} />);

    expect(screen.getByText('+120 XP')).toBeInTheDocument();
    const bar = screen.getByRole('progressbar', { name: 'Aderência da semana' });
    expect(bar).toHaveAttribute('aria-valuenow', '80');
    expect(bar).toHaveAttribute('aria-valuetext', '4 de 5 blocos (80%)');
    const tiers = within(screen.getByRole('list', { name: 'Faixas de aderência' })).getAllByRole(
      'listitem',
    );
    expect(tiers.map((tier) => tier.textContent)).toEqual(['80% alcançada', '90%', '100%']);
  });

  it('arredonda a porcentagem para o inteiro mais próximo', () => {
    render(<QuestCard quest={quest({ eligible: 3, completed: 2, ratio: 2 / 3 })} />);

    expect(screen.getByRole('progressbar', { name: 'Aderência da semana' })).toHaveAttribute(
      'aria-valuenow',
      '67',
    );
  });

  it('cumprida mostra a comemoração', () => {
    render(<QuestCard quest={quest({ status: 'completed' })} />);

    expect(screen.getByRole('heading', { name: 'Quest da semana cumprida!' })).toBeInTheDocument();
  });
});
