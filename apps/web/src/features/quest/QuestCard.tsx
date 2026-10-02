import { Scroll } from 'lucide-react';
import type { Quest } from '@lifexp/shared';
import { cn } from '@/lib/utils';
import { describeQuest } from './questModel';

/** Cartão da quest semanal: barra com as faixas 80/90/100 (só feedback positivo, RN34) e o bônus. */
export function QuestCard({ quest }: { quest: Quest }) {
  const view = describeQuest(quest);
  const done = quest.status === 'completed';
  const percent = Math.round(view.progress * 100);

  return (
    <section
      aria-label="Quest da semana"
      className={cn(
        'rounded-2xl border bg-card/80 p-4 backdrop-blur sm:p-5',
        done ? 'border-xp/60' : 'border-border',
      )}
    >
      <div className="flex items-start gap-3">
        <Scroll aria-hidden className={cn('mt-0.5 size-5 shrink-0', done && 'text-xp')} />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-bold">{view.headline}</h2>
          <p className="text-sm text-muted-foreground">{view.detail}</p>
        </div>
        <p className="font-hud text-sm font-bold text-xp tabular-nums">+{quest.bonusXp} XP</p>
      </div>

      <div
        role="progressbar"
        aria-label="Aderência da semana"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${quest.completed} de ${quest.eligible} blocos (${percent}%)`}
        className="relative mt-4 h-2 rounded-full bg-muted"
      >
        <div
          className={cn('h-full rounded-full', done ? 'bg-xp' : 'bg-primary')}
          style={{ width: `${percent}%` }}
        />
        {quest.tiers.map((tier) => (
          <span
            key={tier.percent}
            aria-hidden
            className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2 bg-border"
            style={{ left: `${tier.percent}%` }}
          />
        ))}
      </div>

      <ul aria-label="Faixas de aderência" className="mt-3 flex gap-2 font-hud text-xs">
        {quest.tiers.map((tier) => (
          <li
            key={tier.percent}
            className={cn(
              'rounded-full border px-2.5 py-0.5 tabular-nums',
              tier.reached
                ? 'border-xp/60 bg-xp/10 text-xp'
                : 'border-border text-muted-foreground',
            )}
          >
            {tier.percent}%{tier.reached && <span className="sr-only"> alcançada</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
