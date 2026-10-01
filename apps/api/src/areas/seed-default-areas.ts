import { XP_WEIGHT_DEFAULT } from '@lifexp/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { buildDefaultAreaPlan } from './domain/default-areas.js';

/**
 * Cria as áreas padrão, cada uma com uma atividade de mesmo nome (peso 1,0), para que o bloco
 * do planejador já tenha o que escolher. Recebe o client da transação: roda junto com a criação
 * do usuário, então ou a conta nasce completa ou não nasce.
 */
export async function seedDefaultAreas(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  for (const area of buildDefaultAreaPlan()) {
    await tx.area.create({
      data: {
        userId,
        name: area.name,
        color: area.color,
        icon: area.icon,
        position: area.position,
        activities: { create: { userId, name: area.name, xpWeight: XP_WEIGHT_DEFAULT } },
      },
    });
  }
}
