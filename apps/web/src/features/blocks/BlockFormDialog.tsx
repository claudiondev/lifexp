import {
  addDays,
  createBlockSchema,
  endsSameDay,
  firstOccurrenceOnOrAfter,
  minutesToTime,
  timeToMinutes,
  weekdayOf,
  type CivilDate,
  type CreateBlockInput,
} from '@lifexp/shared';
import { useEffect, useMemo } from 'react';
import { useForm, type FieldPath } from 'react-hook-form';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { longDate } from '@/lib/civilFormat';
import { useActivities } from '../activities/useActivities';
import { useServerError } from '../auth/useAuthForm';
import { useAreas } from '../areas/useAreas';
import { DURATION_OPTIONS, WEEKDAY_OPTIONS } from './blockOptions';
import { useBlockMutations } from './useBlockMutations';

interface FormValues {
  activityId: string;
  recurrence: 'weekly' | 'once';
  weekday: number;
  validFrom: CivilDate;
  date: CivilDate;
  startTime: string;
  durationMin: number;
}

interface BlockFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Segunda-feira da semana que está na tela: os padrões do formulário partem dela. */
  weekStart: CivilDate;
  today: CivilDate;
}

export function BlockFormDialog({ open, onOpenChange, weekStart, today }: BlockFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* key: reinicia o formulário (e os padrões) a cada abertura ou troca de semana. */}
        <BlockForm
          key={`${open}-${weekStart}`}
          weekStart={weekStart}
          today={today}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

/** Monta exatamente o que a API espera para o tipo escolhido (a API rejeita campos de sobra). */
function toPayload(values: FormValues) {
  const common = {
    activityId: values.activityId,
    startTime: values.startTime,
    durationMin: Number(values.durationMin),
  };
  return values.recurrence === 'weekly'
    ? {
        recurrence: 'weekly' as const,
        ...common,
        weekday: Number(values.weekday),
        validFrom: values.validFrom,
      }
    : { recurrence: 'once' as const, ...common, date: values.date };
}

const FIELD_NAMES: readonly string[] = [
  'activityId',
  'weekday',
  'validFrom',
  'date',
  'startTime',
  'durationMin',
];

