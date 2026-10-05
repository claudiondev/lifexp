import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { CivilDate, Occurrence } from '@lifexp/shared';
import { DayView } from './DayView';
import type { OccurrenceDisplay } from './OccurrenceCard';

const ACTIVITY = '0192f1a0-7b3c-7000-8000-0000000000a1';
const AREA = '0192f1a0-7b3c-7000-8000-0000000000b1';
let counter = 0;

const display = (
  overrides: Partial<Occurrence> = {},
  extra: Partial<OccurrenceDisplay> = {},
): OccurrenceDisplay => ({
  occurrence: {
    blockId: `0192f1a0-7b3c-7000-8000-${String(++counter).padStart(12, '0')}`,
    occurrenceDate: '2026-10-07',
    date: '2026-10-07',
    startTime: '09:00',
    durationMin: 60,
    activityId: ACTIVITY,
    areaId: AREA,
    goalId: null,
    note: null,
    recurrence: 'weekly',
    skipped: false,
    modified: false,
    ...overrides,
  },
  activityName: 'Reunião',
  areaName: 'Trabalho',
  areaColor: 'violet',
  areaIcon: 'briefcase',
  ...extra,
});

function Harness({
  items,
  initial = '2026-10-07',
  today = '2026-10-07',
  onSelect = vi.fn(),
}: {
  items: OccurrenceDisplay[];
  initial?: CivilDate;
  today?: CivilDate;
  onSelect?: (display: OccurrenceDisplay) => void;
}) {
  const [day, setDay] = useState<CivilDate>(initial);
  return (
    <DayView
      weekStart="2026-10-05"
      today={today}
      selectedDate={day}
      onSelectDate={setDay}
      items={items}
      onSelect={onSelect}
    />
  );
}

const tab = (name: RegExp) => screen.getByRole('tab', { name });
const panel = () => screen.getByRole('tabpanel');

