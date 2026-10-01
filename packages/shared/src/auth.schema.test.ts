import { describe, expect, it } from 'vitest';
import { loginSchema, registerSchema } from './auth.schema.js';
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

describe('isValidTimezone', () => {
  it('reconhece fusos IANA', () => {
    expect(isValidTimezone('America/Sao_Paulo')).toBe(true);
    expect(isValidTimezone('UTC')).toBe(true);
    expect(isValidTimezone('nao/existe')).toBe(false);
  });
});
