import type { Area, Goal, GoalActionResult, GoalStatus } from '@lifexp/shared';
import { ArrowLeft, CalendarClock, Clock, Pencil, Trash2, TriangleAlert } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAreas } from '@/features/areas/useAreas';
import { AreaBadge } from '@/features/areas/AreaBadge';
import { GoalCelebration, type GoalCelebrationData } from '@/features/goals/GoalCelebration';
import { GoalFormDialog } from '@/features/goals/GoalFormDialog';
import { GoalProgressBar } from '@/features/goals/GoalProgressBar';
import { MilestoneList } from '@/features/goals/MilestoneList';
import {
  STATUS_LABEL,
  formatInvested,
  formatNumber,
  progressPercent,
  progressText,
  statusActions,
} from '@/features/goals/goalFormat';
import { useGoal, useGoalHistory, useGoalMutations } from '@/features/goals/useGoals';
import { LevelUpDialog } from '@/features/today/LevelUpDialog';
import { longDate } from '@/lib/civilFormat';
import { PageHeader } from './PageHeader';

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Algo deu errado. Tente de novo.';

export function GoalDetailPage() {
  const { goalId = '' } = useParams();
  const goal = useGoal(goalId);
  const areas = useAreas(true);

  if (goal.isPending) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-10">
        <div
          aria-busy="true"
          className="h-64 animate-pulse rounded-2xl border border-border bg-card/50"
        />
      </main>
    );
  }

  if (goal.isError) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-10">
        <div
          role="alert"
          className="rounded-2xl border border-destructive/40 bg-destructive/10 p-5"
        >
          <p className="text-destructive">Não foi possível abrir esta meta.</p>
          <Button asChild variant="secondary" size="sm" className="mt-3">
            <Link to="/metas">Voltar às metas</Link>
          </Button>
        </div>
      </main>
    );
  }

  const area = goal.data.areaId
    ? areas.data?.find((item) => item.id === goal.data.areaId)
    : undefined;
  return <GoalDetail goal={goal.data} area={area} />;
}

