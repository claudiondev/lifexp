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

## Autenticação (decisões do 1a)

- Access JWT 15 min no header `Authorization` (memória no front, nunca localStorage). Refresh token opaco
  (32 bytes), 7 dias, cookie `httpOnly` + `SameSite=Strict` + `Path=/api/auth`; no banco só o SHA-256
  (`Session`, com `tokenFamily`). Rotação a cada uso; reuso de token revogado revoga a família (RS04).
- Sem Passport: `JwtAuthGuard` global próprio (deny by default), `@Public()` e `@CurrentUser()`.
  `userId` sempre do token. Senha com argon2id (8 a 72 caracteres).
- Login responde sempre 401 "Credenciais inválidas" (RS13). Cadastro com e-mail repetido responde 409.
- Front: `apiClient` com refresh single-flight + Web Locks entre abas (o refresh é de uso único).
- e2e da api: banco `<nome>_test` separado, criado e migrado pelo `test/global-setup.ts`.
- `ConfigModule.forRoot()` lê o env no import do `AppModule`: para testes com env diferente, defina o env
  antes e importe o módulo dinamicamente.

## Perfil, áreas e atividades (decisões do 1b)

- Áreas padrão no cadastro (RF08): lista em `areas/domain/default-areas.ts`, gravada na MESMA transação do
  usuário (`seedDefaultAreas`). Cada área nasce com uma atividade de mesmo nome (peso 1,0).
- Cor e ícone de área, e o emblema do perfil, são CHAVES de listas fixas em `@lifexp/shared`
  (`AREA_COLORS`, `AREA_ICONS`, `AVATAR_KEYS`); o front resolve a chave em cor/ícone por tema.
- Arquivar, nunca excluir (RN27). Arquivar área esconde as atividades dela sem alterá-las; atividade de área
  arquivada não restaura até a área voltar. Nome único entre ativos, sem diferenciar maiúsculas (409),
  checado no service (o Prisma não tem índice único parcial).
- Recurso de outra pessoa responde 404, igual a inexistente (RS06). Schemas de criação/edição usam
  `z.strictObject`: campos extras viram 400 (RS07); atividade não muda de área.
- `userId` da `Activity` é repetido de propósito (filtro por dono sem join); o service garante que bate com o da área.
- Front: TanStack Query; o cache é LIMPO ao entrar, sair e quando a sessão expira (dados de uma pessoa nunca
  aparecem para outra). Atividades vêm numa chamada só e são agrupadas por área no cliente.

## Blocos e Semana (decisões do 1c)

- `Block` é TEMPLATE (`weekly`/`once`, `weekday` 1=segunda..7, `startTime` "HH:mm", `durationMin`, `validFrom`/
  `validUntil`); `BlockException` (`skip`|`override`) é única por (blockId, occurrenceDate), RN32. Nada de
  ocorrência futura no banco (RN31): `computeWeekOccurrences` (puro, `blocks/domain`) calcula a semana.
- Datas civis são `DATE`/`AAAA-MM-DD` (sem fuso, convertidas SEMPRE em UTC); horário é hora de relógio.
  `todayIn(timezone)` decide "hoje". Helpers de datas ficam em `@lifexp/shared/civil-date` (api e web).
- Semana começa na SEGUNDA. Bloco não atravessa a meia-noite (duração 15 min a 12 h, passo 5). Sobreposição
  permitida (`layoutDay` põe lado a lado). Mover uma ocorrência só dentro da mesma semana (regra e CHECK no banco).
- Editar/excluir "esta e as próximas" = `planEdit`/`planDelete` (puros, `series-split`): com passado, encerra a
  série em `from-1` e cria nova (exceções futuras acompanham, a menos que o dia da semana mude); sem passado,
  edita no lugar. **O passado nunca muda.** Excluir série só encerra (a linha fica; é idempotente). Bloco avulso
  é removido (no 1d, se houver Completion, converter em exceção skip em vez de apagar).
- Edições e exceções serializam por bloco com `SELECT ... FOR UPDATE` (`lockAndLoad`).
- A consulta da semana é UMA query (`relationLoadStrategy: 'join'` + preview `relationJoins`); há teste que
  conta queries.
- Restrições CHECK no banco (migration `blocks`) repetem as regras da aplicação como defesa em profundidade.
- Front: grade (desktop) x abas/agenda (celular) decididas por `useIsDesktop` (JS), não por CSS, para não duplicar
  blocos no DOM. Cartão da grade é `<button>`. Painel de ações em `OccurrenceDialog`.

