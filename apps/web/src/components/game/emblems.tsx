import {
  BookMarked,
  Compass,
  Crown,
  Flame,
  Heart,
  Leaf,
  Moon,
  Shield,
  Star,
  Sun,
  Swords,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { AvatarKey } from '@lifexp/shared';

/** Exaustivo de propósito: um emblema novo em @lifexp/shared obriga a desenhá-lo aqui. */
export const EMBLEMS: Record<AvatarKey, { label: string; Icon: LucideIcon }> = {
  swords: { label: 'Espadas', Icon: Swords },
  shield: { label: 'Escudo', Icon: Shield },
  'book-marked': { label: 'Livro', Icon: BookMarked },
  heart: { label: 'Coração', Icon: Heart },
  flame: { label: 'Chama', Icon: Flame },
  star: { label: 'Estrela', Icon: Star },
  compass: { label: 'Bússola', Icon: Compass },
  crown: { label: 'Coroa', Icon: Crown },
  leaf: { label: 'Folha', Icon: Leaf },
  moon: { label: 'Lua', Icon: Moon },
  sun: { label: 'Sol', Icon: Sun },
  zap: { label: 'Raio', Icon: Zap },
};
