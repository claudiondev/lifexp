import { useQueryClient } from '@tanstack/react-query';
import {
  addDays,
  groupEventsByDate,
  type CalendarEvent,
  isValidCivilDate,
  isWeekStart,
  todayIn,
  weekStartOf,
  type CivilDate,
} from '@lifexp/shared';
import { CalendarPlus, CalendarRange, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { useIsDesktop } from '@/lib/useIsDesktop';
import { formatWeekRange } from '@/lib/civilFormat';
import { useActivities } from '@/features/activities/useActivities';
import { useAreas } from '@/features/areas/useAreas';
import { useAuth } from '@/features/auth/useAuth';
import { EventDialog } from '@/features/events/EventDialog';
import { EventFormDialog } from '@/features/events/EventFormDialog';
import { useEvents } from '@/features/events/useEvents';
import { BlockFormDialog } from '@/features/blocks/BlockFormDialog';
import { DayView } from '@/features/blocks/DayView';
import { OccurrenceDialog } from '@/features/blocks/OccurrenceDialog';
import type { OccurrenceDisplay } from '@/features/blocks/OccurrenceCard';
import { useNow } from '@/features/blocks/useNow';
import { useWeek, weekQueryOptions } from '@/features/blocks/useWeek';
import { WeekGrid } from '@/features/blocks/WeekGrid';
import { PageHeader } from './PageHeader';

const WEEK_PARAM = 'inicio';

/** Aceita qualquer data da URL e a normaliza para a segunda-feira da semana; lixo vira "esta semana". */
function resolveWeekStart(param: string | null, currentWeek: CivilDate): CivilDate {
  if (param && isValidCivilDate(param)) return isWeekStart(param) ? param : weekStartOf(param);
  return currentWeek;
}

export function WeekPage() {
  const { state } = useAuth();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const now = useNow();
  const [creating, setCreating] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [creatingEvent, setCreatingEvent] = useState(false);
  const [selected, setSelected] = useState<OccurrenceDisplay | null>(null);
  const [pickedDay, setPickedDay] = useState<CivilDate | null>(null);
  const isDesktop = useIsDesktop();

  const timezone = state.status === 'authenticated' ? state.user.timezone : 'UTC';
  const today = todayIn(timezone, now);
  const currentWeek = weekStartOf(today);
  const weekStart = resolveWeekStart(params.get(WEEK_PARAM), currentWeek);

  // Dia aberto na visão do celular: o escolhido, se ainda pertence a esta semana; senão hoje (na
  // semana atual) ou a segunda. Ao trocar de semana o dia escolhido deixa de valer sozinho.
  const defaultDay = today >= weekStart && today <= addDays(weekStart, 6) ? today : weekStart;
  const selectedDay =
    pickedDay !== null && pickedDay >= weekStart && pickedDay <= addDays(weekStart, 6)
      ? pickedDay
      : defaultDay;

  const week = useWeek(weekStart);
  // Eventos da semana (RF35). Se falharem, a grade de blocos continua funcionando sem eles.
  const weekEvents = useEvents(weekStart, addDays(weekStart, 6));
  const eventsByDate = useMemo(() => groupEventsByDate(weekEvents.data ?? []), [weekEvents.data]);
  // Inclui arquivadas: blocos antigos de uma atividade arquivada continuam aparecendo.
  const activities = useActivities(true);
  const areas = useAreas(true);

  // Semanas vizinhas já ficam em cache: navegar para elas é instantâneo.
  useEffect(() => {
    void queryClient.prefetchQuery(weekQueryOptions(addDays(weekStart, -7)));
    void queryClient.prefetchQuery(weekQueryOptions(addDays(weekStart, 7)));
  }, [queryClient, weekStart]);

  const items = useMemo<OccurrenceDisplay[]>(() => {
    if (!week.data || !activities.data || !areas.data) return [];
    const activityById = new Map(activities.data.map((activity) => [activity.id, activity]));
    const areaById = new Map(areas.data.map((area) => [area.id, area]));
    const completionByOccurrence = new Map(
      week.data.completions.map((completion) => [
        `${completion.blockId}:${completion.occurrenceDate}`,
        completion,
      ]),
    );
    return week.data.occurrences.map((occurrence) => {
      const area = areaById.get(occurrence.areaId);
      return {
        occurrence,
        activityName: activityById.get(occurrence.activityId)?.name ?? 'Atividade',
        areaName: area?.name ?? 'Área',
        areaColor: area?.color ?? 'slate',
        areaIcon: area?.icon ?? 'star',
        completion: completionByOccurrence.get(
          `${occurrence.blockId}:${occurrence.occurrenceDate}`,
        ),
      };
    });
  }, [week.data, activities.data, areas.data]);

  const goTo = (target: CivilDate) => {
    if (target === currentWeek) setParams({}, { replace: true });
    else setParams({ [WEEK_PARAM]: target });
  };

  const nowLocal = now.setZone(timezone);
  const nowMinutes = nowLocal.hour * 60 + nowLocal.minute;
  const loading = week.isPending || activities.isPending || areas.isPending;
  const failed = week.isError || activities.isError || areas.isError;

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <PageHeader
        eyebrow="Planejador"
        title="Sua semana"
        description={formatWeekRange(weekStart)}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => setCreating(true)}>
              <Plus aria-hidden className="size-4" />
              Novo bloco
            </Button>
            <Button variant="secondary" onClick={() => setCreatingEvent(true)}>
              <CalendarPlus aria-hidden className="size-4" />
              Novo evento
            </Button>
            <Button asChild variant="secondary" size="icon" aria-label="Calendário do mês">
              <Link to="/calendario">
                <CalendarRange aria-hidden className="size-4" />
              </Link>
            </Button>
            <Button
              variant="secondary"
              size="icon"
              aria-label="Semana anterior"
              onClick={() => goTo(addDays(weekStart, -7))}
            >
              <ChevronLeft aria-hidden className="size-4" />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={weekStart === currentWeek}
              onClick={() => goTo(currentWeek)}
            >
              Hoje
            </Button>
            <Button
              variant="secondary"
              size="icon"
              aria-label="Próxima semana"
              onClick={() => goTo(addDays(weekStart, 7))}
            >
              <ChevronRight aria-hidden className="size-4" />
            </Button>
          </div>
        }
      />

      <section aria-label="Grade da semana" className="mt-6">
        {loading && !failed && (
          <div
            aria-busy="true"
            className="h-[28rem] animate-pulse rounded-2xl border border-border bg-card/50"
          />
        )}

        {failed && (
          <div
            role="alert"
            className="rounded-2xl border border-destructive/40 bg-destructive/10 p-5"
          >
            <p className="text-destructive">Não foi possível carregar a semana.</p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={() => {
                void week.refetch();
                void activities.refetch();
                void areas.refetch();
              }}
            >
              Tentar de novo
            </Button>
          </div>
        )}

        {!loading && !failed && (
          <>
            {items.length === 0 && (
              <p className="mb-4 rounded-xl border border-dashed border-border bg-card/40 px-4 py-3 text-sm text-muted-foreground">
                Nenhum bloco nesta semana.
              </p>
            )}
            {isDesktop ? (
              <WeekGrid
                weekStart={weekStart}
                today={today}
                nowMinutes={nowMinutes}
                items={items}
                onSelect={setSelected}
                events={eventsByDate}
                onSelectEvent={setSelectedEvent}
              />
            ) : (
              <DayView
                weekStart={weekStart}
                today={today}
                selectedDate={selectedDay}
                onSelectDate={setPickedDay}
                items={items}
                onSelect={setSelected}
                events={eventsByDate}
                onSelectEvent={setSelectedEvent}
              />
            )}
          </>
        )}
      </section>

      <OccurrenceDialog display={selected} onClose={() => setSelected(null)} />
      <EventDialog
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
        onEdit={(event) => {
          setSelectedEvent(null);
          setEditingEvent(event);
        }}
      />
      <EventFormDialog
        open={creatingEvent || editingEvent !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreatingEvent(false);
            setEditingEvent(null);
          }
        }}
        event={editingEvent}
        defaultDate={selectedDay}
      />
      <BlockFormDialog
        open={creating}
        onOpenChange={setCreating}
        weekStart={weekStart}
        today={today}
      />
    </main>
  );
}
