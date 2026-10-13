import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { MAX_LEISURE_SESSION_MIN, type LeisureSession, type LeisureSummary } from '@lifexp/shared';
import { CLOCK, type Clock } from '../clock/clock.js';
import { XpLedgerService, type Tx } from '../gamification/xp-ledger.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  canStart,
  isRunning,
  leisureWeek,
  sessionEnd,
  weekBalance,
  type WeekBalance,
} from './domain/leisure-rules.js';
import { toSessionDto } from './leisure.mapper.js';
import type { LeisureSession as LeisureSessionEntity } from '../generated/prisma/client.js';

const SESSION_NOT_FOUND = 'Sessão de lazer não encontrada';
const OPTION_NOT_FOUND = 'Lazer não encontrado';
const OPTION_ARCHIVED = 'Este lazer está arquivado. Restaure-o para usar';
const NO_BALANCE =
  'Você ainda não tem tempo de lazer esta semana. Cumpra blocos das suas atividades de estudo para ganhar';
const ALREADY_RUNNING = 'Já existe um cronômetro de lazer em andamento';

/** Uma sessão que começou na semana passada ainda pode estar correndo na segunda: procurar uma semana para trás basta (o limite máximo é uma semana). */
const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Tempo de lazer: o saldo (ganho − usado) da semana e o cronômetro. O saldo é DERIVADO na leitura (nada é gravado na
 * virada da semana). A sessão guarda só o início e o limite; o fim é calculado, então nenhum job fecha sessões.
 */
@Injectable()
export class LeisureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: XpLedgerService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async getSummary(userId: string): Promise<LeisureSummary> {
    const now = this.clock.now();
    const { timezone } = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { timezone: true },
    });
    const week = leisureWeek(now, timezone);
    const state = await this.loadState(this.prisma, userId, week, now);

    const activities = await this.prisma.activity.findMany({
      where: { userId, id: { in: state.byActivity.map((row) => row.activityId) } },
      select: { id: true, name: true },
    });
    const names = new Map(activities.map((activity) => [activity.id, activity.name]));
    const running = state.openSessions.find((session) => isRunning(session, now));

    return {
      weekStart: week.weekStart,
      earnedMin: state.balance.earnedMin,
      usedMin: state.balance.usedMin,
      balanceMin: state.balance.balanceMin,
      activeSession: running ? toSessionDto(running, now) : null,
      byActivity: state.byActivity.map((row) => ({
        ...row,
        name: names.get(row.activityId) ?? 'Atividade',
      })),
      sessions: state.weekSessions.map((session) => toSessionDto(session, now)),
    };
  }

  /**
   * Começa o cronômetro. A sessão leva o saldo de agora como limite e acaba sozinha ao chegar nele. Só uma sessão corre
   * por vez; a pessoa é travada para dois "iniciar" simultâneos não abrirem duas.
   */
  async start(userId: string, optionId: string): Promise<LeisureSession> {
    const now = this.clock.now();
    return this.prisma.$transaction(async (tx) => {
      const timezone = await this.ledger.lockUser(tx, userId);
      const option = await tx.leisureOption.findFirst({ where: { id: optionId, userId } });
      if (!option) throw new NotFoundException(OPTION_NOT_FOUND);
      if (option.archivedAt !== null) throw new ConflictException(OPTION_ARCHIVED);

      const state = await this.loadState(tx, userId, leisureWeek(now, timezone), now);
      const hasRunning = state.openSessions.some((session) => isRunning(session, now));
      if (hasRunning) throw new ConflictException(ALREADY_RUNNING);
      if (!canStart(state.balance.balanceMin, hasRunning)) throw new ConflictException(NO_BALANCE);

      const created = await tx.leisureSession.create({
        data: {
          userId,
          optionId,
          startedAt: now,
          limitMin: Math.min(state.balance.balanceMin, MAX_LEISURE_SESSION_MIN),
        },
      });
      return toSessionDto(created, now);
    });
  }

  /** Para o cronômetro. Idempotente; parar depois do limite grava o próprio limite (a sessão nunca passa dele). */
  async stop(userId: string, id: string): Promise<LeisureSession> {
    const now = this.clock.now();
    return this.prisma.$transaction(async (tx) => {
      await this.ledger.lockUser(tx, userId);
      const session = await tx.leisureSession.findFirst({ where: { id, userId } });
      if (!session) throw new NotFoundException(SESSION_NOT_FOUND);
      if (session.stoppedAt !== null) return toSessionDto(session, now);

      const end = sessionEnd(session);
      const stoppedAt = now.getTime() < end.getTime() ? now : end;
      const stopped = await tx.leisureSession.update({ where: { id }, data: { stoppedAt } });
      return toSessionDto(stopped, now);
    });
  }

  /**
   * O que o saldo precisa: ganho da semana (conclusões ativas, pelo instante da conclusão), por atividade, e as sessões da
   * semana (pelo início). `openSessions` traz também as sessões ainda abertas que começaram antes da semana.
   */
  private async loadState(
    db: Tx | PrismaService,
    userId: string,
    week: { from: Date; to: Date },
    now: Date,
  ) {
    const [earnedRows, sessions] = await Promise.all([
      db.completion.groupBy({
        by: ['activityId'],
        where: {
          userId,
          undoneAt: null,
          leisureMin: { gt: 0 },
          completedAt: { gte: week.from, lt: week.to },
        },
        _sum: { leisureMin: true, durationMin: true },
        orderBy: { activityId: 'asc' },
      }),
      db.leisureSession.findMany({
        where: {
          userId,
          OR: [
            { startedAt: { gte: week.from, lt: week.to } },
            { stoppedAt: null, startedAt: { gte: new Date(week.from.getTime() - LOOKBACK_MS) } },
          ],
        },
        orderBy: { startedAt: 'asc' },
      }),
    ]);

    const byActivity = earnedRows.map((row) => ({
      activityId: row.activityId,
      doneMin: row._sum.durationMin ?? 0,
      earnedMin: row._sum.leisureMin ?? 0,
    }));
    const weekSessions = sessions.filter(
      (session) => session.startedAt >= week.from && session.startedAt < week.to,
    );
    const balance: WeekBalance = weekBalance({
      earnedMin: byActivity.reduce((sum, row) => sum + row.earnedMin, 0),
      sessions: weekSessions,
      now,
    });
    const openSessions: LeisureSessionEntity[] = sessions.filter((s) => s.stoppedAt === null);
    return { byActivity, weekSessions, openSessions, balance };
  }
}
