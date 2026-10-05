import type { AreaColor, Task } from '@lifexp/shared';
import { Archive, Check, CircleCheck, Pencil, SunMedium, Trash2, Undo2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { AREA_COLOR_CLASSES } from '../areas/areaAppearance';
import { OccurrenceNote } from '../blocks/OccurrenceNote';
import { carriedText, priorityLabel, stepProgress } from './taskModel';
import type { TaskActions } from './useTaskActions';

export interface TaskAreaInfo {
  name: string;
  color: AreaColor;
}

interface TaskCardProps {
  task: Task;
  /** A área da tarefa, se ela tem e a lista de áreas já chegou. */
  area?: TaskAreaInfo | undefined;
  actions: TaskActions;
  onEdit: (task: Task) => void;
  /** O dia de hoje: a tarefa de outro dia (ou sem dia) ganha o atalho "Para hoje". */
  today: string;
}

export function TaskCard({ task, area, actions, onEdit, today }: TaskCardProps) {
  const done = task.completedAt !== null;
  const busy = actions.busyId === task.id;
  const steps = stepProgress(task);
  const carried = carriedText(task);
  const [open, setOpen] = useState(false);
  const [stepTitle, setStepTitle] = useState('');

  const addStep = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = stepTitle.trim();
    if (!trimmed) return;
    actions.addItem(task, trimmed);
    setStepTitle('');
  };

  return (
    <article
      aria-label={task.title}
      className={cn(
        'rounded-2xl border border-border bg-card/80 p-4 backdrop-blur transition-colors',
        done && 'border-xp/30 opacity-80',
      )}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          aria-pressed={done}
          aria-label={done ? `Desfazer “${task.title}”` : `Concluir “${task.title}”`}
          disabled={busy}
          onClick={() => (done ? actions.undo(task) : actions.complete(task))}
          className={cn(
            'mt-0.5 grid size-8 shrink-0 cursor-pointer place-items-center rounded-full border-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60',
            done
              ? 'border-xp bg-xp/20 text-xp'
              : 'border-border text-transparent hover:border-xp hover:text-xp/60',
          )}
        >
          <Check aria-hidden className="size-4" />
        </button>

        <div className="min-w-0 flex-1">
          <h3
            className={cn('font-medium break-words', done && 'text-muted-foreground line-through')}
          >
            {task.title}
          </h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span>{priorityLabel(task.priority)}</span>
            {area && (
              <span className={cn('font-medium', AREA_COLOR_CLASSES[area.color].text)}>
                {area.name}
              </span>
            )}
            {carried && <span>{carried}</span>}
            {done ? (
              <span className="inline-flex items-center gap-1 font-hud text-xp tabular-nums">
                <CircleCheck aria-hidden className="size-3" />
                {task.xpAwarded > 0 ? `+${task.xpAwarded} XP` : 'Feita'}
              </span>
            ) : (
              <span className="font-hud tabular-nums">+{task.xpPreview} XP</span>
            )}
          </p>
          <OccurrenceNote note={task.note} clamp={2} className="mt-1 text-sm" />

          {(steps.total > 0 || open) && (
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen((value) => !value)}
              className="mt-2 cursor-pointer text-xs font-medium text-xp hover:underline focus-visible:outline-2 focus-visible:outline-ring"
            >
              {steps.total > 0 ? `Passos ${steps.done}/${steps.total}` : 'Passos'}
            </button>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {!done && task.dueDate !== today && (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              aria-label={`Fazer “${task.title}” hoje`}
              title="Para hoje"
              onClick={() => actions.moveTo(task, today, `“${task.title}” ficou para hoje`)}
            >
              <SunMedium aria-hidden className="size-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            aria-label={`Editar “${task.title}”`}
            title="Editar"
            onClick={() => onEdit(task)}
          >
            <Pencil aria-hidden className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            aria-label={`Arquivar “${task.title}”`}
            title="Arquivar"
            onClick={() => actions.archive(task)}
          >
            <Archive aria-hidden className="size-4" />
          </Button>
        </div>
      </div>

      {open && (
        <div className="mt-3 border-t border-border pt-3 pl-11">
          <ul aria-label={`Passos de ${task.title}`} className="flex flex-col gap-1.5">
            {task.items.map((item) => (
              <li key={item.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={item.done}
                  disabled={busy}
                  aria-label={item.title}
                  onChange={() => actions.toggleItem(task, item)}
                  className="size-4 cursor-pointer accent-[var(--xp)]"
                />
                <span
                  className={cn(
                    'min-w-0 flex-1 break-words',
                    item.done && 'text-muted-foreground line-through',
                  )}
                >
                  {item.title}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`Remover o passo “${item.title}”`}
                  onClick={() => actions.removeItem(task, item)}
                  className="cursor-pointer text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <Trash2 aria-hidden className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <form onSubmit={addStep} className="mt-2 flex gap-2">
            <Input
              aria-label={`Novo passo de ${task.title}`}
              placeholder="Novo passo"
              autoComplete="off"
              maxLength={120}
              value={stepTitle}
              onChange={(event) => setStepTitle(event.target.value)}
              className="h-9"
            />
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              disabled={!stepTitle.trim() || busy}
            >
              Adicionar passo
            </Button>
          </form>
        </div>
      )}
      {done && !open && task.xpAwarded === 0 && (
        <p className="mt-2 flex items-center gap-1.5 pl-11 text-xs text-muted-foreground">
          <Undo2 aria-hidden className="size-3" />
          Feita sem XP: o máximo de XP de tarefas do dia já tinha sido atingido.
        </p>
      )}
    </article>
  );
}
