import { cn } from '@/lib/utils';

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('font-display text-2xl font-extrabold tracking-tight', className)}>
      Life<span className="font-hud text-xp">XP</span>
    </span>
  );
}
