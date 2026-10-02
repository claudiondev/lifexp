import type { GoalStatus } from '@lifexp/shared';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { useAreas } from '@/features/areas/useAreas';
import { GoalCard } from '@/features/goals/GoalCard';
import { GoalFormDialog } from '@/features/goals/GoalFormDialog';
import { STATUS_FILTERS } from '@/features/goals/goalFormat';
import { useGoalList } from '@/features/goals/useGoals';
import { cn } from '@/lib/utils';
import { PageHeader } from './PageHeader';

const EMPTY_TEXT: Record<GoalStatus, string> = {
  active: 'Nenhuma meta ativa. Crie a primeira e ligue seus blocos a ela.',
  paused: 'Nenhuma meta pausada.',
  completed: 'Nenhuma meta concluída ainda. A primeira vale +500 XP.',
  abandoned: 'Nenhuma meta abandonada.',
};

export function GoalsPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<GoalStatus>('active');
  const [creating, setCreating] = useState(false);
  const goals = useGoalList(status);
  const areas = useAreas(true);
  const areaById = new Map(areas.data?.map((area) => [area.id, area]));

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <PageHeader
        eyebrow="Objetivos"
        title="Metas"
        description="Marcos e horas de blocos cumpridos mostram o quanto você já avançou."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus aria-hidden className="size-4" />
            Nova meta
          </Button>
        }
      />

      <div role="group" aria-label="Filtrar por status" className="mt-6 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            aria-pressed={status === filter.value}
            onClick={() => setStatus(filter.value)}
            className={cn(
              'h-9 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
              status === filter.value
                ? 'border-primary bg-primary/15 text-foreground'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <section aria-label="Lista de metas" className="mt-6">
        {goals.isPending && (
          <div className="grid gap-4 sm:grid-cols-2" aria-busy="true">
            {[0, 1].map((index) => (
              <div
                key={index}
                className="h-40 animate-pulse rounded-2xl border border-border bg-card/50"
              />
            ))}
          </div>
        )}

        {goals.isError && (
          <div
            role="alert"
            className="rounded-2xl border border-destructive/40 bg-destructive/10 p-5"
          >
            <p className="text-destructive">Não foi possível carregar as metas.</p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={() => void goals.refetch()}
            >
              Tentar de novo
            </Button>
          </div>
        )}

        {goals.isSuccess && goals.data.length === 0 && (
          <p className="rounded-2xl border border-dashed border-border bg-card/40 p-8 text-center text-muted-foreground">
            {EMPTY_TEXT[status]}
          </p>
        )}

        {goals.isSuccess && goals.data.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {goals.data.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                area={goal.areaId ? areaById.get(goal.areaId) : undefined}
              />
            ))}
          </div>
        )}
      </section>

      <GoalFormDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(goal) => void navigate(`/metas/${goal.id}`)}
      />
    </main>
  );
}
