# LifeXP

Planejador semanal gamificado e multiusuário. Cada pessoa organiza a semana em blocos por área da
vida, cumpre os blocos, ganha XP e evolui.

> Status: **Marco 4d (push no celular e relatório semanal)**, **4c (conquistas, títulos e recompensas reais)**, **4b (radar e coringa)**, **Marco 4a (quest semanal)**, **Marco 3b (notas)**, **3c (revisão semanal)** e **3a (sessões e conta)** sobre o **Marco 2e** (blocos em vários dias da semana, com fim) sobre o **Marco 2d (extras)**: arrastar e soltar na grade, histórico de XP e recuperação de senha. Com 2a
> (metas), 2b (eventos) e 2c (notificações), a **fase 2 está completa**, sobre o **Marco 1** (PWA, streak, Hoje/XP,
> blocos/Semana, perfil/áreas, autenticação, fundação).

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

### Relatório semanal (Marco 4d, RF47)

Na **Revisão**, a seção **"Relatório da semana"** resume o que foi planejado e cumprido de segunda a domingo, gerado no backend a cada
leitura (nada é gravado: editar um bloco ou desfazer dentro do prazo aparece na próxima abertura).

| Método | Rota                                | O que faz                                                     |
| ------ | ----------------------------------- | ------------------------------------------------------------- |
| GET    | `/api/reports/weekly?weekStart=`    | O relatório (a semana atual por padrão; semana futura dá 400) |
| GET    | `/api/reports/weekly.md?weekStart=` | O mesmo em **Markdown**, como arquivo para baixar             |

- **Conteúdo:** blocos (planejados, cumpridos, pulados, ainda em aberto) e **aderência** (blocos, nunca minutos nem XP: RN40-RN42); tempo
  cumprido; XP **líquido** (ganhos e devolvidos por desfazer, total e por área; o bônus da quest entra como "Sem área"); aderência por
  área (área sem blocos = "sem dados", nunca zero); a **quest** da semana; **streak** no fim da semana e o **coringa** daquela semana;
  conquistas desbloqueadas, marcos e metas concluídos e o melhor dia.
- **Mesmas regras do radar e do streak:** pular não pune; o que ainda dá tempo de concluir (hoje e ontem) vira **"em aberto"** e não pesa
  na aderência; o que ainda vai acontecer não entra. XP e conquistas são da semana **no fuso da pessoa**.
- **Aviso "relatório pronto":** toda **segunda-feira, na hora do resumo do dia**, a varredura gera (uma vez, `report:<semana>`) um aviso
  do relatório da semana que acabou, no sino e no push. Semana sem nenhum bloco contado não gera aviso; dá para desligar em
  Configurações ("Relatório da semana"). Na segunda de manhã o domingo ainda está dentro do prazo, então o número do aviso conta só
  o que já fechou; abrir o relatório mostra o estado atual.
- **Markdown seguro:** nomes de área, metas e marcos são escapados; o arquivo se chama `lifexp-relatorio-<segunda>.md`.

### Push no celular (Marco 4d, RF41)

Os mesmos avisos do sino (lembrete de bloco e de evento, resumo do dia, relatório) podem chegar como **notificação do celular**, mesmo com
o app fechado, por **Web Push com chaves VAPID**. **Desligado até você configurar as chaves.**

| Método | Rota                      | O que faz                                                     |
| ------ | ------------------------- | ------------------------------------------------------------- |
| GET    | `/api/push/config`        | O push está ligado neste servidor? Traz a chave pública VAPID |
| GET    | `/api/push/subscriptions` | Quantos aparelhos da pessoa estão inscritos                   |
| POST   | `/api/push/subscriptions` | Inscreve este aparelho (até 10)                               |
| DELETE | `/api/push/subscriptions` | Cancela a inscrição deste aparelho (idempotente)              |
| POST   | `/api/push/test`          | Envia um aviso de teste aos aparelhos (limitado por IP)       |

**Como ligar (local ou produção):**

1. `pnpm --filter @lifexp/api push:keys` gera o par de chaves. Copie as linhas para `apps/api/.env` (nunca versione):
   `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT` (`mailto:voce@exemplo.com` ou `https://seusite`). As **duas** chaves vêm
   juntas ou nenhuma; a chave privada é segredo, e **trocar o par invalida as inscrições** (cada aparelho precisa ativar de novo).
2. Reinicie a API. Em **Configurações > Avisos no celular**, clique em **Ativar neste aparelho** (o navegador pede a permissão) e use
   **Enviar teste**.

