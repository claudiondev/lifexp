import {
  groupEventsByDate,
  todayIn,
  weekStartOf,
  type CalendarEvent,
  type CivilDate,
} from '@lifexp/shared';
import { CalendarPlus, CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/useAuth';
import { useActivities } from '@/features/activities/useActivities';
import { useAreas } from '@/features/areas/useAreas';
import { formatDuration } from '@/features/blocks/blockOptions';
import { AreaStrip, DaySummaryLine } from '@/features/blocks/DaySummaryBar';
import { summarizeDay } from '@/features/blocks/daySummary';
import { toOccurrenceDisplays } from '@/features/blocks/occurrenceDisplays';
import { timeRange, type OccurrenceDisplay } from '@/features/blocks/OccurrenceCard';
import { useNow } from '@/features/blocks/useNow';
import { useRange } from '@/features/blocks/useWeek';
import { AREA_COLOR_CLASSES } from '@/features/areas/areaAppearance';
import { EventChip } from '@/features/events/EventChip';
import { EventDialog } from '@/features/events/EventDialog';
import { EventFormDialog } from '@/features/events/EventFormDialog';
import { EVENT_APPEARANCE } from '@/features/events/eventAppearance';
import { addMonths, monthGrid, monthStartOf, parseMonthParam } from '@/features/events/monthGrid';
import { useEvents } from '@/features/events/useEvents';
import { dayOfMonth, longDate, weekdayLong } from '@/lib/civilFormat';
import { useIsDesktop } from '@/lib/useIsDesktop';
import { cn } from '@/lib/utils';
import { PageHeader } from './PageHeader';

const MONTH_PARAM = 'mes';
const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const MAX_CHIPS = 2;

const monthLabel = (monthStart: CivilDate) =>
  new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${monthStart}T00:00:00Z`),
  );
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function CalendarPage() {
  const { state } = useAuth();
  const [params, setParams] = useSearchParams();
  const now = useNow();
  const isDesktop = useIsDesktop();
  const [pickedDay, setPickedDay] = useState<CivilDate | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [creating, setCreating] = useState(false);

  const timezone = state.status === 'authenticated' ? state.user.timezone : 'UTC';
  const today = todayIn(timezone, now);
  const currentMonth = monthStartOf(today);
  const month = parseMonthParam(params.get(MONTH_PARAM)) ?? currentMonth;
  const weeks = useMemo(() => monthGrid(month), [month]);
  const gridStart = weeks[0]![0]!;
  const gridEnd = weeks.at(-1)![6]!;

  const events = useEvents(gridStart, gridEnd);
  // Blocos do mês (as semanas da grade, numa consulta só). São um EXTRA: se falharem, o mês segue só com os eventos.
  const range = useRange(gridStart, weeks.length);
  const activities = useActivities(true);
  const areas = useAreas(true);
  const blocks = useMemo<OccurrenceDisplay[]>(
    () =>
      range.data && activities.data && areas.data
        ? toOccurrenceDisplays(range.data, activities.data, areas.data)
        : [],
    [range.data, activities.data, areas.data],
  );
  const blocksOf = (date: CivilDate) =>
    blocks
      .filter(({ occurrence }) => occurrence.date === date)
      .sort((a, b) => a.occurrence.startTime.localeCompare(b.occurrence.startTime));
  const byDate = useMemo(() => groupEventsByDate(events.data ?? []), [events.data]);

  // Dia aberto: o escolhido, se ainda é do mês exibido; senão hoje (no mês atual) ou o dia 1.
  const inMonth = (date: CivilDate) => monthStartOf(date) === month;
  const selectedDay =
    pickedDay !== null && inMonth(pickedDay) ? pickedDay : inMonth(today) ? today : month;
  const dayEvents = byDate.get(selectedDay) ?? [];
  const dayBlocks = blocksOf(selectedDay);

  const goTo = (target: CivilDate) => {
    if (target === currentMonth) setParams({}, { replace: true });
    else setParams({ [MONTH_PARAM]: target.slice(0, 7) });
  };

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <PageHeader
        eyebrow="Calendário"
        title={capitalize(monthLabel(month))}
        description="Seus blocos, consultas, viagens, aniversários e prazos do mês."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => setCreating(true)}>
              <CalendarPlus aria-hidden className="size-4" />
              Novo evento
            </Button>
            <Button
              variant="secondary"
              size="icon"
              aria-label="Mês anterior"
              onClick={() => goTo(addMonths(month, -1))}
            >
              <ChevronLeft aria-hidden className="size-4" />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={month === currentMonth}
              onClick={() => goTo(currentMonth)}
            >
              Hoje
            </Button>
            <Button
              variant="secondary"
              size="icon"
              aria-label="Próximo mês"
              onClick={() => goTo(addMonths(month, 1))}
            >
              <ChevronRight aria-hidden className="size-4" />
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link to="/semana">
                <CalendarRange aria-hidden className="size-4" />
                Semana
              </Link>
            </Button>
          </div>
        }
      />

      {events.isError && (
        <div
          role="alert"
          className="mt-6 rounded-2xl border border-destructive/40 bg-destructive/10 p-4"
        >
          <p className="text-destructive">Não foi possível carregar os eventos do mês.</p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => void events.refetch()}
          >
            Tentar de novo
          </Button>
        </div>
      )}

      <section
        aria-label="Grade do mês"
        className="mt-6 overflow-hidden rounded-2xl border border-border bg-card/60 backdrop-blur"
      >
        <div className="grid grid-cols-7 border-b border-border">
          {WEEKDAYS.map((name) => (
            <span
              key={name}
              className="py-2 text-center font-hud text-[0.65rem] tracking-wider text-muted-foreground uppercase"
            >
              {name}
            </span>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0]} className="grid grid-cols-7 border-b border-border/60 last:border-b-0">
            {week.map((date) => {
              const items = byDate.get(date) ?? [];
              const inThisMonth = inMonth(date);
              const isToday = date === today;
              const selected = date === selectedDay;
              const summary = summarizeDay(blocks, date);
              const blockCount = summary.planned;
              return (
                <div
                  key={date}
                  className={cn(
                    'flex min-h-16 min-w-0 flex-col gap-1 border-l border-border/60 p-1 first:border-l-0 sm:min-h-24',
                    !inThisMonth && 'bg-background/40 text-muted-foreground/60',
                    selected && 'bg-primary/10',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setPickedDay(date)}
                    aria-label={`${weekdayLong(date)}, ${longDate(date)}${isToday ? ' (hoje)' : ''}, ${items.length} ${items.length === 1 ? 'evento' : 'eventos'}${blockCount > 0 ? `, ${blockCount} ${blockCount === 1 ? 'bloco' : 'blocos'}` : ''}`}
                    aria-pressed={selected}
                    className={cn(
                      'grid size-7 place-items-center self-start rounded-full font-display text-sm font-bold transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
                      isToday && 'bg-xp text-background hover:bg-xp',
                    )}
                  >
                    {dayOfMonth(date)}
                  </button>

                  {blockCount > 0 && (
                    <div className="flex min-w-0 flex-col gap-0.5 px-0.5">
                      {isDesktop && <DaySummaryLine summary={summary} />}
                      <AreaStrip summary={summary} />
                    </div>
                  )}

                  {isDesktop ? (
                    <ul className="flex min-w-0 flex-col gap-0.5">
                      {items.slice(0, MAX_CHIPS).map((event) => (
                        <li key={event.id}>
                          <EventChip event={event} onSelect={setSelectedEvent} compact />
                        </li>
                      ))}
                      {items.length > MAX_CHIPS && (
                        <li>
                          <button
                            type="button"
                            onClick={() => setPickedDay(date)}
                            className="px-1 text-left text-[0.7rem] text-muted-foreground hover:text-foreground"
                          >
                            +{items.length - MAX_CHIPS} mais
                          </button>
                        </li>
                      )}
                    </ul>
                  ) : (
                    <div aria-hidden className="flex flex-wrap gap-0.5 px-0.5">
                      {items.slice(0, 4).map((event) => (
                        <span
                          key={event.id}
                          className={cn(
                            'size-1.5 rounded-full',
                            AREA_COLOR_CLASSES[EVENT_APPEARANCE[event.category].color].solid,
                          )}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </section>

      <section aria-label="Blocos do dia" className="mt-6">
        <h2 className="font-display text-xl font-bold">Blocos do dia</h2>
        {dayBlocks.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-border bg-card/40 p-6 text-muted-foreground">
            Nenhum bloco neste dia.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {dayBlocks.map((display) => (
              <li key={`${display.occurrence.blockId}-${display.occurrence.occurrenceDate}`}>
                <DayBlockLink display={display} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Eventos do dia" className="mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display text-xl font-bold">
            {capitalize(`${weekdayLong(selectedDay)}, ${longDate(selectedDay)}`)}
          </h2>
          <Button variant="ghost" size="sm" onClick={() => setCreating(true)}>
            <CalendarPlus aria-hidden className="size-4" />
            Novo evento neste dia
          </Button>
        </div>
        {dayEvents.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-border bg-card/40 p-6 text-muted-foreground">
            Nenhum evento neste dia.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {dayEvents.map((event) => (
              <li key={event.id}>
                <EventChip event={event} onSelect={setSelectedEvent} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <EventDialog
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
        onEdit={(event) => {
          setSelectedEvent(null);
          setEditingEvent(event);
        }}
      />
      <EventFormDialog
        open={creating || editingEvent !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditingEvent(null);
          }
        }}
        event={editingEvent}
        defaultDate={selectedDay}
      />
    </main>
  );
}

/** Um bloco do dia aberto: leva para a Semana em que ele está (lá se conclui, pula e edita). */
function DayBlockLink({ display }: { display: OccurrenceDisplay }) {
  const { occurrence, activityName, areaName, areaColor, completion } = display;
  const colors = AREA_COLOR_CLASSES[areaColor];
  return (
    <Link
      to={`/semana?inicio=${weekStartOf(occurrence.date)}`}
      className={cn(
        'flex items-center gap-3 rounded-2xl border border-l-4 p-3 transition-[filter] hover:brightness-125 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        colors.soft,
        colors.border,
        occurrence.skipped && 'border-dashed opacity-60',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate font-semibold', occurrence.skipped && 'line-through')}>
          {activityName}
        </span>
        <span className="block font-hud text-sm text-muted-foreground tabular-nums">
          {timeRange(occurrence.startTime, occurrence.durationMin)} ·{' '}
          {formatDuration(occurrence.durationMin)} · {areaName}
        </span>
      </span>
      {completion && (
        <span className="shrink-0 rounded-full border border-xp/40 bg-xp/10 px-2 py-0.5 font-hud text-xs font-medium text-xp tabular-nums">
          +{completion.xpAmount} XP
        </span>
      )}
      {occurrence.skipped && (
        <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground">
          Pulado
        </span>
      )}
    </Link>
  );
}
