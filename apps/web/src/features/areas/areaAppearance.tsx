import {
  BookOpen,
  Briefcase,
  Church,
  Code,
  Dumbbell,
  GraduationCap,
  HeartPulse,
  House,
  Leaf,
  Moon,
  Music,
  Palette,
  Plane,
  Rocket,
  Sparkles,
  Star,
  Sun,
  Target,
  Users,
  Utensils,
  type LucideIcon,
} from 'lucide-react';
import type { AreaColor, AreaIcon } from '@lifexp/shared';

/*
 * Os Records abaixo são exaustivos de propósito: se alguém adicionar uma cor ou ícone em
 * @lifexp/shared, o TypeScript acusa aqui até a UI saber desenhá-lo.
 * As classes ficam escritas por extenso porque o Tailwind só gera o que enxerga no código.
 */
export const AREA_COLOR_CLASSES: Record<
  AreaColor,
  { label: string; text: string; soft: string; solid: string; border: string }
> = {
  violet: {
    label: 'Violeta',
    text: 'text-area-violet',
    soft: 'bg-area-violet/15',
    solid: 'bg-area-violet',
    border: 'border-area-violet/40',
  },
  gold: {
    label: 'Ouro',
    text: 'text-area-gold',
    soft: 'bg-area-gold/15',
    solid: 'bg-area-gold',
    border: 'border-area-gold/40',
  },
  moss: {
    label: 'Musgo',
    text: 'text-area-moss',
    soft: 'bg-area-moss/15',
    solid: 'bg-area-moss',
    border: 'border-area-moss/40',
  },
  rose: {
    label: 'Rubi',
    text: 'text-area-rose',
    soft: 'bg-area-rose/15',
    solid: 'bg-area-rose',
    border: 'border-area-rose/40',
  },
  sky: {
    label: 'Céu',
    text: 'text-area-sky',
    soft: 'bg-area-sky/15',
    solid: 'bg-area-sky',
    border: 'border-area-sky/40',
  },
  orange: {
    label: 'Laranja',
    text: 'text-area-orange',
    soft: 'bg-area-orange/15',
    solid: 'bg-area-orange',
    border: 'border-area-orange/40',
  },
  pink: {
    label: 'Rosa',
    text: 'text-area-pink',
    soft: 'bg-area-pink/15',
    solid: 'bg-area-pink',
    border: 'border-area-pink/40',
  },
  slate: {
    label: 'Ardósia',
    text: 'text-area-slate',
    soft: 'bg-area-slate/15',
    solid: 'bg-area-slate',
    border: 'border-area-slate/40',
  },
};

export const AREA_ICON_COMPONENTS: Record<AreaIcon, { label: string; Icon: LucideIcon }> = {
  briefcase: { label: 'Maleta', Icon: Briefcase },
  'book-open': { label: 'Livro aberto', Icon: BookOpen },
  'graduation-cap': { label: 'Capelo', Icon: GraduationCap },
  users: { label: 'Pessoas', Icon: Users },
  church: { label: 'Igreja', Icon: Church },
  'heart-pulse': { label: 'Saúde', Icon: HeartPulse },
  dumbbell: { label: 'Halter', Icon: Dumbbell },
  moon: { label: 'Lua', Icon: Moon },
  rocket: { label: 'Foguete', Icon: Rocket },
  code: { label: 'Código', Icon: Code },
  palette: { label: 'Paleta', Icon: Palette },
  music: { label: 'Música', Icon: Music },
  house: { label: 'Casa', Icon: House },
  plane: { label: 'Avião', Icon: Plane },
  utensils: { label: 'Talheres', Icon: Utensils },
  sparkles: { label: 'Brilhos', Icon: Sparkles },
  sun: { label: 'Sol', Icon: Sun },
  leaf: { label: 'Folha', Icon: Leaf },
  target: { label: 'Alvo', Icon: Target },
  star: { label: 'Estrela', Icon: Star },
};
