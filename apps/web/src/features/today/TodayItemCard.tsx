import type { AreaColor, AreaIcon, TodayItem } from '@lifexp/shared';
import { Check, Lock, RotateCcw, Sparkles, SkipForward, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AreaBadge } from '../areas/AreaBadge';
import { AREA_COLOR_CLASSES } from '../areas/areaAppearance';
import { formatDuration } from '../blocks/blockOptions';
import { timeRange } from '../blocks/OccurrenceCard';
import { OccurrenceNote } from '../blocks/OccurrenceNote';
import { STATUS_LABEL } from './todayModel';

export interface TodayItemView {
  item: TodayItem;
  activityName: string;
  areaName: string;
  areaColor: AreaColor;
  areaIcon: AreaIcon;
}

interface TodayItemCardProps {
  view: TodayItemView;
  /** O próximo bloco do dia ganha destaque. */
  highlight?: boolean;
  busy: boolean;
  onComplete: (item: TodayItem) => void;
  onUndo: (item: TodayItem) => void;
  onSkip: (item: TodayItem) => void;
  onRestore: (item: TodayItem) => void;
}

export function TodayItemCard({
  view,
  highlight,
  busy,
  onComplete,
  onUndo,
  onSkip,
  onRestore,
}: TodayItemCardProps) {
  const { item, activityName, areaName, areaColor, areaIcon } = view;
  const colors = AREA_COLOR_CLASSES[areaColor];
  const { status } = item;
  const muted = status === 'skipped' || status === 'closed';

  return (
    <div className="@container">
      <article
        aria-label={`${activityName}, ${timeRange(item.startTime, item.durationMin)}`}
        className={cn(
          'relative flex flex-col gap-4 overflow-hidden rounded-2xl border bg-card/80 p-4 backdrop-blur transition-colors @lg:flex-row @lg:items-center @lg:p-5',
          highlight ? 'border-xp/60 shadow-[0_0_32px_-12px_var(--xp)]' : 'border-border',
          status === 'completed' && 'border-xp/30',
          muted && 'opacity-70',
        )}
      >
        <div
          aria-hidden
          className={cn('absolute inset-y-0 left-0 w-1', muted ? 'bg-border' : colors.solid)}
        />
        <div className="flex min-w-0 flex-1 items-center gap-3 pl-1">
          <AreaBadge color={areaColor} icon={areaIcon} />
          <div className="min-w-0">
            {highlight && (
              <p className="font-hud text-[0.65rem] tracking-[0.2em] text-xp uppercase">
                Próximo bloco
              </p>
            )}
            <h3
              className={cn(
                'truncate font-display text-lg leading-tight font-bold',
                status === 'skipped' && 'line-through',
              )}
            >
              {activityName}
            </h3>
            <p className="text-sm text-muted-foreground">
              {areaName} · {timeRange(item.startTime, item.durationMin)} ·{' '}
              {formatDuration(item.durationMin)}
            </p>
            <OccurrenceNote note={item.note} clamp={2} className="mt-1 text-sm" />
            <p className="mt-0.5 font-hud text-[0.7rem] tracking-wider text-muted-foreground uppercase">
              {STATUS_LABEL[status]}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 @lg:justify-end">
          {status === 'open' && (
            <Button disabled={busy} onClick={() => onComplete(item)}>
              <Check aria-hidden className="size-4" />
              Concluir
              <span className="font-hud text-xs tabular-nums">+{item.xpPreview} XP</span>
            </Button>
          )}
          {status === 'upcoming' && (
            <span className="inline-flex h-11 items-center gap-2 px-2 text-sm text-muted-foreground">
              <Lock aria-hidden className="size-4" />
              Libera às {item.startTime}
            </span>
          )}
          {status === 'completed' && (
            <>
              <span className="inline-flex h-11 items-center gap-2 rounded-lg border border-xp/40 bg-xp/10 px-3 font-hud text-sm text-xp tabular-nums">
                <Sparkles aria-hidden className="size-4" />+{item.completion?.xpAmount ?? 0} XP
              </span>
              <Button variant="ghost" disabled={busy} onClick={() => onUndo(item)}>
                <Undo2 aria-hidden className="size-4" />
                Desfazer
              </Button>
            </>
          )}
          {(status === 'open' || status === 'upcoming') && (
            <Button variant="ghost" disabled={busy} onClick={() => onSkip(item)}>
              <SkipForward aria-hidden className="size-4" />
              Pular
            </Button>
          )}
          {status === 'skipped' && (
            <Button variant="ghost" disabled={busy} onClick={() => onRestore(item)}>
              <RotateCcw aria-hidden className="size-4" />
              Restaurar
            </Button>
          )}
        </div>
      </article>
    </div>
  );
}
