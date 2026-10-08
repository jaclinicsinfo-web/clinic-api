ALTER TABLE "planos" ADD COLUMN "precoAnual" DECIMAL(12,2) NOT NULL DEFAULT 0;

UPDATE "planos" SET "precoAnual" = "precoMensal" * 12;

ALTER TABLE "clinicas" ADD COLUMN "cicloCobranca" TEXT NOT NULL DEFAULT 'mensal';
