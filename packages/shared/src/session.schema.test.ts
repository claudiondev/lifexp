import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_EXPORT_VERSION,
  accountExportSchema,
  deleteAccountSchema,
  revokeOthersResultSchema,
  sessionListSchema,
  sessionSchema,
} from './session.schema.js';

const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success;

const id = '0192f1a0-7b3c-7000-8000-0000000000a1';
const session = {
  id,
  device: 'Chrome · Windows',
  createdAt: '2026-10-01T12:00:00.000Z',
  lastUsedAt: '2026-10-02T09:30:00.000Z',
  current: true,
};

describe('sessionSchema', () => {
  it('aceita uma sessão e uma lista (inclusive vazia)', () => {
    expect(ok(sessionSchema, session)).toBe(true);
    expect(ok(sessionListSchema, [session, { ...session, current: false }])).toBe(true);
    expect(ok(sessionListSchema, [])).toBe(true);
  });

  it('exige id UUID, aparelho preenchido e datas ISO', () => {
    expect(ok(sessionSchema, { ...session, id: '123' })).toBe(false);
    expect(ok(sessionSchema, { ...session, device: '' })).toBe(false);
    expect(ok(sessionSchema, { ...session, device: 'x'.repeat(81) })).toBe(false);
    expect(ok(sessionSchema, { ...session, createdAt: 'ontem' })).toBe(false);
    expect(ok(sessionSchema, { ...session, lastUsedAt: undefined })).toBe(false);
    expect(ok(sessionSchema, { ...session, current: 'sim' })).toBe(false);
  });
});

describe('revokeOthersResultSchema', () => {
  it('é um inteiro não negativo', () => {
    expect(ok(revokeOthersResultSchema, { revoked: 0 })).toBe(true);
    expect(ok(revokeOthersResultSchema, { revoked: 3 })).toBe(true);
    expect(ok(revokeOthersResultSchema, { revoked: -1 })).toBe(false);
    expect(ok(revokeOthersResultSchema, { revoked: 1.5 })).toBe(false);
  });
});

describe('deleteAccountSchema', () => {
  it('exige a senha e rejeita campos extras (RS07)', () => {
    expect(ok(deleteAccountSchema, { password: 'x' })).toBe(true);
    expect(ok(deleteAccountSchema, { password: '' })).toBe(false);
    expect(ok(deleteAccountSchema, {})).toBe(false);
    expect(ok(deleteAccountSchema, { password: 'x', userId: 'outro' })).toBe(false);
  });

  it('não impõe tamanho mínimo à senha (quem confere é o servidor)', () => {
    expect(ok(deleteAccountSchema, { password: '1' })).toBe(true);
  });
});

describe('accountExportSchema', () => {
  const exported = {
    version: ACCOUNT_EXPORT_VERSION,
    exportedAt: '2026-10-02T12:00:00.000Z',
    user: {
      id,
      name: 'Ana',
      email: 'ana@test.dev',
      timezone: 'America/Sao_Paulo',
      avatarKey: 'swords',
      createdAt: '2026-10-01T12:00:00.000Z',
    },
    data: { areas: [{ id, name: 'Saúde' }], goals: [] },
  };

  it('aceita o envelope com listas de linhas', () => {
    expect(ok(accountExportSchema, exported)).toBe(true);
    expect(ok(accountExportSchema, { ...exported, data: {} })).toBe(true);
  });

  it('só aceita a versão atual do formato', () => {
    expect(ACCOUNT_EXPORT_VERSION).toBe(1);
    expect(ok(accountExportSchema, { ...exported, version: 2 })).toBe(false);
  });

  it('cada tipo de dado precisa ser uma lista de objetos', () => {
    expect(ok(accountExportSchema, { ...exported, data: { areas: 'x' } })).toBe(false);
    expect(ok(accountExportSchema, { ...exported, data: { areas: ['x'] } })).toBe(false);
  });

  it('o usuário exportado não carrega hash de senha (o schema não o prevê)', () => {
    const parsed = accountExportSchema.parse({
      ...exported,
      user: { ...exported.user, passwordHash: 'segredo' },
    });
    expect(parsed.user).not.toHaveProperty('passwordHash');
  });
});
