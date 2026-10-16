import type { Occurrence } from '@lifexp/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { OccurrenceDisplay } from './OccurrenceCard';
import { WeekGrid } from './WeekGrid';

const display = (n: number, startTime = '09:00', durationMin = 60): OccurrenceDisplay => {
  const occurrence: Occurrence = {
    blockId: `0190f2f0-0000-7000-8000-00000000010${n}`,
    activityId: '0190f2f0-0000-7000-8000-000000000002',
    areaId: '0190f2f0-0000-7000-8000-000000000003',
    goalId: null,
    occurrenceDate: '2026-03-02',
    date: '2026-03-02',
    startTime,
    durationMin,
    recurrence: 'once',
    skipped: false,
    modified: false,
    note: null,
  };
  return {
    occurrence,
    activityName: `Atividade ${n}`,
    areaName: 'Estudo',
    areaColor: 'violet',
    areaIcon: 'book-open',
  };
};

const renderGrid = (items: OccurrenceDisplay[], onSelect = vi.fn()) => {
  render(
    <WeekGrid
      weekStart="2026-03-02"
      today="2026-03-04"
      nowMinutes={0}
      items={items}
      onSelect={onSelect}
    />,
  );
  return onSelect;
};

describe('WeekGrid: blocos sobrepostos', () => {
  it('até 2 blocos juntos aparecem lado a lado, sem indicador "+N"', () => {
    renderGrid([display(1), display(2)]);
    expect(screen.getByRole('button', { name: /Atividade 1/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Atividade 2/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ver lista/ })).not.toBeInTheDocument();
  });

  it('3 blocos juntos: 2 na grade e um "+1" que leva ao terceiro', async () => {
    renderGrid([display(1), display(2), display(3)]);
    const drawn = screen.getAllByRole('button', { name: /Atividade \d/ });
    expect(drawn).toHaveLength(2);
    expect(screen.getByRole('button', { name: /Mais 1 bloco em segunda-feira/ })).toHaveTextContent(
      '+1',
    );
  });

  it('o "+N" abre a lista com os escondidos e escolher um abre o painel dele', async () => {
    const user = userEvent.setup();
    const onSelect = renderGrid([display(1), display(2), display(3), display(4)]);
    await user.click(screen.getByRole('button', { name: /Mais 2 blocos/ }));

    const list = within(screen.getByRole('dialog'));
    const entries = list.getAllByRole('button', { name: /Atividade/ });
    expect(entries).toHaveLength(2);

    await user.click(entries[0]!);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('nenhum bloco some: o que sai da grade está na lista', async () => {
    const user = userEvent.setup();
    renderGrid([display(1), display(2), display(3), display(4)]);
    const drawn = screen
      .getAllByRole('button', { name: /Atividade \d/ })
      .map((button) => button.getAttribute('aria-label')!.slice(0, 11));
    await user.click(screen.getByRole('button', { name: /Mais 2 blocos/ }));
    const listed = within(screen.getByRole('dialog'))
      .getAllByRole('button', { name: /Atividade/ })
      .map((button) => button.textContent!.slice(0, 11));
    expect([...drawn, ...listed].sort()).toEqual([
      'Atividade 1',
      'Atividade 2',
      'Atividade 3',
      'Atividade 4',
    ]);
  });

  it('os cartões que dividem horário com o "+N" deixam a faixa dele livre', () => {
    renderGrid([display(1), display(2), display(3), display(4, '14:00')]);
    const shared = screen.getAllByRole('button', { name: /Atividade [12]/ });
    for (const card of shared) expect(card.style.width).toContain('22px');
    // quem está sozinho em outro horário mantém a largura toda
    expect(screen.getByRole('button', { name: /Atividade 4/ }).style.width).toBe(
      'calc(100% - 4px)',
    );
  });

  it('blocos em horários diferentes não geram "+N"', () => {
    renderGrid([display(1, '08:00'), display(2, '10:00'), display(3, '12:00')]);
    expect(screen.queryByRole('button', { name: /ver lista/ })).not.toBeInTheDocument();
  });
});