- **Privacidade:** a mensagem é **criptografada de ponta a ponta** com as chaves do aparelho (RFC 8291); o serviço de push do navegador
  (Google, Mozilla, Apple) só vê texto cifrado. O endereço da inscrição é segredo: nunca vai para log nem para a exportação de dados
  (só o host aparece nos logs).
- **Segurança (SSRF):** o servidor só envia para endereços de **serviços de push conhecidos** (`fcm.googleapis.com`,
  `push.services.mozilla.com`, `notify.windows.com`, `push.apple.com`); `https` obrigatório, sem usuário/senha nem porta diferente de 443.
  Qualquer outro host é recusado (400), e o banco também confere `https`.
- **Envio:** junto da varredura por minuto, sob a mesma trava de banco. Só para quem **ligou o push** e tem aparelho inscrito; aviso já
  lido no app, agendado para o futuro ou com mais de **30 min** não vira push. Cada aviso tem até **3 tentativas**; inscrição que o
  navegador cancelou (404/410) é apagada sozinha. Sem as chaves VAPID, nada é enviado nem tentado.
- **Aparelhos:** cada navegador/aparelho é uma inscrição (até 10 por pessoa); o mesmo aparelho que entra em outra conta passa a pertencer
  a ela. No **iPhone/iPad** (iOS 16.4+) o push só funciona com o app **instalado na Tela de Início** e aberto por ele.
- **Toque no aviso:** abre o destino certo (bloco na Semana, calendário, Hoje ou Revisão); só caminhos do próprio app são aceitos.

### Conquistas, títulos e recompensas reais (Marco 4c)

| Método | Rota                      | O que faz                                                          |
| ------ | ------------------------- | ------------------------------------------------------------------ |
| GET    | `/api/achievements`       | As 8 conquistas do catálogo: desbloqueadas, bloqueadas e progresso |
| GET    | `/api/rewards`            | As recompensas da pessoa (mais novas primeiro)                     |
| POST   | `/api/rewards`            | Cadastra uma recompensa com o gatilho (até 50)                     |
| PATCH  | `/api/rewards/:id`        | Edita nome e descrição (o gatilho **não** muda)                    |
| POST   | `/api/rewards/:id/redeem` | Resgata uma recompensa já desbloqueada (idempotente)               |
| DELETE | `/api/rewards/:id`        | Exclui                                                             |

- **Conquistas (RF23):** catálogo fixo no código (`@lifexp/shared`); o banco só guarda quais foram desbloqueadas. São **permanentes**:
  desfazer uma conclusão depois não retira nenhuma (recompensar, nunca punir). Desbloqueiam **na mesma transação** de concluir
  bloco, concluir marco/meta e cumprir a quest, e o resultado traz `achievementsUnlocked`. Quem já merecia antes recebe na **próxima
  ação** (retroativo). Catálogo: _Primeiro passo_ (1º bloco), _Semana completa_ (1ª quest), _Constante_ (7 dias de streak),
  _Inabalável_ (30), _Equilibrado_, _100 horas_, _Sonho realizado_ (1ª meta) e _Descanso merecido_ (10 blocos de Descanso).
- **Adaptações da sugestão dos requisitos (decisões de produto):** _100 horas_ vale para **qualquer área** (6.000 min cumpridos numa
  mesma área), não só Código, porque as áreas são livres; _Equilibrado_ = na mesma semana, **todas as áreas ativas** (mínimo 2) tiveram
  bloco planejado e cada uma cumpriu ao menos **80%** (a mesma conta da quest, por área; pular não conta); _Descanso_ é a área padrão
  com esse nome (renomeá-la tira o papel; limitação). Streak usa o **melhor** da história.
- **Títulos (RF23):** `levelTitle(nível)` em `@lifexp/shared` (Aprendiz, Explorador, Aventureiro, Veterano, Mestre, Lenda), exibido
  na ficha. Sem tabela.
- **Recompensas reais (RF25):** o prêmio é da própria pessoa (ex.: "Jantar no japonês"). Gatilhos: **nível geral**, **dias de streak**,
  **XP total** ou **uma conquista**. O instante em que o gatilho é atingido fica em `reachedAt` e **não some** se o streak cair depois;
  o resgate é sempre decisão da pessoa (`available` → `redeemed`). Um gatilho que já valia na criação nasce desbloqueado. O resultado
  de concluir traz `rewardsReached`. O gatilho é imutável (para trocar, exclua e crie outra). Máximo de 50 por pessoa (409, também
  com pedidos simultâneos).
