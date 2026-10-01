import { useId } from 'react';
import { cn } from '@/lib/utils';

interface LevelSigilProps {
  level: number;
  /** Largura em px; a altura segue a proporção do hexágono. */
  size?: number;
  className?: string;
}

/** Selo hexagonal de nível: borda em degradê ouro→violeta, número em fonte de HUD. */
export function LevelSigil({ level, size = 88, className }: LevelSigilProps) {
  const gradientId = useId();
  return (
    <div
      role="img"
      aria-label={`Nível ${level}`}
      className={cn('relative grid shrink-0 place-items-center', className)}
      style={{ width: size, height: size * 1.12 }}
    >
      <svg
        viewBox="0 0 100 112"
        aria-hidden
        className="absolute inset-0 size-full drop-shadow-[0_0_14px_color-mix(in_oklab,var(--xp)_38%,transparent)]"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--xp)" />
            <stop offset="1" stopColor="var(--primary)" />
          </linearGradient>
        </defs>
        <polygon
          points="50,4 96,29 96,83 50,108 4,83 4,29"
          fill="var(--card)"
          stroke={`url(#${gradientId})`}
          strokeWidth="3.5"
          strokeLinejoin="round"
        />
        <polygon
          points="50,13.4 87.7,33.9 87.7,78.1 50,98.6 12.3,78.1 12.3,33.9"
          fill="none"
          stroke="var(--border)"
          strokeWidth="1"
        />
      </svg>
      <div aria-hidden className="relative flex flex-col items-center leading-none">
        <span
          className="font-hud tracking-[0.25em] text-muted-foreground uppercase"
          style={{ fontSize: size * 0.13 }}
        >
          Nv
        </span>
        <span className="font-hud font-bold text-foreground" style={{ fontSize: size * 0.4 }}>
          {level}
        </span>
      </div>
    </div>
  );
}
