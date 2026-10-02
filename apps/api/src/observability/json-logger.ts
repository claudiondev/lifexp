import type { LoggerService } from '@nestjs/common';
import { redact, truncate } from './redact.js';

type Level = 'fatal' | 'error' | 'warn' | 'log' | 'debug' | 'verbose';
const LEVEL_NAMES: Record<Level, string> = {
  fatal: 'fatal',
  error: 'error',
  warn: 'warn',
  log: 'info',
  debug: 'debug',
  verbose: 'trace',
};

/** Campos que o logger define; um objeto de log não os sobrescreve. */
const RESERVED = new Set(['time', 'level', 'context', 'message', 'stack']);
const MAX_STACK = 2000;

function isError(value: unknown): value is Error {
  return value instanceof Error;
}

function stringify(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return '[objeto não serializável]';
  }
}

/** Redige recursivamente os textos de um objeto de log (só valores simples e listas/objetos rasos). */
function clean(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return redact(value);
  if (value === null || typeof value !== 'object') return value;
  if (depth >= 3) return '[objeto]';
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => clean(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) out[key] = clean(entry, depth + 1);
  return out;
}

/**
 * Logger em JSON, uma linha por registro (RNF13): fácil de filtrar e consultar em Railway, Datadog e afins. Segue a
 * convenção do Nest (`log(mensagem, contexto)` e `error(mensagem, stack, contexto)`). Todo texto passa por `redact`,
 * então e-mail, token e chave que escaparem numa mensagem não chegam ao log. Um objeto no lugar da mensagem vira
 * campos do registro (ex.: `{ event: 'job_failed', job: 'x' }`).
 */
export class JsonLogger implements LoggerService {
  constructor(private readonly write: (line: string) => void = defaultWrite) {}

  log(message: unknown, ...params: unknown[]): void {
    this.emit('log', message, params);
  }
  error(message: unknown, ...params: unknown[]): void {
    this.emit('error', message, params);
  }
  warn(message: unknown, ...params: unknown[]): void {
    this.emit('warn', message, params);
  }
  debug(message: unknown, ...params: unknown[]): void {
    this.emit('debug', message, params);
  }
  verbose(message: unknown, ...params: unknown[]): void {
    this.emit('verbose', message, params);
  }
  fatal(message: unknown, ...params: unknown[]): void {
    this.emit('fatal', message, params);
  }

  private emit(level: Level, message: unknown, params: unknown[]): void {
    // Convenção do Nest: o contexto é sempre o último parâmetro texto; no erro, o anterior a ele é o stack.
    const texts = params.filter((param): param is string => typeof param === 'string');
    const context = params.length > 0 ? texts.at(-1) : undefined;
    let stack =
      level === 'error' || level === 'fatal'
        ? texts.length >= 2
          ? texts[0]
          : undefined
        : undefined;

    const record: Record<string, unknown> = {
      time: new Date().toISOString(),
      level: LEVEL_NAMES[level],
    };
    if (context) record['context'] = context;

    if (isError(message)) {
      record['message'] = redact(message.message);
      stack = message.stack ?? stack;
    } else if (message !== null && typeof message === 'object') {
      const { message: inner, ...fields } = message as Record<string, unknown>;
      record['message'] = typeof inner === 'string' ? redact(inner) : (fields['event'] ?? '');
      for (const [key, value] of Object.entries(fields)) {
        if (!RESERVED.has(key)) record[key] = clean(value);
      }
    } else {
      record['message'] = redact(stringify(message));
    }
    // Erros passados como parâmetro (logger.error('falhou', error)) também levam o stack, sem o texto do dado.
    const errorParam = params.find(isError);
    if (errorParam) stack = errorParam.stack ?? stack;
    if (stack) record['stack'] = truncate(redact(stack), MAX_STACK);

    this.write(JSON.stringify(record));
  }
}

function defaultWrite(line: string): void {
  process.stdout.write(`${line}\n`);
}

/** Produção usa JSON por padrão (ferramentas de log leem); em desenvolvimento, o texto colorido do Nest. */
export function resolveLogFormat(
  format: 'json' | 'pretty' | undefined,
  nodeEnv: 'development' | 'test' | 'production',
): 'json' | 'pretty' {
  return format ?? (nodeEnv === 'production' ? 'json' : 'pretty');
}
