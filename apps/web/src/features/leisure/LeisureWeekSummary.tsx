import { Link } from 'react-router';
import type { LeisureOption, LeisureSummary } from '@lifexp/shared';
import { formatLeisure } from './leisureFormat';

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card/80 px-4 py-3 backdrop-blur">
      <span
        aria-hidden
        className="absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-mana/60 to-transparent"
      />
      <dt className="hud-label">{label}</dt>
      <dd className="mt-1 font-hud text-2xl font-bold tabular-nums">{value}</dd>
    </div>
  );
}

/** "ter., 12:00" no fuso da pessoa. */
function sessionStart(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: timezone,
  }).format(new Date(iso));
}

interface LeisureWeekSummaryProps {
  summary: LeisureSummary;
  options: readonly LeisureOption[];
  timezone: string;
}

/** O saldo da semana, o que cada atividade rendeu e as sessões do cronômetro. Só leitura. */
export function LeisureWeekSummary({ summary, options, timezone }: LeisureWeekSummaryProps) {
  const nameOf = (optionId: string) =>
    options.find((option) => option.id === optionId)?.name ?? 'Lazer';

  return (
    <div className="flex flex-col gap-6">
      <dl aria-label="Números da semana" className="grid grid-cols-3 gap-3">
        <Tile label="Ganho" value={formatLeisure(summary.earnedMin)} />
        <Tile label="Usado" value={formatLeisure(summary.usedMin)} />
        <Tile label="Disponível" value={formatLeisure(summary.balanceMin)} />
      </dl>

      <section aria-label="Ganho por atividade">
        <h2 className="font-display text-xl font-bold">Ganho por atividade</h2>
        {summary.byActivity.length === 0 ? (
          <p className="mt-2 rounded-2xl border border-dashed border-border bg-card/40 p-5 text-sm text-muted-foreground">
            Nada ganho ainda esta semana. Em{' '}
            <Link to="/areas" className="underline underline-offset-2">
              Áreas
            </Link>
            , escolha quais atividades geram lazer e cumpra os blocos delas.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1">
            {summary.byActivity.map((row) => (
              <li
                key={row.activityId}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/60 px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1 truncate">{row.name}</span>
                <span className="text-muted-foreground">
                  {formatLeisure(row.doneMin)} cumpridas
                </span>
                <span className="font-hud font-bold text-mana tabular-nums">
                  +{formatLeisure(row.earnedMin)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Sessões da semana">
        <h2 className="font-display text-xl font-bold">Sessões da semana</h2>
        {summary.sessions.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Quando você usar o cronômetro, as sessões aparecem aqui.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1">
            {[...summary.sessions].reverse().map((session) => (
              <li
                key={session.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/60 px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1 truncate">{nameOf(session.optionId)}</span>
                <span className="text-muted-foreground">
                  {sessionStart(session.startedAt, timezone)}
                </span>
                <span className="font-hud font-bold tabular-nums">
                  {session.active ? 'em andamento' : formatLeisure(session.usedMin)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
