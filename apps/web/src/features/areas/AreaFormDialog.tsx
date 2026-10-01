import { zodResolver } from '@hookform/resolvers/zod';
import {
  AREA_COLORS,
  AREA_ICONS,
  createAreaSchema,
  type Area,
  type CreateAreaInput,
} from '@lifexp/shared';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { TextField } from '../auth/TextField';
import { useServerError } from '../auth/useAuthForm';
import { AreaBadge } from './AreaBadge';
import { AREA_COLOR_CLASSES, AREA_ICON_COMPONENTS } from './areaAppearance';
import { useAreaMutations } from './useAreas';

interface AreaFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Sem área: modo criação. Com área: modo edição. */
  area?: Area | null;
}

export function AreaFormDialog({ open, onOpenChange, area }: AreaFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* key: reinicia o formulário a cada abertura ou troca de área. */}
        <AreaForm key={area?.id ?? 'new'} area={area ?? null} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function AreaForm({ area, onDone }: { area: Area | null; onDone: () => void }) {
  const { create, update } = useAreaMutations();
  const { serverError, run } = useServerError();
  const editing = area !== null;

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateAreaInput>({
    resolver: zodResolver(createAreaSchema),
    defaultValues: {
      name: area?.name ?? '',
      color: area?.color ?? 'violet',
      icon: area?.icon ?? 'briefcase',
    },
  });

  const [name, color, icon] = [watch('name'), watch('color'), watch('icon')];

  const onSubmit = handleSubmit((values) =>
    run(async () => {
      if (area) await update.mutateAsync({ id: area.id, input: values });
      else await create.mutateAsync(values);
      toast.success(editing ? 'Área atualizada' : `Área “${values.name}” criada`);
      onDone();
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <div>
        <DialogTitle>{editing ? 'Editar área' : 'Nova área'}</DialogTitle>
        <DialogDescription>
          {editing
            ? 'Mudar o nome, a cor ou o ícone não altera o XP já ganho.'
            : 'Uma área é um atributo do seu personagem, como Saúde ou Estudo.'}
        </DialogDescription>
      </div>

      <div className="flex items-center gap-3 rounded-xl border border-border bg-background/50 p-3">
        <AreaBadge color={color} icon={icon} />
        <span className="truncate font-display text-lg font-bold">
          {name.trim() || 'Nome da área'}
        </span>
      </div>

      <TextField
        label="Nome"
        autoComplete="off"
        placeholder="Ex.: Música"
        error={errors.name?.message}
        {...register('name')}
      />

      <fieldset className="flex flex-col gap-2">
        <Label asChild>
          <legend>Cor</legend>
        </Label>
        <Controller
          control={control}
          name="color"
          render={({ field }) => (
            <div className="flex flex-wrap gap-2">
              {AREA_COLORS.map((key) => (
                <label
                  key={key}
                  className={cn(
                    'relative grid size-9 cursor-pointer place-items-center rounded-full border-2 border-transparent transition has-checked:border-foreground has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring',
                  )}
                >
                  <input
                    type="radio"
                    name="area-color"
                    value={key}
                    checked={field.value === key}
                    onChange={() => field.onChange(key)}
                    className="sr-only"
                  />
                  <span className="sr-only">{AREA_COLOR_CLASSES[key].label}</span>
                  <span
                    aria-hidden
                    className={cn('size-6 rounded-full', AREA_COLOR_CLASSES[key].solid)}
                  />
                </label>
              ))}
            </div>
          )}
        />
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <Label asChild>
          <legend>Ícone</legend>
        </Label>
        <Controller
          control={control}
          name="icon"
          render={({ field }) => (
            <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
              {AREA_ICONS.map((key) => {
                const { Icon, label } = AREA_ICON_COMPONENTS[key];
                return (
                  <label
                    key={key}
                    className="relative grid aspect-square cursor-pointer place-items-center rounded-lg border border-border text-muted-foreground transition hover:text-foreground has-checked:border-primary has-checked:bg-primary/15 has-checked:text-foreground has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring"
                  >
                    <input
                      type="radio"
                      name="area-icon"
                      value={key}
                      checked={field.value === key}
                      onChange={() => field.onChange(key)}
                      className="sr-only"
                    />
                    <span className="sr-only">{label}</span>
                    <Icon aria-hidden className="size-4.5" />
                  </label>
                );
              })}
            </div>
          )}
        />
      </fieldset>

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
          {editing ? 'Salvar' : 'Criar área'}
        </Button>
      </div>
    </form>
  );
}
