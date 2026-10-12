-- AlterTable
ALTER TABLE "NotificationPreference" ADD COLUMN     "checkinEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "wrapupEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "wrapupTime" TEXT NOT NULL DEFAULT '21:30';

-- CreateTable
CREATE TABLE "PushActionToken" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushActionToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushActionToken_notificationId_key" ON "PushActionToken"("notificationId");

-- CreateIndex
CREATE UNIQUE INDEX "PushActionToken_tokenHash_key" ON "PushActionToken"("tokenHash");

-- AddForeignKey
ALTER TABLE "PushActionToken" ADD CONSTRAINT "PushActionToken_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Regras que o Prisma não expressa (defesa em profundidade: a aplicação já valida tudo isso).

-- A origem combina com o tipo: check-in é como o lembrete de bloco (aponta bloco + ocorrência);
-- o fechamento da noite é como o resumo, sem origem.
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_origin_check";
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_origin_check" CHECK (
  ("kind" IN ('BLOCK', 'CHECKIN') AND "blockId" IS NOT NULL AND "occurrenceDate" IS NOT NULL AND "eventId" IS NULL)
  OR ("kind" = 'EVENT' AND "eventId" IS NOT NULL AND "blockId" IS NULL AND "occurrenceDate" IS NULL)
  OR ("kind" IN ('DIGEST', 'REPORT', 'WRAPUP') AND "blockId" IS NULL AND "occurrenceDate" IS NULL AND "eventId" IS NULL)
);

ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_wrapup_time_check"
  CHECK ("wrapupTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

-- Só o SHA-256 em hexadecimal entra aqui: o token em claro nunca é gravado (como no PasswordResetToken).
ALTER TABLE "PushActionToken" ADD CONSTRAINT "PushActionToken_hash_check"
  CHECK ("tokenHash" ~ '^[0-9a-f]{64}$');
-- Nunca passa de 2 dias: o pior caso é a janela de conclusão de uma ocorrência (até 23:59 do dia seguinte).
ALTER TABLE "PushActionToken" ADD CONSTRAINT "PushActionToken_expiry_check"
  CHECK ("expiresAt" > "createdAt" AND "expiresAt" <= "createdAt" + INTERVAL '2 days');
