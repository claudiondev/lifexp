import {
  CalendarDays,
  LayoutDashboard,
  NotebookPen,
  Swords,
  Shapes,
  Trophy,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { NavLink } from 'react-router';
import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const ITEMS: NavItem[] = [
  { to: '/', label: 'Painel', icon: LayoutDashboard, end: true },
  { to: '/hoje', label: 'Hoje', icon: Swords },
  { to: '/semana', label: 'Semana', icon: CalendarDays },
  { to: '/metas', label: 'Metas', icon: Trophy },
  { to: '/notas', label: 'Notas', icon: NotebookPen },
  { to: '/areas', label: 'Áreas', icon: Shapes },
  { to: '/configuracoes', label: 'Ajustes', icon: UserRound },
];

/**
 * Abas no topo, para telas a partir de `md`. Só a aba ativa mostra o nome: com 7 abas e o HUD, nomes em todas não cabem
 * no cabeçalho (o streak, o sino e o botão de sair ficavam cortados). Nas demais o nome continua para leitor de tela
 * (`sr-only`) e aparece como dica ao passar o mouse.
 */
export function DesktopNav() {
  return (
    <nav aria-label="Principal" className="hidden items-center gap-1 md:flex">
      {ITEMS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          title={label}
          className={({ isActive }) =>
            cn(
              'inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors',
              isActive
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
            )
          }
        >
          {({ isActive }) => (
            <>
              <Icon aria-hidden className="size-4" />
              <span className={isActive ? undefined : 'sr-only'}>{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

/** Barra fixa embaixo, no celular e no tablet (até `md`). */
export function MobileNav() {
  return (
    <nav
      aria-label="Principal (celular)"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-7 border-t border-border bg-background/90 backdrop-blur-md md:hidden"
    >
      {ITEMS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              'flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors',
              isActive ? 'text-xp' : 'text-muted-foreground',
            )
          }
        >
          <Icon aria-hidden className="size-5" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