## Hoje, XP e níveis (decisões do 1d)

- XP = `round(durationMin × xpWeight × multiplicador)`, teto 300; curva `xpToReachLevel(n)=round(100·(n−1)^1.5)`
  em `packages/shared/src/xp.ts` (isolada para recalibrar). Regras puras em `gamification/domain/`
  (`completion-window`, `xp-ledger`).
- Ledger `XpTransaction` imutável (trigger bloqueia UPDATE): COMPLETION positivo ≤300, REVERSAL negativo
  apontando ao original (um por lançamento). Caches `User.cachedTotalXp` e `AreaProgress` saem do ledger na mesma
  transação (invariante testada: soma do ledger == caches); `CacheRebuildService.check/rebuild`.
- `Completion` única por (blockId, occurrenceDate), reaproveitada ao refazer, com foto (área, duração, XP). O
  estorno usa a área da foto, não a da atividade atual. `createdAt` do ledger vem do `Clock`, não do banco.
- Janela: início do bloco até 23:59:59.999 do dia local seguinte. Concluir/desfazer idempotentes.
- Travas: pessoa `FOR NO KEY UPDATE` e depois bloco `FOR UPDATE` (FOR UPDATE na pessoa deu deadlock com edição).
- `Clock` injetável (`CLOCK`); testes usam `FakeClock`. Ocorrência concluída bloqueia pular/alterar (409);
  `planEdit`/`planDelete` conhecem conclusões (movem com a série; 409 quando ficariam órfãs).
- Front: `useProgress` (chave `progress`), `useToday` (refaz a cada 60 s), `useCompletionMutations` invalida
  today + progress + blocks. Subida de nível comemora (só recompensa). Streak fica para o 1e.

## Streak (decisões do 1e)

- Regra pura em `gamification/domain/streak.ts` (`buildStreakDays` agrupa ocorrências por dia EFETIVO,
  ignorando pulados; `computeStreak` percorre os dias planejados). Dia sem bloco = neutro; um dia planejado
  sem conclusão só quebra quando fecha (`date <= hoje-2`); hoje e ontem em aberto são neutros.
- SEM cache/tabela: `StreakService.getStreak` recalcula do histórico (semanas desde o primeiro bloco) a cada
  `GET /progress`. Decisão: o streak muda com o tempo e com edições (pular bloco), então cache seria sempre
  suspeito. Se virar gargalo, cachear por (usuário, dia) é o caminho.
- `best` também é derivado do histórico: desfazer conclusão antiga pode reduzi-lo (é coerente com a história).
- Front: `useCharacter` traz `streakDays`/`streakBest`; `useBlockMutations` invalida `progress` (pular/editar
  bloco muda dias planejados). Texto nunca culpa: dia livre = "seu streak não muda". Coringa é fase 4.

## PWA (decisões do 1f)

- `vite-plugin-pwa` (generateSW, `registerType: 'prompt'`); configuração em `apps/web/pwa.config.ts` (manifesto +
  Workbox), testada por `pwa.config.test.ts`. `scripts/check-pwa.mjs` roda no fim do `pnpm build` e valida o
  que foi realmente gerado.
- Regra inegociável: **`/api/*` é NetworkOnly** e fica fora do `navigateFallback` (denylist). Nunca cachear
  resposta da API (token só em memória; dados mudam sempre). Sem offline de dados.
- Ícones: `scripts/icon.svg` -> `pnpm icons` (sharp, devDependency); PNGs versionados.
- Front: `UpdatePrompt` (aviso de versão nova, em `App`), `InstallAppCard` (Perfil, via `beforeinstallprompt`).
  Push do PWA é fase 4. Registro do SW só foi verificado por testes e pelo build; vale testar num Chrome real.

## Metas (decisões do 2a)

- Modelos `Goal` e `Milestone` (migration `goals` + `xp_ledger_goal_types`; o `ADD VALUE` do enum e o CHECK que usa
  os valores novos ficam em migrations separadas, senão o Postgres recusa o uso na mesma transação). Status no banco
  em maiúsculas (`ACTIVE`...) e na API em minúsculas. `Block.goalId` (SetNull ao excluir a meta).
- Regras puras em `goals/domain/goal-rules.ts` (`goalProgress`, `isOverdue`, `statusXpEffect`, `isReadyToComplete`).
  "Atrasada" é derivada (nunca gravada). A meta nunca conclui sozinha.
