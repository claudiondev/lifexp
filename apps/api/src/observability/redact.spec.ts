import { describe, expect, it } from 'vitest';
import { redact, truncate } from './redact.js';

describe('redact', () => {
  it('mascara e-mails, deixando só a primeira letra e o domínio', () => {
    expect(redact('falha ao enviar para ana.silva@exemplo.com.br agora')).toBe(
      'falha ao enviar para a***@exemplo.com.br agora',
    );
    expect(redact('a@b.co e c.d+e@f.org')).toBe('a***@b.co e c***@f.org');
  });

  it('esconde cabeçalho Bearer e JWT soltos', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJl';
    expect(redact(`Authorization: Bearer ${jwt}`)).not.toContain('eyJ');
    expect(redact(`erro com ${jwt} no meio`)).toBe('erro com [jwt] no meio');
    expect(redact('Bearer abc.def-ghi')).toBe('Bearer [redigido]');
  });

  it('esconde o valor de campos sensíveis em texto e em JSON', () => {
    expect(redact('password=SuperSecreta123 ok')).toBe('password=[redigido] ok');
    expect(redact('{"token":"abc123def","nome":"Ana"}')).toBe(
      '{"token":"[redigido]","nome":"Ana"}',
    );
    expect(redact('senha: minhasenha')).toBe('senha: [redigido]');
    expect(redact('refresh_token=xyz; Path=/')).toBe('refresh_token=[redigido]; Path=/');
    expect(redact('api-key = chave123')).toBe('api-key = [redigido]');
  });

  it('esconde usuário e senha de URL de conexão', () => {
    expect(redact('conectando em postgresql://app:senha-forte@localhost:5432/lifexp')).toBe(
      'conectando em postgresql://[redigido]@localhost:5432/lifexp',
    );
    expect(redact('postgres://app@db/x')).toBe('postgres://[redigido]@db/x');
  });

  it('esconde o caminho do endereço de push (identifica o aparelho), deixando só o host', () => {
    expect(redact('enviando para https://fcm.googleapis.com/fcm/send/SEGREDO123 hoje')).toBe(
      'enviando para https://fcm.googleapis.com/[redigido] hoje',
    );
    expect(redact('https://updates.push.services.mozilla.com/wpush/v2/abc')).toBe(
      'https://updates.push.services.mozilla.com/[redigido]',
    );
  });

  it('esconde hashes e chaves longas soltas, mas não UUIDs nem palavras comuns', () => {
    expect(redact(`hash ${'a1'.repeat(32)} fim`)).toBe('hash [hex] fim');
    expect(redact(`chave ${'Ab-_'.repeat(12)} fim`)).toBe('chave [token] fim');
    const uuid = '0192f1a0-7b3c-7000-8000-0000000000a1';
    expect(redact(`pessoa ${uuid} excluída`)).toBe(`pessoa ${uuid} excluída`);
    expect(redact('Falha ao gerar notificações da pessoa')).toBe(
      'Falha ao gerar notificações da pessoa',
    );
  });

  it('texto sem nada sensível passa intacto, inclusive o vazio', () => {
    expect(redact('')).toBe('');
    expect(redact('3 notificações geradas para 2 pessoas')).toBe(
      '3 notificações geradas para 2 pessoas',
    );
  });

  it('combina várias coisas na mesma mensagem', () => {
    const out = redact('ana@x.com token=abc senha=zzz postgres://u:p@h/d');
    expect(out).not.toMatch(/ana@|abc|zzz|u:p/);
  });
});

describe('truncate', () => {
  it('corta com reticências, sem passar do limite, e não mexe no que cabe', () => {
    expect(truncate('abcdef', 4)).toBe('abc…');
    expect(truncate('abcdef', 4)).toHaveLength(4);
    expect(truncate('abcd', 4)).toBe('abcd');
    expect(truncate('', 4)).toBe('');
  });
});
