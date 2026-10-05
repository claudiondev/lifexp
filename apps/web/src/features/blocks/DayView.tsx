import { Check } from 'lucide-react';
import { weekDates, type CalendarEvent, type CivilDate } from '@lifexp/shared';
import { useRef, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';
import { dayOfMonth, longDate, weekdayLong, weekdayShort } from '@/lib/civilFormat';
import { AREA_COLOR_CLASSES, AREA_ICON_COMPONENTS } from '../areas/areaAppearance';
import { EventChip } from '../events/EventChip';
import { formatDuration } from './blockOptions';
import { timeRange, type OccurrenceDisplay } from './OccurrenceCard';
import { OccurrenceNote } from './OccurrenceNote';

interface DayViewProps {
  weekStart: CivilDate;
  today: CivilDate;
  selectedDate: CivilDate;
  onSelectDate: (date: CivilDate) => void;
  items: OccurrenceDisplay[];
  onSelect: (display: OccurrenceDisplay) => void;
  /** Eventos da semana por dia (RF35): os do dia aberto ficam no topo da lista. */
  events?: Map<CivilDate, CalendarEvent[]>;
  onSelectEvent?: (event: CalendarEvent) => void;
}

/** Visão do celular: abas com os 7 dias e a agenda (lista cronológica) do dia escolhido. */
export function DayView({
  weekStart,
  today,
  selectedDate,
  onSelectDate,
  items,
  onSelect,
  events,
  onSelectEvent,
}: DayViewProps) {
  const dates = weekDates(weekStart);
  const tabRefs = useRef(new Map<CivilDate, HTMLButtonElement>());

  const itemsOf = (date: CivilDate) =>
    items
      .filter(({ occurrence }) => occurrence.date === date)
      .sort((a, b) => a.occurrence.startTime.localeCompare(b.occurrence.startTime));

  // Padrão ARIA de abas: setas movem entre os dias (e Home/End vão às pontas).
  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const target =
      event.key === 'ArrowRight'
        ? dates[(index + 1) % dates.length]
        : event.key === 'ArrowLeft'
          ? dates[(index - 1 + dates.length) % dates.length]
          : event.key === 'Home'
            ? dates[0]
            : event.key === 'End'
              ? dates[dates.length - 1]
              : undefined;
    if (!target) return;
    event.preventDefault();
    onSelectDate(target);
    tabRefs.current.get(target)?.focus();
  };

  const selectedItems = itemsOf(selectedDate);
  const selectedEvents = events?.get(selectedDate) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Dias da semana" className="grid grid-cols-7 gap-1">
        {dates.map((date, index) => {
          const selected = date === selectedDate;
          const count = itemsOf(date).length;
          return (
            <button
              key={date}
              ref={(node) => {
                if (node) tabRefs.current.set(date, node);
              }}
              type="button"
              role="tab"
              id={`day-tab-${date}`}
              aria-selected={selected}
              aria-controls="day-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => onSelectDate(date)}
              onKeyDown={(event) => onKeyDown(event, index)}
              aria-label={`${weekdayLong(date)}, ${longDate(date)}${date === today ? ' (hoje)' : ''}, ${count} ${count === 1 ? 'bloco' : 'blocos'}`}
              className={cn(
                'flex flex-col items-center gap-1 rounded-xl border py-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                selected
                  ? 'border-primary bg-primary/15'
                  : 'border-border bg-card/50 text-muted-foreground',
              )}
            >
              <span className="font-hud text-[0.65rem] tracking-wider uppercase">
                {weekdayShort(date)}
              </span>
              <span
                className={cn(
                  'grid size-7 place-items-center rounded-full font-display text-base font-bold',
                  date === today && 'bg-xp text-background',
                )}
              >
                {dayOfMonth(date)}
              </span>
              <span
                aria-hidden
                className={cn('h-1 w-1 rounded-full', count > 0 ? 'bg-xp' : 'bg-transparent')}
              />
            </button>
          );
        })}
      </div>

      <section
        id="day-panel"
        role="tabpanel"
        aria-labelledby={`day-tab-${selectedDate}`}
        aria-label={`${weekdayLong(selectedDate)}, ${longDate(selectedDate)}`}
        className="flex flex-col gap-3"
      >
        {selectedEvents.length > 0 && onSelectEvent && (
          <ul aria-label="Eventos do dia" className="flex flex-col gap-2">
            {selectedEvents.map((event) => (
              <li key={event.id}>
                <EventChip event={event} onSelect={onSelectEvent} />
              </li>
            ))}
          </ul>
        )}
        {selectedItems.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-card/40 p-6 text-center text-muted-foreground">
            Nenhum bloco neste dia.
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            {selectedItems.map((display) => (
              <li key={`${display.occurrence.blockId}-${display.occurrence.occurrenceDate}`}>
                <AgendaCard display={display} onSelect={onSelect} />
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function AgendaCard({
  display,
  onSelect,
}: {
  display: OccurrenceDisplay;
  onSelect: (display: OccurrenceDisplay) => void;
}) {
  const { occurrence, activityName, areaName, areaColor, areaIcon, completion } = display;
  const colors = AREA_COLOR_CLASSES[areaColor];
  const { Icon } = AREA_ICON_COMPONENTS[areaIcon];
  const range = timeRange(occurrence.startTime, occurrence.durationMin);

  return (
    <button
      type="button"
      onClick={() => onSelect(display)}
      aria-label={`${activityName}, ${weekdayLong(occurrence.date)}, ${range}${occurrence.skipped ? ', pulado' : ''}${display.completion ? ', concluído' : ''}`}
      className={cn(
        'relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border border-l-4 p-4 text-left transition-[filter] active:brightness-125 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        colors.soft,
        colors.border,
        occurrence.skipped && 'border-dashed opacity-60',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'absolute inset-y-0 left-0 w-1',
          occurrence.skipped ? 'bg-border' : colors.solid,
        )}
      />
      <span
        aria-hidden
        className={cn(
          'grid size-10 shrink-0 place-items-center rounded-xl bg-background/40',
          colors.text,
        )}
      >
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block truncate font-display text-lg font-bold',
            occurrence.skipped && 'line-through',
          )}
        >
          {activityName}
        </span>
        <span className="block font-hud text-sm text-muted-foreground tabular-nums">
          {range} · {formatDuration(occurrence.durationMin)}
        </span>
        <span className="block text-xs text-muted-foreground">{areaName}</span>
        <OccurrenceNote note={occurrence.note} clamp={2} className="mt-1 text-sm" />
      </span>
      {completion && (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-xp/40 bg-xp/10 px-2 py-0.5 font-hud text-xs font-medium text-xp tabular-nums">
          <Check aria-hidden className="size-3" />+{completion.xpAmount} XP
        </span>
      )}
      {occurrence.skipped && (
        <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground">
          Pulado
        </span>
      )}
      {occurrence.modified && !occurrence.skipped && (
        <span className="shrink-0 rounded-full border border-xp/50 px-2 py-0.5 text-xs font-medium text-xp">
          Alterado
        </span>
      )}
    </button>
  );
}
