# LifeXP — contexto para o Claude

Planejador semanal gamificado e multiusuário. Requisitos completos: `docs/requisitos-v2.pdf` (pasta `docs/` é local e está no `.gitignore`; não é versionada)
(RF = requisitos funcionais, RN = regras de negócio, RS = segurança, RNF = não funcionais).
Projeto de aprendizado de TypeScript (vindo de Java/Spring Boot) e portfólio: explique brevemente
decisões não óbvias, comparando com Spring quando ajudar. Responda em português.

## Stack

- Monorepo **pnpm workspaces**: `apps/api` (NestJS 12), `apps/web` (React 19 + Vite + TS + Tailwind 4),
  `packages/shared` (`@lifexp/shared`).
- Validação com **Zod** (`nestjs-zod` na api). Schemas, tipos e regras puras ficam em `packages/shared`.
- **PostgreSQL** via Docker Compose (porta do host **5433**, para não colidir com um Postgres local em 5432) + **Prisma 7** (driver adapter `@prisma/adapter-pg`; a URL do banco
  fica em `prisma.config.ts`, não no `schema.prisma`; client gerado em `apps/api/src/generated`, ignorado no git).
- **Vitest** em api, web e shared. (Desvio do requisito original "Jest na api": o Nest 12 é ESM-only e o
  template oficial usa Vitest.) TypeScript 5.9.
- Datas: **Luxon** (ainda não instalado; entra com os blocos). Timestamps em UTC; datas civis
  (`occurrenceDate`, `weekStart`, `deadline`) como `DATE`.
- CI: GitHub Actions (lint, test, build). Deploy futuro: Vercel com rewrite `/api` → Railway
  (mesma origem, cookie `SameSite=Strict`).

## Arquitetura (backend)

- `controller → service → repository`; repository **apenas** com consulta complexa
  (RNF01). Caso contrário o service usa o `PrismaService` direto.
- Regras de negócio puras (XP, nível, streak, quest, balance score) em `domain/` dentro de cada módulo,
  sem dependência de framework e com cobertura ≥ 80% (RNF02).
- `userId` sempre vem do contexto autenticado, nunca de URL/body (RN39, RS06).
- Completion + XpTransaction + caches na mesma transação de banco (RN30).

## Decisões de domínio já fechadas

- `Block` é template com `validFrom`/`validUntil`. "Só esta ocorrência" = `BlockException`.
  "Esta e as próximas" = encerra o Block atual (`validUntil`) e cria um novo (`validFrom`).
  Não criar ocorrências futuras no banco (RN31).
- Mudança de fuso **preserva o horário local** dos blocos.
- XP é ledger imutável (`XpTransaction`); caches (`totalXp`, `AreaProgress`) são derivados.

## Convenções

- ESM em tudo: imports relativos no `api` e no `shared` levam extensão `.js`.
- Commits pequenos, semânticos e em português (`feat:`, `fix:`, `chore:`, `test:`, `docs:`, `ci:`),
  **sem marca d'água/atribuição** de IA. Um commit por task.
- Segredos só em `.env` (ignorado pelo git); só o `.env.example` com placeholders é versionado.
- Não implementar nada de marcos futuros antes de combinado. Marco atual: **0 (Fundação)** concluído.
- Estrutura: `apps/api/src/<modulo>/{controller,service,dto,domain}`; web por feature em
  `apps/web/src/features/<feature>`.

## Comandos

```bash
cp .env.example .env && cp apps/api/.env.example apps/api/.env   # segredos: nunca versionar
pnpm install            # também roda prisma generate (postinstall da api)
docker compose up -d    # PostgreSQL
pnpm dev                # shared (watch) + api :3000 + web :5173
pnpm lint | test | build | format
pnpm --filter @lifexp/api test:e2e
```

Swagger: `/api/docs`. Health: `GET /api/health`.
