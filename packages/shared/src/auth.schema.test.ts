import { describe, expect, it } from 'vitest';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from './auth.schema.js';
import { isValidTimezone } from './timezone.js';

describe('registerSchema', () => {
  const valid = { name: ' Ana ', email: ' ANA@Mail.com ', password: '12345678' };

  it('normaliza nome e e-mail e aplica o fuso padrão', () => {
    const parsed = registerSchema.parse(valid);
    expect(parsed).toMatchObject({
      name: 'Ana',
      email: 'ana@mail.com',
      timezone: 'America/Sao_Paulo',
    });
  });

  it('rejeita senha curta, e-mail inválido e fuso desconhecido', () => {
    expect(registerSchema.safeParse({ ...valid, password: '1234567' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, email: 'ana' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, timezone: 'Marte/Olympus' }).success).toBe(false);
  });

  it('rejeita senha acima de 72 caracteres', () => {
    expect(registerSchema.safeParse({ ...valid, password: 'a'.repeat(73) }).success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('não impõe tamanho mínimo à senha (só exige preenchimento)', () => {
    expect(loginSchema.safeParse({ email: 'a@b.com', password: 'x' }).success).toBe(true);
    expect(loginSchema.safeParse({ email: 'a@b.com', password: '' }).success).toBe(false);
  });
});

describe('forgotPasswordSchema', () => {
  it('normaliza o e-mail como no cadastro (espaços e maiúsculas)', () => {
    expect(forgotPasswordSchema.parse({ email: '  Ana@Mail.COM ' })).toEqual({
      email: 'ana@mail.com',
    });
  });

  it('rejeita e-mail inválido, ausente e campos extras', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'ana' }).success).toBe(false);
    expect(forgotPasswordSchema.safeParse({}).success).toBe(false);
    expect(forgotPasswordSchema.safeParse({ email: 'a@b.com', userId: 'x' }).success).toBe(false);
  });
});

describe('resetPasswordSchema', () => {
  const token = 'Zm9vYmFyLWZvb2Jhci1mb29iYXItZm9vYmFyLWZvb2Jhcg_-';
  const valid = { token, password: 'senha-nova-123' };

  it('aceita token base64url e senha dentro da regra', () => {
    expect(resetPasswordSchema.parse(valid)).toEqual(valid);
  });

  it('a senha nova segue a mesma regra do cadastro (8 a 72)', () => {
    expect(resetPasswordSchema.safeParse({ token, password: '1234567' }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ token, password: '12345678' }).success).toBe(true);
    expect(resetPasswordSchema.safeParse({ token, password: 'a'.repeat(72) }).success).toBe(true);
    expect(resetPasswordSchema.safeParse({ token, password: 'a'.repeat(73) }).success).toBe(false);
  });

  it('rejeita token curto, longo demais, com caracteres estranhos ou ausente', () => {
    const withToken = (value: unknown) =>
      resetPasswordSchema.safeParse({ ...valid, token: value }).success;
    expect(withToken('a'.repeat(31))).toBe(false);
    expect(withToken('a'.repeat(32))).toBe(true);
    expect(withToken('a'.repeat(128))).toBe(true);
    expect(withToken('a'.repeat(129))).toBe(false);
    expect(withToken(`${'a'.repeat(40)} `)).toBe(false);
    expect(withToken(`${'a'.repeat(40)}/+=`)).toBe(false);
    expect(withToken(`${'a'.repeat(40)}\n`)).toBe(false);
    expect(resetPasswordSchema.safeParse({ password: 'senha-nova-123' }).success).toBe(false);
  });

  it('rejeita campos extras (RS07): ninguém escolhe a conta pelo corpo', () => {
    expect(resetPasswordSchema.safeParse({ ...valid, email: 'a@b.com' }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ ...valid, userId: 'x' }).success).toBe(false);
  });
});

describe('isValidTimezone', () => {
  it('reconhece fusos IANA', () => {
    expect(isValidTimezone('America/Sao_Paulo')).toBe(true);
    expect(isValidTimezone('UTC')).toBe(true);
    expect(isValidTimezone('nao/existe')).toBe(false);
  });
});
