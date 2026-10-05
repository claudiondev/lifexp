# LifeXP — Deploy (Vercel + Render + Neon)

O LifeXP vai ao ar em três partes, todas com plano gratuito: o **front** (arquivos estáticos do `apps/web`) na **Vercel**, a **API** (Docker) no **Render** e o
**PostgreSQL** no **Neon**. A Vercel reescreve `/api/*` para a API, então o navegador vê **uma única origem** (o cookie de sessão e o PWA funcionam sem
CORS). Criar contas, gerar segredos e aceitar termos é com você.

**O que já está pronto no repositório:** `Dockerfile` (API), `render.yaml` (Blueprint do Render), `apps/web/vercel.json`, `GET /api/health/ready`
(prontidão), logs em JSON, Swagger desligado em produção e o `pnpm --filter @lifexp/api smoke:prod <url>` para conferir o resultado. O job `docker` do CI
constrói a imagem a cada push.

> **Planos gratuitos mudam.** Confira limites e preços nos sites antes de criar as contas. O que importa aqui: o serviço **free do Render dorme** depois de
> ~15 min sem tráfego, e o **Neon free suspende o banco** quando fica ocioso e tem um teto de horas de computação por mês. A API tem um agendador interno
> (avisos a cada minuto), então ela mantém o banco acordado: acompanhe o consumo no painel do Neon no primeiro mês (veja _Operação_).

## 1. Neon (banco)

1. Crie a conta e um **projeto** (região mais perto do Render, por exemplo `us-east`/`Ohio` se o Render estiver em Ohio; **a mesma região dos dois reduz a latência**).
2. Em **Connect**, desligue _Connection pooling_ e copie a string **direta** (o host **sem** `-pooler`). Ela termina com `?sslmode=require`.
   Use a URL direta porque o `prisma migrate deploy` usa trava de sessão, que o pooler (PgBouncer) não garante.
3. Guarde a string: ela é o `DATABASE_URL` do passo 2.

## 2. Render (API)

1. **New > Blueprint**, escolha o repositório `claudiondev/lifexp`. O Render lê o `render.yaml`.
2. Ele pede só `DATABASE_URL` (a string **direta** do Neon) e `APP_URL` (o endereço **https** do front na Vercel; a API **não sobe** com http). A
   região (Ohio) já está no arquivo. Para e-mail e push, depois do deploy crie no painel (**Environment**) as variáveis abaixo; **nunca vazias**:

   | Variável                                                 | Valor                                                                            |
   | -------------------------------------------------------- | -------------------------------------------------------------------------------- |
   | `RESEND_API_KEY`, `MAIL_FROM`                            | e-mail do resumo e da recuperação de senha                                       |
   | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | push (gere com `pnpm --filter @lifexp/api push:keys`; as duas chaves ou nenhuma) |

   Já vêm no `render.yaml`: `NODE_ENV=production`, `COOKIE_SECURE=true`, `TRUST_PROXY=2` (Vercel e Render entre o cliente e a API) e `JWT_ACCESS_SECRET`
   (gerado pelo Render; trocar derruba as sessões). Não defina `PORT`. Para ligar o Swagger em produção, crie `SWAGGER_ENABLED=true` (padrão: desligado).

3. **Apply.** As migrations rodam **sozinhas** a cada subida (`prisma migrate deploy`, com trava de banco). Anote o endereço `https://lifexp-api.onrender.com`
   (o nome pode variar se já estiver em uso).

Se o `APP_URL` ainda não existir (a Vercel vem depois), coloque um https provisório e corrija no passo 4.

## 3. Vercel (front)

1. **Add New Project** com o mesmo repositório; **Root Directory** = `apps/web` (deixe ligado _Include source files outside of the Root Directory_).
2. Antes do deploy, edite `apps/web/vercel.json` e troque `SEU-APP.onrender.com` pelo endereço da API no Render (o destino do rewrite de `/api/*`);
   faça o commit e o push.
3. Deploy. Anote o endereço final da Vercel.

## 4. Fechar o circuito

1. No Render, ajuste `APP_URL` para o endereço final da Vercel (a API reinicia sozinha).
2. **Mantenha a API acordada.** No [UptimeRobot](https://uptimerobot.com) (plano gratuito), crie um monitor HTTP em
   `https://lifexp-api.onrender.com/api/health` a cada **5 minutos**. Sem isso, a API dorme e o agendador de avisos para.
3. Confira:

```bash
pnpm --filter @lifexp/api smoke:prod https://seu-front.vercel.app
```

Ele confere saúde, prontidão, Swagger desligado, cabeçalhos de segurança, cookie `Secure`/`HttpOnly` e o fluxo cadastro > sessão > exclusão **passando pela Vercel**.
Depois, no celular: instale o app (Compartilhar > Adicionar à Tela de Início), ative **Configurações > Avisos no celular** e use **Enviar teste**.

## Operação

- **Primeira requisição lenta:** se o monitor falhar ou o Render reiniciar, a API leva cerca de um minuto para acordar. Normal no plano gratuito.
- **Consumo do Neon:** no painel, acompanhe as horas de computação do mês. Se o agendador estourar o teto gratuito, troque só o `DATABASE_URL` por outro
  Postgres (Supabase, ou o do próprio Render por 30 dias): o código é o mesmo.
- **Logs:** em JSON no painel do Render; `GET /api/health/jobs` mostra se a varredura de avisos e o snapshot das quests estão rodando (`degraded` = 3 falhas seguidas).
- **Atualizar:** cada push em `main` redeploya as duas partes. Migrations só avançam: para desfazer uma, escreva uma nova migration (o redeploy da versão anterior
  da API **não** desfaz o banco; mantenha as migrations compatíveis com a versão anterior por um deploy).
- **Backup:** o Neon free guarda só um histórico curto; de qualquer forma, `pg_dump` periódico a partir do `DATABASE_URL` é o seguro. A exportação de dados
  da conta (Configurações) é por pessoa, não é backup.
- **Domínio próprio:** fica para depois. Quando houver, aponte-o à Vercel e atualize `APP_URL`; a API continua só pelo rewrite.
- **Ainda não feito (decisões suas):** Content-Security-Policy no front (precisa de teste em navegador real para não quebrar fontes e estilos) e alertas além do
  monitor de uptime.
