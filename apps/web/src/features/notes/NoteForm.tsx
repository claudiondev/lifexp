import { NOTE_CONTENT_MAX, NOTE_TITLE_MAX, type Note, type NoteLinkInput } from '@lifexp/shared';
import { Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useServerError } from '../auth/useAuthForm';
import { LinkPicker } from './LinkPicker';
import { MarkdownView } from './MarkdownView';
import { TagsInput } from './TagsInput';
import { useNoteMutations } from './useNotes';

interface Draft {
  title: string;
  content: string;
  tags: string[];
  pinned: boolean;
  link: NoteLinkInput | null;
}

export interface NotePrefill {
  link: NoteLinkInput;
  label: string | null;
}

const fromNote = (note: Note): Draft => ({
  title: note.title,
  content: note.content,
  tags: note.tags,
  pinned: note.pinned,
  link: note.link ? { type: note.link.type, id: note.link.id } : null,
});

const sameLink = (a: NoteLinkInput | null, b: NoteLinkInput | null) =>
  a?.type === b?.type && a?.id === b?.id;

const isDirty = (a: Draft, b: Draft) =>
  a.title !== b.title ||
  a.content !== b.content ||
  a.pinned !== b.pinned ||
  a.tags.join('\u0000') !== b.tags.join('\u0000') ||
  !sameLink(a.link, b.link);

/** O editor de uma nota nova (`note` nulo) ou existente. */
export function NoteForm({ note, prefill }: { note: Note | null; prefill?: NotePrefill | null }) {
  const navigate = useNavigate();
  const { create, update, remove } = useNoteMutations();
  const { serverError, run } = useServerError();
  const initial: Draft = note
    ? fromNote(note)
    : { title: '', content: '', tags: [], pinned: false, link: prefill?.link ?? null };
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const [titleError, setTitleError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const label = note?.link?.label ?? prefill?.label ?? null;
  const dirty = isDirty(draft, saved);
  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));
  // Um vínculo escolhido pela metade (tipo sem alvo) ainda não vale: não vai para a API.
  const link = draft.link && draft.link.id ? draft.link : null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.title.trim()) {
      setTitleError('Dê um título à nota');
      return;
    }
    setTitleError(null);
    void run(async () => {
      if (note) {
        const updated = await update.mutateAsync({
          id: note.id,
          input: { ...draft, title: draft.title, link },
        });
        setSaved(fromNote(updated));
        setDraft(fromNote(updated));
        toast.success('Nota salva');
      } else {
        const created = await create.mutateAsync({
          title: draft.title,
          content: draft.content,
          tags: draft.tags,
          pinned: draft.pinned,
          ...(link && { link }),
        });
        toast.success('Nota criada');
        await navigate(`/notas/${created.id}`, { replace: true });
      }
    });
  };

  const confirmDelete = () => {
    if (!note) return;
    remove.mutate(note.id, {
      onSuccess: () => {
        toast.success('Nota excluída');
        void navigate('/notas', { replace: true });
      },
      onError: (error) => toast.error(error.message),
    });
  };

  const busy = create.isPending || update.isPending;

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="note-title">Título</Label>
        <Input
          id="note-title"
          value={draft.title}
          maxLength={NOTE_TITLE_MAX}
          aria-invalid={titleError ? true : undefined}
          onChange={(event) => set({ title: event.target.value })}
        />
        {titleError && <span className="text-sm text-destructive">{titleError}</span>}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="note-content">Texto (markdown)</Label>
          <div
            role="tablist"
            aria-label="Modo do texto"
            className="flex gap-1 rounded-lg bg-secondary p-1"
          >
            {(
              [
                ['write', 'Escrever'],
                ['preview', 'Visualizar'],
              ] as const
            ).map(([value, text]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={mode === value}
                onClick={() => setMode(value)}
                className={cn(
                  'rounded-md px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring',
                  mode === value ? 'bg-background text-foreground' : 'text-muted-foreground',
                )}
              >
                {text}
              </button>
            ))}
          </div>
        </div>
        {mode === 'write' ? (
          <>
            <Textarea
              id="note-content"
              className="min-h-64 font-mono"
              maxLength={NOTE_CONTENT_MAX}
              value={draft.content}
              onChange={(event) => set({ content: event.target.value })}
            />
            <span className="self-end font-hud text-xs text-muted-foreground tabular-nums">
              {draft.content.length}/{NOTE_CONTENT_MAX}
            </span>
          </>
        ) : (
          <div
            role="tabpanel"
            aria-label="Visualização"
            className="min-h-64 rounded-lg border border-input bg-background/60 px-4 py-3"
          >
            {draft.content.trim() ? (
              <MarkdownView source={draft.content} />
            ) : (
              <p className="text-sm text-muted-foreground">Nada para mostrar ainda.</p>
            )}
          </div>
        )}
      </div>

      <TagsInput tags={draft.tags} onChange={(tags) => set({ tags })} />
      <LinkPicker
        value={draft.link}
        currentLabel={label}
        onChange={(next) => set({ link: next })}
      />

      <div className="flex items-center gap-3">
        <Switch
          id="note-pinned"
          checked={draft.pinned}
          onCheckedChange={(pinned) => set({ pinned })}
        />
        <Label htmlFor="note-pinned">Fixar no topo da lista</Label>
      </div>

      {serverError && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {serverError}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {note ? (
          <Button type="button" variant="destructive" onClick={() => setDeleting(true)}>
            <Trash2 aria-hidden className="size-4" />
            Excluir
          </Button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-3">
          {note && !dirty && <span className="text-sm text-muted-foreground">Tudo salvo</span>}
          <Button type="submit" disabled={busy || (!!note && !dirty)}>
            {busy ? 'Salvando...' : note ? 'Salvar' : 'Criar nota'}
          </Button>
        </div>
      </div>

      <Dialog open={deleting} onOpenChange={setDeleting}>
        <DialogContent>
          {deleting && (
            <>
              <DialogTitle>Excluir a nota?</DialogTitle>
              <DialogDescription>
                “{saved.title}” será apagada para sempre. Não dá para desfazer.
              </DialogDescription>
              <div className="mt-5 flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setDeleting(false)}>
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={remove.isPending}
                  onClick={confirmDelete}
                >
                  Excluir nota
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </form>
  );
}
