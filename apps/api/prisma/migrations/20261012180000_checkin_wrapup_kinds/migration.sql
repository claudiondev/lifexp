-- AlterEnum
-- Os valores novos ficam sozinhos nesta migration: o Postgres não deixa usá-los na mesma transação em que nascem.
ALTER TYPE "NotificationKind" ADD VALUE 'CHECKIN';
ALTER TYPE "NotificationKind" ADD VALUE 'WRAPUP';
