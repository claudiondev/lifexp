import { ArrowLeft } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router';
import type { NoteLinkInput, NoteLinkType } from '@lifexp/shared';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/apiClient';
import { NoteForm, type NotePrefill } from '@/features/notes/NoteForm';
import { useNote } from '@/features/notes/useNotes';
import { PageHeader } from './PageHeader';

const PREFILL_PARAMS: [string, NoteLinkType][] = [
  ['goalId', 'goal'],
  ['eventId', 'event'],
  ['blockId', 'block'],
  ['areaId', 'area'],
];

/** O atalho "Anotar" abre o editor já com o vínculo: `/notas/nova?goalId=...&rotulo=Nome`. */
function readPrefill(params: URLSearchParams): NotePrefill | null {
  for (const [key, type] of PREFILL_PARAMS) {
    const id = params.get(key);
    if (id && /^[0-9a-f-]{36}$/i.test(id)) {
      const link: NoteLinkInput = { type, id };
      return { link, label: params.get('rotulo')?.slice(0, 120) ?? null };
    }
  }
  return null;
}

export function NoteEditorPage() {
  const { noteId } = useParams();
  const [params] = useSearchParams();
  const note = useNote(noteId);
  const isNew = noteId === undefined;

  const back = (
    <Button asChild variant="ghost" size="sm" className="-ml-3 mb-2">
      <Link to="/notas">
        <ArrowLeft aria-hidden className="size-4" />
        Notas
      </Link>
    </Button>
  );

  if (!isNew && note.isError) {
    const missing = note.error instanceof ApiError && note.error.status === 404;
    return (
      <main className="mx-auto max-w-3xl px-5 py-10">
        {back}
        <div
          role="alert"
          className="rounded-2xl border border-destructive/40 bg-destructive/10 p-5"
        >
          <p className="text-destructive">
            {missing ? 'Essa nota não existe mais.' : 'Não foi possível carregar a nota.'}
          </p>
          {!missing && (
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={() => void note.refetch()}
            >
              Tentar de novo
            </Button>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      {back}
      <PageHeader eyebrow="Anotações" title={isNew ? 'Nova nota' : 'Editar nota'} />
      <div className="mt-6 rounded-2xl border border-border bg-card/80 p-5 backdrop-blur sm:p-6">
        {!isNew && note.isPending && (
          <div aria-busy="true" className="h-64 animate-pulse rounded-xl bg-background/40" />
        )}
        {isNew && <NoteForm note={null} prefill={readPrefill(params)} />}
        {!isNew && note.isSuccess && <NoteForm key={note.data.id} note={note.data} />}
      </div>
    </main>
  );
}
