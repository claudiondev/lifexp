import { timeToMinutes, weekDates, type CivilDate } from '@lifexp/shared';
import { cn } from '@/lib/utils';
import { dayOfMonth, longDate, weekdayLong, weekdayShort } from '@/lib/civilFormat';
import { layoutDay, visibleHourRange } from './layoutDay';
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
}

const pad = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

export function WeekGrid({ weekStart, today, nowMinutes, items }: WeekGridProps) {
  const dates = weekDates(weekStart);
  const range = visibleHourRange(items.map(({ occurrence }) => occurrence));
  const hours = Array.from({ length: range.end - range.start }, (_, index) => range.start + index);
  const totalHeight = hours.length * HOUR_PX;
  const rangeStartMin = range.start * 60;

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card/60 backdrop-blur">
      <div className="min-w-[56rem]">
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

          {dates.map((date) => {
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
                    return (
                      <li key={`${occurrence.blockId}-${occurrence.occurrenceDate}`}>
                        <OccurrenceCard
                          display={item}
                          label={`${activityName}, ${weekdayLong(date)}, ${timeRange(
                            occurrence.startTime,
                            occurrence.durationMin,
                          )}${occurrence.skipped ? ', pulado' : ''}`}
                          compact={(occurrence.durationMin / 60) * HOUR_PX < 40}
                          style={{
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
