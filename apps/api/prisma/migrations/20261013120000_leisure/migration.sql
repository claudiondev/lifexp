-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "leisurePercent" INTEGER;

-- AlterTable
ALTER TABLE "Completion" ADD COLUMN     "leisureMin" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "LeisureOption" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeisureOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeisureSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "limitMin" INTEGER NOT NULL,
    "stoppedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeisureSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeisureOption_userId_idx" ON "LeisureOption"("userId");

-- CreateIndex
CREATE INDEX "LeisureSession_userId_startedAt_idx" ON "LeisureSession"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "LeisureSession_optionId_idx" ON "LeisureSession"("optionId");

-- AddForeignKey
ALTER TABLE "LeisureOption" ADD CONSTRAINT "LeisureOption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeisureSession" ADD CONSTRAINT "LeisureSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeisureSession" ADD CONSTRAINT "LeisureSession_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "LeisureOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Defesa em profundidade (repete as regras da aplicação).
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_leisurePercent_check"
  CHECK ("leisurePercent" IS NULL OR "leisurePercent" IN (25, 50, 100));

ALTER TABLE "Completion" ADD CONSTRAINT "Completion_leisureMin_check"
  CHECK ("leisureMin" BETWEEN 0 AND 720);

ALTER TABLE "LeisureOption" ADD CONSTRAINT "LeisureOption_name_length_check"
  CHECK (char_length("name") BETWEEN 1 AND 40);

-- Repete LEISURE_ICONS de @lifexp/shared (o teste de constraints insere todas as chaves e quebra se a lista ficar para trás).
ALTER TABLE "LeisureOption" ADD CONSTRAINT "LeisureOption_icon_check"
  CHECK ("icon" IN ('smartphone', 'music', 'tv', 'gamepad', 'film', 'coffee', 'headphones', 'message-circle', 'play', 'sparkles'));

ALTER TABLE "LeisureSession" ADD CONSTRAINT "LeisureSession_limitMin_check"
  CHECK ("limitMin" BETWEEN 1 AND 10080);

ALTER TABLE "LeisureSession" ADD CONSTRAINT "LeisureSession_stoppedAt_check"
  CHECK ("stoppedAt" IS NULL OR "stoppedAt" >= "startedAt");