- **Segurança:** tudo filtrado pelo dono (alheio = 404); `strictObject` por tipo de gatilho (RS07); CHECKs no banco para a forma do
  gatilho, faixas, chaves de conquista e `redeemedAt ≥ reachedAt`; entram na exportação e na exclusão da conta (RS15).
- Telas: `/conquistas` (cartões com barra de progresso nas numéricas), `/recompensas` (agrupadas em prontas, em andamento e resgatadas),
  atalhos e título na ficha do painel; avisos (toasts) ao desbloquear.

### Radar de equilíbrio (Marco 4b)

Na tela inicial, **"Equilíbrio das áreas"**: a aderência de cada área nas últimas 4 semanas (28 dias terminando hoje).

| Método | Rota           | O que faz                                                    |
| ------ | -------------- | ------------------------------------------------------------ |
| GET    | `/api/balance` | Por área ativa: blocos planejados, concluídos e a nota 0-100 |

- **Nota = blocos concluídos ÷ planejados (RN41).** Conta **blocos**, nunca XP (RN40) nem minutos (RN42): uma leitura de 15 minutos
  pesa o mesmo que um treino de 10 horas, então rotinas curtas não parecem abandonadas.
- **Mesmas regras do streak:** pular tira o bloco da conta; o que ainda dá tempo de concluir (hoje e ontem) só entra quando é
  concluído (o que não foi concluído só vira "planejado" depois que a janela de conclusão fecha, em `settledThrough`).
- **Área sem blocos no período = sem nota** (`score: null`, "sem dados"), nunca zero: não é abandono. Área arquivada sai do radar.
  Sem nenhum bloco em nenhuma área, a seção nem aparece.
- Sem tabela: recalculado a cada leitura (`BalanceService`, regra pura em `gamification/domain/balance.ts`), com o histórico de
  ocorrências compartilhado com o streak (`OccurrenceHistoryService`, que só calcula as semanas necessárias).
- Front: radar em **SVG sem biblioteca** (`features/balance`), com a lista de barras ao lado como versão acessível (o desenho é
  `aria-hidden`); com menos de 3 áreas só a lista aparece.

### Quest semanal (Marco 4a)

Na tela **Hoje**, um cartão mostra a **quest da semana**: cumprir **80%** dos blocos planejados rende um **bônus de 20%** do XP dessa semana.

| Método | Rota         | O que faz                                                                           |
| ------ | ------------ | ----------------------------------------------------------------------------------- |
| GET    | `/api/quest` | A quest da semana atual (ou de `?weekStart=` uma segunda-feira): progresso e faixas |

- **Snapshot (RN18):** na primeira consulta da semana (ou pelo agendador, a cada 10 minutos) a API congela **quais blocos** entram na
  quest. Bloco criado depois **não entra** (não dá para "turbinar" a quest no meio da semana). Só há quest se a semana tinha algo
  planejado. O snapshot é idempotente, mesmo com consultas simultâneas.
- **Pular não pune:** bloco pulado (ou cuja série terminou) **sai da conta**: a meta de 80% se recalcula sobre os que restam. Se todos
  forem pulados, a quest só fica sem cobrança.
- **Faixas 80/90/100% (RN34):** só feedback visual positivo, sem XP extra e sem punição. O XP vem do bônus único de 20%.
- **Bônus no mesmo ledger (RN30):** ao concluir o bloco que cumpre a meta, o lançamento do bônus (`type QUEST`, sem área) entra **na
  mesma transação** da conclusão, e o resultado traz `questBonusXp`. Ao **desfazer** e a quest deixar de estar cumprida, o bônus é
  **estornado** (`questBonusReverted`) e a quest volta a "em andamento". O bônus **fica congelado** no valor dado: pular um bloco
  depois de cumprir não o muda.
- **Histórico e exportação:** o bônus aparece no histórico de XP (filtro "Quests") e a quest entra na exportação de dados da conta.
- **Limitações conhecidas:** (1) editar "esta e as próximas" no meio da semana troca o `blockId` das ocorrências seguintes, que saem
  da quest; (2) semanas passadas anteriores ao recurso **não ganham** quest retroativa; (3) o bônus é liquidado ao concluir/desfazer e
  ao consultar a **semana atual**; pular/restaurar sozinhos só o acertam na próxima consulta ou no agendador.
- Configuração: `QUESTS_SCHEDULER` (liga/desliga o agendador; desligado nos testes e2e).

### Notas (Marco 3b)

Tela **Notas** (`/notas`): anotações em **markdown**, com tags, busca, vínculo opcional e fixar no topo.

