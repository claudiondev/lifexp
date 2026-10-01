import { Scroll } from 'lucide-react';
import { CharacterCard } from '@/components/game/CharacterCard';
import { useAuth } from '@/features/auth/useAuth';
import { useCharacter } from '@/features/character/useCharacter';
import { HealthStatus } from '@/features/health/HealthStatus';

export function HomePage() {
  const { state } = useAuth();
  const character = useCharacter();
  if (state.status !== 'authenticated') return null;

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <p className="font-hud text-xs tracking-[0.2em] text-muted-foreground uppercase">
        Seu painel
      </p>
      <h1 className="mt-1 font-display text-4xl font-extrabold sm:text-5xl">
        Olá, <span className="text-xp">{state.user.name}</span>
      </h1>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,26rem)_1fr]">
        <CharacterCard name={state.user.name} emblem={state.user.avatarKey} {...character} />

        <section
          aria-labelledby="today-title"
          className="flex flex-col items-start justify-center gap-3 rounded-2xl border border-dashed border-border bg-card/40 p-6 sm:p-8"
        >
          <span className="grid size-11 place-items-center rounded-xl bg-secondary text-xp">
            <Scroll aria-hidden className="size-5" />
          </span>
          <h2 id="today-title" className="font-display text-2xl font-bold">
            Missão de hoje
          </h2>
          <p className="max-w-md text-muted-foreground">
            Nenhum bloco planejado para hoje. Quando o planejador da semana chegar, é aqui que você
            conclui blocos e ganha XP.
          </p>
        </section>
      </div>

      <div className="mt-10">
        <HealthStatus />
      </div>
    </main>
  );
}
