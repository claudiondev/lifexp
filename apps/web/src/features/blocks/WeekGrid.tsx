import {
  minutesToTime,
  timeToMinutes,
  weekDates,
  type CalendarEvent,
  type CivilDate,
} from '@lifexp/shared';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { cn } from '@/lib/utils';
import { dayOfMonth, longDate, weekdayLong, weekdayShort } from '@/lib/civilFormat';
import { EventChip } from '../events/EventChip';
import { computeDrop, dropOffset, isDrag, type DragInput } from './dragGeometry';
import { layoutDay, visibleHourRange } from './layoutDay';
import type { MoveTarget } from './useMoveOccurrence';
import { OccurrenceCard, timeRange, type OccurrenceDisplay } from './OccurrenceCard';

/** Altura de uma hora na grade, em pixels. */
export const HOUR_PX = 48;
const MIN_CARD_PX = 22;

interface WeekGridProps {
  weekStart: CivilDate;
  today: CivilDate;
  /** Minutos desde 00:00 no fuso da pessoa, para a linha de "agora" (só aparece em hoje). */
  nowMinutes: number;
  items: OccurrenceDisplay[];
  onSelect: (display: OccurrenceDisplay) => void;
  /** Eventos da semana por dia (RF35): ficam numa faixa acima das horas. */
  events?: Map<CivilDate, CalendarEvent[]>;
  onSelectEvent?: (event: CalendarEvent) => void;
  /** Soltar um bloco em outro dia/horário (RF18). Sem isto a grade não aceita arrasto. */
  onMove?: (display: OccurrenceDisplay, target: MoveTarget) => void;
}

const keyOf = ({ occurrence }: OccurrenceDisplay) =>
  `${occurrence.blockId}-${occurrence.occurrenceDate}`;

/** Um arrasto em andamento: de onde saiu e quanto o ponteiro já andou. */
interface DragState {
  display: OccurrenceDisplay;
  originX: number;
  originY: number;
  geometry: Omit<DragInput, 'deltaX' | 'deltaY'>;
  deltaX: number;
  deltaY: number;
  /** Passou do limiar: deixou de ser um clique. */
  active: boolean;
}

const pad = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

