# LifeXP

Planejador semanal gamificado e multiusuário. Cada pessoa organiza a semana em blocos por área da
vida, cumpre os blocos, ganha XP e evolui.

> Status: **Marco 2b (Calendário de eventos)** concluído, sobre 2a (metas) e o **Marco 1** completo (PWA, streak,
> Hoje/XP, blocos/Semana, perfil/áreas, autenticação, fundação). Próximos: 2c (notificações) e 2d (extras da fase 2).

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

## Perfil, áreas e atividades (Marco 1b)

Toda conta nova nasce com 7 áreas (Trabalho, Estudo, Família, Fé, Saúde, Descanso e Projetos pessoais),
cada uma com uma atividade de mesmo nome (peso de XP 1,0). Tudo é editável e arquivável.

| Método | Rota                                         | O que faz                                   |
| ------ | -------------------------------------------- | ------------------------------------------- |
| PATCH  | `/api/users/me`                              | Edita nome, fuso e emblema                  |
| GET    | `/api/areas?includeArchived=`                | Lista as áreas                              |
| POST   | `/api/areas`                                 | Cria área (nome, cor, ícone)                |
| PATCH  | `/api/areas/:id`                             | Edita a área                                |
| POST   | `/api/areas/:id/archive` e `/unarchive`      | Arquiva e restaura                          |
| GET    | `/api/activities?areaId=&includeArchived=`   | Lista atividades                            |
| POST   | `/api/activities`                            | Cria atividade (área, nome, peso 0,5 a 2,0) |
| PATCH  | `/api/activities/:id`                        | Edita nome ou peso                          |
| POST   | `/api/activities/:id/archive` e `/unarchive` | Arquiva e restaura                          |

Dados de outra pessoa respondem **404** (igual a um recurso que não existe). Corpos com campos extras
são rejeitados com 400. Telas: Painel, Áreas e Perfil.

## Blocos e tela Semana (Marco 1c)

Um **bloco** é uma atividade num dia e horário. Pode ser **semanal** (toda semana) ou **avulso** (uma vez).

**Como a recorrência funciona:** o banco guarda só o _template_ do bloco (dia da semana, horário, duração
e de quando a regra vale) e as _exceções_ por data. As ocorrências de cada semana são **calculadas na hora
da consulta**; nada de ocorrências futuras gravadas.

- **Pular só esta ocorrência** e **alterar só esta** (dia na mesma semana, horário ou duração) viram uma
  _exceção_ daquela data.
- **Editar/excluir "esta e as próximas"** encerra a série no dia anterior e cria uma nova a partir da data.
  **O passado nunca muda.** "Toda a série" é "esta e as próximas" na primeira ocorrência.
- A semana começa na **segunda-feira**. Datas são civis (`AAAA-MM-DD`, sem fuso); o horário é hora de relógio
  (`HH:mm`). Mudar de fuso preserva o horário local. Bloco não atravessa a meia-noite; blocos podem se sobrepor.

| Método | Rota                               | O que faz                                         |
| ------ | ---------------------------------- | ------------------------------------------------- |
| GET    | `/api/blocks/week?weekStart=`      | Ocorrências da semana (uma única consulta)        |
| POST   | `/api/blocks`                      | Cria bloco semanal ou avulso                      |
| PATCH  | `/api/blocks/:id`                  | Edita a partir de uma data (`from`)               |
| DELETE | `/api/blocks/:id?from=`            | Encerra/exclui a partir de uma data (idempotente) |
| PUT    | `/api/blocks/:id/exceptions/:date` | Pula ou altera só uma ocorrência                  |
| DELETE | `/api/blocks/:id/exceptions/:date` | Restaura a ocorrência original                    |

Telas: **Semana** (grade no desktop; abas dos dias no celular) com navegação entre semanas, criação de
blocos e um painel de ações ao clicar num bloco.

## Hoje, conclusão, XP e níveis (Marco 1d)

Concluir um bloco rende **XP**: `round(duração em min × peso da atividade × multiplicador)`, no máximo 300 por
conclusão. O nível geral e o de cada área vêm de uma curva única (`packages/shared/src/xp.ts`):
`XP para chegar ao nível n = round(100 · (n−1)^1.5)` (nível 1 = 0 XP). A curva está isolada para ser recalibrada.

- **Janela de conclusão:** do início do bloco até 23:59 do dia seguinte (no fuso da pessoa). Antes de começar
  não dá para concluir; depois da janela também não, e desfazer segue a mesma janela. Pular não pune.
