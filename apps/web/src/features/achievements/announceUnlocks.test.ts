import { beforeEach, describe, expect, it, vi } from 'vitest';
import { announceUnlocks } from './announceUnlocks';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

describe('announceUnlocks', () => {
  beforeEach(() => toast.success.mockClear());

  it('uma mensagem por conquista, com o texto do catálogo', () => {
    announceUnlocks({ achievementsUnlocked: ['constant', 'unshakeable'], rewardsReached: [] });

    expect(toast.success).toHaveBeenCalledTimes(2);
    expect(toast.success).toHaveBeenNthCalledWith(1, 'Conquista desbloqueada: Constante', {
      description: 'Chegue a 7 dias planejados seguidos de streak.',
    });
    expect(toast.success).toHaveBeenNthCalledWith(2, 'Conquista desbloqueada: Inabalável', {
      description: 'Chegue a 30 dias planejados seguidos de streak.',
    });
  });

  it('uma mensagem por recompensa, apontando onde resgatar', () => {
    announceUnlocks({
      achievementsUnlocked: [],
      rewardsReached: [
        { id: '0192f1a0-7b3c-7000-8000-0000000000e1', title: 'Jantar fora' },
        { id: '0192f1a0-7b3c-7000-8000-0000000000e2', title: 'Livro novo' },
      ],
    });

    expect(toast.success).toHaveBeenCalledTimes(2);
    expect(toast.success).toHaveBeenCalledWith('Recompensa desbloqueada: Livro novo', {
      description: 'Você pode resgatá-la em Recompensas.',
    });
  });

  it('sem nada desbloqueado, fica em silêncio', () => {
    announceUnlocks({ achievementsUnlocked: [], rewardsReached: [] });

    expect(toast.success).not.toHaveBeenCalled();
  });
});
