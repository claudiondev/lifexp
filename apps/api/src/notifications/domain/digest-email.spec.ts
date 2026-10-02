import { describe, expect, it } from 'vitest';
import { buildDigestEmail } from './digest-email.js';

const input = {
  name: 'Ana Souza',
  body: 'Hoje: 2 blocos e 1 evento. O primeiro bloco é Corrida, às 08:00.',
  appUrl: 'https://lifexp.app',
};

describe('buildDigestEmail', () => {
  it('assunto fixo e corpo com saudação, resumo, link e como parar de receber', () => {
    const email = buildDigestEmail(input);

    expect(email.subject).toBe('Seu dia no LifeXP');
    expect(email.text).toContain('Olá, Ana!');
    expect(email.text).toContain(input.body);
    expect(email.text).toContain('https://lifexp.app/hoje');
    expect(email.text).toMatch(/desligue "Resumo por e-mail"/);
  });

  it('usa só o primeiro nome', () => {
    expect(buildDigestEmail({ ...input, name: '  Maria  Clara  ' }).text).toContain('Olá, Maria!');
  });

  it('nome vazio não deixa "Olá, !"', () => {
    expect(buildDigestEmail({ ...input, name: '   ' }).text).toContain('Olá, olá!');
  });

  it('não duplica a barra do endereço do app', () => {
    expect(buildDigestEmail({ ...input, appUrl: 'https://lifexp.app///' }).text).toContain(
      'https://lifexp.app/hoje',
    );
    expect(buildDigestEmail({ ...input, appUrl: 'http://localhost:5173' }).text).toContain(
      'http://localhost:5173/hoje',
    );
  });

  it('é texto simples: sem HTML nem rastreio', () => {
    const { text } = buildDigestEmail(input);
    expect(text).not.toMatch(/<[a-z][^>]*>/i);
    expect(text).not.toMatch(/utm_|pixel|track/i);
  });

  it('o tom é de aviso, sem cobrança', () => {
    expect(buildDigestEmail(input).text).not.toMatch(/atrasad|perdeu|falhou|cobran/i);
  });
});
