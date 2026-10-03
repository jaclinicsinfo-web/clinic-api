ALTER TABLE "clinicas" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ativa';
ALTER TABLE "clinicas" ADD COLUMN "valorMensal" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "clinicas" ADD COLUMN "situacaoCobranca" TEXT NOT NULL DEFAULT 'pendente';