| Método | Rota              | O que faz                                                                       |
| ------ | ----------------- | ------------------------------------------------------------------------------- |
| GET    | `/api/notes`      | Lista (fixadas primeiro), com `q` (busca), `tag`, filtro por vínculo e `before` |
| GET    | `/api/notes/tags` | As tags da pessoa com a quantidade de notas de cada uma                         |
| POST   | `/api/notes`      | Cria                                                                            |
| GET    | `/api/notes/:id`  | Uma nota, com o texto completo                                                  |
| PATCH  | `/api/notes/:id`  | Edita só o que veio (inclusive fixar e vincular; `link: null` desvincula)       |
| DELETE | `/api/notes/:id`  | Exclui                                                                          |

- **Campos:** título (até 200), texto em markdown (até 20 mil caracteres), até **10 tags** e fixada. Tags são normalizadas
  (`#Saúde Mental` vira `saúde-mental`: minúsculas, sem `#`, sem repetir; letras com acento valem).
- **Vínculo opcional com UM alvo (RF44):** área, meta, evento ou bloco, sempre da própria pessoa (alvo alheio responde 404). Se o alvo
  for excluído, a nota **continua**, só sem vínculo. O atalho **"Anotar"** abre o editor já vinculado: na tela da meta, no painel do
  evento e no painel da ocorrência de um bloco; a meta mostra **"Notas"** com as dela.
- **Busca (RF43):** no título e no texto, sem diferenciar maiúsculas; `%` e `_` são buscados como texto (o Prisma não os escapa, então
  escapamos). Filtro exato por tag e por vínculo. A lista traz só um **trecho** (160 caracteres, sem a sintaxe de markdown nem a URL dos
  links), nunca o texto todo.
- **Fixar (RF45):** até **20** fixadas por pessoa (409 além disso, também com pedidos simultâneos). Fixar e desafixar **não mudam** a data
  de atualização (senão desafixar uma nota antiga a jogaria para o topo). A lista é paginada por **cursor opaco** (fixadas, depois as
  atualizadas há menos tempo, desempate pelo id) (RNF08).
- **Segurança (RS10):** o servidor guarda o markdown **exatamente como veio**; a sanitização é na **renderização**. O `MarkdownView` usa
  o `react-markdown` (HTML cru aparece como texto e nunca é interpretado), o `rehype-sanitize` e regras próprias: só `http(s)` e `mailto`
  viram link (com `target=_blank` e `rel="noopener noreferrer nofollow"` nos de `http`), e **imagens nunca são carregadas** (uma imagem
  remota entregaria o IP): aparece `[imagem: texto]`. Há testes com dezenas de vetores de XSS.
- **Logs (RS14):** nada do título ou do texto vai para log nem volta numa mensagem de erro (há teste). Entra na exportação de dados (3a).

### Revisão semanal (Marco 3c)

Tela **Revisão** (`/revisao`, botão "Revisar semana" na Semana): fecha o ciclo planejar → executar → revisar.

| Método | Rota                          | O que faz                                                                  |
| ------ | ----------------------------- | -------------------------------------------------------------------------- |
| GET    | `/api/reviews/:weekStart`     | Resumo de aderência da semana, a reflexão escrita e a prioridade combinada |
| PUT    | `/api/reviews/:weekStart`     | Salva a reflexão da semana (substitui; idempotente)                        |
| GET    | `/api/reviews?limit=&before=` | Revisões já escritas, da mais recente à mais antiga (cursor = a semana)    |

- **Resumo de aderência (calculado na leitura, nunca gravado):** blocos **planejados × cumpridos**, tempo e **XP líquido da semana**,
  no total e por área, a partir das ocorrências da semana e das conclusões ativas. **Pular não é "planejado"** (RN11): o pulado
  aparece só como informativo e nunca derruba a aderência. Aderência é `cumpridos ÷ planejados`, ou **nula** (traço) quando nada foi
  planejado: não existe "0%" de nada. O texto da tela nunca culpa.
- **A semana é a do fuso da pessoa** (segunda a domingo; a janela do XP vai da meia-noite local de segunda à da seguinte, inclusive
  em semanas de horário de verão). Só dá para revisar a **semana atual e as passadas**; semana futura é 400.
- **Reflexão guiada (RF46):** "O que deu certo?", "O que travou?" e "Qual a prioridade da próxima semana?", até 2000 caracteres
  cada (texto puro). Uma revisão por pessoa e semana (única no banco, com CHECK de segunda-feira e de tamanho).
