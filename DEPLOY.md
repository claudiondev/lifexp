# LifeXP — Deploy (Vercel + Railway)

O LifeXP vai ao ar em duas partes: o **front** (arquivos estáticos do `apps/web`) na **Vercel** e a **API + Postgres** na **Railway**. A Vercel reescreve
`/api/*` para a API, então o navegador vê **uma única origem** (o cookie de sessão e o PWA funcionam sem CORS). Nada abaixo foi publicado por mim: criar
contas, gerar segredos e aceitar cobrança é com você.

**O que já está pronto no repositório:** `Dockerfile` (API), `apps/web/vercel.json`, `GET /api/health/ready` (prontidão), logs em JSON, Swagger desligado
em produção, e o `pnpm --filter @lifexp/api smoke:prod <url>` para conferir o resultado. O CI constrói a imagem a cada push (job `docker`); **eu não
consegui construir a imagem localmente** (sem acesso ao Docker nesta máquina): o que o `Dockerfile` faz foi validado passo a passo sem Docker
(`pnpm deploy --prod`, `prisma migrate deploy` num banco vazio e a API em `NODE_ENV=production`), mas o primeiro build de verdade é o do CI.

### 1. Railway (API e banco)

1. **Novo projeto** > **Provision PostgreSQL**.
2. **New > GitHub Repo** com este repositório. A Railway acha o `Dockerfile` na raiz sozinha. Em **Settings > Deploy**: _Healthcheck Path_ =
   `/api/health/ready`.
3. **Variables** do serviço da API (`DATABASE_URL` pode referenciar o Postgres do projeto, `${{Postgres.DATABASE_URL}}`):

   | Variável                                                 | Valor                                                                           | Obrigatória |
   | -------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------- |
   | `NODE_ENV`                                               | `production`                                                                    | sim         |
   | `DATABASE_URL`                                           | a do Postgres da Railway                                                        | sim         |
   | `JWT_ACCESS_SECRET`                                      | `openssl rand -base64 48` (guarde; trocar derruba as sessões)                   | sim         |
   | `COOKIE_SECURE`                                          | `true` (a API **não sobe** com `false` em produção)                             | sim         |
   | `APP_URL`                                                | o endereço **https** do front na Vercel (a API **não sobe** com http)           | sim         |
   | `TRUST_PROXY`                                            | `2` (Vercel e Railway estão entre o cliente e a API)                            | sim         |
   | `RESEND_API_KEY`, `MAIL_FROM`                            | e-mail do resumo e da recuperação de senha (veja Notificações)                  | opcional    |
   | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | push (gere com `pnpm --filter @lifexp/api push:keys`)                           | opcional    |
   | `SWAGGER_ENABLED`                                        | só `true` se você quiser a documentação pública (padrão em produção: desligada) | opcional    |

   Não defina `PORT` (a Railway define). As migrations rodam **sozinhas** a cada subida (`prisma migrate deploy`, com trava de banco: várias instâncias
   subindo juntas é seguro). **Settings > Networking > Generate Domain** dá o endereço `https://<nome>.up.railway.app`.

### 2. Vercel (front)

1. **Add New Project** com o mesmo repositório; **Root Directory** = `apps/web` (deixe ligado _Include source files outside of the Root Directory_).
2. Antes do deploy, edite `apps/web/vercel.json` e troque `SEU-APP.up.railway.app` pelo endereço da API na Railway (o destino do rewrite de `/api/*`); faça
   o commit.
3. Deploy. Depois volte à Railway e coloque o endereço final da Vercel em `APP_URL` (a API reinicia sozinha).

### 3. Conferir

```bash
pnpm --filter @lifexp/api smoke:prod https://seu-front.vercel.app
```

Ele confere saúde, prontidão, Swagger desligado, cabeçalhos de segurança, cookie `Secure`/`HttpOnly` e o fluxo cadastro > sessão > exclusão **passando pela Vercel**.
Depois, no celular: instale o app (Compartilhar > Adicionar à Tela de Início), ative **Configurações > Avisos no celular** e use **Enviar teste**.

### Operação

- **Logs:** em JSON no painel da Railway; `GET /api/health/jobs` mostra se a varredura de avisos e o snapshot das quests estão rodando (`degraded` = 3 falhas seguidas).
- **Atualizar:** cada push em `main` redeploya as duas partes. Migrations só avançam: para desfazer uma, escreva uma nova migration (o redeploy da versão anterior
  da API **não** desfaz o banco; mantenha as migrations compatíveis com a versão anterior por um deploy).
- **Backup:** confira na Railway o que o seu plano inclui; de qualquer forma, `pg_dump` periódico a partir do `DATABASE_URL` é o seguro. A exportação de dados
  da conta (Configurações) é por pessoa, não é backup.
- **Custos:** Vercel e Railway têm planos gratuitos ou de entrada com limites, e os preços mudam: confira nos sites antes de criar a conta. O Resend também tem
  plano gratuito (veja Notificações).
- **Domínio próprio:** fica para depois. Quando houver, aponte-o à Vercel e atualize `APP_URL`; a API continua só pelo rewrite.
- **Ainda não feito (decisões suas):** Content-Security-Policy no front (precisa de teste em navegador real para não quebrar fontes e estilos), monitoramento
  externo de uptime e alertas.
