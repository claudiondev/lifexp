import {
  DEFAULT_REMIND_BEFORE_MIN,
  createEventSchema,
  type CalendarEvent,
  type CivilDate,
  type EventCategory,
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
import { longDate } from '@/lib/civilFormat';
import { TextField } from '../auth/TextField';
import { useServerError } from '../auth/useAuthForm';
import { useAreas } from '../areas/useAreas';
import { CATEGORY_OPTIONS, reminderOptions } from './eventFormat';
import { useEventMutations } from './useEvents';

interface EventFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Sem evento: modo criação. Com evento: modo edição. */
  event?: CalendarEvent | null;
  /** Data sugerida ao criar. */
  defaultDate: CivilDate;
}

export function EventFormDialog({ open, onOpenChange, event, defaultDate }: EventFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* key: reinicia o formulário a cada abertura, troca de evento ou de data sugerida. */}
        <EventForm
          key={`${open}-${event?.id ?? 'new'}-${defaultDate}`}
          event={event ?? null}
          defaultDate={defaultDate}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

interface FormValues {
  title: string;
  category: EventCategory;
  date: CivilDate;
  time: string;
  areaId: string;
  notes: string;
  remind: string;
}

const remindToMinutes = (value: string): number | null => (value === 'none' ? null : Number(value));

function EventForm({
  event,
  defaultDate,
  onDone,
}: {
  event: CalendarEvent | null;
  defaultDate: CivilDate;
  onDone: () => void;
}) {
  const { create, update } = useEventMutations();
  const { serverError, run } = useServerError();
  const areas = useAreas(false);
  const editing = event !== null;
  const [allDay, setAllDay] = useState(event ? event.time === null : true);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      title: event?.title ?? '',
      category: event?.category ?? 'appointment',
      date: event?.date ?? defaultDate,
      time: event?.time ?? '09:00',
      areaId: event?.areaId ?? '',
      notes: event?.notes ?? '',
      remind: String(event ? (event.remindBeforeMin ?? 'none') : DEFAULT_REMIND_BEFORE_MIN),
    },
  });

  const [date, remind] = watch(['date', 'remind']);
  const options = reminderOptions(allDay);

  // Ao marcar "dia todo", um lembrete em minutos/horas deixa de fazer sentido: volta ao padrão.
  const changeAllDay = (value: boolean) => {
    setAllDay(value);
    if (value && !reminderOptions(true).some((option) => option.value === remind)) {
      setValue('remind', String(DEFAULT_REMIND_BEFORE_MIN));
    }
  };

  const onSubmit = handleSubmit((values) =>
    run(async () => {
      const payload = {
        title: values.title,
        category: values.category,
        date: values.date,
        time: allDay ? null : values.time,
        areaId: values.areaId || null,
        notes: values.notes.trim() ? values.notes.trim() : null,
        remindBeforeMin: remindToMinutes(values.remind),
      };
      // A mesma validação da API: se passar aqui, o servidor aceita.
      const parsed = createEventSchema.safeParse(payload);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const field = String(issue.path[0]);
          if (field === 'title' || field === 'date' || field === 'time') {
            setError(field, { message: issue.message });
          } else if (field === 'remindBeforeMin') {
            setError('remind', { message: issue.message });
          }
        }
        return;
      }
      if (event) await update.mutateAsync({ id: event.id, input: parsed.data });
      else await create.mutateAsync(parsed.data);
      toast.success(editing ? 'Evento atualizado' : 'Evento criado', {
        description: `${values.title.trim()} · ${longDate(values.date)}`,
      });
      onDone();
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <div>
        <DialogTitle>{editing ? 'Editar evento' : 'Novo evento'}</DialogTitle>
        <DialogDescription>
          Eventos marcam o que acontece num dia (consulta, viagem, prazo). Eles não rendem XP.
        </DialogDescription>
      </div>

      <TextField
        label="Título"
        autoComplete="off"
        placeholder="Ex.: Consulta com a dentista"
        error={errors.title?.message}
        {...register('title')}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="event-category">Categoria</Label>
          <Select id="event-category" {...register('category')}>
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="event-date">Data</Label>
          <Input
            id="event-date"
            type="date"
            aria-invalid={errors.date ? true : undefined}
            {...register('date')}
          />
          {errors.date && <span className="text-sm text-destructive">{errors.date.message}</span>}
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-background/50 p-4">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="event-all-day">Dia todo</Label>
          <Switch id="event-all-day" checked={allDay} onCheckedChange={changeAllDay} />
        </div>
        {!allDay && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="event-time">Hora</Label>
            <Input
              id="event-time"
              type="time"
              step={300}
              aria-invalid={errors.time ? true : undefined}
              {...register('time')}
            />
            {errors.time && <span className="text-sm text-destructive">{errors.time.message}</span>}
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="event-reminder">Lembrete</Label>
          <Select id="event-reminder" {...register('remind')}>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          {errors.remind && (
            <span className="text-sm text-destructive">{errors.remind.message}</span>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="event-area">Área (opcional)</Label>
          <Select id="event-area" {...register('areaId')}>
            <option value="">Sem área</option>
            {areas.data?.map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="event-notes">Notas (opcional)</Label>
        <Input id="event-notes" autoComplete="off" {...register('notes')} />
      </div>

      <p className="text-sm text-muted-foreground" data-testid="event-summary">
        {longDate(date)} · {allDay ? 'dia todo' : watch('time')}
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
        <Button type="submit" disabled={isSubmitting}>
          {editing ? 'Salvar' : 'Criar evento'}
        </Button>
      </div>
    </form>
  );
}
