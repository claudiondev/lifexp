import {
  CalendarDays,
  CalendarRange,
  Ellipsis,
  Gift,
  History,
  LayoutDashboard,
  NotebookPen,
  ScrollText,
  Settings,
  Shapes,
  Swords,
  Target,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { NavLink, useLocation } from 'react-router';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

/** Os grupos seguem o jogo: o que fazer agora, como evoluir e o que registrar. */
export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Jogar',
    items: [
      { to: '/', label: 'Painel', icon: LayoutDashboard, end: true },
      { to: '/hoje', label: 'Hoje', icon: Swords },
      { to: '/semana', label: 'Semana', icon: CalendarDays },
      { to: '/calendario', label: 'Mês', icon: CalendarRange },
    ],
  },
  {
    title: 'Evoluir',
    items: [
      { to: '/metas', label: 'Metas', icon: Target },
      { to: '/conquistas', label: 'Conquistas', icon: Trophy },
      { to: '/recompensas', label: 'Recompensas', icon: Gift },
      { to: '/historico', label: 'Histórico de XP', icon: History },
      { to: '/revisao', label: 'Revisão', icon: ScrollText },
    ],
  },
  {
    title: 'Registrar',
    items: [
      { to: '/notas', label: 'Notas', icon: NotebookPen },
      { to: '/areas', label: 'Áreas', icon: Shapes },
    ],
  },
  {
    title: 'Conta',
    items: [{ to: '/configuracoes', label: 'Ajustes', icon: Settings }],
  },
];

const ALL_ITEMS = NAV_GROUPS.flatMap((group) => group.items);

/** Atalhos fixos da barra inferior; o resto abre em "Mais". */
const BOTTOM_PATHS = ['/hoje', '/semana', '/metas', '/notas'];
const BOTTOM_ITEMS = BOTTOM_PATHS.map((path) => ALL_ITEMS.find((item) => item.to === path)!);

/**
 * Barra lateral, a partir de `lg`. O item ativo ganha uma trava azul acesa à esquerda: é o "você está aqui" do
 * mapa do jogo. Abaixo disso a navegação vai para a barra inferior.
 */
export function SideNav() {
  return (
    <nav aria-label="Principal" className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-2">
      {NAV_GROUPS.map((group) => (
        <div key={group.title}>
          <p className="hud-label px-3 pb-2">{group.title}</p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map(({ to, label, icon: Icon, end }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cn(
                      'group relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-accent text-foreground'
                        : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <span
                          aria-hidden
                          className="glow-xp absolute top-2 bottom-2 -left-3 w-1 rounded-r-full bg-xp"
                        />
                      )}
                      <Icon aria-hidden className={cn('size-4', isActive && 'text-xp')} />
                      {label}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Barra fixa embaixo, no celular e no tablet (até `lg`): quatro atalhos e "Mais" com o restante. */
export function MobileNav() {
  const [moreOpen, setMoreOpen] = useState(false);
  const { pathname } = useLocation();
  const inBottom = BOTTOM_ITEMS.some((item) => pathname.startsWith(item.to));
  const rest = ALL_ITEMS.filter((item) => !BOTTOM_ITEMS.includes(item));

  return (
    <>
      <nav
        aria-label="Principal (celular)"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-background/90 backdrop-blur-md lg:hidden"
      >
        {BOTTOM_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'relative flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors',
                isActive ? 'text-xp' : 'text-muted-foreground',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span
                    aria-hidden
                    className="glow-xp absolute inset-x-5 top-0 h-0.5 rounded-b-full bg-xp"
                  />
                )}
                <Icon aria-hidden className="size-5" />
                {label}
              </>
            )}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className={cn(
            'flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors',
            !inBottom ? 'text-xp' : 'text-muted-foreground',
          )}
        >
          <Ellipsis aria-hidden className="size-5" />
          Mais
        </button>
      </nav>

      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent>
          <DialogTitle>Mais telas</DialogTitle>
          <DialogDescription>Tudo o que não cabe na barra de baixo.</DialogDescription>
          <ul className="mt-5 grid grid-cols-2 gap-2">
            {rest.map(({ to, label, icon: Icon, end }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  onClick={() => setMoreOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex h-12 items-center gap-3 rounded-lg border px-3 text-sm font-medium transition-colors',
                      isActive
                        ? 'border-xp/60 bg-accent text-foreground'
                        : 'border-border bg-secondary text-muted-foreground hover:text-foreground',
                    )
                  }
                >
                  <Icon aria-hidden className="size-4 text-xp" />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
