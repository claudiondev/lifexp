import type { Note, NoteListItem } from '@lifexp/shared';
import { json } from '../goals/testing';

export const NOTE_ID = '0192f1a0-7b3c-7000-8000-0000000000e1';
export const NOW_ISO = '2026-10-07T15:00:00.000Z';

export function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: NOTE_ID,
    title: 'Ideias do livro',
    content: '# Capítulo 1\n\nCena inicial no porto.',
    tags: ['livro'],
    pinned: false,
    link: null,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
    ...overrides,
  };
}

const excerptOf = (content: string) =>
  content
    .replace(/[#*_`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export function toItem(note: Note): NoteListItem {
  const { content, ...rest } = note;
  return { ...rest, excerpt: excerptOf(content) };
}

export interface FakeNotes {
  notes: Note[];
  calls: { method: string; url: string; body?: Record<string, unknown> }[];
  /** Resposta forçada para a próxima chamada que combinar com o método (ex.: 409 ao fixar). */
  failNext?: { method: string; status: number; message: string } | undefined;
  handle: (url: string, init?: RequestInit) => Response | null;
}

/**
 * API de notas em memória que imita as regras do servidor que a tela usa: fixadas primeiro, busca,
 * filtro por tag e por vínculo, paginação por cursor (o id da última nota), PATCH parcial e DELETE.
 */
export function makeFakeNotes(initial: Note[] = []): FakeNotes {
  const fake: FakeNotes = {
    notes: [...initial],
    calls: [],
    failNext: undefined,
    handle(url, init) {
      const method = init?.method ?? 'GET';
      if (!url.startsWith('/api/notes')) return null;
      const body = init?.body
        ? (JSON.parse(String(init.body)) as Record<string, unknown>)
        : undefined;
      fake.calls.push({ method, url, ...(body && { body }) });

      if (fake.failNext && fake.failNext.method === method) {
        const { status, message } = fake.failNext;
        fake.failNext = undefined;
        return json(status, { message });
      }

      const path = new URL(url, 'http://x');
      if (path.pathname === '/api/notes/tags') {
        const counts = new Map<string, number>();
        for (const note of fake.notes)
          for (const tag of note.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
        return json(
          200,
          [...counts]
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .map(([tag, count]) => ({ tag, count })),
        );
      }
      if (path.pathname === '/api/notes' && method === 'GET') {
        const q = path.searchParams.get('q')?.toLowerCase();
        const tag = path.searchParams.get('tag');
        const limit = Number(path.searchParams.get('limit'));
        const before = path.searchParams.get('before');
        const link = (['goalId', 'eventId', 'blockId', 'areaId'] as const)
          .map((key) => [key, path.searchParams.get(key)] as const)
          .find(([, value]) => value);
        const linkType = {
          goalId: 'goal',
          eventId: 'event',
          blockId: 'block',
          areaId: 'area',
        } as const;
        const sorted = [...fake.notes]
          .filter((note) => !q || `${note.title} ${note.content}`.toLowerCase().includes(q))
          .filter((note) => !tag || note.tags.includes(tag))
          .filter(
            (note) => !link || (note.link?.type === linkType[link[0]] && note.link.id === link[1]),
          )
          .sort(
            (a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt),
          );
        const start = before ? sorted.findIndex((note) => note.id === before) + 1 : 0;
        const slice = sorted.slice(start, start + limit);
        const hasMore = start + limit < sorted.length;
        return json(200, {
          items: slice.map(toItem),
          nextCursor: hasMore ? slice[slice.length - 1]!.id : null,
        });
      }
      if (path.pathname === '/api/notes' && method === 'POST') {
        const created = makeNote({
          id: `0192f1a0-7b3c-7000-8000-00000000f${String(fake.notes.length).padStart(3, '0')}`,
          title: String(body!['title']),
          content: String(body!['content'] ?? ''),
          tags: (body!['tags'] as string[] | undefined) ?? [],
          pinned: Boolean(body!['pinned']),
          link: body!['link']
            ? { ...(body!['link'] as { type: 'goal'; id: string }), label: 'Alvo' }
            : null,
        });
        fake.notes.push(created);
        return json(201, created);
      }
      const one = /^\/api\/notes\/([0-9a-f-]{36})$/.exec(path.pathname);
      if (one) {
        const index = fake.notes.findIndex((note) => note.id === one[1]);
        if (index === -1) return json(404, { message: 'Nota não encontrada' });
        if (method === 'GET') return json(200, fake.notes[index]);
        if (method === 'DELETE') {
          fake.notes.splice(index, 1);
          return new Response(null, { status: 204 });
        }
        if (method === 'PATCH') {
          const current = fake.notes[index]!;
          const patch = body!;
          const next: Note = {
            ...current,
            ...(patch['title'] !== undefined && { title: String(patch['title']) }),
            ...(patch['content'] !== undefined && { content: String(patch['content']) }),
            ...(patch['tags'] !== undefined && { tags: patch['tags'] as string[] }),
            ...(patch['pinned'] !== undefined && { pinned: Boolean(patch['pinned']) }),
            ...(patch['link'] !== undefined && {
              link: patch['link']
                ? { ...(patch['link'] as { type: 'goal'; id: string }), label: 'Alvo' }
                : null,
            }),
          };
          fake.notes[index] = next;
          return json(200, next);
        }
      }
      return json(404);
    },
  };
  return fake;
}
