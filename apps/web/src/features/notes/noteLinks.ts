import type { NoteLinkType } from '@lifexp/shared';

const PARAM: Record<NoteLinkType, string> = {
  area: 'areaId',
  goal: 'goalId',
  event: 'eventId',
  block: 'blockId',
};

/**
 * Endereço do editor de nota já vinculado a um alvo (o atalho "Anotar"). O `rotulo` só serve para
 * mostrar o nome do alvo no editor antes de a nota existir; quem confere o alvo é a API ao salvar.
 */
export function newNoteUrl(type: NoteLinkType, id: string, label: string): string {
  const params = new URLSearchParams({ [PARAM[type]]: id, rotulo: label });
  return `/notas/nova?${params.toString()}`;
}
