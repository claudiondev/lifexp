-- CreateEnum
CREATE TYPE "QuestStatus" AS ENUM ('ACTIVE', 'COMPLETED');

-- AlterEnum
ALTER TYPE "XpTransactionType" ADD VALUE 'QUEST';

-- CreateTable
CREATE TABLE "WeeklyQuest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "status" "QuestStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "WeeklyQuest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestItem" (
    "id" TEXT NOT NULL,
    "questId" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "occurrenceDate" DATE NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "xp" INTEGER NOT NULL,

    CONSTRAINT "QuestItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyQuest_userId_weekStart_key" ON "WeeklyQuest"("userId", "weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "QuestItem_questId_blockId_occurrenceDate_key" ON "QuestItem"("questId", "blockId", "occurrenceDate");

-- AddForeignKey
ALTER TABLE "WeeklyQuest" ADD CONSTRAINT "WeeklyQuest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestItem" ADD CONSTRAINT "QuestItem_questId_fkey" FOREIGN KEY ("questId") REFERENCES "WeeklyQuest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Regras que o Prisma não expressa (defesa em profundidade: a aplicação já garante tudo isso).

-- A semana começa na segunda-feira (ISO: dia 1).
ALTER TABLE "WeeklyQuest" ADD CONSTRAINT "WeeklyQuest_weekStart_monday_check"
  CHECK (EXTRACT(ISODOW FROM "weekStart") = 1);
-- Cumprida se, e somente se, tem data de conclusão.
ALTER TABLE "WeeklyQuest" ADD CONSTRAINT "WeeklyQuest_completed_check"
  CHECK (("status" = 'COMPLETED') = ("completedAt" IS NOT NULL));
ALTER TABLE "WeeklyQuest" ADD CONSTRAINT "WeeklyQuest_completedAt_after_createdAt_check"
  CHECK ("completedAt" IS NULL OR "completedAt" >= "createdAt");

-- Cada ocorrência do snapshot: duração e XP dentro das mesmas faixas de um bloco (15 min a 12 h; XP até 300).
ALTER TABLE "QuestItem" ADD CONSTRAINT "QuestItem_durationMin_check"
  CHECK ("durationMin" BETWEEN 15 AND 720);
ALTER TABLE "QuestItem" ADD CONSTRAINT "QuestItem_xp_check"
  CHECK ("xp" BETWEEN 0 AND 300);
