import type { Area, Goal } from '@lifexp/shared';
import { CalendarClock, Clock, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router';
import { longDate } from '@/lib/civilFormat';
import { cn } from '@/lib/utils';
import { AreaBadge } from '../areas/AreaBadge';
import { GoalProgressBar } from './GoalProgressBar';
import { STATUS_LABEL, formatInvested, progressPercent, progressText } from './goalFormat';

interface GoalCardProps {
  goal: Goal;
  area?: Area | undefined;
}

export function GoalCard({ goal, area }: GoalCardProps) {
  const percent = progressPercent(goal);
  const text = progressText(goal);
  const inactive = goal.status === 'abandoned' || goal.status === 'paused';

  return (
    <Link
      to={`/metas/${goal.id}`}
      aria-label={goal.title}
      className={cn(
        'group relative flex flex-col gap-4 rounded-2xl border border-border bg-card/80 p-5 backdrop-blur transition-colors hover:border-primary/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        goal.status === 'completed' && 'border-xp/40',
        inactive && 'opacity-75',
      )}
    >
      <div className="flex items-start gap-3">
        {area ? (
          <AreaBadge color={area.color} icon={area.icon} />
        ) : (
          <AreaBadge color="slate" icon="target" />
        )}
        <div className="min-w-0 flex-1">
          <h2 className="line-clamp-2 font-display text-xl leading-tight font-bold">
            {goal.title}
          </h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="font-hud tracking-wider uppercase">{STATUS_LABEL[goal.status]}</span>
            {area && <span>· {area.name}</span>}
          </p>
        </div>
        {goal.overdue && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-destructive/50 bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
            <TriangleAlert aria-hidden className="size-3" />
            Atrasada
          </span>
        )}
      </div>

      <div>
        <GoalProgressBar
          ratio={goal.progress.ratio}
          label={`Progresso de ${goal.title}`}
          valueText={text}
        />
        <p className="mt-2 flex justify-between gap-3 text-sm text-muted-foreground">
          <span>{text}</span>
          {percent !== null && <span className="font-hud tabular-nums">{percent}%</span>}
        </p>
      </div>

      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {goal.deadline && (
          <span className="inline-flex items-center gap-1">
            <CalendarClock aria-hidden className="size-3.5" />
            Até {longDate(goal.deadline)}
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <Clock aria-hidden className="size-3.5" />
          {formatInvested(goal.investedMinutes)} investidas
        </span>
        {goal.readyToComplete && <span className="font-medium text-xp">Pronta para concluir</span>}
      </p>
    </Link>
  );
}