- **A prioridade volta:** na revisão de uma semana aparece, em destaque, a prioridade que você escreveu na revisão da semana
  anterior para ela. Revisão sem nenhum texto não entra no histórico. O histórico é paginado (RNF08).
- Entra na **exportação de dados** (3a) e some junto com a conta.

### Sessões e conta (Marco 3a)

Telas: **Configurações** (`/configuracoes`; `/perfil` continua funcionando e redireciona), com perfil, notificações,
**dispositivos conectados**, **exportar os dados** e **excluir a conta**.

| Método | Rota                               | O que faz                                                    |
| ------ | ---------------------------------- | ------------------------------------------------------------ |
| GET    | `/api/auth/sessions`               | Dispositivos com sessão ativa (a atual primeiro)             |
| DELETE | `/api/auth/sessions/:id`           | Encerra um dispositivo (se for o atual, equivale a sair)     |
| POST   | `/api/auth/sessions/revoke-others` | Encerra todos, menos o atual                                 |
| GET    | `/api/users/me/export`             | Baixa todos os dados da pessoa em JSON (sem credenciais)     |
| POST   | `/api/users/me/delete`             | Exclui a conta e tudo que é dela, depois de conferir a senha |

- **Uma "sessão" é um aparelho:** a família de refresh tokens (`tokenFamily`). Renovar troca o token, mas a sessão é a mesma.
  A lista mostra o aparelho ("Chrome · Windows", montado a partir do User-Agent), quando entrou e o último uso. **Não há IP**
  (RS17: identificar o aparelho sem expor dado desnecessário) e o User-Agent original nunca é devolvido.
- **O token de acesso cai na hora:** o JWT agora leva o id da sessão (`sid`) e o guard confere a cada requisição (uma consulta
  indexada) que ela está ativa. Assim **sair, encerrar um dispositivo e redefinir a senha valem imediatamente**, sem esperar os
  15 minutos do token. (Isso fecha a limitação que existia desde o 2d.) A renovação do refresh token ficou **atômica** (revoga o
  antigo e cria o novo na mesma transação): sem isso uma requisição no meio da troca levaria 401 sem motivo.
- **Sessão de outra pessoa responde 404**, igual a uma inexistente (RS06). Encerrar de novo uma sessão sua é idempotente.
- **Exportar (RF06, RS15):** um JSON versionado (`version: 1`) com uma lista por tipo de dado (áreas, atividades, blocos,
  exceções, conclusões, livro-caixa de XP, metas, marcos, eventos, avisos e preferências), lido numa única transação de leitura
  repetível. Datas civis saem como `AAAA-MM-DD` e instantes como ISO UTC. **Senhas, tokens de sessão e de recuperação nunca
  entram.** O nome do arquivo usa a data no fuso da pessoa.
- **Teste-guarda:** um teste lê o `schema.prisma` e **falha se aparecer um modelo que pertence a uma pessoa sem decisão** de
  exportá-lo (ou de excluí-lo de propósito, com o motivo). Notas, revisões e o que vier depois não ficam de fora sem ninguém notar.
- **Excluir (RS15):** pede a senha (403 se errada) e, na tela, também uma palavra digitada. É imediato e irreversível: uma única
  exclusão leva junto, em cascata, sessões, áreas, blocos, conclusões, livro-caixa, metas, eventos e avisos. Um teste confere,
  tabela por tabela, que não sobra nenhuma linha, e que os dados de outras pessoas ficam intactos. Não há período de arrependimento.
  O mesmo e-mail pode abrir uma conta nova depois. Exportar e excluir têm rate limit por IP (RS08).

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

| Método | Rota                               | O que faz                                            |
| ------ | ---------------------------------- | ---------------------------------------------------- |
| GET    | `/api/blocks/week?weekStart=`      | Ocorrências da semana (uma única consulta)           |
| POST   | `/api/blocks`                      | Cria bloco semanal ou avulso                         |
| POST   | `/api/blocks/weekly`               | Cria um bloco semanal por dia marcado (tudo ou nada) |
| PATCH  | `/api/blocks/:id`                  | Edita a partir de uma data (`from`)                  |
| DELETE | `/api/blocks/:id?from=`            | Encerra/exclui a partir de uma data (idempotente)    |
| PUT    | `/api/blocks/:id/exceptions/:date` | Pula ou altera só uma ocorrência                     |
| DELETE | `/api/blocks/:id/exceptions/:date` | Restaura a ocorrência original                       |

Telas: **Semana** (grade no desktop; abas dos dias no celular) com navegação entre semanas, criação de
blocos e um painel de ações ao clicar num bloco.

### Vários dias da semana e término da série (Marco 2e)

