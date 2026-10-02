import { z } from 'zod';

/**
 * Uma sessão (dispositivo) ativa. O `id` é a família do refresh token (`tokenFamily`): é ela que
 * representa "um aparelho logado", já que cada renovação troca o token mas mantém a família.
 * Não há IP de propósito (RS17: identificar o aparelho sem expor dado desnecessário).
 */
export const sessionSchema = z.object({
  id: z.uuid(),
  /** "Chrome · Windows", montado a partir do user agent. */
  device: z.string().min(1).max(80),
  /** Quando esta sessão foi aberta (o login). */
  createdAt: z.iso.datetime(),
  /** Última renovação do token: o melhor sinal de "usada por último". */
  lastUsedAt: z.iso.datetime(),
  /** É a sessão de quem está pedindo a lista. */
  current: z.boolean(),
});

export const sessionListSchema = z.array(sessionSchema);

export const revokeOthersResultSchema = z.object({ revoked: z.number().int().min(0) });

/** Excluir a conta pede a senha de novo (RS15). strictObject: campos extras viram 400 (RS07). */
export const deleteAccountSchema = z.strictObject({
  password: z.string().min(1, 'Informe a senha'),
});

/** Versão do formato da exportação: muda quando o formato muda de jeito incompatível. */
export const ACCOUNT_EXPORT_VERSION = 1;

/**
 * Exportação dos próprios dados (RF06, RS15). `data` tem uma lista por tipo de dado (áreas, blocos,
 * metas...), com as linhas como o banco as guarda, sem o hash da senha.
 */
export const accountExportSchema = z.object({
  version: z.literal(ACCOUNT_EXPORT_VERSION),
  exportedAt: z.iso.datetime(),
  user: z.object({
    id: z.uuid(),
    name: z.string(),
    email: z.string(),
    timezone: z.string(),
    avatarKey: z.string(),
    createdAt: z.iso.datetime(),
  }),
  data: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
});

export type SessionInfo = z.infer<typeof sessionSchema>;
export type RevokeOthersResult = z.infer<typeof revokeOthersResultSchema>;
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
export type AccountExport = z.infer<typeof accountExportSchema>;
