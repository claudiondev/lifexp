import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import { CharacterCard } from '@/components/game/CharacterCard';
import { SkyBackdrop } from '@/components/game/SkyBackdrop';
import { Wordmark } from '@/components/game/Wordmark';

// O ciclo central do produto (requisitos v2): aqui a numeração é verdadeira, é uma sequência.
const LOOP = ['Planejar', 'Executar', 'Ganhar XP', 'Revisar', 'Ajustar'] as const;

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
  /** Nome exibido na ficha do personagem (no cadastro, atualiza enquanto a pessoa digita). */
  characterName?: string | undefined;
}

export function AuthLayout({ title, subtitle, children, footer, characterName }: AuthLayoutProps) {
  const reduceMotion = useReducedMotion();
  const enter = (delay: number) => ({
    initial: reduceMotion ? false : { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.55, delay, ease: 'easeOut' as const },
  });

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <SkyBackdrop />
      <div className="relative mx-auto grid min-h-dvh max-w-6xl content-center gap-6 px-5 py-6 lg:py-8 lg:grid-cols-[1fr_minmax(0,28rem)] lg:items-center lg:gap-20">
        <motion.aside {...enter(0)} className="flex flex-col gap-5 lg:gap-8">
          <Wordmark />
          <div className="hidden max-w-lg lg:block">
            <p className="font-display text-5xl leading-[1.05] font-extrabold">
              <span className="block">Cumpra.</span>
              <span className="block">Descanse.</span>
              <span className="block text-xp [text-shadow:0_0_28px_color-mix(in_oklab,var(--xp)_55%,transparent)]">
                Evolua.
              </span>
            </p>
            <p className="mt-4 text-lg text-muted-foreground">
              Monte a semana em blocos, ganhe XP pelo que cumpriu e veja cada área da sua vida subir
              de nível.
            </p>
          </div>
          <CharacterCard
            name={characterName?.trim() || 'Seu personagem'}
            level={1}
            xp={0}
            levelProgress={0}
            streakDays={0}
            className="max-w-md"
          />
          <ol className="hidden max-w-lg flex-wrap items-center gap-x-2 gap-y-2 lg:flex">
            {LOOP.map((step, index) => (
              <li key={step} className="flex items-center gap-2">
                <span className="grid size-6 place-items-center rounded-md border border-xp/50 bg-xp/10 font-hud text-xs text-xp tabular-nums">
                  {index + 1}
                </span>
                <span className="text-sm text-muted-foreground">{step}</span>
                {index < LOOP.length - 1 && (
                  <span
                    aria-hidden
                    className="ml-1 h-px w-4 bg-gradient-to-r from-xp/60 to-border"
                  />
                )}
              </li>
            ))}
          </ol>
        </motion.aside>

        <motion.main {...enter(0.12)} className="w-full">
          <div className="relative rounded-2xl border border-border bg-card/85 p-6 shadow-[0_30px_80px_-30px_rgb(0_0_0/0.65)] backdrop-blur sm:p-8">
            <div
              aria-hidden
              className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-xp to-transparent"
            />
            <h1 className="font-display text-3xl font-bold">{title}</h1>
            <p className="mt-1.5 text-muted-foreground">{subtitle}</p>
            <div className="mt-7">{children}</div>
          </div>
          <p className="mt-6 text-center text-sm text-muted-foreground">{footer}</p>
        </motion.main>
      </div>
    </div>
  );
}