- **Idempotência:** concluir ou desfazer duas vezes não duplica XP.
- **Livro-caixa (ledger) imutável:** `XpTransaction` só recebe lançamentos novos (conclusão positiva, estorno
  negativo ligado ao original; um estorno por lançamento). Um _trigger_ do banco bloqueia UPDATE. O XP total
  (`User.cachedTotalXp`) e o de cada área (`AreaProgress`) são **caches** derivados do ledger, atualizados na
  mesma transação; `CacheRebuildService` confere (`check`) e reconstrói (`rebuild`) a partir do ledger.
- **Concorrência:** a linha da pessoa é travada com `FOR NO KEY UPDATE` e depois a do bloco com `FOR UPDATE`.
  Com `FOR UPDATE` na pessoa havia _deadlock_ com a edição de blocos (a FK pede `FOR KEY SHARE` na pessoa).
- **Relógio injetável (`Clock`):** a API lê a hora por um token (`CLOCK`), então os testes usam um `FakeClock`.
- **Ocorrência concluída** não pode ser pulada nem alterada (409); desfazer libera. Editar a série move as
  conclusões junto; mudar o dia da semana com conclusões ativas, ou excluir bloco avulso concluído, dá 409.

| Método | Rota                                           | O que faz                                  |
| ------ | ---------------------------------------------- | ------------------------------------------ |
| GET    | `/api/progress`                                | XP e nível geral e por área                |
| GET    | `/api/today`                                   | Blocos de hoje (+ ontem ainda abertos), XP |
| POST   | `/api/blocks/:id/occurrences/:date/completion` | Conclui a ocorrência (idempotente)         |
| DELETE | `/api/blocks/:id/occurrences/:date/completion` | Desfaz a conclusão (estorno, idempotente)  |

Telas: **Hoje** (`/hoje`: próximo bloco em destaque, Concluir com "+XP", Desfazer, Pular, XP do dia,
"De ontem (ainda dá tempo)", comemoração ao subir de nível); HUD, ficha e áreas com XP/nível reais; a
**Semana** mostra ✓ e XP nas concluídas e o painel oferece "Desfazer conclusão".

## Streak (Marco 1e)

O streak mede **aderência ao que você planejou**, não produtividade diária. Só dias com ao menos um bloco
planejado contam; dia sem bloco é **neutro** (não avança e não quebra).

- Em dia planejado, cumprir **um** bloco já avança. Blocos pulados não contam como planejados (um dia só com
  pulados também é neutro). Blocos de qualquer área contam, inclusive Descanso.
- Um dia planejado sem nenhuma conclusão **só quebra a sequência quando a janela dele fecha** (23:59 do dia
  seguinte). Hoje e ontem, ainda em aberto, nunca quebram nada. O recorde (`best`) é o maior streak da história.
- Uma ocorrência movida de dia conta no dia para onde foi; a conclusão é ligada pela data original.
- **Sem tabela de cache:** o streak é recalculado do histórico a cada leitura (`StreakService`, regra pura em
  `gamification/domain/streak.ts`). Ele muda com o tempo e com edições, não só ao concluir; um cache ficaria
  desatualizado por construção. Vem junto em `GET /api/progress` (`streak: {current, best, lastFulfilledDate}`).
- O coringa semanal (RF26) é da fase 4 e ainda não existe.

Telas: HUD, ficha ("Recorde") e a tela Hoje mostram o streak; em dia livre a Hoje avisa que o streak não muda.

## PWA instalável (Marco 1f)

O LifeXP é instalável como app (RNF03), sem push (push é da fase 4).

- **Manifesto** (`apps/web/pwa.config.ts`): abre em `/hoje`, `display: standalone`, tema escuro do HUD, ícones
  192, 512 e _maskable_. Os ícones saem de `apps/web/scripts/icon.svg` com `pnpm --filter @lifexp/web icons`
  (os PNGs ficam versionados em `public/icons`, então o build não depende do `sharp`).
- **Service worker** (Workbox, `generateSW`): só o "casco" do app é pré-cacheado (JS, CSS, HTML, fontes, ícones).
  **`/api/*` nunca é cacheado** (`NetworkOnly`) e o fallback de navegação ignora `/api`: XP, streak e blocos mudam
  o tempo todo e o token vive só em memória, então resposta velha seria pior que erro de rede. Não há modo
  offline de dados.
- **Atualização** em modo `prompt`: quando sai versão nova aparece "Nova versão disponível" com
  Atualizar/Depois; nada recarrega sozinho no meio de uma ação.
