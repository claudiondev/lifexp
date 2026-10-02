import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MAX_PINNED_NOTES,
  type CreateNoteInput,
  type ListNotesQuery,
  type Note,
  type NoteLinkInput,
  type NoteLinkType,
  type NotePage,
  type TagCount,
  type UpdateNoteInput,
} from '@lifexp/shared';
import { CLOCK, type Clock } from '../clock/clock.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { afterCursor, decodeCursor, encodeCursor } from './domain/cursor.js';
import { makeExcerpt } from './domain/excerpt.js';
import { escapeLike } from './domain/search.js';

type Tx = Prisma.TransactionClient;

const NOT_FOUND = 'Nota não encontrada';
const TARGET_NOT_FOUND: Record<NoteLinkType, string> = {
  area: 'Área não encontrada',
  goal: 'Meta não encontrada',
  event: 'Evento não encontrado',
  block: 'Bloco não encontrado',
};
const TOO_MANY_PINNED = `Você já fixou ${MAX_PINNED_NOTES} notas. Desafixe uma para fixar outra`;
const BAD_CURSOR = 'Cursor inválido';

/** O nome do alvo do vínculo vem junto (um SELECT só, com join), para a lista não fazer uma consulta por nota. */
const WITH_LINK = {
  area: { select: { name: true } },
  goal: { select: { title: true } },
  event: { select: { title: true } },
  block: { select: { activity: { select: { name: true } } } },
} satisfies Prisma.NoteInclude;

type NoteRow = Prisma.NoteGetPayload<{ include: typeof WITH_LINK }>;

function toLink(row: NoteRow): Note['link'] {
  if (row.areaId && row.area) return { type: 'area', id: row.areaId, label: row.area.name };
  if (row.goalId && row.goal) return { type: 'goal', id: row.goalId, label: row.goal.title };
  if (row.eventId && row.event) return { type: 'event', id: row.eventId, label: row.event.title };
  if (row.blockId && row.block) {
    return { type: 'block', id: row.blockId, label: row.block.activity.name };
  }
  return null;
}

