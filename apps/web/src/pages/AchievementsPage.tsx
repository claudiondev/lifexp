import { Award, Lock } from 'lucide-react';
import type { Achievement } from '@lifexp/shared';
import { Button } from '@/components/ui/button';
import { useAchievements } from '@/features/achievements/useAchievements';
import { cn } from '@/lib/utils';
import { PageHeader } from './PageHeader';

const UNLOCKED_ON = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' });

function AchievementCard({ achievement }: { achievement: Achievement }) {
  const { unlocked, progress } = achievement;
  const percent = progress ? Math.round((progress.current / progress.target) * 100) : 0;
  return (
    <li
      className={cn(
        'flex gap-3 rounded-2xl border bg-card/80 p-4 backdrop-blur',
        unlocked ? 'border-xp/60' : 'border-border',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'grid size-11 shrink-0 place-items-center rounded-xl bg-secondary',
          unlocked ? 'text-xp' : 'text-muted-foreground',
        )}
      >
        {unlocked ? <Award className="size-5" /> : <Lock className="size-5" />}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="font-display text-lg leading-tight font-bold">{achievement.title}</h3>
        <p className="text-sm text-muted-foreground">{achievement.description}</p>
        {unlocked && achievement.unlockedAt && (
          <p className="mt-1 font-hud text-xs text-xp">
            Desbloqueada em {UNLOCKED_ON.format(new Date(achievement.unlockedAt))}
          </p>
        )}
        {!unlocked && progress && (
          <div className="mt-2">
            <div
              role="progressbar"
              aria-label={`Progresso de ${achievement.title}`}
              aria-valuemin={0}
              aria-valuemax={progress.target}
              aria-valuenow={progress.current}
              aria-valuetext={`${progress.current} de ${progress.target}`}
              className="h-1.5 rounded-full bg-muted"
            >
              <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
            </div>
            <p className="mt-1 font-hud text-xs text-muted-foreground tabular-nums">
              {progress.current} / {progress.target}
            </p>
          </div>
        )}
      </div>
    </li>
  );
}

export function AchievementsPage() {
  const achievements = useAchievements();
  const list = achievements.data ?? [];
  const unlockedCount = list.filter((achievement) => achievement.unlocked).length;

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <PageHeader
        eyebrow="Marcos de uso"
        title="Conquistas"
        description={
          achievements.data
            ? `${unlockedCount} de ${list.length} desbloqueadas. Uma vez conquistada, a conquista é sua para sempre.`
            : 'Marcos que você desbloqueia usando o LifeXP.'
        }
      />

      <div className="mt-8">
        {achievements.isPending && (
          <div
            aria-busy="true"
            className="h-40 animate-pulse rounded-2xl border border-border bg-card/50"
          />
        )}
        {achievements.isError && (
          <div
            role="alert"
            className="rounded-2xl border border-destructive/40 bg-destructive/10 p-5"
          >
            <p className="text-destructive">Não foi possível carregar as conquistas.</p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={() => void achievements.refetch()}
            >
              Tentar de novo
            </Button>
          </div>
        )}
        {achievements.data && (
          <ul aria-label="Conquistas" className="grid gap-3 sm:grid-cols-2">
            {list.map((achievement) => (
              <AchievementCard key={achievement.key} achievement={achievement} />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
