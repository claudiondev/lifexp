import {
  createTaskSchema,
  updateTaskSchema,
  type CivilDate,
  type Task,
  type TaskPriority,
} from '@lifexp/shared';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { addDays } from '@lifexp/shared';
import { TextField } from '../auth/TextField';
import { useServerError } from '../auth/useAuthForm';
import { useAreas } from '../areas/useAreas';
import { NoteField } from '../blocks/NoteField';
import { GoalSelect } from '../goals/GoalSelect';
import { useGoalList } from '../goals/useGoals';
import { PRIORITY_OPTIONS } from './taskModel';
import { useTaskMutations } from './useTasks';

interface TaskFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Sem tarefa: modo criação. Com tarefa: modo edição. */
  task?: Task | null;
  /** O dia de hoje (padrão de uma tarefa nova em Hoje). */
  today: CivilDate;
  /** Dia sugerido para uma tarefa nova: hoje (em Hoje) ou nenhum (em Pendentes). */
  defaultDueDate?: CivilDate | null;
}

export function TaskFormDialog({
  open,
  onOpenChange,
  task,
  today,
  defaultDueDate = null,
}: TaskFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* key: reinicia o formulário a cada abertura ou troca de tarefa. */}
        <TaskForm
          key={`${open}-${task?.id ?? 'new'}`}
          task={task ?? null}
          today={today}
          defaultDueDate={defaultDueDate}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

interface FormValues {
  title: string;
  note: string;
  /** Vazio = sem dia (Pendentes). */
  dueDate: string;
  priority: TaskPriority;
  /** Vazio = sem área. */
  areaId: string;
  /** Vazio = sem meta. */
  goalId: string;
}

function TaskForm({
  task,
  today,
  defaultDueDate,
  onDone,
}: {
  task: Task | null;
  today: CivilDate;
  defaultDueDate: CivilDate | null;
  onDone: () => void;
}) {
  const { create, update } = useTaskMutations();
  const { serverError, run } = useServerError();
  const areas = useAreas(false);
  const goals = useGoalList();
  const editing = task !== null;
  const hasGoals =
    task?.goalId != null ||
    (goals.data ?? []).some((goal) => goal.status === 'active' || goal.status === 'paused');

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      title: task?.title ?? '',
      note: task?.note ?? '',
      dueDate: task ? (task.dueDate ?? '') : (defaultDueDate ?? ''),
      priority: task?.priority ?? 'medium',
      areaId: task?.areaId ?? '',
      goalId: task?.goalId ?? '',
    },
  });
  const [note, dueDate] = watch(['note', 'dueDate']);

  const onSubmit = handleSubmit((values) =>
    run(async () => {
      const common = {
        title: values.title,
        note: values.note.trim() ? values.note : null,
        dueDate: values.dueDate || null,
        priority: values.priority,
        areaId: values.areaId || null,
        goalId: values.goalId || null,
      };
      // A mesma validação da API: se passar aqui, o servidor aceita.
      const parsed = (task ? updateTaskSchema : createTaskSchema).safeParse(common);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const field = String(issue.path[0]);
          if (field in values) setError(field as keyof FormValues, { message: issue.message });
        }
        return;
      }
      if (task) {
        await update.mutateAsync({ id: task.id, input: parsed.data });
        toast.success('Tarefa atualizada');
      } else {
        const created = await create.mutateAsync(
          parsed.data as Parameters<typeof create.mutateAsync>[0],
        );
        toast.success(`Tarefa “${created.title}” criada`);
      }
      onDone();
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <div>
        <DialogTitle>{editing ? 'Editar tarefa' : 'Nova tarefa'}</DialogTitle>
        <DialogDescription>
          Uma tarefa é algo para fazer em um dia, sem horário marcado. Sem dia, ela fica em
          Pendentes.
        </DialogDescription>
      </div>

      <TextField
        label="Título"
        autoComplete="off"
        placeholder="Ex.: Pagar a conta de luz"
        error={errors.title?.message}
        {...register('title')}
      />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="task-due">Dia (opcional)</Label>
        <Input
          id="task-due"
          type="date"
          aria-invalid={errors.dueDate ? true : undefined}
          {...register('dueDate')}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setValue('dueDate', today)}
          >
            Hoje
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setValue('dueDate', addDays(today, 1))}
          >
            Amanhã
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={dueDate === ''}
            onClick={() => setValue('dueDate', '')}
          >
            Sem dia (Pendentes)
          </Button>
        </div>
        {errors.dueDate && (
          <span className="text-sm text-destructive">{errors.dueDate.message}</span>
        )}
      </div>

      <fieldset className="flex flex-col gap-2">
        <Label asChild>
          <legend>Prioridade</legend>
        </Label>
        <div className="grid grid-cols-3 gap-2">
          {PRIORITY_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="cursor-pointer rounded-lg border border-border px-2 py-2.5 text-center text-sm font-medium transition has-checked:border-primary has-checked:bg-primary/15 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring"
            >
              <input
                type="radio"
                value={option.value}
                className="sr-only"
                {...register('priority')}
              />
              {option.label}
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Simples rende 10 XP, média 20 e importante 40 (até 100 XP de tarefas por dia).
        </p>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="task-area">Área (opcional)</Label>
          <Select id="task-area" {...register('areaId')}>
            <option value="">Sem área</option>
            {areas.data?.map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </Select>
        </div>
        {hasGoals && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="task-goal">Meta (opcional)</Label>
            <GoalSelect
              id="task-goal"
              currentGoalId={task?.goalId ?? null}
              {...register('goalId')}
            />
          </div>
        )}
      </div>

      <NoteField
        id="task-note"
        value={note}
        hint="Texto livre."
        error={errors.note?.message}
        {...register('note')}
      />

      {serverError && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {serverError}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {editing ? 'Salvar' : 'Criar tarefa'}
        </Button>
      </div>
    </form>
  );
}
