-- O novo valor do enum (TASK) só pode ser usado depois do commit da migration que o criou; por isso a regra do
-- livro-caixa é trocada aqui, numa migration separada.

ALTER TABLE "XpTransaction" DROP CONSTRAINT "XpTransaction_type_amount_check";

-- Conclusão de bloco: positiva e até 300 (RN03). Marco e meta (RN21): positivos, com teto folgado porque o valor
-- depende de calibração. Quest semanal (RN17): positiva, 20% do XP elegível da semana (a aplicação limita a 1000).
-- Tarefa (Marco 5a): positiva e até 40 (prioridade alta); lançamento de 0 não existe, a aplicação simplesmente não
-- lança. Estorno: negativo e ligado ao lançamento que desfaz.
ALTER TABLE "XpTransaction" ADD CONSTRAINT "XpTransaction_type_amount_check" CHECK (
  ("type" = 'COMPLETION' AND "amount" > 0 AND "amount" <= 300 AND "reversedTransactionId" IS NULL)
  OR
  ("type" IN ('MILESTONE', 'GOAL') AND "amount" > 0 AND "amount" <= 1000 AND "reversedTransactionId" IS NULL)
  OR
  ("type" = 'QUEST' AND "amount" > 0 AND "amount" <= 5000 AND "reversedTransactionId" IS NULL)
  OR
  ("type" = 'TASK' AND "amount" > 0 AND "amount" <= 40 AND "reversedTransactionId" IS NULL)
  OR
  ("type" = 'REVERSAL' AND "amount" < 0 AND "reversedTransactionId" IS NOT NULL)
);
