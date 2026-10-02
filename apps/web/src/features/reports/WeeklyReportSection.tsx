import { Download } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { CivilDate, WeeklyReport } from '@lifexp/shared';
import { Button } from '@/components/ui/button';
import { weekdayLong } from '@/lib/civilFormat';
import { describeJoker } from '../character/jokerModel';
import { downloadWeeklyReport } from './reportsApi';
import { adherenceText, durationText, questLine, signedXp } from './reportFormat';
import { useWeeklyReport } from './useWeeklyReport';

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-background/50 p-4">
      <p className="font-hud text-[0.7rem] tracking-wider text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl font-bold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ReportBody({ report }: { report: WeeklyReport }) {
  const { blocks, xp } = report;
  const notes = [
    blocks.open > 0 &&
      `${blocks.open} ${blocks.open === 1 ? 'bloco ainda' : 'blocos ainda'} em aberto, com tempo para cumprir.`,
    blocks.skipped > 0 &&
      `${blocks.skipped} pulado${blocks.skipped === 1 ? '' : 's'}, sem XP e sem penalidade.`,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Aderência" value={adherenceText(blocks.adherence)} />
        <Tile label="Blocos" value={`${blocks.completed} de ${blocks.planned}`} hint="cumpridos" />
        <Tile label="Tempo" value={durationText(report.minutes)} hint="de blocos cumpridos" />
        <Tile
          label="XP"
          value={signedXp(xp.net)}
          hint={xp.reverted > 0 ? `${xp.reverted} devolvidos por desfazer` : undefined}
        />
      </div>

      {notes.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {notes.map((note) => (
            <li key={String(note)}>{note}</li>
          ))}
        </ul>
      )}

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-medium">Quest da semana</dt>
          <dd className="text-muted-foreground">{questLine(report.quest)}</dd>
        </div>
        <div>
          <dt className="font-medium">Sequência</dt>
          <dd className="text-muted-foreground">
            {report.streak.current} {report.streak.current === 1 ? 'dia' : 'dias'} (recorde{' '}
            {report.streak.best}). {describeJoker(report.streak.joker)}
          </dd>
        </div>
        {report.bestDay && (
          <div>
            <dt className="font-medium">Melhor dia</dt>
            <dd className="text-muted-foreground">
              {weekdayLong(report.bestDay.date)}, com {report.bestDay.completed}{' '}
              {report.bestDay.completed === 1 ? 'bloco cumprido' : 'blocos cumpridos'}
            </dd>
          </div>
        )}
        {report.achievements.length > 0 && (
          <div>
            <dt className="font-medium">Conquistas da semana</dt>
            <dd className="text-muted-foreground">
              {report.achievements.map((achievement) => achievement.title).join(', ')}
            </dd>
          </div>
        )}
        {(report.goals.completed.length > 0 || report.goals.milestones.length > 0) && (
          <div className="sm:col-span-2">
            <dt className="font-medium">Metas</dt>
            <dd>
              <ul className="list-disc pl-5 text-muted-foreground">
                {report.goals.completed.map((goal) => (
                  <li key={goal.id}>Meta concluída: {goal.title}</li>
                ))}
                {report.goals.milestones.map((milestone) => (
                  <li key={`${milestone.goalId}-${milestone.title}-${milestone.doneAt}`}>
                    Marco concluído: {milestone.title} ({milestone.goalTitle})
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}

/**
 * O relatório da semana (RF47) na Revisão, com o botão de baixar em Markdown. É um extra: se a consulta falhar, a
 * seção some em silêncio e a revisão segue. Semana sem nenhum bloco não mostra números zerados: só a explicação.
 */
export function WeeklyReportSection({ weekStart }: { weekStart: CivilDate }) {
  const report = useWeeklyReport(weekStart);
  const [downloading, setDownloading] = useState(false);

  if (report.isError) return null;

  const empty =
    report.data !== undefined &&
    report.data.blocks.planned === 0 &&
    report.data.blocks.open === 0 &&
    report.data.blocks.skipped === 0;

  const download = async () => {
    setDownloading(true);
    try {
      await downloadWeeklyReport(weekStart);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível baixar o relatório.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <section
      aria-labelledby="report-title"
      className="mt-6 rounded-2xl border border-border bg-card/80 p-5 backdrop-blur sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="report-title" className="font-display text-xl font-bold">
          Relatório da semana
        </h2>
        {report.data && !empty && (
          <Button
            variant="secondary"
            size="sm"
            disabled={downloading}
            onClick={() => void download()}
          >
            <Download aria-hidden className="size-4" />
            Baixar em Markdown
          </Button>
        )}
      </div>
      <div className="mt-4">
        {report.isPending && (
          <div
            aria-busy="true"
            className="h-24 animate-pulse rounded-xl border border-border bg-card/50"
          />
        )}
        {empty && (
          <p className="text-muted-foreground">
            Sem blocos planejados nesta semana, então não há o que relatar. Sem cobrança: semana
            livre também conta.
          </p>
        )}
        {report.data && !empty && <ReportBody report={report.data} />}
      </div>
    </section>
  );
}
