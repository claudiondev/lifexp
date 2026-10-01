import { NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';

/**
 * Carrega o bloco da pessoa já travando a linha (SELECT ... FOR UPDATE): operações simultâneas
 * sobre a mesma série (editar, pular, concluir) esperam uma pela outra em vez de se atropelarem.
 * Bloco de outra pessoa responde 404, igual a um que não existe (RS06).
 */
export async function lockAndLoadBlock(tx: Prisma.TransactionClient, userId: string, id: string) {
  const owned = await tx.block.findFirst({ where: { id, userId }, select: { id: true } });
  if (!owned) throw new NotFoundException('Bloco não encontrado');

  await tx.$queryRaw`SELECT "id" FROM "Block" WHERE "id" = ${id} FOR UPDATE`;

  // Relê depois do bloqueio: outra operação pode ter terminado enquanto esperávamos.
  return tx.block.findUniqueOrThrow({
    where: { id },
    include: {
      activity: { select: { areaId: true, xpWeight: true } },
      exceptions: true,
    },
  });
}
