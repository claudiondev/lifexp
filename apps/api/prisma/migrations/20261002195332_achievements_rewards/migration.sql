-- CreateEnum
CREATE TYPE "RewardTrigger" AS ENUM ('LEVEL', 'STREAK', 'TOTAL_XP', 'ACHIEVEMENT');

-- CreateTable
CREATE TABLE "Achievement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Achievement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reward" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "trigger" "RewardTrigger" NOT NULL,
    "threshold" INTEGER,
    "achievementKey" TEXT,
    "reachedAt" TIMESTAMP(3),
    "redeemedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Achievement_userId_key_key" ON "Achievement"("userId", "key");

-- CreateIndex
CREATE INDEX "Reward_userId_idx" ON "Reward"("userId");

-- AddForeignKey
ALTER TABLE "Achievement" ADD CONSTRAINT "Achievement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reward" ADD CONSTRAINT "Reward_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Regras que o Prisma não expressa (defesa em profundidade: a aplicação já garante tudo isso).
-- A lista de chaves é a de ACHIEVEMENT_KEYS em @lifexp/shared; um teste confere as duas pontas.

ALTER TABLE "Achievement" ADD CONSTRAINT "Achievement_key_check"
  CHECK ("key" IN ('first_step', 'full_week', 'constant', 'unshakeable', 'balanced', 'hundred_hours', 'dream_realized', 'deserved_rest'));

ALTER TABLE "Reward" ADD CONSTRAINT "Reward_title_check"
  CHECK (char_length(btrim("title")) BETWEEN 1 AND 100);
ALTER TABLE "Reward" ADD CONSTRAINT "Reward_description_check"
  CHECK ("description" IS NULL OR char_length("description") <= 500);

-- Conquista como gatilho: só ela tem chave e não tem limiar; os demais gatilhos têm limiar e não têm chave.
ALTER TABLE "Reward" ADD CONSTRAINT "Reward_trigger_shape_check"
  CHECK (
    ("trigger" = 'ACHIEVEMENT' AND "achievementKey" IS NOT NULL AND "threshold" IS NULL)
    OR ("trigger" <> 'ACHIEVEMENT' AND "achievementKey" IS NULL AND "threshold" IS NOT NULL)
  );
ALTER TABLE "Reward" ADD CONSTRAINT "Reward_achievementKey_check"
  CHECK ("achievementKey" IS NULL OR "achievementKey" IN ('first_step', 'full_week', 'constant', 'unshakeable', 'balanced', 'hundred_hours', 'dream_realized', 'deserved_rest'));
ALTER TABLE "Reward" ADD CONSTRAINT "Reward_threshold_range_check"
  CHECK (
    "threshold" IS NULL
    OR ("trigger" = 'LEVEL' AND "threshold" BETWEEN 2 AND 100)
    OR ("trigger" = 'STREAK' AND "threshold" BETWEEN 1 AND 365)
    OR ("trigger" = 'TOTAL_XP' AND "threshold" BETWEEN 1 AND 1000000)
  );

-- Só se resgata o que foi atingido, e o resgate não pode ser anterior ao momento em que foi atingido.
ALTER TABLE "Reward" ADD CONSTRAINT "Reward_redeemed_check"
  CHECK ("redeemedAt" IS NULL OR ("reachedAt" IS NOT NULL AND "redeemedAt" >= "reachedAt"));
