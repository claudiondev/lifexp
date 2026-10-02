import { NotebookPen, Plus } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { newNoteUrl } from './noteLinks';
import { useNoteList } from './useNotes';

const SHOWN = 5;

/** As notas ligadas a uma meta (RF44), com o atalho para escrever uma nova já vinculada. */
export function GoalNotes({ goalId, goalTitle }: { goalId: string; goalTitle: string }) {
  const notes = useNoteList({ goalId });
  const items = notes.data?.pages.flatMap((page) => page.items) ?? [];
  const hasMore = items.length > SHOWN || Boolean(notes.hasNextPage);

  return (
    <section
      aria-labelledby="goal-notes-title"
      className="mt-4 rounded-2xl border border-border bg-card/80 p-5 backdrop-blur"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="goal-notes-title" className="font-display text-xl font-bold">
          Notas
        </h2>
        <Button asChild variant="secondary" size="sm">
          <Link to={newNoteUrl('goal', goalId, goalTitle)}>
            <Plus aria-hidden className="size-4" />
            Nova nota
          </Link>
        </Button>
      </div>

      {notes.isSuccess && items.length === 0 && (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <NotebookPen aria-hidden className="size-4" />
          Nenhuma nota ligada a esta meta ainda.
        </p>
      )}
      {items.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {items.slice(0, SHOWN).map((note) => (
            <li key={note.id}>
              <Link
                to={`/notas/${note.id}`}
                className="block rounded-xl border border-border bg-background/40 p-3 text-sm transition-colors hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-ring"
              >
                <span className="block truncate font-medium">{note.title}</span>
                {note.excerpt && (
                  <span className="block truncate text-muted-foreground">{note.excerpt}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {hasMore && (
        <p className="mt-2 text-sm text-muted-foreground">
          Mostrando as {SHOWN} mais recentes. As outras estão em{' '}
          <Link to="/notas" className="font-semibold text-xp hover:underline">
            Notas
          </Link>
          .
        </p>
      )}
      {notes.isError && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          Não foi possível carregar as notas desta meta.
        </p>
      )}
    </section>
  );
}
