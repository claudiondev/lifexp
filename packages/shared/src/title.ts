/**
 * Títulos do personagem (RF23): o nome exibido conforme o nível geral. Só texto derivado do nível, sem
 * tabela. A lista é ordenada pelo nível mínimo e começa no 1, então todo nível tem título.
 */
export const LEVEL_TITLES: readonly { minLevel: number; title: string }[] = [
  { minLevel: 1, title: 'Aprendiz' },
  { minLevel: 5, title: 'Explorador' },
  { minLevel: 10, title: 'Aventureiro' },
  { minLevel: 20, title: 'Veterano' },
  { minLevel: 30, title: 'Mestre' },
  { minLevel: 50, title: 'Lenda' },
];

export function levelTitle(level: number): string {
  let title = LEVEL_TITLES[0]!.title;
  for (const entry of LEVEL_TITLES) {
    if (level >= entry.minLevel) title = entry.title;
  }
  return title;
}
