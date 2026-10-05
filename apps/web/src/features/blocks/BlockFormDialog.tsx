import {
  MAX_SERIES_WEEKS,
  addDays,
  createBlockSchema,
  createWeeklyBlocksSchema,
  endsSameDay,
  minutesToTime,
  timeToMinutes,
  validUntilForWeeks,
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
import { GoalSelect } from '../goals/GoalSelect';
import { useGoalList } from '../goals/useGoals';
import { useServerError } from '../auth/useAuthForm';
import { useAreas } from '../areas/useAreas';
import { DURATION_OPTIONS, WEEKDAY_OPTIONS } from './blockOptions';
import { NoteField } from './NoteField';
import {
  DEFAULT_SERIES_WEEKS,
  WEEKDAY_PRESETS,
  createdTitle,
  describeWeekdays,
  firstOccurrence,
  resolveEnd,
  toggleWeekday,
  type EndMode,
} from './seriesForm';
import { useBlockMutations } from './useBlockMutations';

interface FormValues {
  activityId: string;
  /** Vazio = bloco sem meta. */
  goalId: string;
  recurrence: 'weekly' | 'once';
  /** Dias da semana marcados (1 = segunda ... 7 = domingo). */
  weekdays: number[];
  validFrom: CivilDate;
  endMode: EndMode;
  /** "Até uma data". */
  endDate: CivilDate;
  /** "Por N semanas". */
  endWeeks: number;
  date: CivilDate;
  startTime: string;
  durationMin: number;
  /** Anotação livre; vazio = sem anotação. */
  note: string;
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

/** Monta o bloco avulso exatamente como a API espera (ela rejeita campos de sobra). */
function toOncePayload(values: FormValues) {
  return {
    recurrence: 'once' as const,
    activityId: values.activityId,
    // Só envia a meta quando há uma escolhida: a API não precisa de campo vazio.
    ...(values.goalId ? { goalId: values.goalId } : {}),
    date: values.date,
    startTime: values.startTime,
    durationMin: Number(values.durationMin),
    ...notePayload(values.note),
  };
}

/** Só envia a anotação quando há texto: a API não precisa de campo vazio. */
const notePayload = (note: string) => (note.trim() ? { note } : {});

const FIELD_NAMES: readonly string[] = [
  'activityId',
  'goalId',
  'weekdays',
  'validFrom',
  'date',
  'startTime',
  'durationMin',
  'note',
];

const WEEKDAY_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'] as const;

function BlockForm({
  weekStart,
  today,
  onDone,
}: {
  weekStart: CivilDate;
  today: CivilDate;
  onDone: () => void;
}) {
  const { create, createWeekly } = useBlockMutations();
  const { serverError, run } = useServerError();
  const activities = useActivities(false);
  const areas = useAreas(false);
  const goals = useGoalList();
  const hasGoals = (goals.data ?? []).some(
    (goal) => goal.status === 'active' || goal.status === 'paused',
  );

  // O dia que a pessoa está olhando: hoje, se a semana da tela for a atual; senão a segunda.
  const baseDate = today >= weekStart && today <= addDays(weekStart, 6) ? today : weekStart;
  const baseWeekday = weekdayOf(baseDate);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    clearErrors,
    formState: { errors, dirtyFields, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      activityId: '',
      goalId: '',
      recurrence: 'weekly',
      weekdays: [baseWeekday],
      validFrom: baseDate,
      endMode: 'never',
      endDate: validUntilForWeeks(baseDate, DEFAULT_SERIES_WEEKS),
      endWeeks: DEFAULT_SERIES_WEEKS,
      date: baseDate,
      startTime: '09:00',
      durationMin: 60,
      note: '',
    },
  });

  const [
    recurrence,
    weekdays,
    validFrom,
    endMode,
    endDate,
    endWeeks,
    date,
    startTime,
    durationMin,
    note,
  ] = watch([
    'recurrence',
    'weekdays',
    'validFrom',
    'endMode',
    'endDate',
    'endWeeks',
    'date',
    'startTime',
    'durationMin',
    'note',
  ]);

  // Ao trocar os dias da semana, a data de início acompanha o primeiro deles na semana da tela
  // (até a pessoa escolher uma data própria).
  const earliestWeekday = weekdays.length > 0 ? Math.min(...weekdays) : null;
  useEffect(() => {
    if (!dirtyFields.validFrom && earliestWeekday !== null) {
      setValue('validFrom', addDays(weekStart, earliestWeekday - 1));
    }
  }, [earliestWeekday, weekStart, dirtyFields.validFrom, setValue]);

  const groups = useMemo(() => {
    const byArea = new Map<string, { id: string; name: string }[]>();
    for (const activity of activities.data ?? []) {
      byArea.set(activity.areaId, [...(byArea.get(activity.areaId) ?? []), activity]);
    }
    return (areas.data ?? [])
      .filter((area) => byArea.has(area.id))
      .map((area) => ({ area, activities: byArea.get(area.id) ?? [] }));
  }, [activities.data, areas.data]);

  /** Troca os dias marcados; o aviso de "nenhum dia" some assim que há um dia de novo. */
  const setDays = (next: number[]) => {
    setValue('weekdays', next);
    if (next.length > 0) clearErrors('weekdays');
  };

  /** Mostra cada erro do schema embaixo do campo dele; `validUntil` vai para o campo de término. */
  const showIssues = (
    issues: readonly { path: PropertyKey[]; message: string }[],
    endField: 'endDate' | 'endWeeks' = 'endDate',
  ) => {
    for (const issue of issues) {
      const field = String(issue.path[0]);
      if (field === 'validUntil') setError(endField, { message: issue.message });
      else if (FIELD_NAMES.includes(field)) {
        setError(field as FieldPath<FormValues>, { message: issue.message });
      }
    }
  };

  const noActivities = activities.isSuccess && areas.isSuccess && groups.length === 0;
  const duration = Number(durationMin);
  const crossesMidnight = !endsSameDay(startTime, duration);
  const endTime = crossesMidnight ? null : minutesToTime(timeToMinutes(startTime) + duration);

  const end = resolveEnd({ mode: endMode, until: endDate, weeks: Number(endWeeks) }, validFrom);
  const firstDate = recurrence === 'weekly' ? firstOccurrence(validFrom, weekdays) : date;
  const summary = recurrence === 'weekly' ? describeWeekdays(weekdays) : `Em ${longDate(date)}`;
  const endText =
    recurrence !== 'weekly'
      ? null
      : end.ok && end.validUntil
        ? `Termina em ${longDate(end.validUntil)}.`
        : end.ok
          ? 'Sem data para terminar.'
          : null;

  const onSubmit = handleSubmit((values) =>
    run(async () => {
      if (!values.activityId) {
        setError('activityId', { message: 'Escolha uma atividade' });
        return;
      }

      if (values.recurrence === 'once') {
        // A mesma validação da API: se passar aqui, o servidor aceita.
        const parsed = createBlockSchema.safeParse(toOncePayload(values));
        if (!parsed.success) {
          showIssues(parsed.error.issues);
          return;
        }
        await create.mutateAsync(parsed.data as CreateBlockInput);
        toast.success('Bloco criado', {
          description: `Começa em ${longDate(values.date)}.`,
        });
        onDone();
        return;
      }

      const ended = resolveEnd(
        { mode: values.endMode, until: values.endDate, weeks: Number(values.endWeeks) },
        values.validFrom,
      );
      if (!ended.ok) {
        setError(ended.field, { message: ended.message });
        return;
      }
      const parsed = createWeeklyBlocksSchema.safeParse({
        activityId: values.activityId,
        ...(values.goalId ? { goalId: values.goalId } : {}),
        weekdays: values.weekdays,
        startTime: values.startTime,
        durationMin: Number(values.durationMin),
        validFrom: values.validFrom,
        ...(ended.validUntil ? { validUntil: ended.validUntil } : {}),
        ...notePayload(values.note),
      });
      if (!parsed.success) {
        showIssues(parsed.error.issues, values.endMode === 'weeks' ? 'endWeeks' : 'endDate');
        return;
      }
      const created = await createWeekly.mutateAsync(parsed.data);
      toast.success(createdTitle(created.length), {
        description: `Começa em ${longDate(firstDate ?? values.validFrom)}.${
          ended.validUntil ? ` Termina em ${longDate(ended.validUntil)}.` : ''
        }`,
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

      {hasGoals && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="block-goal">Meta (opcional)</Label>
          <GoalSelect id="block-goal" {...register('goalId')} />
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
        <>
          <fieldset className="flex flex-col gap-2">
            <Label asChild>
              <legend>Dias da semana</legend>
            </Label>
            <div className="grid grid-cols-7 gap-1.5">
              {WEEKDAY_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className="cursor-pointer rounded-lg border border-border px-1 py-2.5 text-center text-sm font-medium transition has-checked:border-primary has-checked:bg-primary/15 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring"
                >
                  <input
                    type="checkbox"
                    aria-label={option.label}
                    checked={weekdays.includes(option.value)}
                    onChange={() => setDays(toggleWeekday(weekdays, option.value))}
                    className="sr-only"
                  />
                  {WEEKDAY_SHORT[option.value - 1]}
                </label>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setDays([...WEEKDAY_PRESETS.workdays])}
              >
                Dias úteis
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setDays([...WEEKDAY_PRESETS.everyday])}
              >
                Todos os dias
              </Button>
            </div>
            {errors.weekdays && (
              <span className="text-sm text-destructive">{errors.weekdays.message}</span>
            )}
          </fieldset>

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

          <fieldset className="flex flex-col gap-2">
            <Label asChild>
              <legend>Término</legend>
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ['never', 'Sem fim'],
                  ['until', 'Até uma data'],
                  ['weeks', 'Por semanas'],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className="cursor-pointer rounded-lg border border-border px-2 py-2.5 text-center text-sm font-medium transition has-checked:border-primary has-checked:bg-primary/15 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring"
                >
                  <input type="radio" value={value} className="sr-only" {...register('endMode')} />
                  {label}
                </label>
              ))}
            </div>
            {endMode === 'until' && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="block-end-date">Último dia</Label>
                <Input
                  id="block-end-date"
                  type="date"
                  aria-invalid={errors.endDate ? true : undefined}
                  {...register('endDate')}
                />
                {errors.endDate && (
                  <span className="text-sm text-destructive">{errors.endDate.message}</span>
                )}
              </div>
            )}
            {endMode === 'weeks' && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="block-end-weeks">Quantas semanas</Label>
                <Input
                  id="block-end-weeks"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_SERIES_WEEKS}
                  aria-invalid={errors.endWeeks ? true : undefined}
                  {...register('endWeeks', { valueAsNumber: true })}
                />
                {errors.endWeeks && (
                  <span className="text-sm text-destructive">{errors.endWeeks.message}</span>
                )}
              </div>
            )}
          </fieldset>
        </>
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

      <NoteField id="block-note" value={note} error={errors.note?.message} {...register('note')} />

      <p
        data-testid="block-summary"
        className="rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm text-muted-foreground"
      >
        {summary ? (
          <span className="font-medium text-foreground">{summary}</span>
        ) : (
          <span className="font-medium text-foreground">Escolha ao menos um dia</span>
        )}
        {summary && endTime && `, das ${startTime} às ${endTime}`}
        {summary && '.'}{' '}
        {recurrence === 'weekly' && summary && firstDate && `Começa em ${longDate(firstDate)}.`}{' '}
        {endText}
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
