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
  **1c (Blocos e Semana)** e **1d (Hoje, XP e níveis)** e **1e (streak)**. Roadmap do Marco 1: 1f PWA.
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
