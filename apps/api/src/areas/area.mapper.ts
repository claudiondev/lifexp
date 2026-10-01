import type { Area, AreaColor, AreaIcon } from '@lifexp/shared';
import type { Area as AreaEntity } from '../generated/prisma/client.js';

export function toAreaResponse(area: AreaEntity): Area {
  return {
    id: area.id,
    name: area.name,
    // O banco só recebe valores já validados pelos schemas compartilhados.
    color: area.color as AreaColor,
    icon: area.icon as AreaIcon,
    position: area.position,
    archivedAt: area.archivedAt?.toISOString() ?? null,
  };
}
