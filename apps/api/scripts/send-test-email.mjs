// Envia UM e-mail de resumo de verdade pelo Resend, para conferir a configuração antes de ligar
// o recurso. Uso (a chave vem do apps/api/.env, nunca da linha de comando):
//
//   pnpm --filter @lifexp/api build
//   pnpm --filter @lifexp/api mail:test seu@email.com
//
// Sem domínio verificado no Resend, o remetente precisa ser onboarding@resend.dev e o destinatário
// precisa ser o e-mail da própria conta do Resend (MAIL_FROM="LifeXP <onboarding@resend.dev>").
import { buildDigestEmail } from '../dist/notifications/domain/digest-email.js';
import { ResendMailer } from '../dist/mail/resend.mailer.js';

const to = process.argv[2];
const apiKey = process.env.RESEND_API_KEY;
const from = process.env.MAIL_FROM ?? 'LifeXP <onboarding@resend.dev>';
const appUrl = process.env.APP_URL ?? 'http://localhost:5173';

if (!to || !to.includes('@')) {
  console.error('Informe o destinatário: pnpm --filter @lifexp/api mail:test seu@email.com');
  process.exit(1);
}
if (!apiKey) {
  console.error('RESEND_API_KEY não está definida em apps/api/.env (crie a chave em resend.com).');
  process.exit(1);
}

const email = buildDigestEmail({
  name: 'Teste',
  body: 'Hoje: 2 blocos e 1 evento. O primeiro bloco é Estudo, às 08:00. (e-mail de teste)',
  appUrl,
});

try {
  await new ResendMailer(apiKey, from).send({ to, ...email });
  console.log(`E-mail de teste enviado para ${to}. Confira a caixa de entrada (e o spam).`);
} catch (error) {
  console.error(`Falhou: ${error instanceof Error ? error.message : 'erro desconhecido'}`);
  process.exit(1);
}
