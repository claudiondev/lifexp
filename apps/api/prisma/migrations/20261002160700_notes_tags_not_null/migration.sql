-- O Prisma cria coluna de lista (TEXT[]) anulável no Postgres, mas a aplicação nunca grava nulo.
-- Um NOT NULL de verdade faria o Prisma enxergar "deriva" a cada `migrate dev` (ele espera a coluna
-- anulável), então a garantia fica num CHECK, como as demais regras que o Prisma não expressa.
ALTER TABLE "Note" ADD CONSTRAINT "Note_tags_not_null_check" CHECK ("tags" IS NOT NULL);
