import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  MAX_LEISURE_OPTIONS,
  type CreateLeisureOptionInput,
  type LeisureOption,
  type UpdateLeisureOptionInput,
} from '@lifexp/shared';
import { CLOCK, type Clock } from '../clock/clock.js';
import { XpLedgerService, type Tx } from '../gamification/xp-ledger.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toOptionDto } from './leisure.mapper.js';

const NOT_FOUND = 'Lazer não encontrado';
const NAME_TAKEN = 'Você já tem um lazer ativo com esse nome';
const LIMIT_REACHED = `Você já tem ${MAX_LEISURE_OPTIONS} lazeres ativos. Arquive algum para criar outro`;

/** Lazeres que a pessoa cadastra para gastar o tempo ganho. Arquivar, nunca excluir (as sessões antigas apontam para eles). */
@Injectable()
export class LeisureOptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: XpLedgerService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(userId: string, includeArchived: boolean): Promise<LeisureOption[]> {
    const rows = await this.prisma.leisureOption.findMany({
      where: { userId, ...(includeArchived ? {} : { archivedAt: null }) },
      orderBy: { id: 'asc' },
    });
    return rows.map(toOptionDto);
  }

  async create(userId: string, input: CreateLeisureOptionInput): Promise<LeisureOption> {
    return this.prisma.$transaction(async (tx) => {
      // Trava a pessoa: o limite e o nome único valem mesmo com pedidos simultâneos.
      await this.ledger.lockUser(tx, userId);
      await this.assertCanBeActive(tx, userId, input.name);
      const created = await tx.leisureOption.create({ data: { userId, ...input } });
      return toOptionDto(created);
    });
  }

  async update(
    userId: string,
    id: string,
    input: UpdateLeisureOptionInput,
  ): Promise<LeisureOption> {
    const now = this.clock.now();
    return this.prisma.$transaction(async (tx) => {
      await this.ledger.lockUser(tx, userId);
      const current = await tx.leisureOption.findFirst({ where: { id, userId } });
      if (!current) throw new NotFoundException(NOT_FOUND);

      const archiving = input.archived === true;
      const restoring = input.archived === false && current.archivedAt !== null;
      const staysActive = !archiving && (current.archivedAt === null || restoring);
      if (restoring) {
        await this.assertCanBeActive(tx, userId, input.name ?? current.name, id);
      } else if (staysActive && input.name !== undefined) {
        await this.assertNameFree(tx, userId, input.name, id);
      }

      const updated = await tx.leisureOption.update({
        where: { id },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.icon !== undefined && { icon: input.icon }),
          ...(archiving && current.archivedAt === null && { archivedAt: now }),
          ...(restoring && { archivedAt: null }),
        },
      });
      return toOptionDto(updated);
    });
  }

  /** Vale para criar e para restaurar: o limite de ativos e o nome livre entre os ativos. */
  private async assertCanBeActive(
    tx: Tx,
    userId: string,
    name: string,
    exceptId?: string,
  ): Promise<void> {
    const active = await tx.leisureOption.count({
      where: { userId, archivedAt: null, ...(exceptId && { id: { not: exceptId } }) },
    });
    if (active >= MAX_LEISURE_OPTIONS) throw new ConflictException(LIMIT_REACHED);
    await this.assertNameFree(tx, userId, name, exceptId);
  }

  private async assertNameFree(
    tx: Tx,
    userId: string,
    name: string,
    exceptId?: string,
  ): Promise<void> {
    const clash = await tx.leisureOption.findFirst({
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