export function WeekGrid({
  weekStart,
  today,
  nowMinutes,
  items,
  onSelect,
  events,
  onSelectEvent,
  onMove,
}: WeekGridProps) {
  const dates = weekDates(weekStart);
  const range = visibleHourRange(items.map(({ occurrence }) => occurrence));
  const hours = Array.from({ length: range.end - range.start }, (_, index) => range.start + index);
  const totalHeight = hours.length * HOUR_PX;
  const rangeStartMin = range.start * 60;

  // O arrasto vive num ref (os ouvintes da janela leem sempre o valor atual) e é espelhado no estado
  // só para redesenhar o cartão.
  const dragRef = useRef<DragState | null>(null);
  const [drag, setDragState] = useState<DragState | null>(null);
  const setDrag = (next: DragState | null) => {
    dragRef.current = next;
    setDragState(next);
  };
  // O navegador dispara um clique ao soltar o botão: depois de um arrasto ele não pode abrir o painel.
  const suppressClick = useRef(false);
  // `dates` e `onMove` mudam a cada render; os ouvintes usam os mais recentes sem se reinscrever.
  const latest = useRef({ dates, onMove });
  useEffect(() => {
    latest.current = { dates, onMove };
  });
  const tracking = drag !== null;

  useEffect(() => {
    if (!tracking) return;
    const move = (event: PointerEvent) => {
      const current = dragRef.current;
      if (!current) return;
      const deltaX = event.clientX - current.originX;
      const deltaY = event.clientY - current.originY;
      setDrag({ ...current, deltaX, deltaY, active: current.active || isDrag(deltaX, deltaY) });
    };
    const finish = (commit: boolean) => {
      const current = dragRef.current;
      setDrag(null);
      if (!current?.active) return;
      suppressClick.current = true;
      // o clique (se vier) chega logo depois do pointerup; passado esse instante, libera
      setTimeout(() => (suppressClick.current = false), 0);
      if (!commit) return;
      const target = computeDrop({ ...current.geometry, ...current });
      latest.current.onMove?.(current.display, {
        date: latest.current.dates[target.dayIndex]!,
        startTime: minutesToTime(target.startMinutes),
      });
    };
    const up = () => finish(true);
    const cancel = () => finish(false);
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish(false);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', key);
    };
  }, [tracking]);

  /** Concluída ou pulada não se move (o servidor também recusa: 409). Toque fica para rolar a grade. */
  const startDrag =
    (display: OccurrenceDisplay, dayIndex: number) =>
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0 || event.pointerType === 'touch') return;
      const column = event.currentTarget.closest('section');
      setDrag({
        display,
        originX: event.clientX,
        originY: event.clientY,
        geometry: {
          dayIndex,
          startMinutes: timeToMinutes(display.occurrence.startTime),
          durationMin: display.occurrence.durationMin,
          columnWidth: column?.getBoundingClientRect().width ?? 0,
          hourPx: HOUR_PX,
          range,
        },
        deltaX: 0,
        deltaY: 0,
        active: false,
      });
    };
  const select = (display: OccurrenceDisplay) => {
    if (suppressClick.current) return;
    onSelect(display);
  };

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card/60 backdrop-blur">
      <div className="min-w-[44rem]">
        <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] border-b border-border">
          <div />
          {dates.map((date) => {
            const isToday = date === today;
            return (
              <div
                key={date}
                className={cn('flex flex-col items-center gap-1 py-2', isToday && 'bg-xp/5')}
              >
                <span className="font-hud text-[0.7rem] tracking-wider text-muted-foreground uppercase">
                  {weekdayShort(date)}
                </span>
                <span
                  className={cn(
                    'grid size-8 place-items-center rounded-full font-display text-lg font-bold',
                    isToday && 'bg-xp text-background',
                  )}
                  aria-label={isToday ? `${longDate(date)} (hoje)` : longDate(date)}
                >
                  {dayOfMonth(date)}
                </span>
              </div>
            );
          })}
        </div>

        {events && events.size > 0 && onSelectEvent && (
          <div
            role="group"
            aria-label="Eventos da semana"
            className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] border-b border-border"
          >
            <span className="pt-2 pr-2 text-right font-hud text-[0.6rem] tracking-wider text-muted-foreground uppercase">
              Eventos
            </span>
            {dates.map((date) => (
              <ul
                key={date}
                className={cn(
                  'flex min-w-0 flex-col gap-1 border-l border-border p-1',
                  date === today && 'bg-xp/5',
                )}
              >
                {(events.get(date) ?? []).map((event) => (
                  <li key={event.id}>
                    <EventChip event={event} onSelect={onSelectEvent} compact />
                  </li>
                ))}
              </ul>
            ))}
          </div>
        )}

        <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]">
          <div aria-hidden className="relative" style={{ height: totalHeight }}>
            {hours.map((hour, index) => (
              <span
                key={hour}
                className="absolute right-2 -translate-y-1/2 font-hud text-[0.65rem] text-muted-foreground tabular-nums"
                style={{ top: index * HOUR_PX }}
              >
                {index === 0 ? '' : pad(hour)}
              </span>
            ))}
          </div>

          {dates.map((date, dayIndex) => {
            const isToday = date === today;
            const dayItems = items.filter(({ occurrence }) => occurrence.date === date);
            const laid = layoutDay(dayItems.map((item) => ({ ...item, ...item.occurrence })));

            return (
              <section
                key={date}
                aria-label={`${weekdayLong(date)}, ${longDate(date)}`}
                className={cn('relative border-l border-border', isToday && 'bg-xp/5')}
                style={{ height: totalHeight }}
              >
                <div aria-hidden>
                  {hours.map((hour) => (
                    <div
                      key={hour}
                      className="border-t border-border/60"
                      style={{ height: HOUR_PX }}
                    />
                  ))}
                </div>

                <ol className="absolute inset-0">
                  {laid.map(({ item, lane, lanes }) => {
                    const { occurrence, activityName } = item;
                    const start = timeToMinutes(occurrence.startTime);
                    const movable = onMove && !item.completion && !occurrence.skipped;
                    const dragging = drag?.active === true && keyOf(drag.display) === keyOf(item);
                    // Durante o arrasto o cartão já aparece no destino encaixado, com o novo horário.
                    const target = dragging ? computeDrop({ ...drag.geometry, ...drag }) : null;
                    const offset = target ? dropOffset(drag!.geometry, target) : null;
                    return (
                      <li key={keyOf(item)}>
                        <OccurrenceCard
                          display={
                            target
                              ? {
                                  ...item,
                                  occurrence: {
                                    ...occurrence,
                                    startTime: minutesToTime(target.startMinutes),
                                  },
                                }
                              : item
                          }
                          dragging={dragging}
                          onDragStart={movable ? startDrag(item, dayIndex) : undefined}
                          label={`${activityName}, ${weekdayLong(date)}, ${timeRange(
                            occurrence.startTime,
                            occurrence.durationMin,
                          )}${occurrence.skipped ? ', pulado' : ''}${item.completion ? ', concluído' : ''}`}
                          compact={(occurrence.durationMin / 60) * HOUR_PX < 40}
                          onSelect={() => select(item)}
                          style={{
                            ...(offset && {
                              transform: `translate(${offset.x}px, ${offset.y}px)`,
                            }),
                            top: ((start - rangeStartMin) / 60) * HOUR_PX,
                            height: Math.max((occurrence.durationMin / 60) * HOUR_PX, MIN_CARD_PX),
                            left: `calc(${(lane / lanes) * 100}% + 2px)`,
                            width: `calc(${100 / lanes}% - 4px)`,
                          }}
                        />
                      </li>
                    );
                  })}
                </ol>

                {isToday && nowMinutes >= rangeStartMin && nowMinutes <= range.end * 60 && (
                  <div
                    aria-hidden
                    data-testid="now-line"
                    className="pointer-events-none absolute inset-x-0 z-10 h-px bg-xp shadow-[0_0_8px_var(--xp)]"
                    style={{ top: ((nowMinutes - rangeStartMin) / 60) * HOUR_PX }}
                  >
                    <span className="absolute -top-1 -left-1 size-2 rounded-full bg-xp" />
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
