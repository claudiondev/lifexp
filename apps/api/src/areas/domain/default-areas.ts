import type { AreaColor, AreaIcon } from '@lifexp/shared';

export interface DefaultAreaTemplate {
  name: string;
  color: AreaColor;
  icon: AreaIcon;
}

export interface DefaultAreaPlan extends DefaultAreaTemplate {
  position: number;
}

/**
 * Áreas criadas em toda conta nova (RF08). A lista final ainda é ponto em aberto nos requisitos,
 * então é só dado: tudo é editável e arquivável pela pessoa depois do cadastro.
 */
export const DEFAULT_AREAS: readonly DefaultAreaTemplate[] = [
  { name: 'Trabalho', color: 'violet', icon: 'briefcase' },
  { name: 'Estudo', color: 'sky', icon: 'book-open' },
  { name: 'Família', color: 'rose', icon: 'users' },
  { name: 'Fé', color: 'gold', icon: 'church' },
  { name: 'Saúde', color: 'moss', icon: 'heart-pulse' },
  { name: 'Descanso', color: 'slate', icon: 'moon' },
  { name: 'Projetos pessoais', color: 'orange', icon: 'rocket' },
];

/** Define a ordem inicial. Cada área nasce com uma atividade de mesmo nome (ver seed). */
export function buildDefaultAreaPlan(): DefaultAreaPlan[] {
  return DEFAULT_AREAS.map((area, index) => ({ ...area, position: index }));
}
