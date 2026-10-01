import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

interface XpBarProps {
  /** Progresso de 0 a 1 dentro do nível atual. */
  progress: number;
  segments?: number;
  label?: string;
  valueText?: string;
  className?: string;
  segmentClassName?: string;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Assinatura visual do LifeXP: a barra de XP é uma fileira de "runas" inclinadas que acendem
 * em sequência. Com 0 XP a primeira runa respira, mostrando onde o XP vai entrar.
 */
export function XpBar({
  progress,
  segments = 12,
  label = 'Experiência',
  valueText,
  className,
  segmentClassName = 'h-3',
}: XpBarProps) {
  const reduceMotion = useReducedMotion();
  const filled = clamp(progress, 0, 1) * segments;

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamp(progress, 0, 1) * 100)}
      aria-valuetext={valueText}
      className={cn('flex gap-1', className)}
    >
      {Array.from({ length: segments }, (_, index) => {
        const fraction = clamp(filled - index, 0, 1);
        return (
          <div
            key={index}
            className={cn(
              'relative flex-1 -skew-x-12 overflow-hidden rounded-[3px] bg-muted',
              segmentClassName,
            )}
          >
            <motion.div
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-xp to-[color-mix(in_oklab,var(--xp)_65%,white)] shadow-[0_0_14px_var(--xp)]"
              initial={{ width: 0 }}
              animate={{ width: `${fraction * 100}%` }}
              transition={{
                duration: reduceMotion ? 0 : 0.5,
                delay: reduceMotion ? 0 : 0.4 + index * 0.06,
                ease: 'easeOut',
              }}
            />
            {index === 0 && fraction === 0 && (
              <span className="absolute inset-0 animate-rune-breathe rounded-[3px] ring-1 ring-xp/70 ring-inset" />
            )}
          </div>
        );
      })}
    </div>
  );
}
