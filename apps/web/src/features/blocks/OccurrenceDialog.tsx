import { weekdayOf, type CivilDate } from '@lifexp/shared';
import {
  ArchiveRestore,
  CalendarClock,
  CircleCheck,
  Pencil,
  SkipForward,
  Trash2,
  Undo2,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { longDate, weekdayLong } from '@/lib/civilFormat';
import { cn } from '@/lib/utils';
import { useServerError } from '../auth/useAuthForm';
import { AreaBadge } from '../areas/AreaBadge';
import { WEEKDAY_OPTIONS, formatDuration } from './blockOptions';
import { EditSeriesForm } from './EditSeriesForm';
import type { OccurrenceDisplay } from './OccurrenceCard';
import { timeRange } from './OccurrenceCard';
import { OverrideForm } from './OverrideForm';
import { useCompletionMutations } from '../today/useCompletionMutations';
import { useBlockMutations } from './useBlockMutations';

type Mode = 'details' | 'override' | 'edit' | 'delete';

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

interface OccurrenceDialogProps {
  /** A ocorrência selecionada; nulo fecha o painel. */
  display: OccurrenceDisplay | null;
  onClose: () => void;
}

export function OccurrenceDialog({ display, onClose }: OccurrenceDialogProps) {
  return (
    <Dialog open={display !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {display && (
          // O painel é desmontado ao fechar, então cada abertura começa nos detalhes.
          <OccurrencePanel display={display} onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function recurrenceText(display: OccurrenceDisplay): string {
  const { occurrence } = display;
  if (occurrence.recurrence === 'once') return 'Bloco avulso (acontece só uma vez)';
  const weekday = WEEKDAY_OPTIONS[weekdayOf(occurrence.occurrenceDate) - 1]?.label.toLowerCase();
  return `Toda ${weekday}`;
}

function OccurrencePanel({
  display,
  onClose,
}: {
  display: OccurrenceDisplay;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>('details');
  const { occurrence, activityName, areaName, areaColor, areaIcon } = display;
  const weekly = occurrence.recurrence === 'weekly';

  const back = () => setMode('details');

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3 pr-8">
        <AreaBadge color={areaColor} icon={areaIcon} />
        <div className="min-w-0">
          <DialogTitle className="truncate">{activityName}</DialogTitle>
          <DialogDescription>{areaName}</DialogDescription>
        </div>
      </div>

      <dl className="grid gap-1.5 rounded-xl border border-border bg-background/50 p-4 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Dia</dt>
          <dd className="text-right font-medium">
            {capitalize(`${weekdayLong(occurrence.date)}, ${longDate(occurrence.date)}`)}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Horário</dt>
          <dd className="text-right font-medium">
            {timeRange(occurrence.startTime, occurrence.durationMin)} ·{' '}
            {formatDuration(occurrence.durationMin)}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Repetição</dt>
          <dd className="text-right font-medium">{recurrenceText(display)}</dd>
        </div>
        {display.completion && (
          <p className="mt-1 flex items-center gap-1.5 font-medium text-xp">
            <CircleCheck aria-hidden className="size-4" />
            Concluída: +{display.completion.xpAmount} XP
          </p>
        )}
        {occurrence.skipped && (
          <p className="mt-1 text-muted-foreground">Esta ocorrência está pulada.</p>
        )}
        {occurrence.modified && !occurrence.skipped && (
          <p className="mt-1 text-xp">
            Esta ocorrência foi alterada. O dia original era {longDate(occurrence.occurrenceDate)}.
          </p>
        )}
      </dl>

      {mode === 'details' && (
        <Actions display={display} weekly={weekly} onMode={setMode} onClose={onClose} />
      )}
      {mode === 'override' && (
        <Section title="Alterar só esta ocorrência">
          <OverrideForm occurrence={occurrence} onBack={back} onDone={onClose} />
        </Section>
      )}
      {mode === 'edit' && (
        <Section title={weekly ? 'Editar esta e as próximas' : 'Editar bloco'}>
          <EditSeriesForm
            occurrence={occurrence}
            activityName={activityName}
            onBack={back}
            onDone={onClose}
          />
        </Section>
      )}
      {mode === 'delete' && (
        <Section title={weekly ? 'Excluir esta e as próximas' : 'Excluir bloco'}>
          <DeleteConfirm
            blockId={occurrence.blockId}
            from={occurrence.occurrenceDate}
            weekly={weekly}
            onBack={back}
            onDone={onClose}
          />
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3 border-t border-border pt-4">
      <h3 className="font-display text-lg font-bold">{title}</h3>
      {children}
    </section>
  );
}

interface ActionButtonProps {
  icon: ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}

function ActionButton({ icon, title, hint, onClick, disabled, danger }: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex w-full items-start gap-3 rounded-xl border border-border bg-background/40 p-3 text-left transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-60',
        danger && 'hover:border-destructive/50 hover:bg-destructive/10',
      )}
    >
      <span aria-hidden className={cn('mt-0.5 shrink-0', danger ? 'text-destructive' : 'text-xp')}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </button>
  );
}

function Actions({
  display,
  weekly,
  onMode,
  onClose,
}: {
  display: OccurrenceDisplay;
  weekly: boolean;
  onMode: (mode: Mode) => void;
  onClose: () => void;
}) {
  const { occurrence, activityName } = display;
  const { setException, restore } = useBlockMutations();
  const { undo: undoCompletion } = useCompletionMutations();
  const { serverError, run } = useServerError();
  const ref = { blockId: occurrence.blockId, occurrenceDate: occurrence.occurrenceDate };
  const busy = setException.isPending || restore.isPending || undoCompletion.isPending;
  const completed = display.completion !== undefined;

  const undoDone = () =>
    run(async () => {
      const result = await undoCompletion.mutateAsync(ref);
      toast.success(`Conclusão de “${activityName}” desfeita`, {
        description: `${result.xpReverted} XP devolvidos.`,
      });
      onClose();
    });

  const undo = () =>
    restore.mutate(ref, {
      onSuccess: () => toast.success('Ocorrência restaurada'),
      onError: (error) => toast.error(error.message),
    });

  const skip = () =>
    run(async () => {
      await setException.mutateAsync({ ...ref, input: { type: 'skip' } });
      toast.success(`“${activityName}” pulado nesta data`, {
        description: 'Sem XP e sem penalidade. A série continua.',
        action: { label: 'Desfazer', onClick: undo },
      });
      onClose();
    });

  const restoreOriginal = (message: string) =>
    run(async () => {
      await restore.mutateAsync(ref);
      toast.success(message);
      onClose();
    });

  return (
    <div className="flex flex-col gap-2">
      {completed ? (
        // Concluída: a API bloqueia pular e alterar só esta ocorrência; desfazer a conclusão libera.
        <ActionButton
          icon={<Undo2 className="size-4" />}
          title="Desfazer conclusão"
          hint="Devolve o XP. Só dá até 23:59 do dia seguinte ao bloco."
          disabled={busy}
          onClick={() => void undoDone()}
        />
      ) : occurrence.skipped ? (
        <ActionButton
          icon={<ArchiveRestore className="size-4" />}
          title="Restaurar esta ocorrência"
          hint="Ela volta a valer normalmente."
          disabled={busy}
          onClick={() => void restoreOriginal('Ocorrência restaurada')}
        />
      ) : (
        <>
          <ActionButton
            icon={<SkipForward className="size-4" />}
            title="Pular só esta"
            hint="Não conta XP nem pune. As outras ocorrências seguem."
            disabled={busy}
            onClick={() => void skip()}
          />
          <ActionButton
            icon={<CalendarClock className="size-4" />}
            title="Alterar só esta"
            hint="Muda o dia (na mesma semana), o horário ou a duração desta vez."
            onClick={() => onMode('override')}
          />
          {occurrence.modified && (
            <ActionButton
              icon={<Undo2 className="size-4" />}
              title="Desfazer a alteração"
              hint="Volta ao dia, horário e duração originais."
              disabled={busy}
              onClick={() => void restoreOriginal('Alteração desfeita')}
            />
          )}
        </>
      )}

      <ActionButton
        icon={<Pencil className="size-4" />}
        title={weekly ? 'Editar esta e as próximas' : 'Editar bloco'}
        hint={
          weekly
            ? 'Muda a série daqui em diante. O passado não muda.'
            : 'Muda o dia, horário ou duração.'
        }
        onClick={() => onMode('edit')}
      />
      <ActionButton
        danger
        icon={<Trash2 className="size-4" />}
        title={weekly ? 'Excluir esta e as próximas' : 'Excluir bloco'}
        hint={weekly ? 'Encerra a série a partir desta data.' : 'Remove o bloco.'}
        onClick={() => onMode('delete')}
      />

      {serverError && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {serverError}
        </p>
      )}
    </div>
  );
}

function DeleteConfirm({
  blockId,
  from,
  weekly,
  onBack,
  onDone,
}: {
  blockId: string;
  from: CivilDate;
  weekly: boolean;
  onBack: () => void;
  onDone: () => void;
}) {
  const { remove } = useBlockMutations();
  const { serverError, run } = useServerError();

  const confirm = () =>
    run(async () => {
      await remove.mutateAsync({ blockId, from });
      toast.success(weekly ? 'Série encerrada' : 'Bloco excluído');
      onDone();
    });

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {weekly
          ? `A série termina antes de ${longDate(from)}. As ocorrências anteriores continuam no seu histórico. Esta ação não pode ser desfeita por aqui.`
          : 'O bloco será removido. Esta ação não pode ser desfeita.'}
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
        <Button type="button" variant="ghost" onClick={onBack}>
          Cancelar
        </Button>
        <Button
          type="button"
          variant="destructive"
          disabled={remove.isPending}
          onClick={() => void confirm()}
        >
          {weekly ? 'Excluir esta e as próximas' : 'Excluir bloco'}
        </Button>
      </div>
    </div>
  );
}
