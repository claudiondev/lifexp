-- AlterTable
ALTER TABLE "Block" ADD COLUMN     "note" TEXT;

-- Defesa em profundidade (como as demais regras do bloco): a anotação, quando existe, tem de 1 a 500 caracteres.
ALTER TABLE "Block" ADD CONSTRAINT "Block_note_length_check"
  CHECK ("note" IS NULL OR char_length("note") BETWEEN 1 AND 500);
