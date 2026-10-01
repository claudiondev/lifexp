import { minutesToTime, timeToMinutes, type Occurrence } from '@lifexp/shared';
import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { AREA_COLOR_CLASSES, AREA_ICON_COMPONENTS } from '../areas/areaAppearance';
import type { AreaColor, AreaIcon } from '@lifexp/shared';

export interface OccurrenceDisplay {
  occurrence: Occurrence;
  activityName: string;
  areaColor: AreaColor;
  areaIcon: AreaIcon;
}

interface OccurrenceCardProps {
  display: OccurrenceDisplay;
  label: string;
  style: CSSProperties;
  compact: boolean;
}

/** "09:00 às 10:00" */
export function timeRange(startTime: string, durationMin: number): string {
  return `${startTime} às ${minutesToTime(timeToMinutes(startTime) + durationMin)}`;
}

export function OccurrenceCard({ display, label, style, compact }: OccurrenceCardProps) {
  const { occurrence, activityName, areaColor, areaIcon } = display;
  const colors = AREA_COLOR_CLASSES[areaColor];
  const { Icon } = AREA_ICON_COMPONENTS[areaIcon];

  return (
    <article
      aria-label={label}
      title={label}
      style={style}
      className={cn(
        'absolute overflow-hidden rounded-lg border border-l-4 px-2 py-1 text-left text-xs leading-tight',
        colors.soft,
        colors.border,
        occurrence.skipped && 'border-dashed opacity-55',
      )}
    >
      <div
        aria-hidden
        className={cn(
          'absolute inset-y-0 left-0 w-1',
          occurrence.skipped ? 'bg-border' : colors.solid,
        )}
      />
      <p
        className={cn(
          'flex items-center gap-1 font-semibold',
          occurrence.skipped && 'line-through',
        )}
      >
        <Icon aria-hidden className={cn('size-3 shrink-0', colors.text)} />
        <span className="truncate">{activityName}</span>
      </p>
      {!compact && (
        <p className="mt-0.5 font-hud text-[0.7rem] text-muted-foreground tabular-nums">
          {timeRange(occurrence.startTime, occurrence.durationMin)}
        </p>
      )}
      {!compact && occurrence.skipped && (
        <p className="mt-0.5 text-[0.7rem] font-medium text-muted-foreground">Pulado</p>
      )}
      {!compact && occurrence.modified && !occurrence.skipped && (
        <p className="mt-0.5 text-[0.7rem] font-medium text-xp">Alterado</p>
      )}
    </article>
  );
}
