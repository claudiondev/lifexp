import type { LeisureSession } from '@lifexp/shared';

/** "45 min", "1h", "1h30": minutos em texto curto (o mesmo do aviso que o servidor manda). */
export function formatLeisure(totalMin: number): string {
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours}h` : `${hours}h${String(minutes).padStart(2, '0')}`;
}

/** Segundos que faltam para a sessão acabar (nunca negativo); `now` em milissegundos. */
export function remainingSeconds(session: Pick<LeisureSession, 'endsAt'>, now: number): number {
  return Math.max(0, Math.ceil((new Date(session.endsAt).getTime() - now) / 1000));
}

/** "05:07" ou, de uma hora para cima, "1:05:07". */
export function formatCountdown(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const two = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${two(minutes)}:${two(seconds)}` : `${two(minutes)}:${two(seconds)}`;
}

/** Para leitores de tela: muda uma vez por minuto, não a cada segundo da contagem. */
export function remainingMinutesText(totalSeconds: number): string {
  const minutes = Math.ceil(totalSeconds / 60);
  return minutes <= 1 ? 'Falta menos de 1 minuto' : `Faltam ${minutes} minutos`;
}
