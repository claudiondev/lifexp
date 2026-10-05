import type { XpEntryType, XpHistoryEntry } from '@lifexp/shared';
import { todayIn } from '@lifexp/shared';
import {
  CircleCheck,
  Flag,
  RotateCcw,
  Scroll,
  Swords,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/useAuth';
import {
  XP_HISTORY_FILTERS,
  dayHeading,
  entryKind,
  entryTime,
  entryTitle,
  formatAmount,
  groupByDay,
} from '@/features/xp-history/xpHistoryFormat';
import { useXpHistory } from '@/features/xp-history/useXpHistory';
import { cn } from '@/lib/utils';
import { PageHeader } from './PageHeader';

const ICONS: Record<XpEntryType, LucideIcon> = {
  completion: Swords,
  milestone: Flag,
  goal: Trophy,
  quest: Scroll,
  task: CircleCheck,
  reversal: RotateCcw,
};

const EMPTY_TEXT: Record<XpEntryType | 'all', string> = {
  all: 'Nenhum XP por aqui ainda. Conclua um bloco para começar o histórico.',
  completion: 'Nenhum bloco concluído ainda.',
  milestone: 'Nenhum marco concluído ainda. Cada um vale +100 XP.',
  goal: 'Nenhuma meta concluída ainda. Cada uma vale +500 XP.',
  quest: 'Nenhuma quest cumprida ainda. Cumpra 80% dos blocos da semana para ganhar o bônus.',
  task: 'Nenhuma tarefa concluída ainda. Conclua uma tarefa para ver o XP dela aqui.',
  reversal: 'Nenhum estorno. Desfazer uma conclusão aparece aqui.',
};

function EntryRow({ entry, timezone }: { entry: XpHistoryEntry; timezone: string }) {
  const Icon = ICONS[entry.type];
  const reversal = entry.type === 'reversal';
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span
        aria-hidden
        className={cn(
          'grid size-9 shrink-0 place-items-center rounded-lg bg-secondary',
          reversal ? 'text-muted-foreground' : 'text-xp',
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{entryTitle(entry)}</p>
        <p className="truncate text-sm text-muted-foreground">
          {entryKind(entry)}
          {entry.areaName && ` · ${entry.areaName}`} · {entryTime(entry.createdAt, timezone)}
        </p>
      </div>
      <span
        className={cn(
          'shrink-0 font-hud text-sm font-semibold tabular-nums',
          reversal ? 'text-muted-foreground' : 'text-xp',
        )}
      >
        {formatAmount(entry.amount)}
      </span>
    </li>
  );
}

export function XpHistoryPage() {
  const { state } = useAuth();
  const [type, setType] = useState<XpEntryType | undefined>(undefined);
  const history = useXpHistory(type);
  if (state.status !== 'authenticated') return null;

  const { timezone } = state.user;
  const entries = history.data?.pages.flatMap((page) => page.items) ?? [];
  const days = groupByDay(entries, timezone);
  const today = todayIn(timezone);

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <PageHeader
        eyebrow="Livro-caixa"
        title="Histórico de XP"
        description="Tudo o que rendeu XP, de onde veio e o que foi desfeito."
      />

      <div role="group" aria-label="Filtrar por origem" className="mt-6 flex flex-wrap gap-2">
        {XP_HISTORY_FILTERS.map((filter) => (
          <button
            key={filter.label}
            type="button"
            aria-pressed={type === filter.value}
            onClick={() => setType(filter.value)}
            className={cn(
              'h-9 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
              type === filter.value
                ? 'border-primary bg-primary/15 text-foreground'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {history.isPending && (
          <div className="space-y-3" aria-busy="true">
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className="h-16 animate-pulse rounded-2xl border border-border bg-card/50"
              />
            ))}
          </div>
        )}

        {history.isError && (
          <div
            role="alert"
            className="rounded-2xl border border-destructive/40 bg-destructive/10 p-5"
          >
            <p className="text-destructive">Não foi possível carregar o histórico de XP.</p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={() => void history.refetch()}
            >
              Tentar de novo
            </Button>
          </div>
        )}

        {history.isSuccess && entries.length === 0 && (
          <p className="rounded-2xl border border-dashed border-border bg-card/40 p-8 text-center text-muted-foreground">
            {EMPTY_TEXT[type ?? 'all']}
          </p>
        )}

        {history.isSuccess && entries.length > 0 && (
          <div className="space-y-6">
            {days.map((day) => {
              const heading = dayHeading(day.date, today);
              return (
                <section key={day.date} aria-label={heading}>
                  <div className="flex items-baseline justify-between px-1">
                    <h2 className="font-hud text-xs tracking-[0.2em] text-muted-foreground uppercase">
                      {heading}
                    </h2>
                    <span className="font-hud text-xs text-muted-foreground tabular-nums">
                      {formatAmount(day.total)}
                    </span>
                  </div>
                  <ul className="mt-2 divide-y divide-border rounded-2xl border border-border bg-card/60">
                    {day.entries.map((entry) => (
                      <EntryRow key={entry.id} entry={entry} timezone={timezone} />
                    ))}
                  </ul>
                </section>
              );
            })}

            {history.hasNextPage && (
              <div className="flex justify-center">
                <Button
                  variant="secondary"
                  disabled={history.isFetchingNextPage}
                  onClick={() => void history.fetchNextPage()}
                >
                  {history.isFetchingNextPage ? 'Carregando…' : 'Carregar mais'}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