- XP: `XpLedgerService` (gamification) é o único escritor do livro-caixa e dos caches (`credit`, `reverse`,
  `lockUser`); conclusão de bloco, marco e meta passam por ele. Tipos `COMPLETION`/`MILESTONE`/`GOAL`/`REVERSAL`;
  `sourceId` aponta para Completion, Milestone ou Goal. Meta sem área credita só o total. Excluir meta/marco
  concluído estorna o XP (senão criar e apagar renderia XP de graça).
- Concorrência: pessoa travada com `FOR NO KEY UPDATE` em toda operação de XP. Vincular bloco a meta usa
  `FOR KEY SHARE` na meta (`lockGoalForLink`) para a exclusão da meta não deixar o vínculo apontar para o vazio
  (erro 500 por chave estrangeira); o teste de estresse em `goals-blocks.e2e-spec.ts` cobre.
- Tempo investido é calculado na leitura (SQL com `SUM(durationMin)` das conclusões ativas); `Occurrence` e `Block`
  carregam `goalId`; `planEdit` herda a meta na série nova e aceita trocar/desvincular.
- Front: `features/goals` (`goalsApi`, `useGoals`, `GoalCard`, `GoalFormDialog`, `MilestoneList`,
  `GoalCelebration`, `GoalSelect`); mutações invalidam `goals` + `progress` + `today`. Subida de nível espera a
  comemoração da meta fechar. `test-setup.ts` agora simula `ResizeObserver` (Radix Switch em formulário).

## Eventos (decisões do 2b)

- `CalendarEvent` (migration `calendar_events` com CHECKs: título, categoria, hora `HH:mm`, antecedências 0/15/60/1440/2880
  e "sem hora só em dias"). Categoria é `String` + CHECK (como cor de área), não enum do Prisma. Não gera XP (RN23).
- Regras puras em `@lifexp/shared/event.schema.ts` (usadas por API e front): `isReminderAllowed`, `sortEvents` (por data;
  no dia, "dia todo" primeiro e depois por hora), `groupEventsByDate`, `DEFAULT_REMIND_BEFORE_MIN` (1 dia, RN24).
  Lição: refinamentos do Zod 4 rodam mesmo com campo inválido; `addDays` com data inválida lança, então a validação de
  período guarda com `isValidCivilDate`.
- API só guarda `remindBeforeMin`; o disparo é do 2c. Período máximo da listagem: 93 dias (`MAX_EVENT_RANGE_DAYS`).
  Atualização valida o lembrete contra o resultado final (hora + lembrete), não só contra os campos enviados.
- Front: `features/events` (`EventChip`, `EventDialog` de detalhes/exclusão, `EventFormDialog`, `monthGrid`,
  `eventAppearance` reaproveita as cores das áreas). `useEvents` só consulta com período definido (`enabled`).
  Falha ao carregar eventos nunca derruba a Semana nem a tela Hoje. O mês fica na URL (`?mes=AAAA-MM`).

## Notificações (decisões do 2c)

- Regra pura em `notifications/domain/notification-plan.ts` (`planNotifications`, `scanWindow`, chaves de idempotência,
  textos); `NotificationGenerator` (lê blocos via `BlocksService.getWeek`, eventos e preferências) grava com
  `createMany(skipDuplicates)` sobre `@@unique([userId, dedupeKey])`. Janela de 60 min; lembrete de algo que já começou é
  descartado (exceção: "no horário" tolera 5 min). Evento de dia todo avisa na hora do resumo, N dias antes.
- `NotificationsScheduler` (`@Cron` por minuto) roda tudo dentro de `$transaction` com `pg_try_advisory_xact_lock`; com
  `NOTIFICATIONS_SCHEDULER=false` (testes) o minuto não faz nada e os testes chamam `generator.scanUser(...)`/`runOnce`.
  Lição: `pg_advisory_xact_lock` retorna `void`, e o Prisma não lê `void` no `$queryRaw` (use `$executeRaw`).
- E-mail: `Mailer` (token `MAILER`) com `ResendMailer` (fetch, sem SDK) e `LogMailer`; `DigestEmailService` só envia o
  DIGEST de quem ligou `digestEmailEnabled`, no máx. 3 tentativas, só se `scheduledFor` for recente (NÃO use `createdAt`:
  é relógio do banco). A exclusão entre instâncias vem da trava da varredura, não de um "claim" no banco. `FakeMailer` nos
  testes (`createTestApp({ mailer })`).
