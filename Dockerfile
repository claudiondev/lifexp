# syntax=docker/dockerfile:1
#
# Imagem da API do LifeXP (NestJS + Prisma + Postgres). O front (apps/web) é estático e vai para a Vercel.
# Contexto de build: a RAIZ do repositório. Exemplo:
#   docker build -t lifexp-api .
#   docker run --rm -p 3000:3000 --env-file apps/api/.env -e NODE_ENV=production ... lifexp-api
#
# Três estágios: instalar e compilar (com as ferramentas de desenvolvimento), empacotar só o necessário em produção
# (`pnpm deploy`) e a imagem final, pequena e sem root.

ARG NODE_VERSION=22

# ---- base: Node + pnpm na versão do package.json (corepack) -------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    CI=true
RUN corepack enable
WORKDIR /repo

# ---- build: instala (só a API e o pacote compartilhado) e compila --------------------------------------------------
FROM base AS build
# Primeiro só os manifestos: a camada de dependências é reaproveitada enquanto elas não mudarem.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
# O pnpm confere o lockfile contra TODOS os projetos do workspace, então o manifesto do front precisa existir.
COPY apps/web/package.json apps/web/
# Sem scripts: o `prisma generate` do postinstall precisa do schema, que só chega abaixo.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts --filter "@lifexp/api..."

COPY packages/shared packages/shared
COPY apps/api apps/api
# `prisma generate` não conecta ao banco (a URL de mentira do prisma.config.ts basta).
RUN pnpm --filter @lifexp/api exec prisma generate \
 && pnpm --filter @lifexp/shared build \
 && pnpm --filter @lifexp/api build
# Empacota a API com as dependências de PRODUÇÃO (inclui o CLI do Prisma, usado em `migrate deploy`).
RUN pnpm --filter @lifexp/api deploy --prod /out

# ---- final: só o necessário para rodar ------------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 3000

# Pronta = o banco responde (o mesmo que o balanceador deve consultar).
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Aplica as migrations pendentes e sobe a API. `exec` faz o Node receber o SIGTERM do deploy (encerramento limpo).
# Várias instâncias subindo juntas é seguro: o `migrate deploy` usa trava de banco.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && exec node dist/main.js"]
