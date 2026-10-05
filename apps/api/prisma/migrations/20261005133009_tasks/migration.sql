-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- AlterEnum
ALTER TYPE "XpTransactionType" ADD VALUE 'TASK';

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "areaId" TEXT,
    "goalId" TEXT,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "dueDate" DATE,
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "completedAt" TIMESTAMP(3),
    "xpAwarded" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskItem" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Task_userId_dueDate_idx" ON "Task"("userId", "dueDate");

-- CreateIndex
CREATE INDEX "Task_userId_completedAt_idx" ON "Task"("userId", "completedAt");

-- CreateIndex
CREATE INDEX "Task_areaId_idx" ON "Task"("areaId");

-- CreateIndex
CREATE INDEX "Task_goalId_idx" ON "Task"("goalId");

-- CreateIndex
CREATE INDEX "TaskItem_taskId_position_idx" ON "TaskItem"("taskId", "position");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskItem" ADD CONSTRAINT "TaskItem_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Defesa em profundidade (repete as regras da aplicação). O valor TASK do enum só pode ser usado depois do commit
-- desta migration; a regra do livro-caixa fica na migration seguinte.
ALTER TABLE "Task" ADD CONSTRAINT "Task_title_length_check"
  CHECK (char_length("title") BETWEEN 1 AND 120);

ALTER TABLE "Task" ADD CONSTRAINT "Task_note_length_check"
  CHECK ("note" IS NULL OR char_length("note") BETWEEN 1 AND 500);

-- Com o teto diário atingido a conclusão vale 0, então não se exige XP > 0.
ALTER TABLE "Task" ADD CONSTRAINT "Task_xp_awarded_check"
  CHECK ("xpAwarded" BETWEEN 0 AND 40);

-- XP só existe em tarefa concluída.
ALTER TABLE "Task" ADD CONSTRAINT "Task_xp_requires_completion_check"
  CHECK ("xpAwarded" = 0 OR "completedAt" IS NOT NULL);

ALTER TABLE "TaskItem" ADD CONSTRAINT "TaskItem_title_length_check"
  CHECK (char_length("title") BETWEEN 1 AND 120);

ALTER TABLE "TaskItem" ADD CONSTRAINT "TaskItem_position_check"
  CHECK ("position" >= 0);