No formulário **Novo bloco**, "Toda semana" aceita **vários dias de uma vez** (botões Seg a Dom, com atalhos "Dias úteis" e
"Todos os dias") e um **término**: **Sem fim**, **Até uma data** ou **Por semanas** (N de 1 a 104).

- `POST /api/blocks/weekly` cria **um bloco semanal por dia marcado, na mesma transação**: ou nascem todos, ou nenhum. Todos
  compartilham atividade, meta, horário, duração, início e fim, e a resposta é a lista, de segunda a domingo.
- **Depois de criados, cada dia é um bloco independente** (editar, pular, concluir e excluir funcionam por dia, como antes).
  Não existe "grupo": para mudar o horário em todos os dias, edite um dia por vez.
- **Fim da série (`validUntil`):** opcional também em `POST /api/blocks` (um dia só). Não pode ser antes do início, e todo dia
  marcado precisa ocorrer ao menos uma vez no período (senão nasceria um bloco que nunca aparece): 400 com o motivo.
- **"Por N semanas"** são `N × 7` dias corridos a partir da data de início, então **cada dia marcado ocorre exatamente N
  vezes**, qualquer que seja o dia de início. A conversão em data final é feita na tela; a API só recebe a data.
- Editar "esta e as próximas" numa série com fim **mantém o fim**.

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
  desatualizado por construção. Vem junto em `GET /api/progress` (`streak: {current, best, lastFulfilledDate, joker}`).
- **Coringa semanal (Marco 4b, RF26, RN14):** 1 por semana (segunda a domingo), usado **automaticamente** no primeiro dia
  planejado perdido da semana (com a janela já fechada). O dia perdoado fica neutro: não quebra e também não avança. Só
  é gasto quando há sequência a proteger (um dia perdido com o streak zerado não queima o coringa) e **não acumula**: semana
  sem uso não rende dois na seguinte. Também é derivado do histórico, sem tabela: `streak.joker`
  (`{weekStart, used, usedOn}`, sempre o estado da semana atual) vem em `GET /api/progress`; pular o dia perdido devolve o coringa.

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

## Notificações (Marco 2c)

Avisos **dentro do app** (o sino no topo) e, se você quiser, o **resumo do dia por e-mail** e o **push no celular** (Marco 4d, mais abaixo).

- **O que avisa:** lembrete de **bloco** (15 min antes, configurável: 5/10/15/30/60), lembrete de **evento** (na antecedência do
  próprio evento, 1 dia antes por padrão) e o **resumo do dia** (às 07:00 locais por padrão; dia sem nada não gera aviso).
  Blocos pulados ou concluídos não avisam. O tom é de aviso, nunca de cobrança.
- **Como funciona (RN38):** `@nestjs/schedule` roda uma varredura **a cada minuto**. A decisão é uma função pura
  (`notifications/domain/notification-plan.ts`) testada com relógio falso; o serviço só lê o banco, chama a função e grava.
  Tudo é calculado no **fuso da pessoa**. A janela olha os últimos 60 minutos: se a API ficou fora do ar, a próxima varredura
  recupera os lembretes, **mas descarta** os de algo que já começou (seria "começa em 15 min" para o que já começou).
- **Idempotência (RF55, RN25):** cada aviso tem uma `dedupeKey` lógica (`block:<id>:<data original>:<antecedência>`,
  `event:<id>:<data>:<hora|all-day>:<antecedência>`, `digest:<dia>`), **única por pessoa** no banco. A gravação usa
  `createMany(skipDuplicates)`, então rodar a varredura de novo, ou em duas instâncias, nunca duplica. Editar a data/hora
  de um evento gera chave nova (o aviso acompanha a edição).
- **Várias instâncias:** a varredura roda sob `pg_try_advisory_xact_lock`: só uma instância varre por minuto (as outras
  pulam). A trava some sozinha no fim da transação, mesmo se a instância cair.
- **E-mail (RF39):** interface `Mailer` com **Resend** (se `RESEND_API_KEY` estiver definido, via HTTP, sem SDK) ou um
  **mailer de log** (dev e testes: só registra, com o endereço mascarado). Só o resumo vai por e-mail, **desligado por
  padrão**. Falhou? Tenta de novo nos minutos seguintes, até 3 vezes; resumo com mais de 3 h é descartado. A chave nunca
  vai para o repositório nem para mensagem de erro.
- **Preferências (RF40):** sem linha gravada valem os padrões; a linha nasce na primeira alteração.