- API: id UUID v7 serve de cursor (`before`); aviso alheio = 404; `GET/PUT /notification-preferences` com padrões em memória.
- Front: `features/notifications` (`NotificationBell` no `AppShell`, `NotificationPreferencesCard` no Perfil); contador
  consultado a cada 60 s, lista só com o painel aberto. `StreakFlame` não quebra linha (o sino apertou o HUD).

## Extras da fase 2 (decisões do 2d)

- Histórico de XP (RF53): `GET /xp/history` (`XpHistoryService`, regra pura em `gamification/domain/xp-history.ts`), cursor
  pelo id como nas notificações. `sourceId` não tem FK: nomes resolvidos em lote, uma consulta por tipo, sempre com o dono
  no filtro. Origem excluída = `sourceLabel` nulo. Front: `features/xp-history`; a chave do histórico fica DENTRO de
  `progressKey` (`['progress','history']`), então tudo que invalida o progresso invalida o histórico.
- Recuperar senha (RF05): `PasswordResetToken` (só SHA-256, CHECK de hash e de validade <= 1 h), regra pura em
  `auth/domain/password-reset.ts` (30 min, intervalo de 2 min por conta), `PasswordResetService`. O pedido trava a pessoa
  (`FOR NO KEY UPDATE`), responde 204 sempre e NÃO espera o `mailer.send`. Redefinir = claim atômico (`updateMany` com
  `usedAt: null`), troca o hash, revoga todas as sessões e encerra os outros tokens. Token no FRAGMENTO do link. O access
  JWT já emitido vale até expirar (limitação aceita). `LogMailer(showBody)` só mostra o corpo com `NODE_ENV=development`.
- Arrastar e soltar (RF18): só front. `dragGeometry.ts` (puro: encaixe de 15 min, limites da semana e das horas visíveis),
  ouvintes de Pointer Events na `window` dentro do `WeekGrid` (estado num ref espelhado em state), `useMoveOccurrence`
  (otimista, desfaz no erro). O PUT da exceção SUBSTITUI a exceção: sempre mandar data, horário e duração juntos.
  Toque e botão direito não arrastam; concluída/pulada também não. Teste: `WeekPage.drag.test.tsx` (mocka
  `getBoundingClientRect`, porque o jsdom não calcula layout).
- Lição de teste: a trava da varredura de notificações é global ao banco de teste; suítes em paralelo disputam por ela.
  Use `scanWhenFree` (helpers) e nunca compare com contagens globais.

## Blocos em vários dias e fim da série (decisões do 2e)

- `POST /blocks/weekly` (`BlocksService.createWeekly`, schema `createWeeklyBlocksSchema`): um `Block` semanal por dia, TUDO NA
  MESMA transação (atividade validada antes; meta travada com `FOR KEY SHARE` como no `create`). Decisão: os dias NÃO ficam
  agrupados (sem "grupo de blocos"); cada um é um bloco independente, então editar/excluir/pular continua por dia. Não mexeu em
  `series-split`. `POST /blocks` continua devolvendo um `Block` (contrato antigo) e só ganhou `validUntil` opcional.
- Regras puras em `@lifexp/shared/block.schema.ts`: `checkSeriesEnd` (fim >= início e todo dia marcado ocorre no período;
  guarda datas inválidas por causa dos refinamentos do Zod 4), `validUntilForWeeks` (`N*7-1` dias: cada dia da semana ocorre
  exatamente N vezes), `MAX_SERIES_WEEKS = 104`. Bloco avulso não tem fim (`strictObject`).
- Front: `features/blocks/seriesForm.ts` (puro: `describeWeekdays`, `firstOccurrence`, `resolveEnd`, `toggleWeekday`), formulário em
  `BlockFormDialog`. A data de início acompanha o dia mais cedo marcado na semana da tela até a pessoa escolher uma própria.
  Weekly sempre vai por `/blocks/weekly`; avulso continua em `/blocks`.
- Lição de teste: o roteiro de mutantes agora confere o ESTADO BASE antes de injetar (se a suíte já falha, "morto" não prova nada).

## Sessões e conta (decisões do 3a)

- Sessão = `tokenFamily` (cada renovação cria uma linha nova na mesma família). O JWT leva `sid` (a família) e o `JwtAuthGuard`
  consulta a sessão a cada requisição (ativa, do dono, não expirada): logout, revogar dispositivo e redefinir senha valem NA
  HORA. Token sem `sid` é recusado. `AuthenticatedUser` ganhou `sessionId`. A renovação (`refresh`) é UMA transação (revoga o
  antigo e cria o novo): sem isso o guard daria 401 no intervalo. Os testes que contam queries filtram as da tabela `Session`.
