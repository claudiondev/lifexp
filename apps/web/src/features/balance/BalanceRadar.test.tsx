import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { BalanceArea } from '@lifexp/shared';
import { BalanceRadar, areaSummary } from './BalanceRadar';

const area = (n: number, over: Partial<BalanceArea> = {}): BalanceArea => ({
  areaId: `0192f1a0-7b3c-7000-8000-00000000000${n}`,
  name: `Área ${n}`,
  color: 'moss',
  icon: 'heart-pulse',
  planned: 10,
  completed: 7,
  score: 70,
  ...over,
});
const empty = { planned: 0, completed: 0, score: null };

describe('areaSummary', () => {
  it('conta blocos, com singular, e explica a área sem dados', () => {
    expect(areaSummary(area(1))).toBe('7 de 10 blocos');
    expect(areaSummary(area(1, { planned: 1, completed: 1, score: 100 }))).toBe('1 de 1 bloco');
    expect(areaSummary(area(1, empty))).toBe('Sem blocos planejados no período');
  });
});

describe('BalanceRadar', () => {
  it('lista cada área com a nota e os blocos, em texto e em barra acessível', () => {
    render(
      <BalanceRadar areas={[area(1), area(2, { planned: 3, completed: 2, score: 67 }), area(3)]} />,
    );

    const list = screen.getByRole('list', { name: 'Aderência por área' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(within(items[1]!).getByText('67%')).toBeInTheDocument();
    expect(within(items[1]!).getByText('2 de 3 blocos')).toBeInTheDocument();
    const bar = within(items[1]!).getByRole('progressbar', { name: 'Aderência de Área 2' });
    expect(bar).toHaveAttribute('aria-valuenow', '67');
    expect(bar).toHaveAttribute('aria-valuetext', '67% (2 de 3 blocos)');
  });

  it('área sem blocos aparece como "sem dados", não como 0%', () => {
    render(<BalanceRadar areas={[area(1), area(2, empty), area(3)]} />);

    const list = screen.getByRole('list', { name: 'Aderência por área' });
    const item = within(list).getByText('Área 2').closest('li')!;
    expect(within(item).getByText('sem dados')).toBeInTheDocument();
    expect(within(item).queryByText('0%')).not.toBeInTheDocument();
    expect(within(item).getByRole('progressbar')).toHaveAttribute('aria-valuetext', 'sem dados');
  });

  it('desenha o radar a partir de 3 áreas e só a lista com menos', () => {
    const { rerender } = render(<BalanceRadar areas={[area(1), area(2), area(3)]} />);
    const radar = screen.getByTestId('balance-radar');
    // um polígono por anel (4) mais o da pessoa
    expect(radar.querySelectorAll('polygon')).toHaveLength(5);

    rerender(<BalanceRadar areas={[area(1), area(2)]} />);
    expect(screen.queryByTestId('balance-radar')).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('o desenho é decorativo (a lista é a versão acessível)', () => {
    render(<BalanceRadar areas={[area(1), area(2), area(3)]} />);
    expect(screen.getByTestId('balance-radar')).toHaveAttribute('aria-hidden', 'true');
  });

  it('o polígono da pessoa acompanha as notas: 100% chega ao anel externo e sem dados fica no centro', () => {
    render(
      <BalanceRadar
        areas={[
          area(1, { planned: 4, completed: 4, score: 100 }),
          area(2, empty),
          area(3, { planned: 4, completed: 0, score: 0 }),
        ]}
      />,
    );
    const polygons = screen.getByTestId('balance-radar').querySelectorAll('polygon');
    const mine = polygons[polygons.length - 1]!.getAttribute('points')!.split(' ');
    const [x0, y0] = mine[0]!.split(',').map(Number);
    expect(x0).toBeCloseTo(140, 1);
    expect(y0).toBeCloseTo(140 - 92, 1); // topo, no raio inteiro
    expect(mine[1]).toBe('140.00,140.00'); // sem dados: centro
    expect(mine[2]).toBe('140.00,140.00'); // nota 0: centro
  });

  it('nomes longos são cortados no desenho, mas completos na lista', () => {
    render(
      <BalanceRadar areas={[area(1, { name: 'Desenvolvimento pessoal' }), area(2), area(3)]} />,
    );
    expect(screen.getByText('Desenvolvim…')).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Aderência por área' });
    expect(within(list).getByText('Desenvolvimento pessoal')).toBeInTheDocument();
  });
});