| Método | Rota                              | O que faz                                              |
| ------ | --------------------------------- | ------------------------------------------------------ |
| GET    | `/api/notifications`              | Central, do mais novo ao mais antigo (cursor `before`) |
| GET    | `/api/notifications/unread-count` | Quantas não lidas                                      |
| POST   | `/api/notifications/:id/read`     | Marca como lida (idempotente)                          |
| POST   | `/api/notifications/read-all`     | Marca todas como lidas                                 |
| GET    | `/api/notification-preferences`   | Preferências (padrões se nunca alteradas)              |
| PUT    | `/api/notification-preferences`   | Altera só os campos enviados                           |

Variáveis novas (`apps/api/.env.example`): `NOTIFICATIONS_SCHEDULER` (liga a varredura), `RESEND_API_KEY` (opcional),
`MAIL_FROM` e `APP_URL` (link do e-mail); `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT` (push, Marco 4d). Em produção com Resend você precisa de conta, chave e domínio verificado; para
rodar e testar localmente, nada disso é necessário.

**Testar o e-mail de verdade (grátis):** o plano gratuito do Resend basta (na data em que escrevi: ~3.000 e-mails por mês e
100 por dia; confira em resend.com/pricing). Sem domínio verificado só dá para enviar do remetente de teste
`onboarding@resend.dev` para o e-mail da **sua própria conta**, que é exatamente o que um teste precisa. Passos:

1. Crie a conta em resend.com e uma chave de API (Settings > API Keys).
2. Em `apps/api/.env` (não versionado) coloque `RESEND_API_KEY=...` e `MAIL_FROM="LifeXP <onboarding@resend.dev>"`.
3. `pnpm --filter @lifexp/api build && pnpm --filter @lifexp/api mail:test seu@email.com`.

Para mandar a outras pessoas (produção) é preciso verificar um domínio no Resend.

Telas: **sino** no HUD com contador e a central (lista paginada, marcar como lida, "marcar todas") e as preferências em
**Perfil > Notificações**, salvas a cada mudança. O contador atualiza a cada minuto (sem WebSocket).

## Extras da fase 2 (Marco 2d)

### Histórico de XP por origem (RF53)

O livro-caixa de XP ficou legível: `/historico` mostra cada lançamento com **origem** (bloco, marco, meta ou estorno),
nome da origem, área, hora local e valor, agrupado por dia com o saldo do dia.

- `GET /api/xp/history?type=&limit=&before=`: do mais novo ao mais antigo, 20 por página (máximo 50), com cursor pelo
  id (UUID v7), como na central de notificações (RNF08). `type` filtra por `completion`, `milestone`, `goal` ou `reversal`.
- **Nome da origem sem N+1:** o lançamento guarda só o `sourceId` (sem chave estrangeira, porque aponta para tabelas
  diferentes conforme o tipo). Os nomes são buscados em lote, uma consulta por tipo; há teste que conta as consultas.
- **Origem excluída** (meta ou marco apagado): o lançamento continua no histórico, com "Meta excluída"/"Marco excluído".
- **Estorno** aparece como lançamento próprio, negativo, dizendo o que foi estornado ("Estorno de marco"), em tom neutro.
- "Quest" (citada no RF53) é da fase 4; o tipo entra no histórico quando existir.

### Recuperar a senha por e-mail (RF05)

| Método | Rota                        | Acesso  | O que faz                                                    |
| ------ | --------------------------- | ------- | ------------------------------------------------------------ |
| POST   | `/api/auth/forgot-password` | público | Envia o link de recuperação (responde 204 sempre)            |
| POST   | `/api/auth/reset-password`  | público | Troca a senha com o token do link e encerra todas as sessões |

- **Não revela se a conta existe (RS13):** o pedido responde 204 igual para qualquer e-mail, e **não espera o envio**
  (o tempo do provedor de e-mail denunciaria a conta).
- **Token (RS12):** 32 bytes aleatórios, **uso único**, válido por **30 minutos**. No banco fica só o SHA-256 (um CHECK
  recusa qualquer coisa que não seja um hash). Um pedido novo invalida o link anterior. Dois usos simultâneos do mesmo
  link: só um passa (`updateMany` condicional, o mesmo "compare-and-set" do refresh token).
- **Link com o token no fragmento** (`/redefinir-senha#token=...`): o navegador não envia o fragmento ao servidor, então o
  token não fica em log de acesso nem no `Referer`. A tela lê o token e o tira da barra de endereço.
- **Rate limit (RS08):** por IP nas duas rotas (`AUTH_RATE_LIMIT_PER_MINUTE`) e, por conta, no máximo um e-mail a cada
  2 minutos (ninguém enche a caixa de outra pessoa).