export function toNoteResponse(row: NoteRow): Note {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    tags: row.tags,
    pinned: row.pinned,
    link: toLink(row),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Os quatro campos de vínculo para gravar: o do tipo escolhido e nulo nos outros (no máximo um vínculo). */
function linkColumns(link: NoteLinkInput | null) {
  return {
    areaId: link?.type === 'area' ? link.id : null,
    goalId: link?.type === 'goal' ? link.id : null,
    eventId: link?.type === 'event' ? link.id : null,
    blockId: link?.type === 'block' ? link.id : null,
  };
}

@Injectable()
export class NotesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** O alvo precisa ser da própria pessoa: de outra pessoa responde 404, igual a um que não existe (RS06). */
  private async assertTargetOwned(tx: Tx, userId: string, link: NoteLinkInput): Promise<void> {
    const where = { id: link.id, userId };
    const found =
      link.type === 'area'
        ? await tx.area.findFirst({ where, select: { id: true } })
        : link.type === 'goal'
          ? await tx.goal.findFirst({ where, select: { id: true } })
          : link.type === 'event'
            ? await tx.calendarEvent.findFirst({ where, select: { id: true } })
            : await tx.block.findFirst({ where, select: { id: true } });
    if (!found) throw new NotFoundException(TARGET_NOT_FOUND[link.type]);
  }

  /**
   * Serializa as operações de nota da pessoa (travando a linha dela) e confere o limite de fixadas: sem a
   * trava, dois pedidos ao mesmo tempo passariam do limite. FOR NO KEY UPDATE, como no resto do app.
   */
  private async lockUser(tx: Tx, userId: string): Promise<void> {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR NO KEY UPDATE`;
  }

  private async assertCanPin(tx: Tx, userId: string, exceptNoteId?: string): Promise<void> {
    const pinned = await tx.note.count({
      where: { userId, pinned: true, ...(exceptNoteId && { id: { not: exceptNoteId } }) },
    });
    if (pinned >= MAX_PINNED_NOTES) throw new ConflictException(TOO_MANY_PINNED);
  }

  async create(userId: string, input: CreateNoteInput): Promise<Note> {
    const now = this.clock.now();
    const row = await this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, userId);
      if (input.link) await this.assertTargetOwned(tx, userId, input.link);
      if (input.pinned) await this.assertCanPin(tx, userId);
      return tx.note.create({
        data: {
          userId,
          title: input.title,
          content: input.content,
          tags: input.tags,
          pinned: input.pinned,
          ...linkColumns(input.link ?? null),
          createdAt: now,
          updatedAt: now,
        },
        include: WITH_LINK,
      });
    });
    return toNoteResponse(row);
  }

  async get(userId: string, id: string): Promise<Note> {
    const row = await this.prisma.note.findFirst({ where: { id, userId }, include: WITH_LINK });
    if (!row) throw new NotFoundException(NOT_FOUND);
    return toNoteResponse(row);
  }

  /**
   * Edita só o que veio. Fixar ou desafixar NÃO conta como alteração da nota: `updatedAt` só anda quando o
   * conteúdo muda (senão desafixar uma nota antiga a jogaria para o topo da lista).
   */
  async update(userId: string, id: string, input: UpdateNoteInput): Promise<Note> {
    const row = await this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, userId);
      const current = await tx.note.findFirst({ where: { id, userId }, select: { pinned: true } });
      if (!current) throw new NotFoundException(NOT_FOUND);
      if (input.link) await this.assertTargetOwned(tx, userId, input.link);
      if (input.pinned && !current.pinned) await this.assertCanPin(tx, userId, id);

      const editsContent =
        input.title !== undefined ||
        input.content !== undefined ||
        input.tags !== undefined ||
        input.link !== undefined;
      return tx.note.update({
        where: { id },
        data: {
          ...(input.title !== undefined && { title: input.title }),
          ...(input.content !== undefined && { content: input.content }),
          ...(input.tags !== undefined && { tags: input.tags }),
          ...(input.pinned !== undefined && { pinned: input.pinned }),
          ...(input.link !== undefined && linkColumns(input.link)),
          ...(editsContent && { updatedAt: this.clock.now() }),
        },
        include: WITH_LINK,
      });
    });
    return toNoteResponse(row);
  }

  /** Exclui de vez (nota é conteúdo da pessoa, não histórico). Alheia ou inexistente: 404, igual (RS06). */
  async remove(userId: string, id: string): Promise<void> {
    const result = await this.prisma.note.deleteMany({ where: { id, userId } });
    if (result.count === 0) throw new NotFoundException(NOT_FOUND);
  }

  /**
   * Lista (RF43): fixadas primeiro e depois as alteradas há menos tempo, paginada por cursor (RNF08).
   * A busca olha o título e o texto sem diferenciar maiúsculas; a tag e o vínculo são filtros exatos.
   */
  async list(userId: string, query: ListNotesQuery): Promise<NotePage> {
    const cursor = query.before ? decodeCursor(query.before) : null;
    if (query.before && !cursor) throw new BadRequestException(BAD_CURSOR);

    const rows = await this.prisma.note.findMany({
      where: {
        userId,
        ...(query.q && {
          OR: [
            { title: { contains: escapeLike(query.q), mode: 'insensitive' } },
            { content: { contains: escapeLike(query.q), mode: 'insensitive' } },
          ],
        }),
        ...(query.tag && { tags: { has: query.tag } }),
        ...(query.areaId && { areaId: query.areaId }),
        ...(query.goalId && { goalId: query.goalId }),
        ...(query.eventId && { eventId: query.eventId }),
        ...(query.blockId && { blockId: query.blockId }),
        // dentro de AND para não colidir com o OR da busca
        ...(cursor && { AND: [afterCursor(cursor)] }),
      },
      orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      include: WITH_LINK,
    });
    const page = rows.slice(0, query.limit);
    const last = page[page.length - 1];
    return {
      items: page.map((row) => {
        const { content, ...rest } = toNoteResponse(row);
        return { ...rest, excerpt: makeExcerpt(content) };
      }),
      nextCursor:
        rows.length > query.limit && last
          ? encodeCursor({ pinned: last.pinned, updatedAt: last.updatedAt, id: last.id })
          : null,
    };
  }

  /** As tags da pessoa com quantas notas cada uma tem, da mais usada para a menos usada (para os filtros). */
  async tags(userId: string): Promise<TagCount[]> {
    const rows = await this.prisma.$queryRaw<{ tag: string; count: bigint }[]>`
      SELECT t AS tag, count(*) AS count
      FROM "Note", unnest("tags") AS t
      WHERE "userId" = ${userId}
      GROUP BY t
      ORDER BY count(*) DESC, t ASC`;
    return rows.map((row) => ({ tag: row.tag, count: Number(row.count) }));
  }
}