describe('DayView', () => {
  it('mostra uma aba para cada dia da semana, com o dia selecionado marcado', () => {
    render(<Harness items={[]} />);

    expect(screen.getAllByRole('tab')).toHaveLength(7);
    expect(tab(/segunda-feira, 5 de outubro/)).toHaveAttribute('aria-selected', 'false');
    expect(tab(/quarta-feira, 7 de outubro/)).toHaveAttribute('aria-selected', 'true');
    expect(tab(/domingo, 11 de outubro/)).toBeInTheDocument();
  });

  it('identifica o dia de hoje e quantos blocos cada dia tem', () => {
    render(
      <Harness
        items={[
          display({ date: '2026-10-07', occurrenceDate: '2026-10-07' }),
          display({ date: '2026-10-07', occurrenceDate: '2026-10-07', startTime: '11:00' }),
          display({ date: '2026-10-09', occurrenceDate: '2026-10-09' }),
        ]}
      />,
    );

    expect(tab(/quarta-feira.*\(hoje\), 2 blocos/)).toBeInTheDocument();
    expect(tab(/sexta-feira.*, 1 bloco$/)).toBeInTheDocument();
    expect(tab(/segunda-feira.*, 0 blocos/)).toBeInTheDocument();
  });

  it('mostra só os blocos do dia selecionado', () => {
    render(
      <Harness
        items={[
          display(
            { date: '2026-10-07', occurrenceDate: '2026-10-07' },
            { activityName: 'Quarta A' },
          ),
          display(
            { date: '2026-10-09', occurrenceDate: '2026-10-09' },
            { activityName: 'Sexta B' },
          ),
        ]}
      />,
    );

    expect(within(panel()).getByRole('button', { name: /Quarta A/ })).toBeInTheDocument();
    expect(within(panel()).queryByRole('button', { name: /Sexta B/ })).not.toBeInTheDocument();
  });

  it('a agenda mostra a anotação de cada bloco, como texto puro', () => {
    render(
      <Harness
        items={[
          display({ note: 'Levar o caderno <i>sim</i>' }, { activityName: 'Inglês' }),
          display({ startTime: '11:00' }, { activityName: 'Sem nota' }),
        ]}
      />,
    );

    const withNote = within(panel()).getByRole('button', { name: /Inglês/ });
    expect(within(withNote).getByText('Levar o caderno <i>sim</i>')).toBeInTheDocument();
    expect(withNote.querySelector('i')).toBeNull();
    const without = within(panel()).getByRole('button', { name: /Sem nota/ });
    expect(without.querySelector('p, .line-clamp-2')).toBeNull();
  });

  it('trocar de aba troca a agenda', async () => {
    render(
      <Harness
        items={[
          display(
            { date: '2026-10-07', occurrenceDate: '2026-10-07' },
            { activityName: 'Quarta A' },
          ),
          display(
            { date: '2026-10-09', occurrenceDate: '2026-10-09' },
            { activityName: 'Sexta B' },
          ),
        ]}
      />,
    );

    await userEvent.click(tab(/sexta-feira/));

    expect(tab(/sexta-feira/)).toHaveAttribute('aria-selected', 'true');
    expect(within(panel()).getByRole('button', { name: /Sexta B/ })).toBeInTheDocument();
    expect(within(panel()).queryByRole('button', { name: /Quarta A/ })).not.toBeInTheDocument();
  });

  it('lista em ordem cronológica, e blocos sobrepostos aparecem todos (um embaixo do outro)', () => {
    render(
      <Harness
        items={[
          display({ startTime: '15:00' }, { activityName: 'Tarde' }),
          display({ startTime: '09:00', durationMin: 120 }, { activityName: 'Manhã' }),
          display({ startTime: '10:00' }, { activityName: 'Sobreposto' }),
        ]}
      />,
    );

    const names = within(panel())
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label')?.split(',')[0]);
    expect(names).toEqual(['Manhã', 'Sobreposto', 'Tarde']);
  });

  it('o cartão mostra o horário, a duração e a área', () => {
    render(<Harness items={[display({ startTime: '14:30', durationMin: 90 })]} />);
    const card = within(panel()).getByRole('button', { name: /Reunião/ });
    expect(card).toHaveTextContent('14:30 às 16:00 · 1 h 30 min');
    expect(card).toHaveTextContent('Trabalho');
  });

  it('dia sem blocos mostra uma mensagem em vez de lista vazia', () => {
    render(<Harness items={[]} />);
    expect(within(panel()).getByText('Nenhum bloco neste dia.')).toBeInTheDocument();
    expect(within(panel()).queryByRole('list')).not.toBeInTheDocument();
  });

  it('ocorrência pulada fica marcada; alterada também', () => {
    render(
      <Harness
        items={[
          display({ skipped: true, startTime: '08:00' }, { activityName: 'Pulada' }),
          display({ modified: true, startTime: '12:00' }, { activityName: 'Alterada' }),
        ]}
      />,
    );

    const skipped = within(panel()).getByRole('button', { name: /Pulada.*pulado/ });
    expect(within(skipped).getByText('Pulado')).toBeInTheDocument();
    const modified = within(panel()).getByRole('button', { name: /Alterada/ });
    expect(within(modified).getByText('Alterado')).toBeInTheDocument();
    expect(within(modified).queryByText('Pulado')).not.toBeInTheDocument();
  });

  it('ocorrência movida aparece no dia efetivo, não no original', async () => {
    render(
      <Harness
        items={[display({ occurrenceDate: '2026-10-07', date: '2026-10-09', modified: true })]}
      />,
    );

    expect(within(panel()).getByText('Nenhum bloco neste dia.')).toBeInTheDocument(); // quarta
    await userEvent.click(tab(/sexta-feira/));
    expect(within(panel()).getByRole('button', { name: /Reunião/ })).toBeInTheDocument();
  });

  it('tocar no cartão seleciona aquela ocorrência', async () => {
    const onSelect = vi.fn();
    const item = display();
    render(<Harness items={[item]} onSelect={onSelect} />);

    await userEvent.click(within(panel()).getByRole('button', { name: /Reunião/ }));

    expect(onSelect).toHaveBeenCalledWith(item);
  });

  describe('teclado (padrão ARIA de abas)', () => {
    it('só a aba selecionada entra na ordem do Tab; as demais são alcançadas pelas setas', () => {
      render(<Harness items={[]} />);
      const tabs = screen.getAllByRole('tab');
      expect(tabs.filter((element) => element.tabIndex === 0)).toHaveLength(1);
      expect(tab(/quarta-feira/).tabIndex).toBe(0);
    });

    it('setas movem a seleção e o foco, dando a volta nas pontas', async () => {
      render(<Harness items={[]} initial="2026-10-11" />); // domingo
      tab(/domingo/).focus();

      await userEvent.keyboard('{ArrowRight}'); // domingo -> segunda (volta)
      expect(tab(/segunda-feira/)).toHaveAttribute('aria-selected', 'true');
      expect(tab(/segunda-feira/)).toHaveFocus();

      await userEvent.keyboard('{ArrowLeft}'); // segunda -> domingo (volta)
      expect(tab(/domingo/)).toHaveAttribute('aria-selected', 'true');
      expect(tab(/domingo/)).toHaveFocus();

      await userEvent.keyboard('{ArrowLeft}');
      expect(tab(/sábado/)).toHaveFocus();
    });

    it('Home e End vão para as pontas da semana', async () => {
      render(<Harness items={[]} />);
      tab(/quarta-feira/).focus();

      await userEvent.keyboard('{End}');
      expect(tab(/domingo/)).toHaveAttribute('aria-selected', 'true');
      await userEvent.keyboard('{Home}');
      expect(tab(/segunda-feira/)).toHaveAttribute('aria-selected', 'true');
    });

    it('o painel acompanha a aba selecionada por teclado', async () => {
      render(
        <Harness
          items={[
            display(
              { date: '2026-10-08', occurrenceDate: '2026-10-08' },
              { activityName: 'Quinta X' },
            ),
          ]}
        />,
      );
      tab(/quarta-feira/).focus();

      await userEvent.keyboard('{ArrowRight}');

      expect(within(panel()).getByRole('button', { name: /Quinta X/ })).toBeInTheDocument();
    });
  });
});
