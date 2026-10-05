import { todayIn, type Task } from '@lifexp/shared';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/useAuth';
import { QuickAddTask } from '@/features/tasks/QuickAddTask';
import { TaskFormDialog } from '@/features/tasks/TaskFormDialog';
import { TaskList } from '@/features/tasks/TaskList';
import { useTaskActions } from '@/features/tasks/useTaskActions';
import { useTaskList } from '@/features/tasks/useTasks';
import { LevelUpDialog } from '@/features/today/LevelUpDialog';
import { PageHeader } from './PageHeader';

/** Caixa de entrada: tarefas sem dia. Dali a pessoa escolhe quando fazer ("Para hoje" ou editar o dia). */
export function PendingPage() {
  const { state } = useAuth();
  const timezone = state.status === 'authenticated' ? state.user.timezone : 'UTC';
  const today = todayIn(timezone);
  const query = useTaskList('inbox');
  const [levelUp, setLevelUp] = useState<number | null>(null);
  const actions = useTaskActions(setLevelUp);
  const [dialog, setDialog] = useState<{ open: boolean; task: Task | null }>({
    open: false,
    task: null,
  });
  const data = query.data;

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <PageHeader
        eyebrow="Caixa de entrada"
        title="Pendentes"
        description="Tarefas sem dia marcado. Escolha quando fazer cada uma, com “Para hoje” ou editando o dia."
      />

      <div className="mt-6 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <QuickAddTask dueDate={null} label="Anotar uma tarefa sem dia" />
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setDialog({ open: true, task: null })}
          >
            <Plus aria-hidden className="size-4" />
            Nova tarefa
          </Button>
        </div>

        {query.isPending && (
          <div
            aria-busy="true"
            className="h-24 animate-pulse rounded-2xl border border-border bg-card/50"
          />
        )}

        {query.isError && (
          <div
            role="alert"
            className="rounded-2xl border border-destructive/40 bg-destructive/10 p-5"
          >
            <p className="text-destructive">Não foi possível carregar os pendentes.</p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={() => void query.refetch()}
            >
              Tentar de novo
            </Button>
          </div>
        )}

        {data && data.tasks.length === 0 && (
          <p className="rounded-2xl border border-dashed border-border bg-card/40 p-6 text-muted-foreground">
            Nada pendente. Quando surgir algo sem dia definido, anote aqui e decida depois.
          </p>
        )}

        {data && data.tasks.length > 0 && (
          <TaskList
            tasks={data.tasks}
            actions={actions}
            today={today}
            onEdit={(task) => setDialog({ open: true, task })}
          />
        )}
      </div>

      <TaskFormDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
        task={dialog.task}
        today={today}
        defaultDueDate={null}
      />
      <LevelUpDialog level={levelUp} onClose={() => setLevelUp(null)} />
    </main>
  );
}
