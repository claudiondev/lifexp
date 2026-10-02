import { Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import type { NoteListItem } from '@lifexp/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/features/auth/useAuth';
import { NoteCard } from '@/features/notes/NoteCard';
import { normalizeTag } from '@/features/notes/noteFormat';
import {
  useDebounced,
  useNoteList,
  useNoteMutations,
  useNoteTags,
} from '@/features/notes/useNotes';
import { cn } from '@/lib/utils';
import { PageHeader } from './PageHeader';

export function NotesPage() {
  const { state } = useAuth();
  const [params, setParams] = useSearchParams();
  const tag = params.get('tag') ? normalizeTag(params.get('tag')!) : undefined;
  const urlQuery = params.get('q') ?? '';
  const [search, setSearch] = useState(urlQuery);
  const q = useDebounced(search.trim(), 300);
  const timezone = state.status === 'authenticated' ? state.user.timezone : 'UTC';

  // O texto buscado e a tag ficam na URL: dá para atualizar a página, voltar e compartilhar o filtro.
  useEffect(() => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (q) next.set('q', q);
        else next.delete('q');
        return next;
      },
      { replace: true },
    );
  }, [q, setParams]);

  const notes = useNoteList({ q: q || undefined, tag });
  const tags = useNoteTags();
  const { update } = useNoteMutations();
  const items = notes.data?.pages.flatMap((page) => page.items) ?? [];
  const filtering = Boolean(q || tag);

  const chooseTag = (value: string | undefined) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value) next.set('tag', value);
        else next.delete('tag');
        return next;
      },
      { replace: true },
    );

  const togglePin = (note: NoteListItem) =>
    update.mutate(
      { id: note.id, input: { pinned: !note.pinned } },
      { onError: (error) => toast.error(error.message) },
    );

  return (
    <main className="mx-auto max-w-4xl px-5 py-10">
      <PageHeader
        eyebrow="Anotações"
        title="Notas"
        description="Ideias, reuniões e aprendizados em markdown, ligados à sua rotina."
        actions={
          <Button asChild>
            <Link to="/notas/nova">
              <Plus aria-hidden className="size-4" />
              Nova nota
            </Link>
          </Button>
        }
      />

      <div className="relative mt-6">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          aria-label="Buscar nas notas"
          placeholder="Buscar no título e no texto"
          className="pl-10"
          maxLength={100}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {tags.data && tags.data.length > 0 && (
        <div role="group" aria-label="Filtrar por tag" className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={!tag}
            onClick={() => chooseTag(undefined)}
            className={cn(
              'h-8 rounded-full border px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
              !tag
                ? 'border-primary bg-primary/15'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            Todas
          </button>
          {tags.data.map((item) => (
            <button
              key={item.tag}
              type="button"
              aria-pressed={tag === item.tag}
              onClick={() => chooseTag(item.tag)}
              className={cn(
                'h-8 rounded-full border px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                tag === item.tag
                  ? 'border-primary bg-primary/15'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              #{item.tag} <span className="font-hud text-xs tabular-nums">{item.count}</span>
            </button>
          ))}
        </div>
      )}

      <section aria-label="Lista de notas" className="mt-6">
        {notes.isPending && (
          <div aria-busy="true" className="space-y-3">
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className="h-24 animate-pulse rounded-2xl border border-border bg-card/50"
              />
            ))}
          </div>
        )}

        {notes.isError && (
          <div
            role="alert"
            className="rounded-2xl border border-destructive/40 bg-destructive/10 p-5"
          >
            <p className="text-destructive">Não foi possível carregar as notas.</p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={() => void notes.refetch()}
            >
              Tentar de novo
            </Button>
          </div>
        )}

        {notes.isSuccess && items.length === 0 && (
          <p className="rounded-2xl border border-dashed border-border bg-card/40 p-8 text-center text-muted-foreground">
            {filtering
              ? 'Nenhuma nota encontrada com esse filtro.'
              : 'Você ainda não tem notas. Registre a primeira ideia.'}
          </p>
        )}

        {items.length > 0 && (
          <ul className="space-y-3">
            {items.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                timezone={timezone}
                onTogglePin={togglePin}
                pinBusy={update.isPending}
              />
            ))}
          </ul>
        )}

        {notes.hasNextPage && (
          <div className="mt-4 flex justify-center">
            <Button
              variant="secondary"
              disabled={notes.isFetchingNextPage}
              onClick={() => void notes.fetchNextPage()}
            >
              {notes.isFetchingNextPage ? 'Carregando…' : 'Carregar mais'}
            </Button>
          </div>
        )}
      </section>
    </main>
  );
}
