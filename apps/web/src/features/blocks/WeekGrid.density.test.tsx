import type { Occurrence } from '@lifexp/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WeekGrid } from './WeekGrid';
import type { OccurrenceDisplay } from './OccurrenceCard';

const occurrence: Occurrence = {
  blockId: '0190f2f0-0000-7000-8000-000000000001',
  activityId: '0190f2f0-0000-7000-8000-000000000002',
  areaId: '0190f2f0-0000-7000-8000-000000000003',
  goalId: null,
  occurrenceDate: '2026-03-02',
  date: '2026-03-02',
  startTime: '09:00',
  durationMin: 60,
  skipped: false,
  modified: false,
  note: null,
  recurrence: 'once',
};

const display = (patch: Partial<Occurrence> = {}): OccurrenceDisplay => ({
  occurrence: { ...occurrence, ...patch },
  activityName: 'Estudar',
  areaName: 'Estudo',
  areaColor: 'violet',
  areaIcon: 'book-open',
});

const renderGrid = (items: OccurrenceDisplay[], hourPx?: number) =>
  render(
    <WeekGrid
      weekStart="2026-03-02"
      today="2026-03-04"
      nowMinutes={0}
      items={items}
      onSelect={() => undefined}
      {...(hourPx !== undefined && { hourPx })}
    />,
  );

describe('WeekGrid: densidade', () => {
  it('sem hourPx mantém 48 px por hora', () => {
    renderGrid([display()]);
    expect(screen.getByRole('button', { name: /Estudar/ })).toHaveStyle({ height: '48px' });
  });

  it.each([36, 72])('com hourPx=%i a altura e a posição acompanham', (hourPx) => {
    renderGrid([display()], hourPx);
    // início às 09h com a grade começando às 06h: 3 horas abaixo do topo
    expect(screen.getByRole('button', { name: /Estudar/ })).toHaveStyle({
      height: `${hourPx}px`,
      top: `${3 * hourPx}px`,
    });
  });

  it('bloco curto mostra o horário na mesma linha do nome', () => {
    renderGrid([display({ durationMin: 30 })]);
    const card = screen.getByRole('button', { name: /Estudar/ });
    expect(card).toHaveTextContent('09:00');
    expect(card).toHaveTextContent('Estudar');
  });

  it('bloco alto não repete o horário na linha do nome', () => {
    renderGrid([display({ durationMin: 120 })]);
    const card = screen.getByRole('button', { name: /Estudar/ });
    // o horário aparece uma vez só: no intervalo "09:00 às 11:00"
    expect(card.textContent?.match(/09:00/g)).toHaveLength(1);
  });

  it('com a grade mais baixa, um bloco de 1 hora passa a ser compacto', () => {
    renderGrid([display()], 36);
    expect(
      screen.getByRole('button', { name: /Estudar/ }).textContent?.match(/09:00/g),
    ).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Estudar/ })).not.toHaveTextContent('09:00 às');
  });
});