- **Instalar:** botão "Instalar app" no Perfil, só quando o navegador oferece (`beforeinstallprompt`). No
  Safari/iOS a instalação é manual (Compartilhar > Adicionar à Tela de Início); o `apple-touch-icon` já está lá.
- **Garantia no build:** `pnpm build` termina com `scripts/check-pwa.mjs`, que falha se o manifesto, os ícones
  ou a regra "API fora do cache" estiverem errados (o CI pega por aqui).
- **Em produção (Vercel):** o rewrite `/api` → Railway precisa continuar na mesma origem, e `sw.js` deve ser
  servido sem cache longo (o Vite já o emite com hash só nos assets, não no `sw.js`).

## Metas e marcos (Marco 2a)

Uma **meta** junta marcos e blocos de tempo em torno de algo que você quer alcançar.

- **Campos:** título, descrição, área, prazo (data civil), status (ativa, concluída, pausada, abandonada) e uma
  **métrica opcional** (valor-alvo, valor atual e unidade). Valor atual e unidade só existem com um valor-alvo.
- **Progresso (RN19):** com métrica, valor atual ÷ alvo (passou do alvo = 100%); sem métrica, marcos concluídos ÷
  total. A métrica vence quando as duas existem. Sem métrica e sem marcos o progresso é **indefinido** (não 0%).
- **A meta nunca conclui sozinha (RN20):** ao chegar a 100% ela só aparece como "pronta para concluir"; quem
  conclui é você. Meta sem métrica e sem marcos também pode ser concluída manualmente.
- **Atrasada (RN22)** é **derivada**, não gravada: prazo vencido e meta ativa ou pausada, no dia local da
  pessoa. No dia do prazo ainda não está atrasada, e atrasar nunca tira XP.
- **XP (RN21):** marco concluído **+100 XP**, meta concluída **+500 XP** (constantes em `packages/shared/src/xp.ts`,
  sujeitas a calibração). São lançamentos imutáveis no mesmo livro-caixa (`MILESTONE` e `GOAL`); desfazer o marco,
  reabrir/pausar/abandonar a meta concluída ou **excluir** meta/marco concluído gera estorno. O XP vai para a
  área da meta (sem área, só para o total). Concluir e desfazer são idempotentes.
- **Marcos só mudam em metas ativas ou pausadas** (concluir/desfazer em meta concluída ou abandonada dá 409).
- **Blocos ligados à meta (RF19):** o bloco guarda `goalId` (criar e editar "esta e as próximas"; o bloco novo da
  série herda a meta). Só metas ativas ou pausadas aceitam blocos novos.
- **Tempo investido (RN35, RF32, RF54):** soma da duração (a "foto" da conclusão) das conclusões **ativas** dos
  blocos ligados à meta, calculada na leitura. O histórico lista os blocos cumpridos, do mais recente ao mais antigo.

| Método | Rota                                                | O que faz                                         |
| ------ | --------------------------------------------------- | ------------------------------------------------- |
| GET    | `/api/goals?status=`                                | Lista as metas (filtro opcional por status)       |
| POST   | `/api/goals`                                        | Cria a meta                                       |
| GET    | `/api/goals/:id`                                    | Detalhe: marcos, progresso, atraso e horas        |
| PATCH  | `/api/goals/:id`                                    | Edita título, descrição, área, prazo e métrica    |
| DELETE | `/api/goals/:id`                                    | Exclui (devolve o XP; idempotente)                |
| PUT    | `/api/goals/:id/status`                             | Muda o status (concluir +500 XP; reabrir estorna) |
| GET    | `/api/goals/:id/history`                            | Blocos cumpridos que contaram para a meta         |
| POST   | `/api/goals/:id/milestones`                         | Adiciona um marco                                 |
| PATCH  | `/api/goals/:id/milestones/:milestoneId`            | Renomeia o marco                                  |
| DELETE | `/api/goals/:id/milestones/:milestoneId`            | Remove o marco (estorna se concluído)             |
| POST   | `/api/goals/:id/milestones/:milestoneId/completion` | Conclui o marco (+100 XP, idempotente)            |
| DELETE | `/api/goals/:id/milestones/:milestoneId/completion` | Desfaz a conclusão do marco (estorno)             |

Telas: **Metas** (`/metas`: filtro por status, progresso, selo "Atrasada", horas) e o detalhe (`/metas/:id`:
marcos com check, valor atual, status, tempo investido e histórico, comemoração ao concluir). O formulário de
bloco ganhou o campo "Meta (opcional)" e o painel da ocorrência mostra a meta.

