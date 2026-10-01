import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Area, AreaProgress } from '@lifexp/shared';
import { AreaCard } from './AreaCard';

const area: Area = {
  id: '0192f1a0-7b3c-7000-8000-000000000001',
  name: 'Saúde',
  color: 'moss',
  icon: 'heart-pulse',
  position: 0,
  archivedAt: null,
};

const progress: AreaProgress = {
  areaId: area.id,
  xp: 480,
  level: 4,
  xpIntoLevel: 30,
  xpForNextLevel: 210,
  progress: 0.5,
};

const renderCard = (props: { progress?: AreaProgress }) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AreaCard
        area={area}
        activities={[]}
        onEdit={vi.fn()}
        onArchive={vi.fn()}
        onRestore={vi.fn()}
        {...props}
      />
    </QueryClientProvider>,
  );

describe('AreaCard', () => {
  it('mostra o nível e o XP reais da área', () => {
    renderCard({ progress });

    expect(screen.getByText(/Nv 4/)).toHaveTextContent('Nv 4 · 480 XP');
    const bar = screen.getByRole('progressbar', { name: 'Experiência em Saúde' });
    expect(bar).toHaveAttribute('aria-valuenow', '50');
    expect(bar).toHaveAttribute('aria-valuetext', '480 XP');
  });

  it('sem progresso (área nova ou carregando) mostra nível 1 com 0 XP', () => {
    renderCard({});

    expect(screen.getByText(/Nv 1/)).toHaveTextContent('Nv 1 · 0 XP');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });
});
