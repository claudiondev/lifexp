import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AreaStrip, DaySummaryLine } from './DaySummaryBar';
import type { DaySummary } from './daySummary';

const summary = (patch: Partial<DaySummary> = {}): DaySummary => ({
  planned: 2,
  done: 1,
  plannedMinutes: 90,
  areas: [
    { color: 'violet', minutes: 60 },
    { color: 'gold', minutes: 30 },
  ],
  ...patch,
});

describe('DaySummaryLine', () => {
  it('mostra concluídos/total e o tempo planejado', () => {
    render(<DaySummaryLine summary={summary()} />);
    expect(screen.getByText('1/2 · 1 h 30 min')).toBeInTheDocument();
  });

  it('dia sem blocos não escreve nada', () => {
    const { container } = render(
      <DaySummaryLine summary={summary({ planned: 0, done: 0, plannedMinutes: 0, areas: [] })} />,
    );
    expect(container).toHaveTextContent('');
  });
});

describe('AreaStrip', () => {
  it('uma fatia por área, proporcional aos minutos', () => {
    render(<AreaStrip summary={summary()} />);
    const slices = screen.getByTestId('area-strip').children;
    expect(slices).toHaveLength(2);
    expect((slices[0] as HTMLElement).style.flexGrow).toBe('60');
    expect((slices[1] as HTMLElement).style.flexGrow).toBe('30');
  });

  it('é só enfeite: some para leitores de tela', () => {
    render(<AreaStrip summary={summary()} />);
    expect(screen.getByTestId('area-strip')).toHaveAttribute('aria-hidden', 'true');
  });
});
