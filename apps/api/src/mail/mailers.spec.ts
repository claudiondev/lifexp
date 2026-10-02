import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { LogMailer, maskEmail } from './log.mailer.js';
import { ResendMailer } from './resend.mailer.js';

const message = { to: 'ana@exemplo.com', subject: 'Seu dia no LifeXP', text: 'Olá, Ana!' };

describe('ResendMailer', () => {
  const ok = () => new Response('{"id":"x"}', { status: 200 });

  it('envia pela API do Resend com a chave, o remetente e o conteúdo', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => ok());
    await new ResendMailer('re_secreta', 'LifeXP <a@b.com>', fetcher).send(message);

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    expect(init!.method).toBe('POST');
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer re_secreta');
    expect(JSON.parse(String(init!.body))).toEqual({
      from: 'LifeXP <a@b.com>',
      to: ['ana@exemplo.com'],
      subject: 'Seu dia no LifeXP',
      text: 'Olá, Ana!',
    });
    expect(init!.signal).toBeInstanceOf(AbortSignal);
  });

  it('resposta de erro vira exceção com o status, sem vazar a chave', async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () => new Response('{"message":"x"}', { status: 422 }),
    );
    const send = new ResendMailer('re_secreta', 'LifeXP <a@b.com>', fetcher).send(message);

    await expect(send).rejects.toThrow('HTTP 422');
    await expect(send).rejects.not.toThrow(/re_secreta/);
  });

  it('falha de rede também propaga o erro', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => {
      throw new Error('sem rede');
    });
    await expect(new ResendMailer('k', 'f', fetcher).send(message)).rejects.toThrow('sem rede');
  });
});

describe('LogMailer', () => {
  it('não envia nada e não falha', async () => {
    await expect(new LogMailer().send(message)).resolves.toBeUndefined();
  });

  describe('o que vai para o log (RS14)', () => {
    const secret = { ...message, text: 'Abra http://x/redefinir-senha#token=SEGREDO' };
    const logged = async (mailer: LogMailer) => {
      const lines: string[] = [];
      const spy = vi
        .spyOn(Logger.prototype, 'log')
        .mockImplementation((line: unknown) => void lines.push(String(line)));
      try {
        await mailer.send(secret);
      } finally {
        spy.mockRestore();
      }
      return lines.join('\n');
    };

    it('por padrão registra só o assunto e o endereço mascarado, nunca o corpo', async () => {
      const output = await logged(new LogMailer());
      expect(output).toContain('Seu dia no LifeXP');
      expect(output).toContain('a**@exemplo.com');
      expect(output).not.toContain('ana@exemplo.com');
      expect(output).not.toContain('SEGREDO');
      expect(output).not.toContain('#token=');
    });

    it('com showBody (só em desenvolvimento) mostra o corpo, para abrir o link sem provedor', async () => {
      const output = await logged(new LogMailer(true));
      expect(output).toContain('#token=SEGREDO');
      expect(output).not.toContain('ana@exemplo.com');
    });
  });

  it('maskEmail esconde o usuário do endereço', () => {
    expect(maskEmail('ana@exemplo.com')).toBe('a**@exemplo.com');
    expect(maskEmail('a@exemplo.com')).toBe('a@exemplo.com');
  });
});
