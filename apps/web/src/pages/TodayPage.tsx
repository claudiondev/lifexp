import { sortEvents, type CalendarEvent, type TodayItem } from '@lifexp/shared';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { LevelSigil } from '@/components/game/LevelSigil';
import { XpBar } from '@/components/game/XpBar';
import { Button } from '@/components/ui/button';
import { useCharacter } from '@/features/character/useCharacter';
import { useActivities } from '@/features/activities/useActivities';
import { describeJoker } from '@/features/character/jokerModel';
import { useAreas } from '@/features/areas/useAreas';
import { useBlockMutations } from '@/features/blocks/useBlockMutations';
import { EventChip } from '@/features/events/EventChip';
import { EventDialog } from '@/features/events/EventDialog';
import { EventFormDialog } from '@/features/events/EventFormDialog';
import { useEvents } from '@/features/events/useEvents';
import { QuestCard } from '@/features/quest/QuestCard';
import { hasQuest } from '@/features/quest/questModel';
import { useQuest } from '@/features/quest/useQuest';
import { LevelUpDialog } from '@/features/today/LevelUpDialog';
import { TodayItemCard, type TodayItemView } from '@/features/today/TodayItemCard';
import { dayProgress, findNext, itemKey, splitByDay } from '@/features/today/todayModel';
import { useCompletionMutations } from '@/features/today/useCompletionMutations';
import { useToday } from '@/features/today/useToday';
import { longDate, weekdayLong } from '@/lib/civilFormat';
import { PageHeader } from './PageHeader';

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function TodayPage() {
  const today = useToday();
  const character = useCharacter();
  const activities = useActivities(true);
  const areas = useAreas(true);
  // A quest é um extra: se falhar, a tela segue sem o cartão.
  const quest = useQuest();
  const { complete, undo } = useCompletionMutations();
  const { setException, restore } = useBlockMutations();
  const [levelUp, setLevelUp] = useState<number | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);

  // Eventos do dia (informativos: não rendem XP nem se concluem). Se falharem, a tela segue sem eles.
  const todayDate = today.data?.date ?? '';
  const dayEvents = useEvents(todayDate, todayDate);
  const eventsToday = today.data ? sortEvents(dayEvents.data ?? []) : [];

  const views = useMemo(() => {
    if (!today.data || !activities.data || !areas.data) return null;
    const activityById = new Map(activities.data.map((activity) => [activity.id, activity]));
    const areaById = new Map(areas.data.map((area) => [area.id, area]));
    const toView = (item: TodayItem): TodayItemView => {
      const area = areaById.get(item.areaId);
      return {
        item,
        activityName: activityById.get(item.activityId)?.name ?? 'Atividade',
        areaName: area?.name ?? 'Área',
        areaColor: area?.color ?? 'slate',
        areaIcon: area?.icon ?? 'star',
      };
    };
    const groups = splitByDay(today.data.items, today.data.date);
    const next = findNext(groups.today);
    return {
      carryover: groups.carryover.map(toView),
      today: groups.today.map(toView),
      nextKey: next ? itemKey(next) : null,
      progress: dayProgress(groups.today),
    };
  }, [today.data, activities.data, areas.data]);

  /** Roda uma ação sobre uma ocorrência travando só o card dela e avisando erro do servidor. */
  const act = (item: TodayItem, action: () => Promise<void>) => {
    setBusyKey(itemKey(item));
    void action()
      .catch((error: unknown) =>
        toast.error(error instanceof Error ? error.message : 'Algo deu errado. Tente de novo.'),
      )
      .finally(() => setBusyKey(null));
  };

  const ref = (item: TodayItem) => ({
    blockId: item.blockId,
    occurrenceDate: item.occurrenceDate,
  });

  const handleComplete = (item: TodayItem, name: string) =>
    act(item, async () => {
      const result = await complete.mutateAsync(ref(item));
      if (result.alreadyCompleted) return;
      toast.success(`+${result.xpAwarded} XP`, { description: `“${name}” concluído.` });
      if (result.questBonusXp > 0) {
        toast.success(`Quest da semana cumprida! +${result.questBonusXp} XP de bônus`);
      }
      if (result.levelAfter > result.levelBefore) setLevelUp(result.levelAfter);
    });

  const handleUndo = (item: TodayItem, name: string) =>
    act(item, async () => {
      const result = await undo.mutateAsync(ref(item));
      toast.success(`Conclusão de “${name}” desfeita`, {
        description: `${result.xpReverted} XP devolvidos.`,
      });
      if (result.questBonusReverted > 0) {
        toast.success('A quest da semana voltou a ficar em andamento', {
          description: `${result.questBonusReverted} XP de bônus devolvidos. Conclua de novo para recuperar.`,
        });
      }
    });

  const handleSkip = (item: TodayItem, name: string) =>
    act(item, async () => {
      await setException.mutateAsync({ ...ref(item), input: { type: 'skip' } });
      toast.success(`“${name}” pulado nesta data`, {
        description: 'Sem XP e sem penalidade. A série continua.',
      });
    });

  const handleRestore = (item: TodayItem) =>
    act(item, async () => {
      await restore.mutateAsync(ref(item));
      toast.success('Ocorrência restaurada');
    });

  const renderCards = (list: TodayItemView[]) =>
    list.map((view) => (
      <li key={itemKey(view.item)}>
        <TodayItemCard
          view={view}
          highlight={itemKey(view.item) === views?.nextKey}
          busy={busyKey === itemKey(view.item)}
          onComplete={(item) => handleComplete(item, view.activityName)}
          onUndo={(item) => handleUndo(item, view.activityName)}
          onSkip={(item) => handleSkip(item, view.activityName)}
          onRestore={handleRestore}
        />
      </li>
    ));

  const failed = today.isError || activities.isError || areas.isError;
  const total = today.data?.total;

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <PageHeader
        eyebrow="Missões de hoje"
        title="Hoje"
        description={
          today.data
            ? capitalize(`${weekdayLong(today.data.date)}, ${longDate(today.data.date)}`)
            : undefined
        }
      />

      {total && (
        <section
          aria-label="Resumo do dia"
          className="mt-6 flex items-center gap-4 rounded-2xl border border-border bg-card/80 p-4 backdrop-blur sm:p-5"
        >
          <LevelSigil level={total.level} size={52} />
          <div className="min-w-0 flex-1">
            <XpBar
              progress={total.progress}
              segments={10}
              segmentClassName="h-2"
              valueText={`${total.xpIntoLevel} de ${total.xpForNextLevel} XP`}
            />
            <p className="mt-2 font-hud text-xs text-muted-foreground tabular-nums">
              {total.xpIntoLevel} / {total.xpForNextLevel} para o nível {total.level + 1}
            </p>
            {character.ready && (
              <p className="mt-1 font-hud text-xs text-muted-foreground tabular-nums">
                Streak: {character.streakDays} {character.streakDays === 1 ? 'dia' : 'dias'}
                {character.streakBest > 0 && ` · recorde ${character.streakBest}`}
              </p>
            )}
            {character.joker && (
              <p className="mt-1 text-xs text-muted-foreground">{describeJoker(character.joker)}</p>
            )}
          </div>
          <div className="text-right">
            <p className="font-hud text-2xl font-bold text-xp tabular-nums">
              {(today.data?.xpToday ?? 0) >= 0 ? '+' : ''}
              {today.data?.xpToday ?? 0}
            </p>
            <p className="font-hud text-[0.65rem] tracking-wider text-muted-foreground uppercase">
              XP do dia
            </p>
          </div>
        </section>
      )}

      {hasQuest(quest.data) && (
        <div className="mt-6">
          <QuestCard quest={quest.data} />
        </div>
      )}

      <section aria-label="Blocos de hoje" className="mt-6">
        {!views && !failed && (
          <div
            aria-busy="true"
            className="h-40 animate-pulse rounded-2xl border border-border bg-card/50"
          />
        )}

        {failed && (
          <div
            role="alert"
            className="rounded-2xl border border-destructive/40 bg-destructive/10 p-5"
          >
            <p className="text-destructive">Não foi possível carregar as missões de hoje.</p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={() => {
                void today.refetch();
                void activities.refetch();
                void areas.refetch();
              }}
            >
              Tentar de novo
            </Button>
          </div>
        )}

        {views && (
          <div className="flex flex-col gap-8">
            {views.carryover.length > 0 && (
              <div>
                <h2 className="font-display text-xl font-bold">De ontem (ainda dá tempo)</h2>
                <p className="text-sm text-muted-foreground">Dá para concluir até 23:59 de hoje.</p>
                <ul className="mt-3 flex flex-col gap-3">{renderCards(views.carryover)}</ul>
              </div>
            )}

            {eventsToday.length > 0 && (
              <div>
                <h2 className="font-display text-xl font-bold">Eventos de hoje</h2>
                <p className="text-sm text-muted-foreground">
                  Compromissos do dia. Eventos não rendem XP.
                </p>
                <ul className="mt-3 flex flex-col gap-2">
                  {eventsToday.map((event) => (
                    <li key={event.id}>
                      <EventChip event={event} onSelect={setSelectedEvent} />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-display text-xl font-bold">Blocos de hoje</h2>
                {views.progress.total > 0 && (
                  <p className="font-hud text-sm text-muted-foreground tabular-nums">
                    {views.progress.done} de {views.progress.total} concluídos
                  </p>
                )}
              </div>
              {views.today.length === 0 ? (
                <p className="mt-3 rounded-2xl border border-dashed border-border bg-card/40 p-6 text-muted-foreground">
                  Nenhum bloco planejado para hoje: dia livre, seu streak não muda. Crie um bloco na
                  Semana se quiser ganhar XP.
                </p>
              ) : (
                <ul className="mt-3 flex flex-col gap-3">{renderCards(views.today)}</ul>
              )}
            </div>
          </div>
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
        open={editingEvent !== null}
        onOpenChange={(open) => {
          if (!open) setEditingEvent(null);
        }}
        event={editingEvent}
        defaultDate={todayDate}
      />
      <LevelUpDialog level={levelUp} onClose={() => setLevelUp(null)} />
    </main>
  );
}
