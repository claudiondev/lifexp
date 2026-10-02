import {
  revokeOthersResultSchema,
  sessionListSchema,
  type DeleteAccountInput,
  type SessionInfo,
} from '@lifexp/shared';
import { apiFetch, apiJson } from '../../lib/apiClient';

export const listSessions = (): Promise<SessionInfo[]> =>
  apiJson('/auth/sessions', sessionListSchema);

/** Idempotente: encerrar de novo uma sessão sua não é erro. */
export async function revokeSession(id: string): Promise<void> {
  await apiFetch(`/auth/sessions/${id}`, { method: 'DELETE' });
}

/** Devolve quantos aparelhos foram desconectados. */
export async function revokeOtherSessions(): Promise<number> {
  const result = await apiJson('/auth/sessions/revoke-others', revokeOthersResultSchema, {
    method: 'POST',
  });
  return result.revoked;
}

export interface ExportFile {
  blob: Blob;
  fileName: string;
}

const FALLBACK_NAME = 'lifexp-dados.json';

/** O nome vem do cabeçalho Content-Disposition da API (com a data no fuso da pessoa). */
export function fileNameFrom(contentDisposition: string | null): string {
  const match = /filename="([^"]+)"/.exec(contentDisposition ?? '');
  return match?.[1] ?? FALLBACK_NAME;
}

export async function fetchExport(): Promise<ExportFile> {
  const response = await apiFetch('/users/me/export');
  return {
    blob: await response.blob(),
    fileName: fileNameFrom(response.headers.get('Content-Disposition')),
  };
}

/** Irreversível: exclui a conta e tudo que é dela, depois de conferir a senha. */
export async function deleteAccount(input: DeleteAccountInput): Promise<void> {
  await apiFetch('/users/me/delete', { method: 'POST', body: JSON.stringify(input) });
}
