import { LogOut } from 'lucide-react';
import { Outlet } from 'react-router';
import { LevelSigil } from '@/components/game/LevelSigil';
import { HexBackdrop } from '@/components/game/HexBackdrop';
import { StreakFlame } from '@/components/game/StreakFlame';
import { Wordmark } from '@/components/game/Wordmark';
import { XpBar } from '@/components/game/XpBar';
import { Button } from '@/components/ui/button';
import { MobileNav, SideNav } from './MainNav';
import { useAuth } from '@/features/auth/useAuth';
import { NotificationBell } from '@/features/notifications/NotificationBell';
import { useCharacter } from '@/features/character/useCharacter';

/**
 * Moldura das telas autenticadas. A partir de `lg` o mapa do jogo fica numa barra lateral (com a ficha do
 * personagem no pé dela); abaixo disso a navegação vai para a barra de baixo. O HUD do topo é sempre visível.
 */
export function AppShell() {
  const { logout } = useAuth();
  const character = useCharacter();
  const xpText = `${character.xpIntoLevel} / ${character.xpForNextLevel} XP`;

  return (
    <div className="relative min-h-dvh lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      <HexBackdrop />

      <aside className="relative z-10 hidden h-dvh flex-col border-r border-border bg-card/60 backdrop-blur-md lg:sticky lg:top-0 lg:flex">
        <div className="flex h-16 items-center px-6">
          <Wordmark className="text-xl" />
        </div>
        <SideNav />
        <div
          className="m-3 flex items-center gap-3 rounded-xl border border-border bg-secondary/70 p-3 transition-opacity"
          aria-busy={!character.ready}
          style={{ opacity: character.ready ? 1 : 0.5 }}
        >
          <LevelSigil level={character.level} size={44} />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="hud-label">Nível {character.level}</span>
            <XpBar
              progress={character.levelProgress}
              segments={8}
              segmentClassName="h-1.5"
              valueText={xpText}
            />
            <span className="font-hud text-[0.7rem] text-muted-foreground tabular-nums">
              <span className="text-xp">{character.xpIntoLevel}</span> / {character.xpForNextLevel}{' '}
              XP
            </span>
          </div>
        </div>
      </aside>

      <div className="relative z-10 min-w-0">
        <header className="sticky top-0 z-20 border-b border-border/70 bg-background/75 backdrop-blur-md">
          <div className="flex h-16 items-center gap-4 px-5">
            <Wordmark className="text-xl lg:hidden" />
            <div
              className="hidden max-w-md flex-1 items-center gap-3 transition-opacity lg:flex"
              aria-busy={!character.ready}
              style={{ opacity: character.ready ? 1 : 0.5 }}
            >
              <span className="hud-label whitespace-nowrap">Nv {character.level}</span>
              <XpBar
                progress={character.levelProgress}
                segments={16}
                segmentClassName="h-2"
                valueText={xpText}
                className="flex-1"
              />
              <span className="font-hud text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                <span className="text-xp">{character.xp}</span> XP
              </span>
            </div>
            <div className="ml-auto flex items-center gap-4">
              <LevelSigil level={character.level} size={32} className="lg:hidden" />
              <StreakFlame days={character.streakDays} />
              <NotificationBell />
              <Button variant="ghost" size="icon" aria-label="Sair" onClick={() => void logout()}>
                <LogOut aria-hidden className="size-4" />
              </Button>
            </div>
          </div>
        </header>
        <div className="pb-20 lg:pb-0">
          <Outlet />
        </div>
      </div>
      <MobileNav />
    </div>
  );
}
