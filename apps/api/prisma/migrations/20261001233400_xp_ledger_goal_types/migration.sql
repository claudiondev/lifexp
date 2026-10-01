-- Os novos valores do enum (MILESTONE, GOAL) só podem ser usados depois do commit da migration que
-- os criou; por isso a regra do livro-caixa é trocada aqui, numa migration separada.

ALTER TABLE "XpTransaction" DROP CONSTRAINT "XpTransaction_type_amount_check";

-- Conclusão de bloco: positiva e até 300 (RN03). Marco e meta (RN21): positivos, com teto folgado
-- porque o valor depende de calibração. Estorno: negativo e ligado ao lançamento que desfaz.
ALTER TABLE "XpTransaction" ADD CONSTRAINT "XpTransaction_type_amount_check" CHECK (
  ("type" = 'COMPLETION' AND "amount" > 0 AND "amount" <= 300 AND "reversedTransactionId" IS NULL)
  OR
  ("type" IN ('MILESTONE', 'GOAL') AND "amount" > 0 AND "amount" <= 1000 AND "reversedTransactionId" IS NULL)
  OR
  ("type" = 'REVERSAL' AND "amount" < 0 AND "reversedTransactionId" IS NOT NULL)
);
