import {
  Coffee,
  Film,
  Gamepad2,
  Headphones,
  MessageCircle,
  Music,
  Play,
  Smartphone,
  Sparkles,
  Tv,
  type LucideIcon,
} from 'lucide-react';
import { LEISURE_ICONS, type LeisureIcon } from '@lifexp/shared';

/** Exaustivo de propósito: um ícone novo em `LEISURE_ICONS` quebra o build até a UI saber desenhá-lo. */
export const LEISURE_ICON_COMPONENTS: Record<LeisureIcon, LucideIcon> = {
  smartphone: Smartphone,
  music: Music,
  tv: Tv,
  gamepad: Gamepad2,
  film: Film,
  coffee: Coffee,
  headphones: Headphones,
  'message-circle': MessageCircle,
  play: Play,
  sparkles: Sparkles,
};

export const LEISURE_ICON_LABELS: Record<LeisureIcon, string> = {
  smartphone: 'Celular',
  music: 'Música',
  tv: 'TV',
  gamepad: 'Jogos',
  film: 'Filmes',
  coffee: 'Café',
  headphones: 'Fones',
  'message-circle': 'Conversa',
  play: 'Vídeos',
  sparkles: 'Outro',
};

export const LEISURE_ICON_LIST: readonly LeisureIcon[] = LEISURE_ICONS;

export function LeisureIconView({ icon, className }: { icon: LeisureIcon; className?: string }) {
  const Icon = LEISURE_ICON_COMPONENTS[icon];
  return <Icon aria-hidden className={className} />;
}
