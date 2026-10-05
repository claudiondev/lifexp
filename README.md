# 🎮 LifeXP — Planejador Semanal Gamificado

<div align="center">

![TypeScript](https://img.shields.io/badge/TypeScript%205.9-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![NestJS](https://img.shields.io/badge/NestJS%2012-E0234E?style=for-the-badge&logo=nestjs&logoColor=white)
![React](https://img.shields.io/badge/React%2019-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind%204-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma%207-2D3748?style=for-the-badge&logo=prisma&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-F69220?style=for-the-badge&logo=pnpm&logoColor=white)

![Status](https://img.shields.io/badge/Status-✅%20Em%20produção-brightgreen?style=for-the-badge)
![PWA](https://img.shields.io/badge/PWA-instalável-5A0FC8?style=for-the-badge&logo=pwa&logoColor=white)

[![CI](https://github.com/claudiondev/lifexp/actions/workflows/ci.yml/badge.svg)](https://github.com/claudiondev/lifexp/actions/workflows/ci.yml)

**Cumpra. Descanse. Evolua.** 🎯✨

[![Acesse o LifeXP](https://img.shields.io/badge/Acesse_o_LifeXP-Clique_Aqui-blue?style=for-the-badge&logo=vercel)](https://lifexp-zeta.vercel.app/)

</div>

---

## 📖 Sobre o Projeto

O **LifeXP** é um planejador semanal multiusuário com cara de jogo. Cada pessoa organiza a semana em **blocos** ligados a **áreas da vida** (trabalho, estudo, saúde, descanso...), cumpre os blocos, ganha **XP**, sobe de **nível** e acompanha o equilíbrio entre as áreas.

Os princípios do produto valem na interface inteira: **recompensar sem punir**, **descanso conta como progresso** e **sem ranking** entre pessoas.

> **Fase atual:** todas as funcionalidades planejadas (marcos 0 a 4) estão implementadas e testadas. Em produção: front na Vercel, API no Render e banco no Neon (guia em [`DEPLOY.md`](DEPLOY.md)). 🚀
>
> ⏳ A API roda no plano gratuito do Render: depois de um período sem uso ela "dorme", e o primeiro acesso pode levar cerca de um minuto.

Também é um projeto de **aprendizado de TypeScript** (vindo de Java/Spring Boot): as decisões não óbvias estão explicadas e comparadas com o Spring em [`ARQUITETURA.md`](ARQUITETURA.md).

---

## ✨ Funcionalidades Principais

### 👤 Conta & Segurança

- ✅ Cadastro e login com **JWT de 15 min** (só em memória no front) + **refresh token opaco rotativo** (cookie `httpOnly`, `SameSite=Strict`)
- ✅ Reuso de refresh token revogado derruba a família inteira de sessões
- ✅ Senhas com **argon2id**; login sempre responde "Credenciais inválidas" (sem revelar se o e-mail existe)
- ✅ Recuperação de senha por e-mail (token de uso único, só o hash fica no banco)
- ✅ Lista e encerra sessões por aparelho; efeito imediato em logout e troca de senha
- ✅ **Exportação** de todos os dados e **exclusão** da conta (pede senha)
- ✅ Rate limiting, Swagger desligado em produção e dados sensíveis redigidos dos logs

### 🗓️ Planejamento

- ✅ **Áreas e atividades** com cor, ícone e peso de XP; arquivar em vez de excluir
- ✅ **Blocos semanais** recorrentes (vários dias de uma vez, com data de fim) ou avulsos
- ✅ **Tarefas** do dia sem horário, com prioridade, área, meta, anotação e checklist; o que não foi feito passa para o dia seguinte sozinho, e as sem dia ficam em **Pendentes**
- ✅ **Anotação** em cada bloco (até 500 caracteres, texto puro), visível na Semana, em Hoje e no painel do bloco
- ✅ Editar, pular ou excluir **"só esta ocorrência"** ou **"esta e as próximas"** — o passado nunca muda
- ✅ **Arrastar e soltar** na grade da Semana (desktop) e agenda/abas no celular
- ✅ **Calendário de eventos** com lembrete configurável (sem XP)

### 🏆 Gamificação

- ✅ **XP** por bloco concluído, **níveis** com curva própria e livro-caixa imutável (nunca se perde nem se cria XP sem rastro)
- ✅ **Streak** com **coringa** semanal — dia livre nunca quebra a sequência
- ✅ **Metas e marcos** com XP e comemoração
- ✅ **Quest semanal** com bônus de XP
- ✅ **Radar de equilíbrio** entre as áreas da vida
- ✅ **Conquistas, títulos e recompensas reais** (você define o prêmio e o gatilho)
- ✅ Histórico de XP por origem

### 📝 Reflexão & Avisos

- ✅ **Notas** em markdown com tags, busca e vínculo a área, meta ou evento (renderização segura)
- ✅ **Revisão semanal** com resumo automático e campos de reflexão
- ✅ **Relatório semanal** (e aviso quando fica pronto)
- ✅ **Notificações** dentro do app, por **e-mail** (resumo diário) e **push no celular**

### 📱 PWA

- ✅ Instalável, com aviso de versão nova
- ✅ Respostas da API **nunca** entram no cache (dados e token só em memória)

---

## 🏗️ Arquitetura e Estrutura

```
LifeXP/
├── apps/
│   ├── api/                    🌐 NestJS (backend)
│   │   ├── prisma/             🗄️ Schema e migrations
│   │   ├── src/<módulo>/       controller → service (→ repository se a consulta for complexa)
│   │   │   └── domain/         🧠 Regras puras, sem framework (XP, streak, quest, balance...)
│   │   └── test/               🧪 e2e com banco de teste separado
│   └── web/                    🖥️ React + Vite (PWA)
│       └── src/features/<x>    Telas, hooks e componentes por funcionalidade
├── packages/
│   └── shared/                 📦 Schemas Zod, tipos e regras puras usados por api e web
├── Dockerfile                  🐳 Imagem da API (Render)
├── docker-compose.yml          🐘 PostgreSQL para desenvolvimento
└── .github/workflows/ci.yml    ⚙️ Audit, lint, testes, build e imagem Docker
```

Módulos da API: `auth`, `users`, `areas`, `blocks`, `gamification`, `goals`, `events`, `notifications`, `push`, `notes`, `reviews`, `observability`, `health`.

### 📊 Fluxo de Dados

```
Requisição HTTP
      ↓
JwtAuthGuard (global, nega por padrão; confere a sessão a cada chamada)
      ↓
Controller (valida a entrada com Zod)
      ↓
Service (userId sempre do token, nunca da URL ou do corpo)
      ↓
Prisma → PostgreSQL (concluir bloco + ledger de XP + caches na MESMA transação)
      ↓
Resposta JSON 2xx / 4xx
```

### 🧱 Decisões que valem destaque

- **Bloco é template**, nunca ocorrência salva: a semana é calculada na leitura (`computeWeekOccurrences`).
- **XP é um ledger imutável** (trigger do banco bloqueia `UPDATE`); totais são caches derivados, com teste de invariante.
- **Regras puras em `domain/`** com cobertura mínima de 80%, sem dependência de framework.
- **Mesma origem em produção** (Vercel reescreve `/api/*` para o Render): cookie `SameSite=Strict` e PWA sem CORS.
- **Defesa em profundidade:** as regras da aplicação também viram `CHECK` no banco.

---

## 🔌 Endpoints da API

Todas as rotas ficam sob `/api` e exigem autenticação, exceto as de `/auth` e `/health`. Com a API rodando, o **Swagger** em `http://localhost:3000/api/docs` lista e testa tudo.

| Grupo           | Rota base                                     | O que faz                                                                                            |
| --------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 🔑 Autenticação | `/auth`                                       | Cadastro, login, renovação, logout, recuperar e redefinir senha                                      |
| 💻 Sessões      | `/auth/sessions`                              | Listar e encerrar aparelhos                                                                          |
| 👤 Conta        | `/users`                                      | Perfil, exportar dados, excluir conta                                                                |
| 🧭 Áreas        | `/areas`                                      | CRUD, arquivar e restaurar                                                                           |
| ✅ Atividades   | `/activities`                                 | CRUD, arquivar e restaurar                                                                           |
| ✅ Tarefas      | `/tasks`                                      | Hoje e Pendentes, criar, editar, arquivar, concluir e desfazer, passos do checklist                  |
| 🧱 Blocos       | `/blocks`                                     | Semana, criar (avulso ou vários dias), editar/pular/excluir ocorrência ou série, concluir e desfazer |
| 🎯 Metas        | `/goals`                                      | Metas, marcos, concluir e reabrir                                                                    |
| 📅 Eventos      | `/events`                                     | CRUD por período                                                                                     |
| 📈 Progresso    | `/progress`, `/xp`                            | Nível, XP, streak e histórico por origem                                                             |
| 🗺️ Quest        | `/quest`                                      | Quest da semana                                                                                      |
| 🕸️ Equilíbrio   | `/balance`                                    | Radar por área                                                                                       |
| 🏅 Conquistas   | `/achievements`                               | Coleção e progresso                                                                                  |
| 🎁 Recompensas  | `/rewards`                                    | CRUD e resgate                                                                                       |
| 📝 Notas        | `/notes`                                      | CRUD, busca, tags e fixar                                                                            |
| 🔍 Revisão      | `/reviews`                                    | Resumo da semana e reflexão                                                                          |
| 📄 Relatório    | `/reports`                                    | Relatório semanal                                                                                    |
| 🔔 Avisos       | `/notifications`, `/notification-preferences` | Lista, marcar como lido, preferências                                                                |
| 📲 Push         | `/push`                                       | Inscrever e remover aparelho                                                                         |
| 🩺 Saúde        | `/health`                                     | Vivo, pronto (`/ready`) e estado dos jobs (`/jobs`)                                                  |

---

## 🚀 Tecnologias Stack

### Backend

<div align="center">

| Tecnologia           | Função                                                   |
| -------------------- | -------------------------------------------------------- |
| **NestJS 12**        | Framework web (equivalente ao Spring Boot)               |
| **Zod + nestjs-zod** | Validação e tipos (equivalente ao Bean Validation + DTO) |
| **Prisma 7**         | ORM e migrations (driver adapter `pg`)                   |
| **PostgreSQL**       | Banco de dados                                           |
| **argon2**           | Hash de senha                                            |
| **web-push**         | Notificações push (VAPID)                                |
| **Resend**           | E-mail transacional (opcional)                           |
| **Luxon**            | Datas e fusos                                            |

</div>

### Frontend

<div align="center">

| Tecnologia                    | Função                                         |
| ----------------------------- | ---------------------------------------------- |
| **React 19 + Vite**           | Interface e build                              |
| **Tailwind CSS 4**            | Estilização, tema escuro por padrão            |
| **TanStack Query**            | Cache e sincronização com a API                |
| **vite-plugin-pwa / Workbox** | App instalável                                 |
| **motion**                    | Animações (respeitam `prefers-reduced-motion`) |

</div>

### Qualidade

- 🧪 **Vitest** em api, web e shared (unitários + e2e com banco real)
- 🧬 **Teste de mutação manual** nas regras de negócio e segurança
- ⚙️ **GitHub Actions:** `pnpm audit`, lint, testes, build e imagem Docker
- 🤖 **Dependabot** para npm e Actions

---

## 🧪 Testes automatizados

```bash
pnpm test
```

Roda unitários (com meta de cobertura ≥ 80% no `domain/`) e e2e da API. Os e2e usam um **banco separado** (`<nome>_test`, criado e migrado automaticamente), então o PostgreSQL do `docker compose` precisa estar no ar; o banco de desenvolvimento nunca é tocado.

Desempenho: `pnpm --filter @lifexp/api perf:smoke` mede as rotas principais e falha se algum p95 passar de 300 ms.

---

## 🐳 Rodando localmente

### Pré-requisitos

- Node.js 22+ (veja `.nvmrc`)
- pnpm 9 (`corepack enable`)
- Docker com Compose

### Passos

```bash
git clone https://github.com/claudiondev/lifexp.git
cd lifexp

pnpm install                                    # também gera o Prisma Client

cp .env.example .env                            # troque a senha; use a mesma nos dois arquivos
cp apps/api/.env.example apps/api/.env

docker compose up -d                            # PostgreSQL em localhost:5433

pnpm dev                                        # shared (watch) + api + web
```

| Serviço | Endereço                         |
| ------- | -------------------------------- |
| Web     | http://localhost:5173            |
| API     | http://localhost:3000/api/health |
| Swagger | http://localhost:3000/api/docs   |

Em desenvolvimento o Vite faz proxy de `/api` para a API, reproduzindo o rewrite da Vercel (mesma origem, cookie `SameSite=Strict`).

### Scripts (raiz)

| Comando       | O que faz                      |
| ------------- | ------------------------------ |
| `pnpm dev`    | Sobe shared (watch), api e web |
| `pnpm build`  | Build de todos os pacotes      |
| `pnpm lint`   | ESLint + checagem do Prettier  |
| `pnpm test`   | Testes de todos os pacotes     |
| `pnpm format` | Formata com Prettier           |

### Migrations

```bash
pnpm --filter @lifexp/api exec prisma migrate dev --name <nome>   # cria e aplica em dev
pnpm --filter @lifexp/api exec prisma migrate deploy              # aplica as existentes
```

---

## ☁️ Deploy (Vercel + Render + Neon)

O **front** (estático) vai para a **Vercel** e a **API** para o **Render** e o **PostgreSQL** para o **Neon**; a Vercel reescreve `/api/*` para a API, então o navegador vê uma única origem. O passo a passo, as variáveis de ambiente e a conferência final (`smoke:prod`) estão em [`DEPLOY.md`](DEPLOY.md).

---

## 📚 Documentação

| Arquivo                            | Conteúdo                                                                           |
| ---------------------------------- | ---------------------------------------------------------------------------------- |
| [`ARQUITETURA.md`](ARQUITETURA.md) | Decisões de cada marco, regras de negócio e glossário para quem vem de Java/Spring |
| [`DEPLOY.md`](DEPLOY.md)           | Guia de publicação e operação                                                      |
| [`CLAUDE.md`](CLAUDE.md)           | Convenções do projeto                                                              |

---

## 📋 Checklist de Funcionalidades

### ✅ Marco 0: Fundação

- ✅ Monorepo pnpm, API, web, shared, CI e banco com Docker Compose

### ✅ Marco 1: Núcleo do jogo

- ✅ Autenticação, perfil, áreas e atividades
- ✅ Blocos e tela Semana
- ✅ Hoje, conclusão, XP e níveis
- ✅ Streak
- ✅ PWA instalável

### ✅ Marco 2: Metas, eventos e avisos

- ✅ Metas e marcos
- ✅ Calendário de eventos
- ✅ Notificações (app e e-mail)
- ✅ Extras: arrastar e soltar, histórico de XP, recuperar senha
- ✅ Blocos em vários dias, com fim da série

### ✅ Marco 3: Conta e reflexão

- ✅ Sessões por aparelho, exportação e exclusão de conta
- ✅ Notas em markdown
- ✅ Revisão semanal

### ✅ Marco 4: Profundidade do jogo

- ✅ Quest semanal
- ✅ Radar de equilíbrio e coringa de streak
- ✅ Conquistas, títulos e recompensas reais
- ✅ Push no celular e relatório semanal

### ✅ Marco 5: Tarefas

- ✅ Tarefas sem horário, Pendentes, checklist e XP com teto diário

### ✅ Transversais

- ✅ Logs estruturados, monitor de jobs, auditoria de dependências, fumaça de desempenho
- ✅ Dockerfile, `render.yaml`, `vercel.json` e guia de deploy
- ✅ Publicado: Vercel (front), Render (API) e Neon (PostgreSQL)

### 🔜 Próximos passos

- ⏳ Conferir PWA, instalação e push em navegador e celular reais
- ⏳ Content-Security-Policy no front e monitoramento de uptime
- 💡 Extras opcionais (RF13, RF56), só se o uso justificar

---

## 👨‍💻 Autor

**Claudio Nascimento**

🔗 GitHub: [@claudiondev](https://github.com/claudiondev)

💼 LinkedIn: [linkedin.com/in/claudionascimento-dev](https://linkedin.com/in/claudionascimento-dev)

⭐ Se este projeto foi útil, deixe uma star! ⭐

---

**Status:** ✅ Em produção (Vercel + Render + Neon) | Última atualização: Outubro de 2026