function GoalDetail({ goal, area }: { goal: Goal; area: Area | undefined }) {
  const navigate = useNavigate();
  const history = useGoalHistory(goal.id);
  const mutations = useGoalMutations();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [celebration, setCelebration] = useState<GoalCelebrationData | null>(null);
  const [levelUp, setLevelUp] = useState<number | null>(null);
  const [currentValue, setCurrentValue] = useState(String(goal.currentValue ?? 0));

  const busy = Object.values(mutations).some((mutation) => mutation.isPending);
  const percent = progressPercent(goal);
  const text = progressText(goal);
  const unit = goal.unit ? ` ${goal.unit}` : '';

  const announceLevel = (result: GoalActionResult) => {
    if (result.levelAfter > result.levelBefore) setLevelUp(result.levelAfter);
  };
  const fail = (error: unknown) => toast.error(errorMessage(error));

  const changeStatus = (status: GoalStatus) =>
    mutations.setStatus.mutate(
      { id: goal.id, status },
      {
        onSuccess: (result) => {
          if (status === 'completed' && result.xpDelta > 0) {
            setCelebration({ title: goal.title, xp: result.xpDelta });
            announceLevel(result);
          } else if (result.xpDelta < 0) {
            toast.success('Meta reaberta', { description: `${-result.xpDelta} XP devolvidos.` });
          } else {
            toast.success(`Meta ${STATUS_LABEL[status].toLowerCase()}`);
          }
        },
        onError: fail,
      },
    );

  const toggleMilestone = (milestoneId: string, done: boolean) => {
    const title = goal.milestones.find((m) => m.id === milestoneId)?.title ?? 'Marco';
    if (done) {
      mutations.completeMilestone.mutate(
        { goalId: goal.id, milestoneId },
        {
          onSuccess: (result) => {
            toast.success(`+${result.xpDelta} XP`, { description: `Marco “${title}” concluído.` });
            announceLevel(result);
          },
          onError: fail,
        },
      );
    } else {
      mutations.undoMilestone.mutate(
        { goalId: goal.id, milestoneId },
        {
          onSuccess: (result) =>
            toast.success(`Marco “${title}” desfeito`, {
              description: `${-result.xpDelta} XP devolvidos.`,
            }),
          onError: fail,
        },
      );
    }
  };

  const saveCurrentValue = (event: FormEvent) => {
    event.preventDefault();
    const value = Number(currentValue);
    if (!Number.isFinite(value) || value < 0) return;
    mutations.update.mutate(
      { id: goal.id, input: { currentValue: value } },
      { onSuccess: () => toast.success('Progresso atualizado'), onError: fail },
    );
  };

  const remove = () =>
    mutations.remove.mutate(goal.id, {
      onSuccess: () => {
        toast.success(`Meta “${goal.title}” excluída`);
        void navigate('/metas');
      },
      onError: fail,
    });

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <Button asChild variant="ghost" size="sm" className="-ml-3 mb-2">
        <Link to="/metas">
          <ArrowLeft aria-hidden className="size-4" />
          Metas
        </Link>
      </Button>

      <PageHeader
        eyebrow={`Meta · ${STATUS_LABEL[goal.status]}`}
        title={goal.title}
        {...(goal.description ? { description: goal.description } : {})}
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              <Pencil aria-hidden className="size-4" />
              Editar
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>
              <Trash2 aria-hidden className="size-4" />
              Excluir
            </Button>
          </div>
        }
      />

      <section
        aria-label="Progresso da meta"
        className="mt-6 rounded-2xl border border-border bg-card/80 p-5 backdrop-blur"
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
          {area && (
            <span className="inline-flex items-center gap-2">
              <AreaBadge color={area.color} icon={area.icon} className="size-7 rounded-lg" />
              {area.name}
            </span>
          )}
          {goal.deadline && (
            <span className="inline-flex items-center gap-1">
              <CalendarClock aria-hidden className="size-4" />
              Até {longDate(goal.deadline)}
            </span>
          )}
          {goal.overdue && (
            <span className="inline-flex items-center gap-1 font-medium text-destructive">
              <TriangleAlert aria-hidden className="size-4" />
              Atrasada
            </span>
          )}
        </div>

        <GoalProgressBar
          ratio={goal.progress.ratio}
          label="Progresso da meta"
          valueText={text}
          className="mt-4 h-3"
        />
        <p className="mt-2 flex justify-between gap-3 text-sm">
          <span className="text-muted-foreground">{text}</span>
          {percent !== null && <span className="font-hud tabular-nums">{percent}%</span>}
        </p>

        {goal.readyToComplete && (
          <p className="mt-3 rounded-lg border border-xp/40 bg-xp/10 px-3 py-2 text-sm text-xp">
            Tudo medido: a meta está pronta para você concluir.
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {statusActions(goal.status).map((action) => (
            <Button
              key={action.to}
              variant={action.primary ? 'default' : 'secondary'}
              disabled={busy}
              onClick={() => changeStatus(action.to)}
            >
              {action.label}
              {action.hint && (
                <span className="font-hud text-xs text-current/80 tabular-nums">{action.hint}</span>
              )}
            </Button>
          ))}
        </div>
      </section>

      {goal.targetValue !== null && (
        <section
          aria-labelledby="metric-title"
          className="mt-4 rounded-2xl border border-border bg-card/80 p-5 backdrop-blur"
        >
          <h2 id="metric-title" className="font-display text-xl font-bold">
            Valor atual
          </h2>
          <p className="text-sm text-muted-foreground">
            Alvo: {formatNumber(goal.targetValue)}
            {unit}. Atualize quando avançar.
          </p>
          <form onSubmit={saveCurrentValue} className="mt-3 flex items-end gap-2">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="current-value">Valor atual{unit && ` (${goal.unit})`}</Label>
              <Input
                id="current-value"
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                value={currentValue}
                onChange={(event) => setCurrentValue(event.target.value)}
              />
            </div>
            <Button
              type="submit"
              variant="secondary"
              disabled={busy || currentValue === '' || Number(currentValue) < 0}
            >
              Salvar
            </Button>
          </form>
        </section>
      )}

      <div className="mt-4">
        <MilestoneList
          goal={goal}
          busy={busy}
          onToggle={toggleMilestone}
          onAdd={(title) =>
            mutations.addMilestone
              .mutateAsync({ goalId: goal.id, title })
              .then(() => undefined)
              .catch((error: unknown) => {
                fail(error);
              })
          }
          onRemove={(milestoneId) =>
            mutations.removeMilestone.mutate({ goalId: goal.id, milestoneId }, { onError: fail })
          }
        />
      </div>

      <section
        aria-labelledby="history-title"
        className="mt-4 rounded-2xl border border-border bg-card/80 p-5 backdrop-blur"
      >
        <h2 id="history-title" className="font-display text-xl font-bold">
          Tempo investido
        </h2>
        <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
          <Clock aria-hidden className="size-4" />
          <span>
            <strong className="font-hud text-foreground tabular-nums">
              {formatInvested(goal.investedMinutes)}
            </strong>{' '}
            em blocos cumpridos desta meta
          </span>
        </p>

        {history.isSuccess && history.data.length === 0 && (
          <p className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            Nenhum bloco cumprido ainda. Ao criar um bloco na Semana, escolha esta meta para ele
            contar aqui.
          </p>
        )}
        {history.isSuccess && history.data.length > 0 && (
          <ul className="mt-4 flex flex-col gap-2">
            {history.data.map((item) => (
              <li
                key={`${item.blockId}-${item.occurrenceDate}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background/40 p-3 text-sm"
              >
                <span className="min-w-0 truncate font-medium">{item.activityName}</span>
                <span className="shrink-0 text-muted-foreground">
                  {longDate(item.occurrenceDate)} · {formatInvested(item.durationMin)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {history.isError && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            Não foi possível carregar o histórico.
          </p>
        )}
      </section>

      <GoalFormDialog open={editing} onOpenChange={setEditing} goal={goal} />

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogTitle>Excluir meta</DialogTitle>
          <DialogDescription>
            “{goal.title}” e seus marcos serão removidos, e o XP que renderam volta. Os blocos
            continuam na Semana, só sem meta. Esta ação não pode ser desfeita.
          </DialogDescription>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" disabled={busy} onClick={remove}>
              Excluir meta
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <GoalCelebration celebration={celebration} onClose={() => setCelebration(null)} />
      {/* A subida de nível espera a comemoração da meta fechar. */}
      <LevelUpDialog level={celebration ? null : levelUp} onClose={() => setLevelUp(null)} />
    </main>
  );
}