- **Ao redefinir:** todas as sessões da pessoa são revogadas e ela entra de novo com a senha nova (sem login automático).
  **Limitação conhecida:** um access token já emitido continua valendo até expirar (15 min), porque o guard não consulta
  o banco a cada requisição.
- **Logs (RS14):** nem token, nem link, nem e-mail completo. Sem `RESEND_API_KEY`, o mailer de log mostra o corpo do
  e-mail **apenas com `NODE_ENV=development`** (é assim que se abre o link em desenvolvimento); em produção, nunca.

Telas: "Esqueci minha senha" no login, `/esqueci-senha` e `/redefinir-senha`.

### Arrastar e soltar na grade (RF18)

Na grade da **Semana** (desktop), arraste um bloco para outro dia ou horário.

- Soltar é o mesmo que **"alterar só esta ocorrência"** (`PUT /api/blocks/:id/exceptions/:date` com `override`): a série
  não muda, e valem as regras do servidor (mesma semana; ocorrência concluída não se move).
- O horário encaixa de **15 em 15 minutos**; o bloco não sai da semana, das horas visíveis nem atravessa a meia-noite.
- Movimento menor que 5 px ainda é clique (abre o painel). **Esc** cancela. Concluídas e puladas não se arrastam.
- A grade muda na hora e **volta ao lugar** se o servidor recusar, mostrando o motivo.
- Sem biblioteca: Pointer Events e uma função pura (`features/blocks/dragGeometry.ts`) que converte o deslocamento em
  dia e horário. No celular (abas por dia) e por teclado, o caminho continua sendo "Alterar só esta" no painel.
  Toque não arrasta, para não brigar com a rolagem da grade.

## Observabilidade e dependências (transversais)

### Logs estruturados e jobs (RNF13)

- **Formato:** `LOG_FORMAT=json|pretty`. Sem valor, **JSON em produção** (uma linha por registro: `time`, `level`, `context`, `message`,
  `stack` e campos extras, fácil de filtrar em Railway/Datadog) e texto legível nos demais ambientes.
- **Sem dado sensível (RS14):** todo texto passa por `redact` antes de sair: e-mails viram `a***@dominio`, e `Bearer`, JWT, `password=`/`token=`,
  usuário e senha de URL de banco, caminho do endereço de push e sequências longas de hex/base64url são trocados por `[redigido]`.
  É uma rede de segurança: o código já evita logar dado de pessoa.
- **Jobs identificáveis:** a varredura de avisos (`notifications-scan`, a cada minuto) e o snapshot das quests (`quests-snapshot`, a cada 10 min)
  rodam sob o `JobMonitor`, que registra cada execução como `job_ok`, `job_failed` (com o erro redigido e cortado) ou `job_skipped` (outra
  instância tinha a trava) e nunca derruba o processo. Execução sem trabalho vai para `debug`, para não gerar ruído.
- **`GET /api/health/jobs`** (público, só nomes, instantes e contagens): `status` `ok` ou `degraded` (algum job com **3 falhas seguidas**), e,
  por job, a última execução, a última vez que deu certo e as falhas seguidas. `GET /api/health` segue sendo o "está no ar".

### Desempenho (RNF04)

`pnpm --filter @lifexp/api perf:smoke` (com a API no ar) cria uma conta descartável com ~1 ano de séries semanais e centenas de conclusões, mede as
rotas das telas principais (Hoje, progresso, Semana, quest, radar, conquistas, histórico, relatório, revisão) e apaga a conta. Falha se algum **p95**
passar de **300 ms**. Medido em desenvolvimento (Postgres local), o pior caso foi `GET /progress` com **p95 ≈ 75 ms** (o streak é recalculado do histórico a cada
leitura, ver Marco 1e): a margem é grande, e a decisão de **não cachear** o streak continua valendo.

### Dependências verificadas (RS16)

- **CI:** `pnpm audit --audit-level=high` roda antes do lint e **falha com vulnerabilidade alta ou crítica**.
- **Dependabot** (`.github/dependabot.yml`): npm toda segunda (atualizações menores e de correção agrupadas num PR; as maiores, em PR próprio) e
  GitHub Actions todo mês.
- **`pnpm.overrides`** no `package.json` raiz fixa `mysql2` e `deepmerge-ts` em versões corrigidas: eles chegam só pelo CLI do Prisma (que usa
  `mysql2` no servidor de desenvolvimento dele; o app usa Postgres). Quando o Prisma subir essas versões sozinho, os overrides podem sair.

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
