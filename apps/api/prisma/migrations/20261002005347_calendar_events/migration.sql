-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "areaId" TEXT,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "date" DATE NOT NULL,
    "time" TEXT,
    "category" TEXT NOT NULL,
    "remindBeforeMin" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalendarEvent_userId_date_idx" ON "CalendarEvent"("userId", "date");

-- CreateIndex
CREATE INDEX "CalendarEvent_areaId_idx" ON "CalendarEvent"("areaId");

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Regras que o Prisma não expressa (defesa em profundidade: a aplicação já valida tudo isso).

ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_title_check"
  CHECK (char_length(btrim("title")) BETWEEN 1 AND 120);
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_category_check"
  CHECK ("category" IN ('appointment', 'birthday', 'medical', 'trip', 'deadline', 'other'));
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_time_check"
  CHECK ("time" IS NULL OR "time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
-- Antecedências aceitas (RF36), e evento sem hora só aceita lembrete em dias.
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_remind_check"
  CHECK ("remindBeforeMin" IS NULL OR "remindBeforeMin" IN (0, 15, 60, 1440, 2880));
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_remind_all_day_check"
  CHECK ("time" IS NOT NULL OR "remindBeforeMin" IS NULL OR "remindBeforeMin" IN (1440, 2880));