- `SessionsService`/`SessionsController` (`/auth/sessions`): lista por família (um item por aparelho, `lastUsedAt` do token mais
  novo, `createdAt` do primeiro), 404 para sessão alheia, encerrar a atual limpa o cookie. Nome do aparelho em
  `auth/domain/device-label.ts` (puro). Sem IP, por decisão (RS17).
- `AccountService`: `export` (leitor por modelo, transação `RepeatableRead`, `serializeRow` põe datas civis em AAAA-MM-DD) e
  `deleteAccount` (`argon2.verify`, 403 se errada, `deleteMany` para ser idempotente). `POST /users/me/delete` (não `DELETE` com
  corpo: alguns proxies descartam o corpo). Rate limit compartilhado em `auth/throttler.ts` (`authThrottler`, importado por Auth e Users).
- **Todo modelo novo que pertença a uma pessoa precisa entrar em `EXPORT_KEYS` (e ter leitor em `account.service.ts`) ou em
  `EXCLUDED_FROM_EXPORT` com o motivo**: `test/account.e2e-spec.ts` lê o `schema.prisma` e falha senão. O teste de exclusão
  também percorre todas as tabelas. Cascatas: o trigger do ledger só bloqueia UPDATE, então o DELETE em cascata funciona.
- Front: `features/account` (`SessionsCard`, `DataExportCard`, `DeleteAccountCard`), página `SettingsPage` em `/configuracoes`
  (`/perfil` redireciona; o menu mostra "Ajustes"). Excluir pede a senha e a palavra `EXCLUIR`; depois chama `logout()` para limpar
  memória e cache. Download via `apiFetch` + blob (`downloadFile`).
- Lição de teste: arquivos que fixam variáveis de ambiente (`AUTH_RATE_LIMIT_PER_MINUTE`) precisam de IMPORT DINÂMICO dos
  helpers, senão o `AppModule` já foi carregado com o env antigo. O roteiro de mutantes confere o estado base de cada comando.

## Revisão semanal (decisões do 3c)

- `WeeklyReview` (`@@unique([userId, weekStart])`, `weekStart` DATE, CHECKs de segunda-feira, 2000 caracteres e `updatedAt >=
createdAt`); `createdAt`/`updatedAt` vêm do `Clock`. O resumo NÃO é gravado: `ReviewsService.getDetail` junta `BlocksService.getWeek`
  (ocorrências + conclusões), as áreas, o `SUM` do ledger na janela da semana e as duas revisões (da semana e da anterior) numa
  rodada de consultas fixa (teste conta queries).
- Regra pura em `reviews/domain/week-summary.ts` (`computeWeekSummary`, `weekRangeUtc`, `isFutureWeek`): pulada não é planejada; a
  conclusão liga pela data ORIGINAL (`blockId:occurrenceDate`); minutos cumpridos usam a medida da própria ocorrência (aderência em
  minutos nunca passa de 100%); aderência nula sem planejado. A janela do XP é `[segunda 00:00 local, próxima segunda 00:00 local)`.
- Só semana atual e passadas (400 no futuro, GET e PUT). `PUT` substitui os três campos (todos obrigatórios, podem ser vazios, `trim`).
- **`weekStartSchema` em `@lifexp/shared/primitives.ts`** é o schema de "segunda-feira": o refinamento só olha o dia quando a data é
  válida (o `isWeekStart` LANÇA com data inexistente e `safeParse` explodiria). Use-o em vez de `civilDateSchema.refine(isWeekStart)`.
- A varredura de notificações ignora conta excluída no meio dela (não é falha).
- Front: `features/reviews` (`ReviewSummary`, `ReviewForm`, `reviewFormat`), `ReviewPage` em `/revisao?semana=AAAA-MM-DD` (resolve
  qualquer data para a segunda-feira, nunca depois da semana atual do fuso da pessoa). Concluir/desfazer e editar blocos invalidam
  `reviewsKey`. O `ReviewForm` tem `key={weekStart}`: sem ele, voltar a uma semana em cache manteria o rascunho da outra.

## Convenções de teste

- Todo comportamento de regra/segurança precisa de teste que FALHE quando o código quebra. Antes de dar uma
  suíte por pronta, injete o bug (ex.: tirar o filtro de dono, desligar a verificação do JWT) e confirme que
  algum teste acusa; depois restaure.
