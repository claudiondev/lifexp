import { Flame } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StreakFlameProps {
  days: number;
  className?: string;
}

export function StreakFlame({ days, className }: StreakFlameProps) {
  const active = days > 0;
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <Flame
        aria-hidden
        className={cn('size-4', active ? 'fill-reward text-reward' : 'text-muted-foreground')}
      />
      <span className="font-hud text-sm font-medium whitespace-nowrap tabular-nums">
        {days} {days === 1 ? 'dia' : 'dias'}
      </span>
    </span>
  );
}
