import type { Activity } from '@lifexp/shared';
import type { Activity as ActivityEntity } from '../generated/prisma/client.js';

export function toActivityResponse(activity: ActivityEntity): Activity {
  return {
    id: activity.id,
    areaId: activity.areaId,
    name: activity.name,
    xpWeight: activity.xpWeight,
    archivedAt: activity.archivedAt?.toISOString() ?? null,
  };
}
