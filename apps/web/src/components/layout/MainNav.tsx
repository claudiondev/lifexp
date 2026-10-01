import { LayoutDashboard, Shapes, UserRound, type LucideIcon } from 'lucide-react';
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
  { to: '/areas', label: 'Áreas', icon: Shapes },
  { to: '/perfil', label: 'Perfil', icon: UserRound },
];

/** Abas no topo, para telas a partir de `sm`. */
export function DesktopNav() {
  return (
    <nav aria-label="Principal" className="hidden items-center gap-1 sm:flex">
      {ITEMS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              'inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors',
              isActive
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
            )
          }
        >
          <Icon aria-hidden className="size-4" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

/** Barra fixa embaixo, só no celular. */
export function MobileNav() {
  return (
    <nav
      aria-label="Principal (celular)"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-border bg-background/90 backdrop-blur-md sm:hidden"
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
