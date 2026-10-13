import type { LeisureOption, LeisureSession } from '@lifexp/shared';
import type {
  LeisureOption as LeisureOptionEntity,
  LeisureSession as LeisureSessionEntity,
} from '../generated/prisma/client.js';
import { isRunning, sessionEnd, usedMinutes } from './domain/leisure-rules.js';

export function toOptionDto(option: LeisureOptionEntity): LeisureOption {
  return {
    id: option.id,
    name: option.name,
    icon: option.icon as LeisureOption['icon'],
    archivedAt: option.archivedAt?.toISOString() ?? null,
  };
}

/** `endsAt`, `usedMin` e `active` são calculados contra `now`: a sessão não guarda o fim, só o início e o limite. */
export function toSessionDto(session: LeisureSessionEntity, now: Date): LeisureSession {
  return {
    id: session.id,
    optionId: session.optionId,
    startedAt: session.startedAt.toISOString(),
    limitMin: session.limitMin,
    stoppedAt: session.stoppedAt?.toISOString() ?? null,
    endsAt: sessionEnd(session).toISOString(),
    usedMin: usedMinutes(session, now),
    active: isRunning(session, now),
  };
}
