# LifeXP

Planejador semanal gamificado e multiusuário. Cada pessoa organiza a semana em blocos por área da
vida, cumpre os blocos, ganha XP e evolui.

> Status: **Marco 1a (Autenticação)** concluído sobre a fundação do Marco 0. Próximos: perfil/áreas,
> blocos, tela Hoje e XP.

## Stack

| Camada     | Tecnologia                                                     |
| ---------- | -------------------------------------------------------------- |
| Monorepo   | pnpm workspaces                                                |
| API        | NestJS 12, Zod (`nestjs-zod`), Prisma 7, PostgreSQL            |
| Web        | React 19, Vite, TypeScript, Tailwind CSS 4                     |
| Compartilh | `packages/shared` (schemas Zod, tipos, regras puras)           |
| Auth       | JWT curto + refresh token rotativo (cookie httpOnly), argon2id |
| Testes     | Vitest (api, web, shared)                                      |
| CI         | GitHub Actions (lint, test, build)                             |

## Pré-requisitos

- Node.js 22+ (`.nvmrc`)
- pnpm 9 (`corepack enable` ou `npm i -g pnpm`)
- Docker com Compose

## Como rodar

```bash
# 1. dependências (gera também o Prisma Client)
pnpm install

# 2. variáveis de ambiente (troque a senha; use a mesma nos dois arquivos)
cp .env.example .env
cp apps/api/.env.example apps/api/.env

# 3. banco de dados
docker compose up -d   # Postgres em localhost:5433

# 4. api (http://localhost:3000) e web (http://localhost:5173)
pnpm dev
```

- Web: http://localhost:5173 (mostra o status de `/api/health`)
- API: http://localhost:3000/api/health
- Swagger: http://localhost:3000/api/docs

Em desenvolvimento o Vite faz proxy de `/api` para a API, reproduzindo o rewrite da Vercel em
produção (mesma origem, cookie `SameSite=Strict`).

## Scripts (raiz)

| Comando       | O que faz                                         |
| ------------- | ------------------------------------------------- |
| `pnpm dev`    | Compila o shared e sobe shared (watch), api e web |
| `pnpm build`  | Build de todos os pacotes                         |
| `pnpm lint`   | ESLint + checagem do Prettier                     |
| `pnpm test`   | Testes de todos os pacotes (inclui e2e da api)    |
| `pnpm format` | Formata o código com Prettier                     |

## Autenticação (Marco 1a)

| Método | Rota                 | Acesso      | O que faz                                     |
| ------ | -------------------- | ----------- | --------------------------------------------- |
| POST   | `/api/auth/register` | público     | Cria a conta e abre a sessão                  |
| POST   | `/api/auth/login`    | público     | Autentica                                     |
| POST   | `/api/auth/refresh`  | cookie      | Rotaciona o refresh token e emite novo access |
| POST   | `/api/auth/logout`   | cookie      | Revoga a sessão (idempotente)                 |
| GET    | `/api/users/me`      | autenticado | Usuário atual                                 |

- Access token: JWT de 15 min, enviado em `Authorization: Bearer`, guardado só em memória no front.
- Refresh token: opaco, 7 dias, cookie `httpOnly` + `SameSite=Strict` + `Path=/api/auth`; no banco só o hash.
  Reuso de um token já rotacionado revoga a família inteira da sessão.
- Login e cadastro têm rate limit por IP (`AUTH_RATE_LIMIT_PER_MINUTE`). Rotas são privadas por padrão;
  as públicas usam `@Public()`.

## Testes

`pnpm test` roda unitários e e2e. Os e2e da api usam um **banco separado** (`<nome>_test`, criado e
migrado automaticamente a partir do `DATABASE_URL`), então o Postgres do `docker compose` precisa estar
no ar. O banco de desenvolvimento nunca é tocado.

## Migrations (Prisma)

```bash
pnpm --filter @lifexp/api exec prisma migrate dev --name <nome>   # cria e aplica em dev
pnpm --filter @lifexp/api exec prisma migrate deploy              # aplica as existentes
```

## Estrutura

```
apps/api         NestJS (controller → service → repository só se a consulta for complexa)
apps/web         React + Vite
packages/shared  Schemas Zod, tipos e regras puras usados por api e web
```

## Decisões de arquitetura

As decisões e convenções do projeto estão resumidas em [`CLAUDE.md`](CLAUDE.md).
