import { cn } from '@/lib/utils';

interface GoalProgressBarProps {
  /** De 0 a 1; nulo = meta ainda sem como medir (barra vazia, sem valor). */
  ratio: number | null;
  label: string;
  valueText: string;
  className?: string;
}

/** Barra contínua de progresso da meta (a barra de runas fica reservada ao XP). */
export function GoalProgressBar({ ratio, label, valueText, className }: GoalProgressBarProps) {
  const percent = ratio === null ? undefined : Math.round(Math.min(1, Math.max(0, ratio)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={valueText}
      className={cn('h-2.5 overflow-hidden rounded-full bg-muted', className)}
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-primary to-xp transition-[width] duration-500"
        style={{ width: `${percent ?? 0}%` }}
      />
    </div>
  );
}
