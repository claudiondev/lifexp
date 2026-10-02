import { describe, expect, it } from 'vitest';
import { resetPasswordSchema } from '@lifexp/shared';
import { readResetToken } from './resetToken';

const TOKEN = 'Zm9vYmFyLWZvb2Jhci1mb29iYXItZm9vYmFyLWZvb2Jhcg_-';

describe('readResetToken', () => {
  it('lê o token do fragmento, com ou sem "#"', () => {
    expect(readResetToken(`#token=${TOKEN}`)).toBe(TOKEN);
    expect(readResetToken(`token=${TOKEN}`)).toBe(TOKEN);
    expect(readResetToken(`#outro=1&token=${TOKEN}`)).toBe(TOKEN);
  });

  it('sem token, vazio ou malformado devolve nulo', () => {
    expect(readResetToken('')).toBeNull();
    expect(readResetToken('#')).toBeNull();
    expect(readResetToken('#token=')).toBeNull();
    expect(readResetToken('#token=curto')).toBeNull();
    expect(readResetToken(`#token=${TOKEN}<script>`)).toBeNull();
    expect(readResetToken(`#tokem=${TOKEN}`)).toBeNull();
  });

  it('o que ele aceita, a API também aceita', () => {
    const token = readResetToken(`#token=${TOKEN}`);
    expect(resetPasswordSchema.safeParse({ token, password: 'senha-nova-123' }).success).toBe(true);
  });
});
