import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Activity, CreateActivityInput, UpdateActivityInput } from '@lifexp/shared';
import type { Activity as ActivityEntity } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toActivityResponse } from './activity.mapper.js';

const NAME_TAKEN = 'Já existe uma atividade ativa com esse nome nesta área';
const AREA_ARCHIVED = 'A área está arquivada. Restaure a área primeiro';

@Injectable()
export class ActivitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, areaId: string | undefined, includeArchived: boolean) {
    const activities = await this.prisma.activity.findMany({
      where: {
        userId,
        ...(areaId && { areaId }),
        // Atividade de área arquivada fica escondida junto com a área.
        ...(includeArchived ? {} : { archivedAt: null, area: { archivedAt: null } }),
      },
      orderBy: [{ areaId: 'asc' }, { createdAt: 'asc' }],
    });
    return activities.map(toActivityResponse);
  }

  async create(userId: string, input: CreateActivityInput): Promise<Activity> {
    const area = await this.prisma.area.findFirst({ where: { id: input.areaId, userId } });
    if (!area) throw new NotFoundException('Área não encontrada');
    if (area.archivedAt !== null) throw new ConflictException(AREA_ARCHIVED);

    await this.assertNameAvailable(userId, input.areaId, input.name);
    const activity = await this.prisma.activity.create({ data: { ...input, userId } });
    return toActivityResponse(activity);
  }

  async update(userId: string, id: string, input: UpdateActivityInput): Promise<Activity> {
    const current = await this.findOwnedOrThrow(userId, id);
    if (input.name !== undefined && current.archivedAt === null) {
      await this.assertNameAvailable(userId, current.areaId, input.name, id);
    }
    const activity = await this.prisma.activity.update({ where: { id }, data: input });
    return toActivityResponse(activity);
  }

  async archive(userId: string, id: string): Promise<Activity> {
    const current = await this.findOwnedOrThrow(userId, id);
    if (current.archivedAt !== null) return toActivityResponse(current);
    const activity = await this.prisma.activity.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
    return toActivityResponse(activity);
  }

  async unarchive(userId: string, id: string): Promise<Activity> {
    const current = await this.findOwnedOrThrow(userId, id);
    if (current.archivedAt === null) return toActivityResponse(current);

    const area = await this.prisma.area.findFirst({ where: { id: current.areaId, userId } });
    if (area?.archivedAt) throw new ConflictException(AREA_ARCHIVED);

    await this.assertNameAvailable(userId, current.areaId, current.name, id);
    const activity = await this.prisma.activity.update({
      where: { id },
      data: { archivedAt: null },
    });
    return toActivityResponse(activity);
  }

  /** Filtra pelo dono (RS06, RN39): atividade alheia responde 404, como uma que não existe. */
  private async findOwnedOrThrow(userId: string, id: string): Promise<ActivityEntity> {
    const activity = await this.prisma.activity.findFirst({ where: { id, userId } });
    if (!activity) throw new NotFoundException('Atividade não encontrada');
    return activity;
  }

  private async assertNameAvailable(
    userId: string,
    areaId: string,
    name: string,
    exceptId?: string,
  ): Promise<void> {
    const clash = await this.prisma.activity.findFirst({
      where: {
        userId,
        areaId,
        archivedAt: null,
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId && { id: { not: exceptId } }),
      },
      select: { id: true },
    });
    if (clash) throw new ConflictException(NAME_TAKEN);
  }
}