## Calendário de eventos (Marco 2b)

Um **evento** é algo que acontece numa data (consulta, viagem, aniversário, prazo). Diferente de um bloco, que é um
compromisso de tempo seu, **evento não rende XP (RN23)**, não se conclui e não entra no streak.

- **Campos:** título, data civil, hora opcional (sem hora = "dia todo"), categoria (compromisso, aniversário,
  consulta, viagem, prazo, outro), área opcional, notas e **lembrete** (`remindBeforeMin`).
- **Lembrete (RF36, RN24):** padrão **1 dia antes**; opções: sem lembrete, no horário, 15 min, 1 h, 1 dia e 2 dias
  antes. Evento **sem hora só aceita lembrete em dias** (1 ou 2): não há horário para antecipar. Ao editar, a regra vale
  para o resultado final (tirar a hora de um evento com lembrete de 1 h dá 400, a menos que o lembrete também mude).
- **Só guarda o lembrete:** quem dispara a notificação é o Marco 2c, que lê `remindBeforeMin` e a data/hora do evento.
- Sem recorrência nesta versão. A hora é de relógio no fuso da pessoa (RN37), como nos blocos.
- Consulta por **período** de datas civis (inclusive), de no máximo **93 dias** (cabe o mês com as semanas vizinhas).

| Método | Rota                    | O que faz                                       |
| ------ | ----------------------- | ----------------------------------------------- |
| GET    | `/api/events?from=&to=` | Eventos do período, em ordem cronológica        |
| POST   | `/api/events`           | Cria um evento                                  |
| GET    | `/api/events/:id`       | Detalhe do evento                               |
| PATCH  | `/api/events/:id`       | Edita (valida o lembrete contra o evento final) |
| DELETE | `/api/events/:id`       | Exclui (idempotente)                            |

Telas: faixa de **eventos no topo da grade da Semana** (RF35; no celular, os do dia aberto no topo da lista), a visão
**mensal** em `/calendario` (RF34: navegação entre meses, até 2 eventos por dia e "+N mais", pontos coloridos no
celular, lista do dia escolhido) e os eventos do dia na tela **Hoje** como informativos.

## Glossário (para quem vem de Java/Spring)

| Termo                         | O que é                                                                                                                                                                                                                               | Equivalente em Java                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| **Lint** (`pnpm lint`)        | Analisa o código **sem executar**: acusa `import` sobrando, variável não usada, formatação fora do padrão. Não testa se o programa funciona.                                                                                          | Checkstyle / SpotBugs / Sonar + formatter    |
| **Teste unitário**            | Executa uma função isolada e confere o resultado.                                                                                                                                                                                     | JUnit                                        |
| **Teste e2e** (ponta a ponta) | Sobe a API de verdade, com banco, e faz requisições HTTP.                                                                                                                                                                             | `@SpringBootTest` + MockMvc / Testcontainers |
| **Cobertura**                 | % das linhas que os testes executaram. Não diz se alguém **conferiu o resultado**.                                                                                                                                                    | JaCoCo                                       |
| **Mutação / mutante**         | Técnica para saber se os testes são bons: **estraga-se o código de propósito** (o _mutante_) e roda-se os testes. Se algum falha, o mutante foi **morto** (bom); se todos passam, **sobreviveu** (existe um bug que ninguém notaria). | PIT (Pitest)                                 |
| **Mutante equivalente**       | Mudança que não altera o comportamento visível; não indica teste fraco.                                                                                                                                                               |                                              |
| **Migration**                 | Arquivo versionado que altera o banco.                                                                                                                                                                                                | Flyway / Liquibase                           |
| **Schema (Zod)**              | Descreve e valida o formato dos dados, e gera o tipo TypeScript.                                                                                                                                                                      | Bean Validation (`@Valid`) + DTO             |
| **Guard**                     | Barra a requisição antes do controller (autenticação).                                                                                                                                                                                | Filtro do Spring Security                    |
| **CI**                        | Roda lint, testes e build a cada push.                                                                                                                                                                                                | Pipeline (Jenkins/GitHub Actions)            |
| **Domínio puro (`domain/`)**  | Regras de negócio sem Nest nem banco; fáceis de testar.                                                                                                                                                                               | Classes de domínio sem Spring                |

## Testes

`pnpm test` roda unitários (com meta de cobertura do domínio) e e2e. Os e2e da api usam um **banco separado** (`<nome>_test`, criado e
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
