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

## 📸 Telas

Capturas reais do app (dados de exemplo, geradas por script: veja [Regenerar as capturas](#-regenerar-as-capturas-de-tela)).

<table>
  <tr>
    <td width="50%"><img src="assets/readme/painel.png" alt="Painel com a ficha do personagem, a missão de hoje e o radar de equilíbrio das áreas" /><br /><sub><b>Painel:</b> nível, streak, missão de hoje e radar de equilíbrio</sub></td>
    <td width="50%"><img src="assets/readme/hoje.png" alt="Tela Hoje com os blocos do dia, o XP de cada um e a quest da semana" /><br /><sub><b>Hoje:</b> concluir rende XP; o que ficou de ontem ainda dá tempo</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/readme/semana.png" alt="Grade da semana com blocos por área, resumo por dia e o indicador +N num horário cheio" /><br /><sub><b>Semana:</b> resumo por dia, densidade ajustável e "+N" nos horários cheios</sub></td>
    <td width="50%"><img src="assets/readme/mes.png" alt="Calendário do mês com a faixa de blocos por área em cada dia e a lista do dia aberto" /><br /><sub><b>Mês:</b> blocos e progresso de cada dia, com a lista do dia aberto</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/readme/evolucao.png" alt="Evolução do XP por semana e mapa de calor de constância das últimas 26 semanas" /><br /><sub><b>Evolução:</b> XP por semana e por área, e o mapa de constância</sub></td>
    <td width="50%" align="center"><img src="assets/readme/celular-hoje.png" alt="Tela Hoje no celular" width="45%" /> <img src="assets/readme/celular-semana.png" alt="Tela Semana no celular, com as abas dos dias" width="45%" /><br /><sub><b>Celular:</b> Hoje e Semana (abas por dia), instalável como PWA</sub></td>
  </tr>
</table>

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
- ✅ **Tempo de lazer**: atividades que você escolhe (estudo, inglês...) rendem minutos para gastar no que gosta, com **cronômetro**; o saldo vale até o fim da semana
- ✅ **Tarefas** do dia sem horário, com prioridade, área, meta, anotação e checklist; o que não foi feito passa para o dia seguinte sozinho, e as sem dia ficam em **Pendentes**
- ✅ **Anotação** em cada bloco (até 500 caracteres, texto puro), visível na Semana, em Hoje e no painel do bloco
- ✅ Editar, pular ou excluir **"só esta ocorrência"** ou **"esta e as próximas"** — o passado nunca muda
- ✅ **Arrastar e soltar** na grade da Semana (desktop) e agenda/abas no celular
- ✅ **Semana legível:** altura das horas ajustável (compacta, padrão, confortável), resumo por dia (concluídos/total, tempo e faixa por área) e "+N" quando mais de 2 blocos dividem o horário
- ✅ **Mês com blocos:** cada dia mostra o progresso e a faixa por área, e o dia aberto lista os blocos com link para a Semana
- ✅ **Calendário de eventos** com lembrete configurável (sem XP)

### 🏆 Gamificação

- ✅ **XP** por bloco concluído, **níveis** com curva própria e livro-caixa imutável (nunca se perde nem se cria XP sem rastro)
- ✅ **Streak** com **coringa** semanal — dia livre nunca quebra a sequência
- ✅ **Metas e marcos** com XP e comemoração
- ✅ **Quest semanal** com bônus de XP
- ✅ **Radar de equilíbrio** entre as áreas da vida
- ✅ **Conquistas, títulos e recompensas reais** (você define o prêmio e o gatilho)
- ✅ Histórico de XP por origem
- ✅ **Evolução do XP:** XP líquido por semana e por área (4, 8 ou 12 semanas), comparativo com a semana anterior em tom positivo e a melhor semana
- ✅ **Mapa de constância:** últimas 26 semanas, um quadrado por dia; dia com plano e nada concluído é só um aro vazio, nunca vermelho

### 📝 Reflexão & Avisos

- ✅ **Notas** em markdown com tags, busca e vínculo a área, meta ou evento (renderização segura)
- ✅ **Revisão semanal** com resumo automático e campos de reflexão
- ✅ **Relatório semanal** (e aviso quando fica pronto)
- ✅ **Notificações** dentro do app, por **e-mail** (resumo diário) e **push no celular**, com botões **"Cumpri"/"Pulei"** que marcam o bloco direto no aviso (sem abrir o app) e um fechamento da noite para o que ficou pendente

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

Módulos da API: `auth`, `users`, `areas`, `blocks`, `tasks`, `leisure`, `gamification`, `goals`, `events`, `notifications`, `push`, `notes`, `reviews`, `observability`, `health`.

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

### 🗺️ Visão geral

```mermaid
flowchart LR
  subgraph Cliente
    B["Navegador / PWA<br/>React + Vite"]
    SW["Service worker<br/>(push; /api nunca vai ao cache)"]
  end
  subgraph Vercel
    V["Front estático<br/>rewrite /api/* → Render"]
  end
  subgraph Render
    A["API NestJS<br/>(Docker)"]
    J["Agendadores<br/>avisos e quest semanal"]
  end
  DB[("PostgreSQL<br/>Neon")]
  R["Resend<br/>e-mail"]
  P["Serviços de push<br/>Web Push / VAPID"]

  B -- "mesma origem" --> V
  V -- "/api/*" --> A
  A --> DB
  J --> DB
  A --> R
  A --> P
  P -.-> SW
  SW -. "Cumpri / Pulei" .-> A
```

### 🏆 Como o XP é registrado

Concluir e desfazer acontecem numa **única transação**: o livro-caixa é a fonte da verdade e os caches (XP total e por área) são derivados dele.

```mermaid
sequenceDiagram
  autonumber
  participant W as Web
  participant C as CompletionsService
  participant DB as PostgreSQL
  W->>C: POST /blocks/:id/occurrences/:data/completion
  C->>DB: BEGIN
  C->>DB: trava a pessoa (FOR NO KEY UPDATE) e o bloco (FOR UPDATE)
  C->>C: confere a janela (do início do bloco até o fim do dia seguinte)
  C->>DB: grava Completion (foto: área, duração e XP)
  C->>DB: grava XpTransaction COMPLETION (+XP, imutável)
  C->>DB: atualiza os caches (total e por área)
  C->>DB: liquida a quest da semana e avalia conquistas
  C->>DB: COMMIT
  C-->>W: XP ganho, nível, quest e conquistas
  Note over W,DB: Desfazer grava um REVERSAL (−XP) ligado ao lançamento original, e nada é apagado
```

### 🔐 Sessão e renovação do token

```mermaid
sequenceDiagram
  autonumber
  participant W as Web (token só em memória)
  participant A as API
  participant DB as PostgreSQL
  W->>A: requisição com access JWT (15 min)
  A->>DB: a sessão (família do token) continua ativa?
  A-->>W: 401 quando o JWT expira
  W->>A: POST /auth/refresh (cookie httpOnly, SameSite=Strict)
  A->>DB: revoga o token usado e cria o novo, na MESMA transação
  A-->>W: novo access JWT e novo cookie
  Note over A,DB: Reuso de um token já revogado derruba a família inteira de sessões
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

| Grupo           | Rota base                                     | O que faz                                                                                                                        |
| --------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 🔑 Autenticação | `/auth`                                       | Cadastro, login, renovação, logout, recuperar e redefinir senha                                                                  |
| 💻 Sessões      | `/auth/sessions`                              | Listar e encerrar aparelhos                                                                                                      |
| 👤 Conta        | `/users`                                      | Perfil, exportar dados, excluir conta                                                                                            |
| 🧭 Áreas        | `/areas`                                      | CRUD, arquivar e restaurar                                                                                                       |
| ✅ Atividades   | `/activities`                                 | CRUD, arquivar e restaurar                                                                                                       |
| ✅ Tarefas      | `/tasks`                                      | Hoje e Pendentes, criar, editar, arquivar, concluir e desfazer, passos do checklist                                              |
| ⏳ Lazer        | `/leisure`                                    | Saldo da semana, seus lazeres (criar, arquivar) e cronômetro (iniciar e parar)                                                   |
| 🧱 Blocos       | `/blocks`                                     | Semana, intervalo de semanas (mês), criar (avulso ou vários dias), editar/pular/excluir ocorrência ou série, concluir e desfazer |
| 🎯 Metas        | `/goals`                                      | Metas, marcos, concluir e reabrir                                                                                                |
| 📅 Eventos      | `/events`                                     | CRUD por período                                                                                                                 |
| 📈 Progresso    | `/progress`, `/xp`                            | Nível, XP, streak, histórico por origem e evolução por semana (`/xp/evolution`)                                                  |
| 🔥 Constância   | `/consistency`                                | Blocos planejados e concluídos por dia (mapa de calor)                                                                           |
| 🗺️ Quest        | `/quest`                                      | Quest da semana                                                                                                                  |
| 🕸️ Equilíbrio   | `/balance`                                    | Radar por área                                                                                                                   |
| 🏅 Conquistas   | `/achievements`                               | Coleção e progresso                                                                                                              |
| 🎁 Recompensas  | `/rewards`                                    | CRUD e resgate                                                                                                                   |
| 📝 Notas        | `/notes`                                      | CRUD, busca, tags e fixar                                                                                                        |
| 🔍 Revisão      | `/reviews`                                    | Resumo da semana e reflexão                                                                                                      |
| 📄 Relatório    | `/reports`                                    | Relatório semanal                                                                                                                |
| 🔔 Avisos       | `/notifications`, `/notification-preferences` | Lista, marcar como lido, preferências                                                                                            |
| 📲 Push         | `/push`, `/push-actions`                      | Inscrever/remover aparelho; "Cumpri"/"Pulei" pelo botão da notificação (pública, sem sessão)                                     |
| 🩺 Saúde        | `/health`                                     | Vivo, pronto (`/ready`) e estado dos jobs (`/jobs`)                                                                              |

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
- 🎭 **Playwright** no navegador real (front e API de verdade, banco de teste), rodando no CI
- 🧬 **Teste de mutação manual** nas regras de negócio e segurança
- ⚙️ **GitHub Actions:** `pnpm audit`, lint, testes, build e imagem Docker
- 🤖 **Dependabot** para npm e Actions

---

## 🧪 Testes automatizados

```bash
pnpm test
```

Roda unitários (com meta de cobertura ≥ 80% no `domain/`) e e2e da API. Os e2e usam um **banco separado** (`<nome>_test`, criado e migrado automaticamente), então o PostgreSQL do `docker compose` precisa estar no ar; o banco de desenvolvimento nunca é tocado.

### 🎭 Testes de ponta a ponta (navegador)

O pacote `apps/e2e` usa o **Playwright**: abre o app num Chromium de verdade, com o front (Vite) e a API compilada falando com um PostgreSQL de teste. Cada teste cria a própria pessoa, então rodam em paralelo. Cobrem o cadastro, o planejamento, a conclusão com XP, o calendário, a evolução do XP e a constância; um deles já achou um bug real de redirecionamento depois do login.

```bash
pnpm build                                      # a API roda compilada
E2E_DATABASE_URL=postgresql://lifexp:SENHA@localhost:5433/lifexp_e2e \
  pnpm --filter @lifexp/e2e e2e                 # o nome do banco precisa terminar em _e2e
```

Na primeira vez: `pnpm --filter @lifexp/e2e exec playwright install chromium`. No CI o job `e2e` sobe um Postgres descartável e, se algo falhar, anexa o relatório com traço e capturas de tela.

### 📸 Regenerar as capturas de tela

As imagens em `assets/readme/` saem de um script (com dados de exemplo, sempre iguais): ele cria uma pessoa com seis meses de histórico, planeja a semana e o dia de hoje pelo app e salva as telas em PNG.

```bash
E2E_DATABASE_URL=postgresql://lifexp:SENHA@localhost:5433/lifexp_e2e \
  pnpm --filter @lifexp/e2e screenshots         # rode depois das 09h: os blocos de hoje já precisam ter começado
```

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

### ✅ Marco 6: Tempo de lazer

- ✅ Atividades rendem minutos de lazer (proporção por atividade), saldo semanal e cronômetro com aviso quando acaba

### ✅ Check-in pelo push

- ✅ Aviso "cumpriu?" no fim de cada bloco, com botões "Cumpri"/"Pulei" que marcam sem abrir o app
- ✅ Fechamento da noite: avisa só o que ainda ficou pendente

### ✅ Insights e calendário

- ✅ Semana mais legível (densidade, resumo por dia, "+N" em horário cheio) e mês com blocos
- ✅ Evolução do XP por semana e por área, com comparativo
- ✅ Mapa de constância das últimas 26 semanas
- ✅ Testes de ponta a ponta no navegador (Playwright) no CI

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
