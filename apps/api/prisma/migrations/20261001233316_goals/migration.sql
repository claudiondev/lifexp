-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'PAUSED', 'ABANDONED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "XpTransactionType" ADD VALUE 'MILESTONE';
ALTER TYPE "XpTransactionType" ADD VALUE 'GOAL';

-- AlterTable
ALTER TABLE "Block" ADD COLUMN     "goalId" TEXT;

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "areaId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "deadline" DATE,
    "status" "GoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "unit" TEXT,
    "targetValue" DOUBLE PRECISION,
    "currentValue" DOUBLE PRECISION,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Milestone" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" TIMESTAMP(3),
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Milestone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Goal_userId_status_idx" ON "Goal"("userId", "status");

-- CreateIndex
CREATE INDEX "Goal_areaId_idx" ON "Goal"("areaId");

-- CreateIndex
CREATE INDEX "Milestone_goalId_position_idx" ON "Milestone"("goalId", "position");

-- CreateIndex
CREATE INDEX "Block_goalId_idx" ON "Block"("goalId");

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Regras que o Prisma não expressa (defesa em profundidade: a aplicação já valida tudo isso).

ALTER TABLE "Goal" ADD CONSTRAINT "Goal_title_check" CHECK (char_length(btrim("title")) BETWEEN 1 AND 120);
-- Valor-alvo positivo e valor atual não negativo (RF28).
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_target_check" CHECK ("targetValue" IS NULL OR "targetValue" > 0);
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_current_check" CHECK ("currentValue" IS NULL OR "currentValue" >= 0);
-- Valor atual e unidade só existem junto com um valor-alvo (uma métrica é um conjunto).
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_metric_check"
  CHECK ("targetValue" IS NOT NULL OR ("currentValue" IS NULL AND "unit" IS NULL));
-- Concluída <=> tem data de conclusão.
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_completed_check"
  CHECK (("status" = 'COMPLETED') = ("completedAt" IS NOT NULL));

ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_title_check" CHECK (char_length(btrim("title")) BETWEEN 1 AND 120);
-- Feito <=> tem data de conclusão.
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_done_check" CHECK ("done" = ("doneAt" IS NOT NULL));
