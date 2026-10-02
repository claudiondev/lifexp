-- CreateTable
CREATE TABLE "WeeklyReview" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "wins" TEXT NOT NULL DEFAULT '',
    "blockers" TEXT NOT NULL DEFAULT '',
    "nextPriority" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyReview_userId_weekStart_key" ON "WeeklyReview"("userId", "weekStart");

-- AddForeignKey
ALTER TABLE "WeeklyReview" ADD CONSTRAINT "WeeklyReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Regras que o Prisma não expressa (defesa em profundidade: a aplicação já garante tudo isso).

-- A semana começa na segunda-feira (ISO: dia 1).
ALTER TABLE "WeeklyReview" ADD CONSTRAINT "WeeklyReview_weekStart_monday_check"
  CHECK (EXTRACT(ISODOW FROM "weekStart") = 1);
-- Cada reflexão cabe em até 2000 caracteres (o mesmo limite da API).
ALTER TABLE "WeeklyReview" ADD CONSTRAINT "WeeklyReview_text_length_check"
  CHECK (char_length("wins") <= 2000 AND char_length("blockers") <= 2000 AND char_length("nextPriority") <= 2000);
-- Atualizada nunca antes de criada.
ALTER TABLE "WeeklyReview" ADD CONSTRAINT "WeeklyReview_updated_check"
  CHECK ("updatedAt" >= "createdAt");
