import type { CalendarEvent } from '@lifexp/shared';
import { NotebookPen, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { longDate, weekdayLong } from '@/lib/civilFormat';
import { cn } from '@/lib/utils';
import { useAreas } from '../areas/useAreas';
import { newNoteUrl } from '../notes/noteLinks';
import { AREA_COLOR_CLASSES } from '../areas/areaAppearance';
import { EVENT_APPEARANCE } from './eventAppearance';
import { CATEGORY_LABEL, reminderLabel, timeLabel } from './eventFormat';
import { useEventMutations } from './useEvents';

interface EventDialogProps {
  /** O evento aberto; nulo fecha o painel. */
  event: CalendarEvent | null;
  onClose: () => void;
  onEdit: (event: CalendarEvent) => void;
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function EventDialog({ event, onClose, onEdit }: EventDialogProps) {
  return (
    <Dialog open={event !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {/* Desmontado ao fechar: cada abertura começa nos detalhes, sem confirmação pendente. */}
        {event && <EventPanel event={event} onClose={onClose} onEdit={onEdit} />}
      </DialogContent>
    </Dialog>
  );
}

function EventPanel({
  event,
  onClose,
  onEdit,
}: {
  event: CalendarEvent;
  onClose: () => void;
  onEdit: (event: CalendarEvent) => void;
}) {
  const { remove } = useEventMutations();
  const areas = useAreas(true);
  const [confirming, setConfirming] = useState(false);
  const { Icon, color } = EVENT_APPEARANCE[event.category];
  const colors = AREA_COLOR_CLASSES[color];
  const area = event.areaId ? areas.data?.find((item) => item.id === event.areaId) : undefined;

  const confirmDelete = () =>
    remove.mutate(event.id, {
      onSuccess: () => {
        toast.success(`Evento “${event.title}” excluído`);
        onClose();
      },
      onError: (error) => toast.error(error.message),
    });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3 pr-8">
        <span
          aria-hidden
          className={cn(
            'grid size-11 shrink-0 place-items-center rounded-xl border',
            colors.soft,
            colors.border,
            colors.text,
          )}
        >
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <DialogTitle className="break-words">{event.title}</DialogTitle>
          <DialogDescription>{CATEGORY_LABEL[event.category]}</DialogDescription>
        </div>
      </div>

      <dl className="grid gap-1.5 rounded-xl border border-border bg-background/50 p-4 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Dia</dt>
          <dd className="text-right font-medium">
            {capitalize(`${weekdayLong(event.date)}, ${longDate(event.date)}`)}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Horário</dt>
          <dd className="text-right font-medium">{timeLabel(event)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Lembrete</dt>
          <dd className="text-right font-medium">{reminderLabel(event.remindBeforeMin)}</dd>
        </div>
        {area && (
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Área</dt>
            <dd className="text-right font-medium">{area.name}</dd>
          </div>
        )}
        {event.notes && (
          <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{event.notes}</p>
        )}
      </dl>

      {confirming ? (
        <section
          aria-label="Confirmar exclusão"
          className="flex flex-col gap-3 border-t border-border pt-4"
        >
          <p className="text-sm text-muted-foreground">
            O evento será removido do calendário. Esta ação não pode ser desfeita.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" disabled={remove.isPending} onClick={confirmDelete}>
              Excluir evento
            </Button>
          </div>
        </section>
      ) : (
        <div className="flex flex-wrap justify-end gap-2">
          <Button asChild variant="ghost">
            <Link to={newNoteUrl('event', event.id, event.title)} onClick={onClose}>
              <NotebookPen aria-hidden className="size-4" />
              Anotar
            </Link>
          </Button>
          <Button variant="destructive" onClick={() => setConfirming(true)}>
            <Trash2 aria-hidden className="size-4" />
            Excluir
          </Button>
          <Button variant="secondary" onClick={() => onEdit(event)}>
            <Pencil aria-hidden className="size-4" />
            Editar
          </Button>
        </div>
      )}
    </div>
  );
}
