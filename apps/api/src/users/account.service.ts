import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { ACCOUNT_EXPORT_VERSION, todayIn, type AccountExport } from '@lifexp/shared';
import { CLOCK, type Clock } from '../clock/clock.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  EXPORT_KEYS,
  exportFileName,
  serializeRow,
  type ExportedModel,
} from './domain/account-export.js';

type Tx = Prisma.TransactionClient;
type Reader = (tx: Tx, userId: string) => Promise<object[]>;

/** Como ler cada modelo exportado. As chaves são as de `EXPORT_KEYS`: o compilador cobra a lista. */
const READERS: Record<ExportedModel, Reader> = {
  Area: (tx, userId) => tx.area.findMany({ where: { userId }, orderBy: { id: 'asc' } }),
  Activity: (tx, userId) => tx.activity.findMany({ where: { userId }, orderBy: { id: 'asc' } }),
  AreaProgress: (tx, userId) =>
    tx.areaProgress.findMany({ where: { userId }, orderBy: { id: 'asc' } }),
  Block: (tx, userId) => tx.block.findMany({ where: { userId }, orderBy: { id: 'asc' } }),
  // Sem userId próprio: pertencem à pessoa pelo bloco ou pela meta.
  BlockException: (tx, userId) =>
    tx.blockException.findMany({ where: { block: { userId } }, orderBy: { id: 'asc' } }),
  Completion: (tx, userId) => tx.completion.findMany({ where: { userId }, orderBy: { id: 'asc' } }),
  XpTransaction: (tx, userId) =>
    tx.xpTransaction.findMany({ where: { userId }, orderBy: { id: 'asc' } }),
  Goal: (tx, userId) => tx.goal.findMany({ where: { userId }, orderBy: { id: 'asc' } }),
  Milestone: (tx, userId) =>
    tx.milestone.findMany({ where: { goal: { userId } }, orderBy: { id: 'asc' } }),
  CalendarEvent: (tx, userId) =>
    tx.calendarEvent.findMany({ where: { userId }, orderBy: { id: 'asc' } }),
  Notification: (tx, userId) =>
    tx.notification.findMany({ where: { userId }, orderBy: { id: 'asc' } }),
  NotificationPreference: (tx, userId) =>
    tx.notificationPreference.findMany({ where: { userId }, orderBy: { id: 'asc' } }),
  WeeklyReview: (tx, userId) =>
    tx.weeklyReview.findMany({ where: { userId }, orderBy: { id: 'asc' } }),
  Note: (tx, userId) => tx.note.findMany({ where: { userId }, orderBy: { id: 'asc' } }),
};

export interface ExportResult {
  body: AccountExport;
  fileName: string;
}

@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Todos os dados da pessoa (RF06), sem credenciais. Lido numa única transação de leitura
   * repetível: as listas saem de um mesmo instante, mesmo que ela use o app durante a exportação.
   */
  async export(userId: string): Promise<ExportResult> {
    const now = this.clock.now();
    const { user, data } = await this.prisma.$transaction(
      async (tx) => {
        const owner = await tx.user.findUniqueOrThrow({ where: { id: userId } });
        const lists: Record<string, Record<string, unknown>[]> = {};
        for (const [model, key] of Object.entries(EXPORT_KEYS)) {
          const rows = await READERS[model as ExportedModel](tx, userId);
          lists[key] = rows.map(serializeRow);
        }
        return { user: owner, data: lists };
      },
      { isolationLevel: 'RepeatableRead' },
    );

    return {
      fileName: exportFileName(todayIn(user.timezone, now)),
      body: {
        version: ACCOUNT_EXPORT_VERSION,
        exportedAt: now.toISOString(),
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          timezone: user.timezone,
          avatarKey: user.avatarKey,
          createdAt: user.createdAt.toISOString(),
        },
        data,
      },
    };
  }

  /**
   * Exclui a conta e tudo que é dela (RS15), depois de conferir a senha. Uma única instrução de
   * exclusão leva junto, em cascata, sessões, áreas, blocos, conclusões, livro-caixa, metas, eventos
   * e avisos. Idempotente: se a conta já não existe (pedido repetido em paralelo), não é erro.
   */
  async deleteAccount(userId: string, password: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!user) return;
    // 403 e não 401: um 401 faria o front tentar renovar a sessão em vez de mostrar o erro.
    if (!(await argon2.verify(user.passwordHash, password))) {
      throw new ForbiddenException('Senha incorreta');
    }
    await this.prisma.user.deleteMany({ where: { id: userId } });
  }
}
