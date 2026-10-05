import { describe, expect, it } from 'vitest';
import { NAV_GROUPS } from './MainNav';

describe('NAV_GROUPS', () => {
  const items = NAV_GROUPS.flatMap((group) => group.items);

  it('Pendentes fica no grupo Jogar, logo depois de Hoje', () => {
    const play = NAV_GROUPS.find((group) => group.title === 'Jogar')!;
    const paths = play.items.map((item) => item.to);
    expect(paths.indexOf('/pendentes')).toBe(paths.indexOf('/hoje') + 1);
    expect(items.find((item) => item.to === '/pendentes')!.label).toBe('Pendentes');
  });

  it('nenhum destino se repete', () => {
    const paths = items.map((item) => item.to);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
