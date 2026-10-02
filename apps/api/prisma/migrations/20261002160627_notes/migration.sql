-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "areaId" TEXT,
    "blockId" TEXT,
    "goalId" TEXT,
    "eventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Note_userId_pinned_updatedAt_id_idx" ON "Note"("userId", "pinned", "updatedAt", "id");

-- CreateIndex
CREATE INDEX "Note_tags_idx" ON "Note" USING GIN ("tags");

-- CreateIndex
CREATE INDEX "Note_areaId_idx" ON "Note"("areaId");

-- CreateIndex
CREATE INDEX "Note_blockId_idx" ON "Note"("blockId");

-- CreateIndex
CREATE INDEX "Note_goalId_idx" ON "Note"("goalId");

-- CreateIndex
CREATE INDEX "Note_eventId_idx" ON "Note"("eventId");

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "Block"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Regras que o Prisma não expressa (defesa em profundidade: a aplicação já garante tudo isso).
-- Nada aqui depende do locale do banco (por isso não há regex de letras: acentos variam entre instalações).

-- As tags: até 10, de 1 a 30 caracteres, sem espaços nem "#", e sem repetir.
CREATE FUNCTION "note_tags_valid"(tags text[]) RETURNS boolean
  LANGUAGE sql IMMUTABLE
  AS $$
    SELECT coalesce(cardinality(tags), 0) <= 10
      AND coalesce(bool_and(char_length(t) BETWEEN 1 AND 30 AND t !~ '[[:space:]#]'), true)
      AND count(DISTINCT t) = count(t)
    FROM unnest(tags) AS t
  $$;

ALTER TABLE "Note" ADD CONSTRAINT "Note_title_check"
  CHECK (char_length(btrim("title")) BETWEEN 1 AND 200);
ALTER TABLE "Note" ADD CONSTRAINT "Note_content_check"
  CHECK (char_length("content") <= 20000);
ALTER TABLE "Note" ADD CONSTRAINT "Note_tags_check"
  CHECK ("note_tags_valid"("tags"));
-- No máximo um vínculo (área, bloco, meta ou evento).
ALTER TABLE "Note" ADD CONSTRAINT "Note_one_link_check"
  CHECK (num_nonnulls("areaId", "blockId", "goalId", "eventId") <= 1);
-- Atualizada nunca antes de criada.
ALTER TABLE "Note" ADD CONSTRAINT "Note_updated_check"
  CHECK ("updatedAt" >= "createdAt");
