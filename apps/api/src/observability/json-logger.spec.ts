import { Logger } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { JsonLogger, resolveLogFormat } from './json-logger.js';

function capture() {
  const lines: string[] = [];
  const logger = new JsonLogger((line) => lines.push(line));
  const last = () => JSON.parse(lines.at(-1)!) as Record<string, unknown>;
  return { logger, lines, last };
}

describe('JsonLogger', () => {
  it('escreve uma linha de JSON por registro, com hora ISO, nível e mensagem', () => {
    const { logger, lines, last } = capture();
    logger.log('3 avisos gerados');

    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain('\n');
    expect(last()).toMatchObject({ level: 'info', message: '3 avisos gerados' });
    expect(new Date(last()['time'] as string).toISOString()).toBe(last()['time']);
  });

  it('mapeia os níveis do Nest', () => {
    const { logger, last } = capture();
    const level = (fn: () => void) => (fn(), last()['level']);
    expect(level(() => logger.log('x'))).toBe('info');
    expect(level(() => logger.warn('x'))).toBe('warn');
    expect(level(() => logger.error('x'))).toBe('error');
    expect(level(() => logger.debug('x'))).toBe('debug');
    expect(level(() => logger.verbose('x'))).toBe('trace');
    expect(level(() => logger.fatal('x'))).toBe('fatal');
  });

  it('o contexto é o último parâmetro texto (convenção do Nest)', () => {
    const { logger, last } = capture();
    logger.log('oi', 'Mailer');
    expect(last()['context']).toBe('Mailer');
    logger.error('falhou', 'Error: x\n    at y', 'Jobs');
    expect(last()).toMatchObject({ context: 'Jobs', stack: 'Error: x\n    at y' });
  });

  it('sem contexto, não inventa o campo', () => {
    const { logger, last } = capture();
    logger.log('oi');
    expect('context' in last()).toBe(false);
  });

  it('um objeto no lugar da mensagem vira campos do registro', () => {
    const { logger, last } = capture();
    logger.log({ event: 'job_ok', job: 'varredura', durationMs: 12, created: 3 }, 'Jobs');
    expect(last()).toMatchObject({
      level: 'info',
      context: 'Jobs',
      message: 'job_ok',
      event: 'job_ok',
      job: 'varredura',
      durationMs: 12,
      created: 3,
    });
  });

  it('o objeto não sobrescreve os campos do logger (hora, nível, contexto, stack)', () => {
    const { logger, last } = capture();
    logger.log(
      { message: 'mensagem', time: 'ontem', level: 'fatal', context: 'x', stack: 's' },
      'Real',
    );
    expect(last()['level']).toBe('info');
    expect(last()['context']).toBe('Real');
    expect(last()['time']).not.toBe('ontem');
    expect('stack' in last()).toBe(false);
    expect(last()['message']).toBe('mensagem');
  });

  it('um Error vira mensagem e stack', () => {
    const { logger, last } = capture();
    const error = new Error('banco fora do ar');
    logger.error(error, 'Jobs');
    expect(last()['message']).toBe('banco fora do ar');
    expect(String(last()['stack'])).toContain('banco fora do ar');
  });

  it('erro passado depois da mensagem também leva o stack (logger.error("falhou", erro))', () => {
    const { logger, last } = capture();
    logger.error('A varredura falhou', new Error('causa'));
    expect(last()['message']).toBe('A varredura falhou');
    expect(String(last()['stack'])).toContain('causa');
  });

  it('o stack é cortado em um tamanho razoável', () => {
    const { logger, last } = capture();
    const error = new Error('x');
    error.stack = `Error: x\n${'    at algumaFuncao (arquivo.ts:1:1)\n'.repeat(500)}`;
    logger.error(error);
    expect(String(last()['stack']).length).toBeLessThanOrEqual(2000);
  });

  it('dado sensível nunca chega à linha: mensagem, objeto, stack e erro', () => {
    const { logger, lines } = capture();
    const secret = 'ana@exemplo.com';
    logger.log(`enviando para ${secret} com token=abc123`);
    logger.log({
      event: 'x',
      error: `falhou para ${secret}`,
      nested: { senha: 'senha=zzz', lista: [secret] },
    });
    logger.error(new Error(`erro de ${secret}`));
    logger.error('falhou', `Error: ${secret}`, 'Ctx');
    for (const line of lines) {
      expect(line).not.toContain('ana@exemplo');
      expect(line).not.toContain('abc123');
      expect(line).not.toContain('zzz');
    }
  });

  it('objeto circular não derruba o log', () => {
    const { logger, last } = capture();
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;
    expect(() => logger.log(circular)).not.toThrow();
    expect(last()['level']).toBe('info');
    expect(() => logger.log('texto', circular as never)).not.toThrow();
  });

  it('valores que o JSON não aceita (BigInt) ou que não têm texto (undefined) viram mensagem, sem derrubar o log', () => {
    const { logger, last } = capture();
    expect(() => logger.log(10n)).not.toThrow();
    expect(last()['message']).toBe('[objeto não serializável]');
    logger.log(undefined);
    expect(last()['message']).toBe('undefined');
    logger.log(42);
    expect(last()['message']).toBe('42');
    logger.log(null);
    expect(last()['message']).toBe('null');
  });

  it('funciona como logger de verdade do Nest (Logger com contexto)', () => {
    const lines: string[] = [];
    Logger.overrideLogger(new JsonLogger((line) => lines.push(line)));
    new Logger('Mailer').log('enviado');
    new Logger('Push').warn('devagar');
    Logger.overrideLogger(false);
    const records = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(records).toMatchObject([
      { level: 'info', context: 'Mailer', message: 'enviado' },
      { level: 'warn', context: 'Push', message: 'devagar' },
    ]);
  });
});

describe('resolveLogFormat', () => {
  it('sem valor: JSON em produção e texto nos demais ambientes; o valor explícito vence', () => {
    expect(resolveLogFormat(undefined, 'production')).toBe('json');
    expect(resolveLogFormat(undefined, 'development')).toBe('pretty');
    expect(resolveLogFormat(undefined, 'test')).toBe('pretty');
    expect(resolveLogFormat('pretty', 'production')).toBe('pretty');
    expect(resolveLogFormat('json', 'development')).toBe('json');
  });
});
