import { zodResolver } from '@hookform/resolvers/zod';
import {
  createGoalSchema,
  type CreateGoalInput,
  type Goal,
  type UpdateGoalInput,
} from '@lifexp/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { TextField } from '../auth/TextField';
import { useServerError } from '../auth/useAuthForm';
import { useAreas } from '../areas/useAreas';
import { useGoalMutations } from './useGoals';

interface GoalFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Sem meta: modo criação. Com meta: modo edição. */
  goal?: Goal | null;
  /** Chamado com a meta criada (para abrir o detalhe, por exemplo). */
  onCreated?: (goal: Goal) => void;
}

export function GoalFormDialog({ open, onOpenChange, goal, onCreated }: GoalFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* key: reinicia o formulário a cada abertura ou troca de meta. */}
        <GoalForm
          key={`${open}-${goal?.id ?? 'new'}`}
          goal={goal ?? null}
          onCreated={onCreated}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

/** Campo numérico vazio vira "ausente"; o schema compartilhado decide se isso é válido. */
const optionalNumber = (value: unknown) =>
  value === '' || value === null || value === undefined ? undefined : Number(value);
const emptyToNull = (value: unknown) => (value === '' || value === undefined ? null : value);

function GoalForm({
  goal,
  onCreated,
  onDone,
}: {
  goal: Goal | null;
  onCreated: ((goal: Goal) => void) | undefined;
  onDone: () => void;
}) {
  const { create, update } = useGoalMutations();
  const { serverError, run } = useServerError();
  const areas = useAreas(false);
  const editing = goal !== null;
  const [measured, setMeasured] = useState(goal?.targetValue != null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateGoalInput>({
    resolver: zodResolver(createGoalSchema),
    defaultValues: {
      title: goal?.title ?? '',
      description: goal?.description ?? null,
      areaId: goal?.areaId ?? null,
      deadline: goal?.deadline ?? null,
      targetValue: goal?.targetValue ?? undefined,
      currentValue: goal?.currentValue ?? undefined,
      unit: goal?.unit ?? null,
    },
  });

  const onSubmit = handleSubmit((values) =>
    run(async () => {
      // Sem "medir por valor", a métrica inteira some (a API não aceita atual/unidade sem alvo).
      const metric = measured
        ? {
            targetValue: values.targetValue ?? null,
            currentValue: values.currentValue ?? null,
            unit: values.unit?.trim() ? values.unit.trim() : null,
          }
        : { targetValue: null, currentValue: null, unit: null };
      const common = {
        title: values.title,
        description: values.description?.trim() ? values.description.trim() : null,
        areaId: values.areaId ?? null,
        deadline: values.deadline ?? null,
      };

      if (goal) {
        const input: UpdateGoalInput = { ...common, ...metric };
        await update.mutateAsync({ id: goal.id, input });
        toast.success('Meta atualizada');
      } else {
        const created = await create.mutateAsync({ ...common, ...metric });
        toast.success(`Meta “${created.title}” criada`);
        onCreated?.(created);
      }
      onDone();
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <div>
        <DialogTitle>{editing ? 'Editar meta' : 'Nova meta'}</DialogTitle>
        <DialogDescription>
          Uma meta junta marcos e blocos de tempo em torno de algo que você quer alcançar.
        </DialogDescription>
      </div>

      <TextField
        label="Título"
        autoComplete="off"
        placeholder="Ex.: Ler 12 livros"
        error={errors.title?.message}
        {...register('title')}
      />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="goal-description">Descrição (opcional)</Label>
        <Input
          id="goal-description"
          autoComplete="off"
          {...register('description', { setValueAs: emptyToNull })}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="goal-area">Área (opcional)</Label>
          <Select id="goal-area" {...register('areaId', { setValueAs: emptyToNull })}>
            <option value="">Sem área</option>
            {areas.data?.map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="goal-deadline">Prazo (opcional)</Label>
          <Input
            id="goal-deadline"
            type="date"
            aria-invalid={errors.deadline ? true : undefined}
            {...register('deadline', { setValueAs: emptyToNull })}
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-background/50 p-4">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="goal-measured">Medir por valor</Label>
          <Switch id="goal-measured" checked={measured} onCheckedChange={setMeasured} />
        </div>
        {!measured && (
          <p className="text-sm text-muted-foreground">
            Sem valor, o progresso vem dos marcos que você concluir.
          </p>
        )}
        {measured && (
          <div className="grid gap-3 sm:grid-cols-3">
            <TextField
              label="Valor-alvo"
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              error={errors.targetValue?.message}
              {...register('targetValue', { setValueAs: optionalNumber })}
            />
            <TextField
              label="Valor atual"
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              error={errors.currentValue?.message}
              {...register('currentValue', { setValueAs: optionalNumber })}
            />
            <TextField
              label="Unidade"
              autoComplete="off"
              placeholder="km, livros…"
              error={errors.unit?.message}
              {...register('unit', { setValueAs: emptyToNull })}
            />
          </div>
        )}
      </div>

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
          {editing ? 'Salvar' : 'Criar meta'}
        </Button>
      </div>
    </form>
  );
}
