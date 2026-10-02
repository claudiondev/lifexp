import type { CalendarEvent } from '@lifexp/shared';
import { cn } from '@/lib/utils';
import { AREA_COLOR_CLASSES } from '../areas/areaAppearance';
import { EVENT_APPEARANCE } from './eventAppearance';
import { timeLabel } from './eventFormat';

interface EventChipProps {
  event: CalendarEvent;
  onSelect: (event: CalendarEvent) => void;
  /** Versão de uma linha, para o topo da grade e o calendário do mês. */
  compact?: boolean;
  className?: string;
}

/** Evento como botão: ícone da categoria, hora (ou "dia todo") e título. */
export function EventChip({ event, onSelect, compact = false, className }: EventChipProps) {
  const { Icon, color } = EVENT_APPEARANCE[event.category];
  const colors = AREA_COLOR_CLASSES[color];
  return (
    <button
      type="button"
      onClick={() => onSelect(event)}
      aria-label={`Evento: ${event.title}, ${timeLabel(event).toLowerCase()}`}
      title={`${event.title} · ${timeLabel(event)}`}
      className={cn(
        'flex w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-md border px-1.5 text-left transition-[filter] hover:brightness-125 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
        colors.soft,
        colors.border,
        compact ? 'py-0.5 text-[0.7rem] leading-tight' : 'py-1.5 text-sm',
        className,
      )}
    >
      <Icon aria-hidden className={cn('shrink-0', colors.text, compact ? 'size-3' : 'size-4')} />
      {event.time && (
        <span className="shrink-0 font-hud tabular-nums text-muted-foreground">{event.time}</span>
      )}
      <span className="truncate font-medium">{event.title}</span>
    </button>
  );
}
