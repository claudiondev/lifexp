import type { Goal } from '@lifexp/shared';
import { Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { allowsMilestoneToggle } from './goalFormat';

interface MilestoneListProps {
  goal: Goal;
  busy: boolean;
  onToggle: (milestoneId: string, done: boolean) => void;
  onAdd: (title: string) => Promise<void>;
  onRemove: (milestoneId: string) => void;
}

export function MilestoneList({ goal, busy, onToggle, onAdd, onRemove }: MilestoneListProps) {
  const [title, setTitle] = useState('');
  const canToggle = allowsMilestoneToggle(goal.status);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    await onAdd(trimmed);
    setTitle('');
  };

  return (
    <section
      aria-labelledby="milestones-title"
      className="rounded-2xl border border-border bg-card/80 p-5 backdrop-blur"
    >
      <h2 id="milestones-title" className="font-display text-xl font-bold">
        Marcos
      </h2>
      <p className="text-sm text-muted-foreground">
        Cada marco concluído rende +100 XP.
        {!canToggle && ' Reabra a meta para concluir ou desfazer marcos.'}
      </p>

      {goal.milestones.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          Nenhum marco ainda. Divida a meta em passos para acompanhar o progresso.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {goal.milestones.map((milestone) => (
            <li
              key={milestone.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-background/40 p-3"
            >
              <input
                id={`milestone-${milestone.id}`}
                type="checkbox"
                checked={milestone.done}
                disabled={busy || !canToggle}
                onChange={(event) => onToggle(milestone.id, event.target.checked)}
                className="size-5 shrink-0 cursor-pointer accent-[var(--primary)] disabled:cursor-not-allowed"
              />
              <label
                htmlFor={`milestone-${milestone.id}`}
                className={cn(
                  'min-w-0 flex-1 truncate text-sm',
                  milestone.done && 'text-muted-foreground line-through',
                )}
              >
                {milestone.title}
              </label>
              {milestone.done && (
                <span className="font-hud text-xs text-xp tabular-nums">+100 XP</span>
              )}
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Excluir marco ${milestone.title}`}
                disabled={busy}
                onClick={() => onRemove(milestone.id)}
              >
                <Trash2 aria-hidden className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={(event) => void submit(event)} className="mt-4 flex gap-2">
        <Input
          aria-label="Novo marco"
          placeholder="Ex.: Terminar o primeiro livro"
          maxLength={120}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <Button type="submit" variant="secondary" disabled={busy || title.trim() === ''}>
          <Plus aria-hidden className="size-4" />
          Adicionar
        </Button>
      </form>
    </section>
  );
}
