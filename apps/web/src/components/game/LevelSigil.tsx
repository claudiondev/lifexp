import { useId } from 'react';
import type { AvatarKey } from '@lifexp/shared';
import { cn } from '@/lib/utils';
import { EMBLEMS } from './emblems';

interface LevelSigilProps {
  level: number;
  /** Largura em px; a altura segue a proporção do hexágono. */
  size?: number;
  /** Emblema escolhido no perfil, mostrado num selo pequeno no canto (só em tamanhos maiores). */
  emblem?: AvatarKey;
  className?: string;
}

/** Selo hexagonal de nível: borda em degradê ouro→violeta, número em fonte de HUD. */
export function LevelSigil({ level, size = 88, emblem, className }: LevelSigilProps) {
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
      {emblem && size >= 56 && <EmblemBadge emblem={emblem} size={size} />}
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

function EmblemBadge({ emblem, size }: { emblem: AvatarKey; size: number }) {
  const { Icon } = EMBLEMS[emblem];
  return (
    <span
      aria-hidden
      className="absolute -right-1 -bottom-1 grid place-items-center rounded-full border border-border bg-card text-xp shadow-[0_0_10px_color-mix(in_oklab,var(--xp)_30%,transparent)]"
      style={{ width: size * 0.4, height: size * 0.4 }}
    >
      <Icon style={{ width: size * 0.22, height: size * 0.22 }} />
    </span>
  );
}
