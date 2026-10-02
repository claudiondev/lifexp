import { Pin, PinOff } from 'lucide-react';
import { Link } from 'react-router';
import type { NoteListItem } from '@lifexp/shared';
import { cn } from '@/lib/utils';
import { linkText, shortDate } from './noteFormat';

interface NoteCardProps {
  note: NoteListItem;
  timezone: string;
  onTogglePin: (note: NoteListItem) => void;
  pinBusy: boolean;
}

/** Uma nota na lista: título, trecho, tags e vínculo; fixar é um botão ao lado (nunca dentro do link). */
export function NoteCard({ note, timezone, onTogglePin, pinBusy }: NoteCardProps) {
  return (
    <li
      className={cn(
        'flex items-start gap-2 rounded-2xl border bg-card/70 p-4 backdrop-blur transition-colors hover:bg-card',
        note.pinned ? 'border-xp/50' : 'border-border',
      )}
    >
      <Link
        to={`/notas/${note.id}`}
        className="min-w-0 flex-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <p className="truncate font-display text-lg font-semibold">{note.title}</p>
        {note.excerpt && (
          <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{note.excerpt}</p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          {note.link && (
            <span className="rounded-full bg-primary/15 px-2 py-0.5 font-medium">
              {linkText(note.link)}
            </span>
          )}
          {note.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-secondary px-2 py-0.5 text-muted-foreground">
              #{tag}
            </span>
          ))}
          <span className="ml-auto font-hud text-muted-foreground tabular-nums">
            {shortDate(note.updatedAt, timezone)}
          </span>
        </div>
      </Link>
      <button
        type="button"
        aria-label={note.pinned ? `Desafixar nota: ${note.title}` : `Fixar nota: ${note.title}`}
        aria-pressed={note.pinned}
        disabled={pinBusy}
        onClick={() => onTogglePin(note)}
        className={cn(
          'grid size-9 shrink-0 place-items-center rounded-lg transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60',
          note.pinned ? 'text-xp' : 'text-muted-foreground',
        )}
      >
        {note.pinned ? (
          <Pin aria-hidden className="size-4" />
        ) : (
          <PinOff aria-hidden className="size-4" />
        )}
      </button>
    </li>
  );
}