function BlockForm({
  weekStart,
  today,
  onDone,
}: {
  weekStart: CivilDate;
  today: CivilDate;
  onDone: () => void;
}) {
  const { create } = useBlockMutations();
  const { serverError, run } = useServerError();
  const activities = useActivities(false);
  const areas = useAreas(false);

  // O dia que a pessoa está olhando: hoje, se a semana da tela for a atual; senão a segunda.
  const baseDate = today >= weekStart && today <= addDays(weekStart, 6) ? today : weekStart;
  const baseWeekday = weekdayOf(baseDate);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors, dirtyFields, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      activityId: '',
      recurrence: 'weekly',
      weekday: baseWeekday,
      validFrom: baseDate,
      date: baseDate,
      startTime: '09:00',
      durationMin: 60,
    },
  });

  const [recurrence, weekday, validFrom, date, startTime, durationMin] = watch([
    'recurrence',
    'weekday',
    'validFrom',
    'date',
    'startTime',
    'durationMin',
  ]);

  // Ao trocar o dia da semana, a data de início acompanha (até a pessoa escolher uma própria).
  useEffect(() => {
    if (!dirtyFields.validFrom) {
      setValue('validFrom', addDays(weekStart, Number(weekday) - 1));
    }
  }, [weekday, weekStart, dirtyFields.validFrom, setValue]);

  const groups = useMemo(() => {
    const byArea = new Map<string, { id: string; name: string }[]>();
    for (const activity of activities.data ?? []) {
      byArea.set(activity.areaId, [...(byArea.get(activity.areaId) ?? []), activity]);
    }
    return (areas.data ?? [])
      .filter((area) => byArea.has(area.id))
      .map((area) => ({ area, activities: byArea.get(area.id) ?? [] }));
  }, [activities.data, areas.data]);

  const noActivities = activities.isSuccess && areas.isSuccess && groups.length === 0;
  const duration = Number(durationMin);
  const crossesMidnight = !endsSameDay(startTime, duration);
  const endTime = crossesMidnight ? null : minutesToTime(timeToMinutes(startTime) + duration);

  const summary =
    recurrence === 'weekly'
      ? `Toda ${WEEKDAY_OPTIONS[Number(weekday) - 1]?.label.toLowerCase()}`
      : `Em ${longDate(date)}`;
  const firstDate =
    recurrence === 'weekly' ? firstOccurrenceOnOrAfter(validFrom, Number(weekday)) : date;

  const onSubmit = handleSubmit((values) =>
    run(async () => {
      if (!values.activityId) {
        setError('activityId', { message: 'Escolha uma atividade' });
        return;
      }
      // A mesma validação da API: se passar aqui, o servidor aceita.
      const parsed = createBlockSchema.safeParse(toPayload(values));
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const field = String(issue.path[0]);
          if (FIELD_NAMES.includes(field)) {
            setError(field as FieldPath<FormValues>, { message: issue.message });
          }
        }
        return;
      }
      await create.mutateAsync(parsed.data as CreateBlockInput);
      toast.success('Bloco criado', {
        description: `Começa em ${longDate(parsed.data.recurrence === 'once' ? parsed.data.date : firstDate)}.`,
      });
      onDone();
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <div>
        <DialogTitle>Novo bloco</DialogTitle>
        <DialogDescription>
          Um bloco é um compromisso com você mesmo: uma atividade num dia e horário.
        </DialogDescription>
      </div>

      {noActivities ? (
        <p className="rounded-xl border border-dashed border-border bg-background/50 p-4 text-sm text-muted-foreground">
          Você ainda não tem atividades ativas.{' '}
          <Link to="/areas" className="font-semibold text-xp hover:underline">
            Crie uma em Áreas
          </Link>{' '}
          para poder planejar blocos.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="block-activity">Atividade</Label>
          <Select
            id="block-activity"
            aria-invalid={errors.activityId ? true : undefined}
            {...register('activityId')}
          >
            <option value="">Escolha uma atividade</option>
            {groups.map(({ area, activities: items }) => (
              <optgroup key={area.id} label={area.name}>
                {items.map((activity) => (
                  <option key={activity.id} value={activity.id}>
                    {activity.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
          {errors.activityId && (
            <span className="text-sm text-destructive">{errors.activityId.message}</span>
          )}
        </div>
      )}

      <fieldset className="flex flex-col gap-2">
        <Label asChild>
          <legend>Repetição</legend>
        </Label>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ['weekly', 'Toda semana'],
              ['once', 'Só uma vez'],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className={cn(
                'cursor-pointer rounded-lg border border-border px-3 py-2.5 text-center text-sm font-medium transition has-checked:border-primary has-checked:bg-primary/15 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring',
              )}
            >
              <input type="radio" value={value} className="sr-only" {...register('recurrence')} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      {recurrence === 'weekly' ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="block-weekday">Dia da semana</Label>
            <Select id="block-weekday" {...register('weekday')}>
              {WEEKDAY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="block-valid-from">A partir de</Label>
            <Input
              id="block-valid-from"
              type="date"
              aria-invalid={errors.validFrom ? true : undefined}
              {...register('validFrom')}
            />
            {errors.validFrom && (
              <span className="text-sm text-destructive">{errors.validFrom.message}</span>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="block-date">Data</Label>
          <Input
            id="block-date"
            type="date"
            aria-invalid={errors.date ? true : undefined}
            {...register('date')}
          />
          {errors.date && <span className="text-sm text-destructive">{errors.date.message}</span>}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="block-start">Início</Label>
          <Input
            id="block-start"
            type="time"
            step={300}
            aria-invalid={errors.startTime ? true : undefined}
            {...register('startTime')}
          />
          {errors.startTime && (
            <span className="text-sm text-destructive">{errors.startTime.message}</span>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="block-duration">Duração</Label>
          <Select
            id="block-duration"
            aria-invalid={errors.durationMin || crossesMidnight ? true : undefined}
            {...register('durationMin')}
          >
            {DURATION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      </div>
      {(errors.durationMin || crossesMidnight) && (
        <p role="status" className="-mt-2 text-sm text-destructive">
          {errors.durationMin?.message ?? 'O bloco não pode atravessar a meia-noite.'}
        </p>
      )}

      <p
        data-testid="block-summary"
        className="rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm text-muted-foreground"
      >
        <span className="font-medium text-foreground">{summary}</span>
        {endTime && `, das ${startTime} às ${endTime}`}.{' '}
        {recurrence === 'weekly' && `Começa em ${longDate(firstDate)}.`}
      </p>

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
        <Button type="submit" disabled={isSubmitting || noActivities}>
          Criar bloco
        </Button>
      </div>
    </form>
  );
}
