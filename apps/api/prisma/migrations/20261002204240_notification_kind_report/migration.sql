-- AlterEnum
-- O valor novo fica sozinho nesta migration: o Postgres não deixa usá-lo na mesma transação em que nasce.
ALTER TYPE "NotificationKind" ADD VALUE 'REPORT';
