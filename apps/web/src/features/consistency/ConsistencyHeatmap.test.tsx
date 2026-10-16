import type { Consistency } from '@lifexp/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ConsistencyHeatmap } from './ConsistencyHeatmap';

// Segunda 2026-10-05 até quarta 2026-10-07, mais a semana anterior inteira.
const consistency: Consistency = {
  start: '2026-09-28',
  end: '2026-10-07',
  days: [
    { date: '2026-09-28', planned: 2, completed: 2 },
    { date: '2026-09-29', planned: 2, completed: 1 },
    { date: '2026-09-30', planned: 1, completed: 0 },
    { date: '2026-10-01', planned: 0, completed: 0 },
    { date: '2026-10-02', planned: 4, completed: 3 },
    { date: '2026-10-03', planned: 0, completed: 0 },
    { date: '2026-10-04', planned: 0, completed: 0 },
    { date: '2026-10-05', planned: 1, completed: 1 },
    { date: '2026-10-06', planned: 0, completed: 0 },
    { date: '2026-10-07', planned: 0, completed: 0 },
  ],
};

describe('ConsistencyHeatmap', () => {
  it('um quadrado por dia que já chegou; os futuros da semana atual não pintam nada', () => {
    render(<ConsistencyHeatmap consistency={consistency} />);
    expect(screen.getAllByTestId('heat-cell')).toHaveLength(10);
  });

  it('pinta cada dia pelo nível', () => {
    render(<ConsistencyHeatmap consistency={consistency} />);
    const levels = screen.getAllByTestId('heat-cell').map((cell) => cell.dataset['level']);
    expect(levels).toEqual([
      'full', // 28/09: 2 de 2
      'mid', // 29/09: 1 de 2
      'none', // 30/09: plano sem conclusão
      'rest', // 01/10: sem plano
      'high', // 02/10: 3 de 4
      'rest',
      'rest',
      'full', // 05/10: 1 de 1
      'rest',
      'rest',
    ]);
  });

  it('dia com plano e nada concluído é um aro vazio, nunca vermelho', () => {
    render(<ConsistencyHeatmap consistency={consistency} />);
    const none = screen
      .getAllByTestId('heat-cell')
      .find((cell) => cell.dataset['level'] === 'none')!;
    expect(none.className).toContain('border');
    expect(none.className).not.toMatch(/destructive|red|rose/);
  });

  it('cada quadrado tem a dica com o dia e as contas', () => {
    render(<ConsistencyHeatmap consistency={consistency} />);
    const titles = screen.getAllByTestId('heat-cell').map((cell) => cell.getAttribute('title'));
    expect(titles[0]).toBe('28/09: 2 de 2 blocos concluídos');
    expect(titles[2]).toBe('30/09: 0 de 1 bloco concluído');
    expect(titles[3]).toBe('01/10: sem blocos planejados');
  });

  it('o resumo em texto é a descrição acessível; os quadrados ficam escondidos do leitor de tela', () => {
    render(<ConsistencyHeatmap consistency={consistency} />);
    const summary = '7 blocos concluídos em 4 dias (de 5 dias com plano).';
    expect(screen.getByRole('img', { name: summary })).toBeInTheDocument();
    expect(screen.getByText(summary)).toBeInTheDocument();
    expect(screen.getAllByTestId('heat-cell')[0]!.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('o rótulo do mês aparece na primeira semana dele', () => {
    render(<ConsistencyHeatmap consistency={consistency} />);
    expect(screen.getByText('set')).toBeInTheDocument();
    expect(screen.getByText('out')).toBeInTheDocument();
  });

  it('a legenda explica as cores sem usar tom de falta', () => {
    render(<ConsistencyHeatmap consistency={consistency} />);
    const legend = screen.getByRole('list', { name: 'Legenda' });
    expect(legend).toHaveTextContent('Plano sem conclusão');
    expect(legend).toHaveTextContent('Tudo concluído');
    expect(legend.textContent).not.toMatch(/falha|perdido|atras/i);
  });

  it('período sem nenhum bloco planejado convida em vez de mostrar números zerados', () => {
    render(
      <ConsistencyHeatmap
        consistency={{
          start: '2026-10-05',
          end: '2026-10-07',
          days: ['2026-10-05', '2026-10-06', '2026-10-07'].map((date) => ({
            date,
            planned: 0,
            completed: 0,
          })),
        }}
      />,
    );
    expect(screen.getByText('Nenhum bloco planejado neste período ainda.')).toBeInTheDocument();
  });
});
