import {
  endsSameDay,
  weekDates,
  weekStartOf,
  type CivilDate,
  type Occurrence,
} from '@lifexp/shared';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { dayOfMonth, weekdayLong } from '@/lib/civilFormat';
import { useServerError } from '../auth/useAuthForm';
import { DURATION_OPTIONS } from './blockOptions';
import { useBlockMutations } from './useBlockMutations';

interface FormValues {
  date: CivilDate;
  startTime: string;
  durationMin: number;
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

interface OverrideFormProps {
  occurrence: Occurrence;
  onBack: () => void;
  onDone: () => void;
}

/** Altera SÓ esta ocorrência: o dia (dentro da mesma semana), o horário e a duração. */
export function OverrideForm({ occurrence, onBack, onDone }: OverrideFormProps) {
  const { setException } = useBlockMutations();
  const { serverError, run } = useServerError();
  // Mover só vale dentro da semana da ocorrência original (regra do produto e do banco).
  const days = weekDates(weekStartOf(occurrence.occurrenceDate));

  const {
    register,
    handleSubmit,
    watch,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      date: occurrence.date,
      startTime: occurrence.startTime,
      durationMin: occurrence.durationMin,
    },
  });

  const [date, startTime, durationMin] = watch(['date', 'startTime', 'durationMin']);
  const duration = Number(durationMin);
  const crossesMidnight = !endsSameDay(startTime, duration);
  const unchanged =
    date === occurrence.date &&
    startTime === occurrence.startTime &&
    duration === occurrence.durationMin;

  const onSubmit = handleSubmit((values) =>
    run(async () => {
      await setException.mutateAsync({
        blockId: occurrence.blockId,
        occurrenceDate: occurrence.occurrenceDate,
        input: {
          type: 'override',
          newDate: values.date,
          newStartTime: values.startTime,
          newDurationMin: Number(values.durationMin),
        },
      });
      toast.success('Ocorrência alterada', { description: 'Só esta vez; a série não mudou.' });
      onDone();
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        A mudança vale só para esta ocorrência. O resto da série continua como está.
      </p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="override-date">Dia</Label>
        <Select id="override-date" {...register('date')}>
          {days.map((day) => (
            <option key={day} value={day}>
              {capitalize(weekdayLong(day))}, {dayOfMonth(day)}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="override-start">Início</Label>
          <Input id="override-start" type="time" step={300} {...register('startTime')} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="override-duration">Duração</Label>
          <Select id="override-duration" {...register('durationMin')}>
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
        <Button type="submit" disabled={isSubmitting || unchanged || crossesMidnight}>
          Salvar só esta
        </Button>
      </div>
    </form>
  );
}
