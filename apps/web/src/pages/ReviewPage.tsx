import { todayIn, weekStartOf, type CivilDate } from '@lifexp/shared';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/useAuth';
import { useNow } from '@/features/blocks/useNow';
import { ReviewForm } from '@/features/reviews/ReviewForm';
import { ReviewSummary } from '@/features/reviews/ReviewSummary';
import { nextWeekOf, previousWeekOf, resolveReviewWeek } from '@/features/reviews/reviewFormat';
import { useReview, useReviewHistory } from '@/features/reviews/useReviews';
import { formatWeekRange } from '@/lib/civilFormat';
import { PageHeader } from './PageHeader';

const WEEK_PARAM = 'semana';

export function ReviewPage() {
  const { state } = useAuth();
  const now = useNow();
  const [params, setParams] = useSearchParams();
  const timezone = state.status === 'authenticated' ? state.user.timezone : 'UTC';
  const currentWeek = weekStartOf(todayIn(timezone, now));
  const weekStart = resolveReviewWeek(params.get(WEEK_PARAM), currentWeek);
  const review = useReview(weekStart);
  const history = useReviewHistory();
  const isCurrent = weekStart === currentWeek;

  const goTo = (target: CivilDate) => {
    if (target === currentWeek) setParams({}, { replace: true });
    else setParams({ [WEEK_PARAM]: target });
  };

  const entries = history.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <main className="mx-auto max-w-4xl px-5 py-10">
      <PageHeader
        eyebrow="Revisão semanal"
        title="Revisão da semana"
        description={`${formatWeekRange(weekStart)}${isCurrent ? ' · esta semana' : ''}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="icon"
              aria-label="Semana anterior"
              onClick={() => goTo(previousWeekOf(weekStart))}
            >
              <ChevronLeft aria-hidden className="size-4" />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={isCurrent}
              onClick={() => goTo(currentWeek)}
            >
              Esta semana
            </Button>
            <Button
              variant="secondary"
              size="icon"
              aria-label="Próxima semana"
              disabled={isCurrent}
              onClick={() => goTo(nextWeekOf(weekStart))}
            >
              <ChevronRight aria-hidden className="size-4" />
            </Button>
          </div>
        }
      />

      {review.isPending && (
        <div
          aria-busy="true"
          className="mt-6 h-64 animate-pulse rounded-2xl border border-border bg-card/50"
        />
      )}

      {review.isError && (
        <div
          role="alert"
          className="mt-6 rounded-2xl border border-destructive/40 bg-destructive/10 p-5"
        >
          <p className="text-destructive">Não foi possível carregar a revisão desta semana.</p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => void review.refetch()}
          >
            Tentar de novo
          </Button>
        </div>
      )}

      {review.isSuccess && (
        <>
          {review.data.previousPriority && (
            <aside
              aria-label="Prioridade combinada"
              className="mt-6 rounded-2xl border border-xp/40 bg-xp/10 p-5"
            >
              <p className="font-hud text-xs tracking-wider text-muted-foreground uppercase">
                Você escolheu como prioridade para esta semana
              </p>
              <p className="mt-1 font-display text-lg font-semibold whitespace-pre-line">
                {review.data.previousPriority}
              </p>
            </aside>
          )}

          <section
            aria-labelledby="summary-title"
            className="mt-6 rounded-2xl border border-border bg-card/80 p-5 backdrop-blur sm:p-6"
          >
            <h2 id="summary-title" className="font-display text-xl font-bold">
              Como foi a semana
            </h2>
            <div className="mt-4">
              <ReviewSummary summary={review.data.summary} />
            </div>
          </section>

          <section
            aria-labelledby="reflection-title"
            className="mt-6 rounded-2xl border border-border bg-card/80 p-5 backdrop-blur sm:p-6"
          >
            <h2 id="reflection-title" className="font-display text-xl font-bold">
              Sua reflexão
            </h2>
            <div className="mt-4">
              {/* key: o formulário recomeça com o texto salvo ao trocar de semana. */}
              <ReviewForm key={weekStart} weekStart={weekStart} review={review.data.review} />
            </div>
          </section>
        </>
      )}

      <section aria-labelledby="history-title" className="mt-10">
        <h2 id="history-title" className="font-display text-xl font-bold">
          Revisões anteriores
        </h2>
        {history.isSuccess && entries.length === 0 && (
          <p className="mt-3 text-muted-foreground">
            Suas revisões escritas aparecem aqui. A primeira é a que você faz agora.
          </p>
        )}
        {entries.length > 0 && (
          <ul className="mt-3 divide-y divide-border rounded-2xl border border-border bg-card/60">
            {entries.map((entry) => (
              <li key={entry.weekStart}>
                <Link
                  to={`/revisao?${WEEK_PARAM}=${entry.weekStart}`}
                  className="flex flex-col gap-0.5 px-4 py-3 transition-colors hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <span className="font-medium">{formatWeekRange(entry.weekStart)}</span>
                  {entry.nextPriority && (
                    <span className="truncate text-sm text-muted-foreground">
                      Prioridade: {entry.nextPriority}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {history.hasNextPage && (
          <div className="mt-4 flex justify-center">
            <Button
              variant="secondary"
              disabled={history.isFetchingNextPage}
              onClick={() => void history.fetchNextPage()}
            >
              {history.isFetchingNextPage ? 'Carregando…' : 'Carregar mais'}
            </Button>
          </div>
        )}
      </section>
    </main>
  );
}
