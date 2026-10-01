import { zodResolver } from '@hookform/resolvers/zod';
import {
  createActivitySchema,
  XP_WEIGHT_DEFAULT,
  XP_WEIGHT_MAX,
  XP_WEIGHT_MIN,
  type Activity,
  type Area,
} from '@lifexp/shared';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { TextField } from '../auth/TextField';
import { useServerError } from '../auth/useAuthForm';
import { formatWeight } from './formatWeight';
import { useActivityMutations } from './useActivities';

// A área vem do cartão em que o diálogo foi aberto; não é um campo do formulário.
const formSchema = createActivitySchema.omit({ areaId: true });
type FormInput = z.input<typeof formSchema>;
type FormOutput = z.output<typeof formSchema>;

interface ActivityFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  area: Area;
  /** Sem atividade: modo criação. Com atividade: modo edição. */
  activity?: Activity | null;
}

export function ActivityFormDialog({
  open,
  onOpenChange,
  area,
  activity,
}: ActivityFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <ActivityForm
          key={activity?.id ?? 'new'}
          area={area}
          activity={activity ?? null}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function ActivityForm({
  area,
  activity,
  onDone,
}: {
  area: Area;
  activity: Activity | null;
  onDone: () => void;
}) {
  const { create, update } = useActivityMutations();
  const { serverError, run } = useServerError();
  const editing = activity !== null;

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: activity?.name ?? '',
      xpWeight: activity?.xpWeight ?? XP_WEIGHT_DEFAULT,
    },
  });

  const onSubmit = handleSubmit((values) =>
    run(async () => {
      if (activity) await update.mutateAsync({ id: activity.id, input: values });
      else await create.mutateAsync({ ...values, areaId: area.id });
      toast.success(editing ? 'Atividade atualizada' : `Atividade “${values.name}” criada`);
      onDone();
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <div>
        <DialogTitle>{editing ? 'Editar atividade' : 'Nova atividade'}</DialogTitle>
        <DialogDescription>
          {editing ? `Em ${area.name}.` : `Será criada em ${area.name}.`} É o que você escolhe ao
          planejar um bloco.
        </DialogDescription>
      </div>

      <TextField
        label="Nome"
        autoComplete="off"
        placeholder="Ex.: Reunião de planejamento"
        error={errors.name?.message}
        {...register('name')}
      />

      <Controller
        control={control}
        name="xpWeight"
        render={({ field }) => (
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="xp-weight">Peso do XP</Label>
              <span className="font-hud text-lg font-bold text-xp tabular-nums">
                {formatWeight(Number(field.value))}
              </span>
            </div>
            <input
              id="xp-weight"
              type="range"
              min={XP_WEIGHT_MIN}
              max={XP_WEIGHT_MAX}
              step={0.1}
              value={field.value}
              onChange={(event) => field.onChange(Number(event.target.value))}
              className="h-2 w-full cursor-pointer accent-xp"
              aria-describedby="xp-weight-help"
            />
            <p id="xp-weight-help" className="text-sm text-muted-foreground">
              {formatWeight(XP_WEIGHT_DEFAULT)} é o padrão. Atividades mais exigentes podem valer
              mais, até {formatWeight(XP_WEIGHT_MAX)}.
            </p>
            {errors.xpWeight && (
              <span className="text-sm text-destructive">{errors.xpWeight.message}</span>
            )}
          </div>
        )}
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
          {editing ? 'Salvar' : 'Criar atividade'}
        </Button>
      </div>
    </form>
  );
}
