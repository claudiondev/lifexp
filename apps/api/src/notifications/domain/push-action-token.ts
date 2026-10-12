import { createHash, randomBytes } from 'node:crypto';
import { addDays, localDateTimeToUtc, type CivilDate, type PushActionInput } from '@lifexp/shared';

const TOKEN_BYTES = 32;
const ONE_MS = 1;

/** Token opaco, como no de recuperação de senha: vai uma única vez no push; no banco só o hash. */
export function generateActionToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

/** SHA-256, como no refresh token e no de recuperação de senha. */
export function hashActionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * O token nunca vale mais que a janela de conclusão da ocorrência (RN08): 23:59:59.999 do dia civil
 * seguinte ao do bloco, no fuso da pessoa. Mesma fórmula do fim da janela de conclusão
 * (`gamification/domain/completion-window.ts`), repetida aqui para este módulo não depender do de
 * gamificação por um detalhe.
 */
export function actionTokenExpiry(occurrenceDate: CivilDate, timezone: string): Date {
  return new Date(
    localDateTimeToUtc(addDays(occurrenceDate, 2), '00:00', timezone).getTime() - ONE_MS,
  );
}

export interface CheckinOutcome {
  action: PushActionInput;
  activityName: string;
  /** 0 quando a ocorrência já estava concluída (idempotente) ou quando a ação é "skip". */
  xpAwarded: number;
  leveledUp: boolean;
  newLevel: number;
}

/**
 * O texto que substitui o aviso original depois do toque no botão (RF41): sem nada a decidir no
 * aparelho, só mostra o que a API devolveu.
 */
export function checkinResultText(outcome: CheckinOutcome): { title: string; body: string } {
  if (outcome.action === 'skip') {
    return { title: 'Pulado', body: outcome.activityName };
  }
  if (outcome.leveledUp) {
    return {
      title: `Você chegou ao nível ${outcome.newLevel}!`,
      body: `${outcome.activityName} · +${outcome.xpAwarded} XP`,
    };
  }
  return {
    title: `✓ ${outcome.activityName}`,
    body: outcome.xpAwarded > 0 ? `+${outcome.xpAwarded} XP` : 'Já estava concluído',
  };
}
