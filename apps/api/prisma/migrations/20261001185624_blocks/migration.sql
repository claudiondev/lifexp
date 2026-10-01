-- CreateEnum
CREATE TYPE "BlockRecurrence" AS ENUM ('WEEKLY', 'ONCE');

-- CreateEnum
CREATE TYPE "ExceptionType" AS ENUM ('SKIP', 'OVERRIDE');

-- CreateTable
CREATE TABLE "Block" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "recurrence" "BlockRecurrence" NOT NULL,
    "weekday" INTEGER,
    "date" DATE,
    "startTime" TEXT NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "validFrom" DATE,
    "validUntil" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Block_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlockException" (
    "id" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "occurrenceDate" DATE NOT NULL,
    "type" "ExceptionType" NOT NULL,
    "newDate" DATE,
    "newStartTime" TEXT,
    "newDurationMin" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlockException_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Block_userId_recurrence_validFrom_idx" ON "Block"("userId", "recurrence", "validFrom");

-- CreateIndex
CREATE INDEX "Block_userId_date_idx" ON "Block"("userId", "date");

-- CreateIndex
CREATE INDEX "Block_activityId_idx" ON "Block"("activityId");

-- CreateIndex
CREATE UNIQUE INDEX "BlockException_blockId_occurrenceDate_key" ON "BlockException"("blockId", "occurrenceDate");

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockException" ADD CONSTRAINT "BlockException_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "Block"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Coerências que o Prisma não expressa. Defesa em profundidade: a aplicação já valida tudo isso,
-- mas dado inválido nunca deve conseguir entrar no banco, nem por um bug ou um script.

-- Semanal tem dia da semana e início de validade; avulso tem data e nenhum dos dois.
ALTER TABLE "Block" ADD CONSTRAINT "Block_recurrence_fields_check" CHECK (
  ("recurrence" = 'WEEKLY' AND "weekday" IS NOT NULL AND "date" IS NULL AND "validFrom" IS NOT NULL)
  OR
  ("recurrence" = 'ONCE' AND "date" IS NOT NULL AND "weekday" IS NULL
    AND "validFrom" IS NULL AND "validUntil" IS NULL)
);

ALTER TABLE "Block" ADD CONSTRAINT "Block_weekday_check"
  CHECK ("weekday" IS NULL OR "weekday" BETWEEN 1 AND 7);

ALTER TABLE "Block" ADD CONSTRAINT "Block_startTime_check"
  CHECK ("startTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

ALTER TABLE "Block" ADD CONSTRAINT "Block_durationMin_check"
  CHECK ("durationMin" BETWEEN 15 AND 720 AND "durationMin" % 5 = 0);

-- O bloco não atravessa a meia-noite.
ALTER TABLE "Block" ADD CONSTRAINT "Block_same_day_check" CHECK (
  CAST(substr("startTime", 1, 2) AS INTEGER) * 60
  + CAST(substr("startTime", 4, 2) AS INTEGER)
  + "durationMin" <= 1440
);

-- validUntil pode ser o dia anterior a validFrom: é como uma série "encerrada" é preservada
-- no histórico sem apagar a linha.
ALTER TABLE "Block" ADD CONSTRAINT "Block_validity_range_check"
  CHECK ("validUntil" IS NULL OR "validFrom" IS NULL OR "validUntil" >= "validFrom" - 1);

-- SKIP não altera nada; OVERRIDE altera ao menos um campo.
ALTER TABLE "BlockException" ADD CONSTRAINT "BlockException_type_fields_check" CHECK (
  ("type" = 'SKIP' AND "newDate" IS NULL AND "newStartTime" IS NULL AND "newDurationMin" IS NULL)
  OR
  ("type" = 'OVERRIDE'
    AND ("newDate" IS NOT NULL OR "newStartTime" IS NOT NULL OR "newDurationMin" IS NOT NULL))
);

ALTER TABLE "BlockException" ADD CONSTRAINT "BlockException_newStartTime_check"
  CHECK ("newStartTime" IS NULL OR "newStartTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

ALTER TABLE "BlockException" ADD CONSTRAINT "BlockException_newDurationMin_check"
  CHECK ("newDurationMin" IS NULL OR ("newDurationMin" BETWEEN 15 AND 720 AND "newDurationMin" % 5 = 0));

-- Mover uma ocorrência só é possível dentro da mesma semana (date_trunc('week') começa na segunda).
ALTER TABLE "BlockException" ADD CONSTRAINT "BlockException_same_week_check" CHECK (
  "newDate" IS NULL
  OR date_trunc('week', "newDate"::timestamp) = date_trunc('week', "occurrenceDate"::timestamp)
);
