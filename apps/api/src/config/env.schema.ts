import { z } from 'zod';

const booleanString = (fallback: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(fallback)
    .transform((value) => value === 'true');

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.string().min(1),
    JWT_ACCESS_SECRET: z.string().min(32, 'use ao menos 32 caracteres'),
    ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(7),
    AUTH_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(10),
    // Atrás de proxy (Vercel/Render) o IP real vem em X-Forwarded-For; sem isso o rate limit vê só o proxy.
    // É o NÚMERO de proxies confiáveis entre a internet e a API (0 = nenhum): o Express pega o IP de quem veio
    // `N` saltos antes, então um cliente que escreva o próprio X-Forwarded-For não consegue se passar por outro IP.
    // "true" vale 1 (compatível com a configuração antiga); "false" vale 0. Vercel -> Render (ou Railway) são 2.
    TRUST_PROXY: z
      .string()
      .regex(/^(true|false|[0-5])$/, 'use false, true ou o número de proxies (0 a 5)')
      .default('false')
      .transform((value) => (value === 'true' ? 1 : value === 'false' ? 0 : Number(value))),
    // Documentação interativa em /api/docs. Sem valor: ligada em desenvolvimento e teste, DESLIGADA em produção
    // (ela lista todas as rotas; em produção só liga se alguém pedir).
    SWAGGER_ENABLED: z.enum(['true', 'false']).optional(),
    // Formato dos logs: JSON (uma linha por registro, para ferramentas de log) ou texto legível. Sem valor: JSON em
    // produção e texto nos demais ambientes.
    LOG_FORMAT: z.enum(['json', 'pretty']).optional(),
    // Liga a varredura por minuto que gera lembretes e resumos (RN38). Os testes desligam.
    NOTIFICATIONS_SCHEDULER: booleanString('true'),
    // Liga a criação do snapshot da quest semanal na virada da semana (RN16). Os testes desligam.
    QUESTS_SCHEDULER: booleanString('true'),
    // E-mail do resumo diário (RF39): sem RESEND_API_KEY o envio só vai para o log (dev e testes).
    RESEND_API_KEY: z.string().min(1).optional(),
    MAIL_FROM: z.string().min(3).default('LifeXP <nao-responda@lifexp.app>'),
    // Push no celular (RF41), por Web Push com chaves VAPID: sem as DUAS chaves o recurso fica desligado. Gere o par com
    // `pnpm --filter @lifexp/api push:keys`. O subject identifica quem envia aos serviços de push (mailto: ou https:).
    VAPID_PUBLIC_KEY: z.string().min(40).optional(),
    VAPID_PRIVATE_KEY: z.string().min(20).optional(),
    VAPID_SUBJECT: z
      .string()
      .regex(
        /^(mailto:[^\s@]+@[^\s@]+|https:\/\/\S+)$/,
        'use mailto:voce@exemplo.com ou https://seusite',
      )
      .default('mailto:contato@lifexp.app'),
    // Endereço do app, usado no link do e-mail.
    APP_URL: z.url().default('http://localhost:5173'),
    // Variáveis de ambiente são sempre string; "false" não pode virar true por coerção.
    COOKIE_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
  })
  .refine((env) => Boolean(env.VAPID_PUBLIC_KEY) === Boolean(env.VAPID_PRIVATE_KEY), {
    message: 'Defina as duas chaves VAPID (pública e privada) ou nenhuma',
    path: ['VAPID_PRIVATE_KEY'],
  })
  // Em produção a API só sobe configurada com segurança: cookie Secure e link do app em https.
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    if (!env.COOKIE_SECURE) {
      ctx.addIssue({
        code: 'custom',
        path: ['COOKIE_SECURE'],
        message: 'em produção o cookie de sessão precisa ser Secure: defina COOKIE_SECURE=true',
      });
    }
    if (!env.APP_URL.startsWith('https://')) {
      ctx.addIssue({
        code: 'custom',
        path: ['APP_URL'],
        message: 'em produção APP_URL precisa ser https://',
      });
    }
  })
  .transform((env) => ({
    ...env,
    SWAGGER_ENABLED: env.SWAGGER_ENABLED
      ? env.SWAGGER_ENABLED === 'true'
      : env.NODE_ENV !== 'production',
  }));

export type Env = z.infer<typeof envSchema>;

/**
 * Valida as variáveis de ambiente no boot. Se algo estiver inválido a app nem sobe
 * (fail fast) — equivalente ao @ConfigurationProperties + @Validated do Spring.
 */
export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Variáveis de ambiente inválidas:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
