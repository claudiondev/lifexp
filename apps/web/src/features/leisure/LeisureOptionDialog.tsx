import { zodResolver } from '@hookform/resolvers/zod';
import {
  LEISURE_NAME_MAX,
  createLeisureOptionSchema,
  type LeisureIcon,
  type LeisureOption,
} from '@lifexp/shared';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { TextField } from '../auth/TextField';
import { useServerError } from '../auth/useAuthForm';
import { LEISURE_ICON_LABELS, LEISURE_ICON_LIST, LeisureIconView } from './leisureAppearance';
import { useLeisureMutations } from './useLeisure';

type FormInput = z.input<typeof createLeisureOptionSchema>;
type FormOutput = z.output<typeof createLeisureOptionSchema>;

interface LeisureOptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Sem lazer: modo criação. Com lazer: modo edição. */
  option?: LeisureOption | null;
}

export function LeisureOptionDialog({ open, onOpenChange, option }: LeisureOptionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <LeisureOptionForm
          key={option?.id ?? 'new'}
          option={option ?? null}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function LeisureOptionForm({
  option,
  onDone,
}: {
  option: LeisureOption | null;
  onDone: () => void;
}) {
  const { create, update } = useLeisureMutations();
  const { serverError, run } = useServerError();
  const editing = option !== null;

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(createLeisureOptionSchema),
    defaultValues: { name: option?.name ?? '', icon: option?.icon ?? 'smartphone' },
  });

  const onSubmit = handleSubmit((values) =>
    run(async () => {
      if (option) await update.mutateAsync({ id: option.id, input: values });
      else await create.mutateAsync(values);
      toast.success(editing ? 'Lazer atualizado' : `Lazer “${values.name}” cadastrado`);
      onDone();
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <div>
        <DialogTitle>{editing ? 'Editar lazer' : 'Novo lazer'}</DialogTitle>
        <DialogDescription>
          É no que você gasta o tempo que conquistou: uma rede social, uma série, um jogo.
        </DialogDescription>
      </div>

      <TextField
        label="Nome"
        autoComplete="off"
        placeholder="Ex.: Instagram"
        maxLength={LEISURE_NAME_MAX + 10}
        error={errors.name?.message}
        {...register('name')}
      />

      <Controller
        control={control}
        name="icon"
        render={({ field }) => (
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">Ícone</legend>
            <div className="flex flex-wrap gap-2">
              {LEISURE_ICON_LIST.map((icon: LeisureIcon) => (
                <label
                  key={icon}
                  className={cn(
                    'grid size-11 cursor-pointer place-items-center rounded-lg border transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring',
                    field.value === icon
                      ? 'border-mana bg-mana/10 text-mana'
                      : 'border-border text-muted-foreground hover:bg-accent',
                  )}
                >
                  <input
                    type="radio"
                    name="leisure-icon"
                    value={icon}
                    checked={field.value === icon}
                    onChange={() => field.onChange(icon)}
                    aria-label={LEISURE_ICON_LABELS[icon]}
                    className="sr-only"
                  />
                  <LeisureIconView icon={icon} className="size-5" />
                </label>
              ))}
            </div>
          </fieldset>
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
          {editing ? 'Salvar' : 'Cadastrar lazer'}
        </Button>
      </div>
    </form>
  );
}
