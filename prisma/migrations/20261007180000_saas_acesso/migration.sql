ALTER TABLE "planos" ADD COLUMN "precoMensal" DECIMAL(12,2) NOT NULL DEFAULT 0;

UPDATE "planos" SET "precoMensal" = 149 WHERE "codigo" = 'essencial';
UPDATE "planos" SET "precoMensal" = 349 WHERE "codigo" = 'profissional';
UPDATE "planos" SET "precoMensal" = 699 WHERE "codigo" = 'ilimitado';

ALTER TABLE "clinicas" ADD COLUMN "tipoAcesso" TEXT NOT NULL DEFAULT 'pago';
ALTER TABLE "clinicas" ADD COLUMN "trialExpiraEm" TIMESTAMP(3);

CREATE TABLE "pedidos_assinatura" (
    "id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "planoCodigo" TEXT NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "dados" JSONB NOT NULL,
    "preferenciaId" TEXT,
    "pagamentoId" TEXT,
    "clinicaId" UUID,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pedidos_assinatura_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pedidos_assinatura_pagamentoId_key" ON "pedidos_assinatura"("pagamentoId");
CREATE UNIQUE INDEX "pedidos_assinatura_clinicaId_key" ON "pedidos_assinatura"("clinicaId");
