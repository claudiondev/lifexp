import type { CivilDate, Task } from '@lifexp/shared';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { QuickAddTask } from './QuickAddTask';
import { TaskFormDialog } from './TaskFormDialog';
import { TaskList } from './TaskList';
import { taskCounts, xpTodayText } from './taskModel';
import { useTaskActions } from './useTaskActions';
import { useTaskList } from './useTasks';

/**
 * As tarefas do dia (sem horário) dentro da tela Hoje. É um extra: se falhar, a tela segue com os blocos e só esta
 * seção avisa, sem derrubar nada.
 */
export function TasksSection({
  today,
  onLevelUp,
}: {
  today: CivilDate;
  onLevelUp?: (level: number) => void;
}) {
  const query = useTaskList('today');
  const actions = useTaskActions(onLevelUp);
  const [dialog, setDialog] = useState<{ open: boolean; task: Task | null }>({
    open: false,
    task: null,
  });
  const data = query.data;
  const counts = data ? taskCounts(data.tasks) : null;

  return (
    <section aria-label="Tarefas de hoje" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <h2 className="font-display text-xl font-bold">Tarefas de hoje</h2>
          <p className="text-sm text-muted-foreground">
            Coisas para fazer neste dia, sem horário marcado.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {data && (
            <p className="font-hud text-xs text-muted-foreground tabular-nums">
              {xpTodayText(data.xpToday, data.xpCap)}
            </p>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setDialog({ open: true, task: null })}
          >
            <Plus aria-hidden className="size-4" />
            Nova tarefa
          </Button>
        </div>
      </div>

      <QuickAddTask dueDate={today} label="Adicionar uma tarefa para hoje" />

      {query.isPending && (
        <div
          aria-busy="true"
          className="h-20 animate-pulse rounded-2xl border border-border bg-card/50"
        />
      )}

      {query.isError && (
        <p className="rounded-2xl border border-dashed border-border bg-card/40 p-4 text-sm text-muted-foreground">
          Não foi possível carregar as tarefas agora.{' '}
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="cursor-pointer font-semibold text-xp hover:underline"
          >
            Tentar de novo
          </button>
        </p>
      )}

      {data && data.tasks.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border bg-card/40 p-5 text-sm text-muted-foreground">
          Nenhuma tarefa para hoje. Anote acima o que precisa fazer, ou veja o que está em{' '}
          <Link to="/pendentes" className="font-semibold text-xp hover:underline">
            Pendentes
          </Link>
          .
        </p>
      )}

      {data && data.tasks.length > 0 && (
        <>
          {counts && (
            <p className="font-hud text-sm text-muted-foreground tabular-nums">
              {counts.done} de {counts.total} concluídas
            </p>
          )}
          <TaskList
            tasks={data.tasks}
            actions={actions}
            today={today}
            onEdit={(task) => setDialog({ open: true, task })}
          />
        </>
      )}

      <TaskFormDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
        task={dialog.task}
        today={today}
        defaultDueDate={today}
      />
    </section>
  );
}
