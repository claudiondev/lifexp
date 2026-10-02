/**
 * Quais modelos do banco entram na exportação dos dados da pessoa (RF06, RS15), e com que nome.
 * Todo modelo que pertence a uma pessoa PRECISA estar aqui ou em `EXCLUDED_FROM_EXPORT`: um teste
 * lê o `schema.prisma` e falha se aparecer um modelo novo sem decisão (assim notas, revisões e o que
 * vier depois não ficam de fora da exportação sem ninguém notar).
 */
export const EXPORT_KEYS = {
  Area: 'areas',
  Activity: 'activities',
  AreaProgress: 'areaProgress',
  Block: 'blocks',
  BlockException: 'blockExceptions',
  Completion: 'completions',
  XpTransaction: 'xpTransactions',
  Goal: 'goals',
  Milestone: 'milestones',
  CalendarEvent: 'calendarEvents',
  Notification: 'notifications',
  NotificationPreference: 'notificationPreferences',
  WeeklyReview: 'weeklyReviews',
  Note: 'notes',
  WeeklyQuest: 'weeklyQuests',
  QuestItem: 'questItems',
  Achievement: 'achievements',
  Reward: 'rewards',
} as const;

export type ExportedModel = keyof typeof EXPORT_KEYS;

/** Fora da exportação de propósito, com o motivo. */
export const EXCLUDED_FROM_EXPORT = {
  Session: 'credenciais: guarda o hash do refresh token',
  PasswordResetToken: 'credenciais: guarda o hash do token de recuperação',
} as const;

/** Colunas `DATE` (data civil, sem fuso): saem como "AAAA-MM-DD", não como instante UTC. */
export const CIVIL_DATE_FIELDS: ReadonlySet<string> = new Set([
  'date',
  'validFrom',
  'validUntil',
  'occurrenceDate',
  'newDate',
  'deadline',
  'weekStart',
]);

/** Linha do banco como vai para o JSON: datas civis em "AAAA-MM-DD", instantes em ISO 8601 (UTC). */
export function serializeRow(row: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] =
      value instanceof Date
        ? CIVIL_DATE_FIELDS.has(key)
          ? value.toISOString().slice(0, 10)
          : value.toISOString()
        : value;
  }
  return out;
}

/** "lifexp-dados-2026-10-02.json" (a data é a do pedido, no fuso da pessoa). */
export function exportFileName(civilDate: string): string {
  return `lifexp-dados-${civilDate}.json`;
}
