import {
  Cake,
  CalendarCheck,
  CalendarClock,
  Flag,
  Plane,
  Stethoscope,
  type LucideIcon,
} from 'lucide-react';
import type { AreaColor, EventCategory } from '@lifexp/shared';

/*
 * Exaustivo de propósito: se alguém adicionar uma categoria em @lifexp/shared, o TypeScript acusa
 * aqui até a UI saber desenhá-la. Reaproveita as cores das áreas (já com contraste nos dois temas).
 */
export const EVENT_APPEARANCE: Record<EventCategory, { Icon: LucideIcon; color: AreaColor }> = {
  appointment: { Icon: CalendarCheck, color: 'violet' },
  birthday: { Icon: Cake, color: 'pink' },
  medical: { Icon: Stethoscope, color: 'moss' },
  trip: { Icon: Plane, color: 'sky' },
  deadline: { Icon: Flag, color: 'orange' },
  other: { Icon: CalendarClock, color: 'slate' },
};