- Domínio (`domain/`) tem meta imposta de >= 80% (`vitest.config.ts` da api, `--coverage` no `test:unit`).
- e2e da api compartilham o mesmo banco em paralelo: nunca contar linhas globais, só as da conta do teste.
  O timeout é de 30 s porque argon2 é caro de propósito.
- Front: testes com API falsa em memória que imita as regras do servidor (409, arquivar...). Mocke `sonner`
  com `vi.hoisted`.
- Teste de mutação manual: ao rodar o roteiro de mutantes, o trecho trocado precisa EXISTIR no arquivo (o
  Prettier quebra linhas e o texto deixa de casar). O roteiro deve acusar "NÃO APLICADO"; um "todos passaram"
  de mutante não aplicado não prova nada. Mutante sobrevivente = teste fraco OU mutante equivalente (decida qual).
- Testes de domínio de datas/semanas cobrem virada de mês/ano, ano bissexto, horário de verão e fusos extremos;
  rode a suíte e2e com `TZ=Pacific/Kiritimati` e `TZ=America/Los_Angeles` quando mexer em datas.
- Ao encadear verificações em script, NÃO use `| tail` no meio: ele mascara o código de saída. Use
  `set -o pipefail` ou redirecione para arquivo e confira `$?` antes de commitar.

## Design system (front)

- Direção: **HUD de RPG moderno**, interface gamificada. Escuro por padrão ("Void Ink" `#0E0B1A`), claro
  "pergaminho" via `prefers-color-scheme` (RNF10). Tokens em `apps/web/src/index.css`: `primary` violeta
  (ação), `xp` ouro (conquista), `mana` musgo (progresso/descanso). Use sempre os tokens, nunca hex solto.
- Fontes auto-hospedadas (`@fontsource`): Bricolage Grotesque (títulos, `font-display`), Figtree (texto),
  Chakra Petch (números e rótulos de HUD, `font-hud`).
- Assinatura: `XpBar` (runas inclinadas que acendem em sequência) e `LevelSigil` (selo hexagonal).
  Componentes de jogo em `src/components/game`, primitivos shadcn-style em `src/components/ui`
  (`cn` em `src/lib/utils.ts`, alias `@/`).
- Cores das áreas: tokens `--area-*` (claro/escuro) em `index.css`; mapeamento chave→classe em
  `features/areas/areaAppearance.tsx` (Records exaustivos: chave nova em shared quebra o build até ser desenhada).
  Emblemas do perfil em `components/game/emblems.tsx` (selo no `LevelSigil`).
- Tagline: "Cumpra. Descanse. Evolua." Princípios do produto valem na UI: recompensar sem punir, descanso
  conta como progresso, sem ranking. Não inventar dados: `useCharacter` é placeholder até o Marco 1d.
- 21st.dev (registry shadcn) exige login, então o CLI não funciona sem o usuário; se ele colar o código de
  um componente, revisar, adaptar aos tokens e registrar autor/licença. Motion: `motion/react`, sempre
  respeitando `prefers-reduced-motion`.

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
- Não implementar nada de marcos futuros antes de combinado. Marcos concluídos: **0 (Fundação)**, **1a (Autenticação)**, **1b (Perfil, áreas e atividades)** e
  **1c (Blocos e Semana)** e **1d (Hoje, XP e níveis)** e **1e (streak)** e **1f (PWA)**: **Marco 1 completo**. **2a (Metas)**, **2b (Eventos)**, **2c (Notificações)** e **2d (extras: arrastar e soltar, histórico de XP,
  recuperar senha)** feitos: **Marco 2 completo**. **2e (blocos em vários dias, com fim)** feito. **3a (sessões e conta)** e **3c (revisão semanal)** feitos; próximos: 3b (notas), fase 4 e,
  por último, o deploy.
  Regra de trabalho: por sub-marco, back primeiro e depois o front que o consome; plano aprovado antes de codar;
  push só com aprovação do usuário.
- Estrutura: `apps/api/src/<modulo>/{controller,service,dto,domain}`; web por feature em
  `apps/web/src/features/<feature>`.

## Comandos

```bash
cp .env.example .env && cp apps/api/.env.example apps/api/.env   # segredos: nunca versionar
pnpm install            # também roda prisma generate (postinstall da api)
docker compose up -d    # PostgreSQL
pnpm dev                # shared (watch) + api :3000 + web :5173
pnpm lint | test | build | format
pnpm --filter @lifexp/api test:e2e   # precisa do Postgres no ar
```

Swagger: `/api/docs`. Health: `GET /api/health`.
