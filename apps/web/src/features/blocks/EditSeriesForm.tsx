import {
  endsSameDay,
  updateBlockSchema,
  weekdayOf,
  type CivilDate,
  type Occurrence,
  type UpdateBlockInput,
} from '@lifexp/shared';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { longDate } from '@/lib/civilFormat';
import { useActivities } from '../activities/useActivities';
import { useAreas } from '../areas/useAreas';
import { useServerError } from '../auth/useAuthForm';
import { DURATION_OPTIONS, WEEKDAY_OPTIONS } from './blockOptions';
import { useBlockMutations } from './useBlockMutations';

interface FormValues {
  activityId: string;
  weekday: number;
  date: CivilDate;
  startTime: string;
  durationMin: number;
}

interface EditSeriesFormProps {
  occurrence: Occurrence;
  activityName: string;
  onBack: () => void;
  onDone: () => void;
}

/**
 * Edita "a partir desta ocorrência": para série semanal vale esta e as próximas (o passado não
 * muda); para bloco avulso edita o próprio bloco.
 */
export function EditSeriesForm({ occurrence, activityName, onBack, onDone }: EditSeriesFormProps) {
  const weekly = occurrence.recurrence === 'weekly';
  const { edit } = useBlockMutations();
  const { serverError, run } = useServerError();
  const activities = useActivities(false);
  const areas = useAreas(false);

  const initial: FormValues = {
    activityId: occurrence.activityId,
    weekday: weekdayOf(occurrence.occurrenceDate),
    date: occurrence.occurrenceDate,
    startTime: occurrence.startTime,
    durationMin: occurrence.durationMin,
  };

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { isSubmitting },
  } = useForm<FormValues>({ defaultValues: initial });

  const values = watch();
  const duration = Number(values.durationMin);
  const crossesMidnight = !endsSameDay(values.startTime, duration);

  // Só o que mudou em relação ao que a pessoa estava vendo (o PATCH fica mínimo).
  const changes: Omit<UpdateBlockInput, 'from'> = {};
  if (values.activityId !== initial.activityId) changes.activityId = values.activityId;
  if (weekly && Number(values.weekday) !== initial.weekday)
    changes.weekday = Number(values.weekday);
  if (!weekly && values.date !== initial.date) changes.date = values.date;
  if (values.startTime !== initial.startTime) changes.startTime = values.startTime;
  if (duration !== initial.durationMin) changes.durationMin = duration;
  const hasChanges = Object.keys(changes).length > 0;

  // Atividades ativas por área; a atual entra mesmo que tenha sido arquivada depois.
  const groups = useMemo(() => {
    const active = activities.data ?? [];
    const list = active.some((activity) => activity.id === occurrence.activityId)
      ? active
      : [
          ...active,
          {
            id: occurrence.activityId,
            areaId: occurrence.areaId,
            name: activityName,
          } as (typeof active)[number],
        ];
    return (areas.data ?? [])
      .map((area) => ({ area, items: list.filter((activity) => activity.areaId === area.id) }))
      .filter((group) => group.items.length > 0);
  }, [activities.data, areas.data, occurrence.activityId, occurrence.areaId, activityName]);

  const onSubmit = handleSubmit(() =>
    run(async () => {
      const payload = { from: occurrence.occurrenceDate, ...changes };
      const parsed = updateBlockSchema.safeParse(payload);
      if (!parsed.success) {
        setError('startTime', { message: parsed.error.issues[0]?.message ?? 'Dados inválidos' });
        return;
      }
      await edit.mutateAsync({ blockId: occurrence.blockId, input: parsed.data });
      toast.success(weekly ? 'Série atualizada' : 'Bloco atualizado', {
        description: weekly
          ? `A mudança vale a partir de ${longDate(occurrence.occurrenceDate)}. O que já passou ficou como estava.`
          : undefined,
      });
      onDone();
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {weekly
          ? `A mudança vale a partir de ${longDate(occurrence.occurrenceDate)}, para esta e as próximas ocorrências. O que já passou não muda.`
          : 'A mudança vale para este bloco.'}
      </p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="series-activity">Atividade</Label>
        <Select id="series-activity" {...register('activityId')}>
          {groups.map(({ area, items }) => (
            <optgroup key={area.id} label={area.name}>
              {items.map((activity) => (
                <option key={activity.id} value={activity.id}>
                  {activity.name}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </div>

      {weekly ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="series-weekday">Dia da semana</Label>
          <Select id="series-weekday" {...register('weekday')}>
            {WEEKDAY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="series-date">Data</Label>
          <Input id="series-date" type="date" {...register('date')} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="series-start">Início</Label>
          <Input id="series-start" type="time" step={300} {...register('startTime')} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="series-duration">Duração</Label>
          <Select id="series-duration" {...register('durationMin')}>
            {DURATION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {crossesMidnight && (
        <p role="status" className="text-sm text-destructive">
          O bloco não pode atravessar a meia-noite.
        </p>
      )}
      {serverError && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {serverError}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onBack}>
          Voltar
        </Button>
        <Button type="submit" disabled={isSubmitting || !hasChanges || crossesMidnight}>
          {weekly ? 'Salvar esta e as próximas' : 'Salvar'}
        </Button>
      </div>
    </form>
  );
}
