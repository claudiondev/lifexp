-- O aviso de fim do tempo de lazer não aponta para bloco nem evento (como o resumo do dia). O valor LEISURE_END do
-- enum nasce na migration anterior: só pode ser usado depois do commit dela.
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_origin_check";
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_origin_check" CHECK (
  ("kind" IN ('BLOCK', 'CHECKIN') AND "blockId" IS NOT NULL AND "occurrenceDate" IS NOT NULL AND "eventId" IS NULL)
  OR ("kind" = 'EVENT' AND "eventId" IS NOT NULL AND "blockId" IS NULL AND "occurrenceDate" IS NULL)
  OR ("kind" IN ('DIGEST', 'REPORT', 'WRAPUP', 'LEISURE_END') AND "blockId" IS NULL AND "occurrenceDate" IS NULL AND "eventId" IS NULL)
);
