import { LogOut } from 'lucide-react';
import { Outlet } from 'react-router';
import { LevelSigil } from '@/components/game/LevelSigil';
import { RuneBackdrop } from '@/components/game/RuneBackdrop';
import { StreakFlame } from '@/components/game/StreakFlame';
import { Wordmark } from '@/components/game/Wordmark';
import { XpBar } from '@/components/game/XpBar';
import { Button } from '@/components/ui/button';
import { DesktopNav, MobileNav } from './MainNav';
import { useAuth } from '@/features/auth/useAuth';
import { useCharacter } from '@/features/character/useCharacter';

/** Moldura das telas autenticadas: o HUD do personagem fica sempre visível no topo. */
export function AppShell() {
  const { logout } = useAuth();
  const character = useCharacter();

  return (
    <div className="relative min-h-dvh">
      <RuneBackdrop />
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/75 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-4 px-5">
          <Wordmark className="text-xl" />
          <div className="ml-2">
            <DesktopNav />
          </div>
          <div className="ml-auto flex items-center gap-4">
            <div className="flex items-center gap-3">
              <LevelSigil level={character.level} size={34} />
              <div className="hidden w-36 flex-col gap-1 sm:flex">
                <XpBar
                  progress={character.levelProgress}
                  segments={10}
                  segmentClassName="h-2"
                  valueText={`${character.xp} XP`}
                />
                <span className="font-hud text-[0.7rem] tracking-wider text-muted-foreground tabular-nums">
                  <span className="text-xp">{character.xp}</span> XP
                </span>
              </div>
            </div>
            <StreakFlame days={character.streakDays} />
            <Button variant="ghost" size="icon" aria-label="Sair" onClick={() => void logout()}>
              <LogOut aria-hidden className="size-4" />
            </Button>
          </div>
        </div>
      </header>
      <div className="relative pb-20 sm:pb-0">
        <Outlet />
      </div>
      <MobileNav />
    </div>
  );
}
