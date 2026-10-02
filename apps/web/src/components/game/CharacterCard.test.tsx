import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CharacterCard } from './CharacterCard';

const base = { name: 'Ana', level: 3, xp: 250, levelProgress: 0.3, streakDays: 4 };

describe('CharacterCard', () => {
  it('mostra o streak atual e o recorde', () => {
    render(<CharacterCard {...base} streakBest={9} />);

    expect(screen.getByText('4 dias')).toBeInTheDocument();
    expect(screen.getByText('Recorde: 9')).toBeInTheDocument();
  });

  it('sem recorde ainda (0), não mostra a linha de recorde', () => {
    render(<CharacterCard {...base} streakDays={0} streakBest={0} />);

    expect(screen.queryByText(/Recorde/)).not.toBeInTheDocument();
  });

  it('mostra o título do personagem quando informado', () => {
    render(<CharacterCard {...base} title="Aventureiro" />);

    expect(screen.getByText('Aventureiro')).toBeInTheDocument();
  });

  it('sem título, não inventa um', () => {
    render(<CharacterCard {...base} />);

    expect(screen.queryByText('Aprendiz')).not.toBeInTheDocument();
  });

  it('mostra quanto falta para o próximo nível quando informado', () => {
    render(<CharacterCard {...base} xpIntoLevel={50} xpForNextLevel={183} />);

    expect(screen.getByText(/50 \/ 183 para o nível 4/)).toBeInTheDocument();
  });
});
