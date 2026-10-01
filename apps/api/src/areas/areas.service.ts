import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Area, CreateAreaInput, UpdateAreaInput } from '@lifexp/shared';
import type { Area as AreaEntity } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toAreaResponse } from './area.mapper.js';

const NAME_TAKEN = 'Já existe uma área ativa com esse nome';

@Injectable()
export class AreasService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, includeArchived: boolean): Promise<Area[]> {
    const areas = await this.prisma.area.findMany({
      where: { userId, ...(includeArchived ? {} : { archivedAt: null }) },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
    return areas.map(toAreaResponse);
  }

  async create(userId: string, input: CreateAreaInput): Promise<Area> {
    await this.assertNameAvailable(userId, input.name);
    const last = await this.prisma.area.aggregate({ where: { userId }, _max: { position: true } });
    const area = await this.prisma.area.create({
      data: { ...input, userId, position: (last._max.position ?? -1) + 1 },
    });
    return toAreaResponse(area);
  }

  async update(userId: string, id: string, input: UpdateAreaInput): Promise<Area> {
    const current = await this.findOwnedOrThrow(userId, id);
    // Só confere o nome quando ele realmente muda e a área está ativa (arquivada não ocupa nome).
    if (input.name !== undefined && current.archivedAt === null) {
      await this.assertNameAvailable(userId, input.name, id);
    }
    const area = await this.prisma.area.update({ where: { id }, data: input });
    return toAreaResponse(area);
  }

  /** Idempotente: arquivar uma área já arquivada mantém a data original. */
  async archive(userId: string, id: string): Promise<Area> {
    const current = await this.findOwnedOrThrow(userId, id);
    if (current.archivedAt !== null) return toAreaResponse(current);
    const area = await this.prisma.area.update({ where: { id }, data: { archivedAt: new Date() } });
    return toAreaResponse(area);
  }

  async unarchive(userId: string, id: string): Promise<Area> {
    const current = await this.findOwnedOrThrow(userId, id);
    if (current.archivedAt === null) return toAreaResponse(current);
    // Ao voltar, o nome não pode colidir com uma área que passou a existir enquanto estava arquivada.
    await this.assertNameAvailable(userId, current.name, id);
    const area = await this.prisma.area.update({ where: { id }, data: { archivedAt: null } });
    return toAreaResponse(area);
  }

  /**
   * Toda leitura/escrita passa por aqui: filtra pelo dono (RS06, RN39). Área de outra pessoa
   * responde 404, igual a uma área que não existe, para não revelar que o id existe.
   */
  private async findOwnedOrThrow(userId: string, id: string): Promise<AreaEntity> {
    const area = await this.prisma.area.findFirst({ where: { id, userId } });
    if (!area) throw new NotFoundException('Área não encontrada');
    return area;
  }

  private async assertNameAvailable(
    userId: string,
    name: string,
    exceptId?: string,
  ): Promise<void> {
    const clash = await this.prisma.area.findFirst({
      where: {
        userId,
        archivedAt: null,
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId && { id: { not: exceptId } }),
      },
      select: { id: true },
    });
    if (clash) throw new ConflictException(NAME_TAKEN);
  }
}
