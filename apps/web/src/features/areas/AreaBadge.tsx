import type { AreaColor, AreaIcon } from '@lifexp/shared';
import { cn } from '@/lib/utils';
import { AREA_COLOR_CLASSES, AREA_ICON_COMPONENTS } from './areaAppearance';

interface AreaBadgeProps {
  color: AreaColor;
  icon: AreaIcon;
  className?: string;
}

/** Ícone da área num quadrado tingido com a cor dela. */
export function AreaBadge({ color, icon, className }: AreaBadgeProps) {
  const { Icon } = AREA_ICON_COMPONENTS[icon];
  const classes = AREA_COLOR_CLASSES[color];
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-11 shrink-0 place-items-center rounded-xl border',
        classes.soft,
        classes.border,
        classes.text,
        className,
      )}
    >
      <Icon className="size-5" />
    </span>
  );
}
