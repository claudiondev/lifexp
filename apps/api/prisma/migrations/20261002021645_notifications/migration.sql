-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('BLOCK', 'EVENT', 'DIGEST');

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "blockId" TEXT,
    "occurrenceDate" DATE,
    "eventId" TEXT,
    "readAt" TIMESTAMP(3),
    "emailSentAt" TIMESTAMP(3),
    "emailAttempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "blockRemindersEnabled" BOOLEAN NOT NULL DEFAULT true,
    "blockLeadMin" INTEGER NOT NULL DEFAULT 15,
    "eventRemindersEnabled" BOOLEAN NOT NULL DEFAULT true,
    "digestEnabled" BOOLEAN NOT NULL DEFAULT true,
    "digestTime" TEXT NOT NULL DEFAULT '07:00',
    "digestEmailEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_userId_dedupeKey_key" ON "Notification"("userId", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference"("userId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Regras que o Prisma não expressa (defesa em profundidade: a aplicação já valida tudo isso).

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_title_check"
  CHECK (char_length(btrim("title")) BETWEEN 1 AND 200);
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_body_check"
  CHECK (char_length("body") <= 1000);
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_dedupe_check"
  CHECK (char_length("dedupeKey") BETWEEN 1 AND 200);
-- A origem combina com o tipo: lembrete de bloco aponta para o bloco e a ocorrência; o de evento, para o evento.
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_origin_check" CHECK (
  ("kind" = 'BLOCK' AND "blockId" IS NOT NULL AND "occurrenceDate" IS NOT NULL AND "eventId" IS NULL)
  OR ("kind" = 'EVENT' AND "eventId" IS NOT NULL AND "blockId" IS NULL AND "occurrenceDate" IS NULL)
  OR ("kind" = 'DIGEST' AND "blockId" IS NULL AND "occurrenceDate" IS NULL AND "eventId" IS NULL)
);
-- Só o resumo vai por e-mail, e o número de tentativas é limitado.
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_email_check"
  CHECK ("emailSentAt" IS NULL OR "kind" = 'DIGEST');
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_email_attempts_check"
  CHECK ("emailAttempts" BETWEEN 0 AND 5);

ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_lead_check"
  CHECK ("blockLeadMin" IN (5, 10, 15, 30, 60));
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_digest_time_check"
  CHECK ("digestTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
