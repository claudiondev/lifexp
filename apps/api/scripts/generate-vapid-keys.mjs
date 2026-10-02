// Gera um par de chaves VAPID para o push no celular (RF41). Uso:
//
//   pnpm --filter @lifexp/api push:keys
//
// Copie as duas linhas para apps/api/.env (nunca versione). A chave PRIVADA é segredo: quem a tem pode enviar push em
// nome do seu servidor. Trocar o par depois invalida as inscrições já feitas (cada aparelho precisa se inscrever de
// novo), então gere uma vez e guarde.
import webpush from 'web-push';

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log('VAPID_SUBJECT=mailto:voce@exemplo.com');
