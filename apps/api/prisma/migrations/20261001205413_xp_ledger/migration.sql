-- CreateEnum
CREATE TYPE "XpTransactionType" AS ENUM ('COMPLETION', 'REVERSAL');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "cachedTotalXp" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Completion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "occurrenceDate" DATE NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "undoneAt" TIMESTAMP(3),
    "activityId" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "xpAmount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Completion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "XpTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "areaId" TEXT,
    "amount" INTEGER NOT NULL,
    "type" "XpTransactionType" NOT NULL,
    "sourceId" TEXT,
    "reversedTransactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "XpTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AreaProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "cachedXp" INTEGER NOT NULL DEFAULT 0,
    "cachedLevel" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AreaProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Completion_userId_completedAt_idx" ON "Completion"("userId", "completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Completion_blockId_occurrenceDate_key" ON "Completion"("blockId", "occurrenceDate");

-- CreateIndex
CREATE UNIQUE INDEX "XpTransaction_reversedTransactionId_key" ON "XpTransaction"("reversedTransactionId");

-- CreateIndex
CREATE INDEX "XpTransaction_userId_createdAt_idx" ON "XpTransaction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "XpTransaction_areaId_idx" ON "XpTransaction"("areaId");

-- CreateIndex
CREATE UNIQUE INDEX "AreaProgress_areaId_key" ON "AreaProgress"("areaId");

-- CreateIndex
CREATE INDEX "AreaProgress_userId_idx" ON "AreaProgress"("userId");

-- AddForeignKey
ALTER TABLE "Completion" ADD CONSTRAINT "Completion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Completion" ADD CONSTRAINT "Completion_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "Block"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XpTransaction" ADD CONSTRAINT "XpTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XpTransaction" ADD CONSTRAINT "XpTransaction_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XpTransaction" ADD CONSTRAINT "XpTransaction_reversedTransactionId_fkey" FOREIGN KEY ("reversedTransactionId") REFERENCES "XpTransaction"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AreaProgress" ADD CONSTRAINT "AreaProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AreaProgress" ADD CONSTRAINT "AreaProgress_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Regras que o Prisma não expressa. Defesa em profundidade: a aplicação já valida tudo isso, mas
-- um dado de XP inconsistente nunca deve conseguir entrar no banco, nem por um bug ou um script.

-- Os caches nunca ficam negativos e o nível começa em 1.
ALTER TABLE "User" ADD CONSTRAINT "User_cachedTotalXp_check" CHECK ("cachedTotalXp" >= 0);
ALTER TABLE "AreaProgress" ADD CONSTRAINT "AreaProgress_cachedXp_check" CHECK ("cachedXp" >= 0);
ALTER TABLE "AreaProgress" ADD CONSTRAINT "AreaProgress_cachedLevel_check" CHECK ("cachedLevel" >= 1);

-- Uma conclusão rende de 0 a 300 XP (RN03) e tem duração válida (a "foto" do bloco).
ALTER TABLE "Completion" ADD CONSTRAINT "Completion_xpAmount_check"
  CHECK ("xpAmount" >= 0 AND "xpAmount" <= 300);
ALTER TABLE "Completion" ADD CONSTRAINT "Completion_durationMin_check"
  CHECK ("durationMin" BETWEEN 15 AND 720);
ALTER TABLE "Completion" ADD CONSTRAINT "Completion_undone_after_completed_check"
  CHECK ("undoneAt" IS NULL OR "undoneAt" >= "completedAt");

-- Livro-caixa: conclusão é positiva (até 300) e não estorna ninguém; estorno é negativo e aponta
-- para o lançamento que desfaz. Cada lançamento só pode ser estornado uma vez (índice único).
ALTER TABLE "XpTransaction" ADD CONSTRAINT "XpTransaction_type_amount_check" CHECK (
  ("type" = 'COMPLETION' AND "amount" > 0 AND "amount" <= 300 AND "reversedTransactionId" IS NULL)
  OR
  ("type" = 'REVERSAL' AND "amount" < 0 AND "reversedTransactionId" IS NOT NULL)
);

-- O livro-caixa é imutável (RN29): um lançamento gravado nunca é alterado. Correções são novos
-- lançamentos (estornos). Apagar continua permitido só porque excluir a conta (LGPD) leva tudo junto.
CREATE FUNCTION "xp_transaction_immutable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'XpTransaction é imutável: corrija com um estorno, não com UPDATE';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "XpTransaction_no_update"
  BEFORE UPDATE ON "XpTransaction"
  FOR EACH ROW EXECUTE FUNCTION "xp_transaction_immutable"();
