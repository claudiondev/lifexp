-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "pushAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pushSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "NotificationPreference" ADD COLUMN     "pushEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "weeklyReportEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Regras que o Prisma não expressa (defesa em profundidade: a aplicação já valida tudo isso).

-- O aviso de relatório semanal não aponta para bloco nem evento (como o resumo do dia).
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_origin_check";
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_origin_check" CHECK (
  ("kind" = 'BLOCK' AND "blockId" IS NOT NULL AND "occurrenceDate" IS NOT NULL AND "eventId" IS NULL)
  OR ("kind" = 'EVENT' AND "eventId" IS NOT NULL AND "blockId" IS NULL AND "occurrenceDate" IS NULL)
  OR ("kind" IN ('DIGEST', 'REPORT') AND "blockId" IS NULL AND "occurrenceDate" IS NULL AND "eventId" IS NULL)
);
-- O número de tentativas de push é limitado, como o de e-mail.
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_push_attempts_check"
  CHECK ("pushAttempts" BETWEEN 0 AND 5);

-- A inscrição é sempre https e de tamanho razoável; as chaves são base64url.
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_endpoint_check"
  CHECK ("endpoint" LIKE 'https://%' AND char_length("endpoint") <= 2048);
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_p256dh_check"
  CHECK ("p256dh" ~ '^[A-Za-z0-9_-]+={0,2}$' AND char_length("p256dh") BETWEEN 20 AND 200);
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_auth_check"
  CHECK ("auth" ~ '^[A-Za-z0-9_-]+={0,2}$' AND char_length("auth") BETWEEN 10 AND 100);
