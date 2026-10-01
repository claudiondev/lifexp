import { cn } from '@/lib/utils';
import { LevelSigil } from './LevelSigil';
import { StreakFlame } from './StreakFlame';
import { XpBar } from './XpBar';

interface CharacterCardProps {
  name: string;
  level: number;
  xp: number;
  /** Progresso de 0 a 1 dentro do nível atual. */
  levelProgress: number;
  streakDays: number;
  className?: string;
}

/** Ficha do personagem: nome, nível, barra de XP e sequência. */
export function CharacterCard({
  name,
  level,
  xp,
  levelProgress,
  streakDays,
  className,
}: CharacterCardProps) {
  return (
    <section
      aria-label="Ficha do personagem"
      className={cn(
        'relative overflow-hidden rounded-2xl border border-border bg-card/80 p-5 shadow-[0_24px_60px_-30px_rgb(0_0_0/0.6)] backdrop-blur sm:p-6',
        className,
      )}
    >
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-xp/70 to-transparent"
      />
      <div className="flex items-center gap-4 sm:gap-5">
        <LevelSigil level={level} size={72} />
        <div className="min-w-0 flex-1">
          <p className="font-hud text-[0.7rem] tracking-[0.2em] text-muted-foreground uppercase">
            Ficha do personagem
          </p>
          <p className="truncate font-display text-2xl font-bold sm:text-3xl">{name}</p>
        </div>
      </div>
      <XpBar progress={levelProgress} className="mt-5" valueText={`${xp} XP`} />
      <div className="mt-3 flex items-center justify-between text-muted-foreground">
        <span className="font-hud text-sm tabular-nums">
          <span className="text-xp">{xp}</span> XP
        </span>
        <StreakFlame days={streakDays} />
      </div>
    </section>
  );
}
