export interface DigestEmailInput {
  name: string;
  /** O corpo do aviso de resumo ("Hoje: 2 blocos e 1 evento. ..."). */
  body: string;
  appUrl: string;
}

export interface DigestEmail {
  subject: string;
  text: string;
}

/**
 * Texto do resumo diário por e-mail (RF39): simples, em português, sem rastreio e com o jeito de
 * parar de receber. O tom é de aviso, nunca de cobrança.
 */
export function buildDigestEmail(input: DigestEmailInput): DigestEmail {
  const link = `${input.appUrl.replace(/\/+$/, '')}/hoje`;
  const firstName = input.name.trim().split(/\s+/)[0] || 'olá';
  return {
    subject: 'Seu dia no LifeXP',
    text: [
      `Olá, ${firstName}!`,
      '',
      input.body,
      '',
      `Abrir o dia de hoje: ${link}`,
      '',
      'Você recebe este resumo porque ligou o e-mail diário. Para parar, desligue "Resumo por e-mail" em Perfil > Notificações.',
    ].join('\n'),
  };
}
