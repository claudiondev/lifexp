import { ArrowRight, Award, Gift, History, Scroll } from 'lucide-react';
import { levelTitle } from '@lifexp/shared';
import { Link } from 'react-router';
import { CharacterCard } from '@/components/game/CharacterCard';
import { Button } from '@/components/ui/button';
import { BalanceSection } from '@/features/balance/BalanceSection';
import { useAuth } from '@/features/auth/useAuth';
import { useCharacter } from '@/features/character/useCharacter';
import { HealthStatus } from '@/features/health/HealthStatus';
import { dayProgress, findNext, splitByDay } from '@/features/today/todayModel';
import { useToday } from '@/features/today/useToday';

export function HomePage() {
  const { state } = useAuth();
  const character = useCharacter();
  const today = useToday();
  if (state.status !== 'authenticated') return null;

  const groups = today.data ? splitByDay(today.data.items, today.data.date) : null;
  const progress = groups ? dayProgress(groups.today) : null;
  const next = groups ? findNext(groups.today) : undefined;
  const openCarryover = groups?.carryover.filter((item) => item.status === 'open').length ?? 0;

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <p className="font-hud text-xs tracking-[0.2em] text-muted-foreground uppercase">
        Seu painel
      </p>
      <h1 className="mt-1 font-display text-4xl font-extrabold sm:text-5xl">
        Olá, <span className="text-xp">{state.user.name}</span>
      </h1>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,26rem)_1fr]">
        <div className="flex flex-col gap-3">
          <CharacterCard
            name={state.user.name}
            emblem={state.user.avatarKey}
            title={levelTitle(character.level)}
            {...character}
          />
          <nav aria-label="Atalhos do personagem" className="flex flex-wrap gap-x-4 gap-y-1">
            {[
              { to: '/historico', label: 'Ver histórico de XP', Icon: History },
              { to: '/conquistas', label: 'Conquistas', Icon: Award },
              { to: '/recompensas', label: 'Recompensas', Icon: Gift },
            ].map(({ to, label, Icon }) => (
              <Link
                key={to}
                to={to}
                className="inline-flex items-center gap-2 rounded-lg px-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <Icon aria-hidden className="size-4" />
                {label}
              </Link>
            ))}
          </nav>
        </div>

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
            {!progress && 'Carregando os blocos de hoje…'}
            {progress && progress.total === 0 && 'Nenhum bloco planejado para hoje.'}
            {progress &&
              progress.total > 0 &&
              `${progress.done} de ${progress.total} blocos concluídos hoje.`}
            {next && ` Próximo: ${next.startTime}.`}
            {openCarryover > 0 && ` Há ${openCarryover} de ontem ainda abertos.`}
          </p>
          <Button asChild>
            <Link to="/hoje">
              Abrir missões de hoje
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          </Button>
        </section>
      </div>

      <BalanceSection />

      <div className="mt-10">
        <HealthStatus />
      </div>
    </main>
  );
}
