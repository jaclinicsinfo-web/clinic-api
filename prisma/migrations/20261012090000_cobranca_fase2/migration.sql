-- Cobrança fase 2: histórico de pagamentos, troca de plano no meio do período e cobrança automática.

-- ---------------------------------------------------------------- B. histórico de pagamentos
-- O que antes só existia no Mercado Pago, gravado na confirmação.
ALTER TABLE "pedidos_assinatura" ADD COLUMN "meio" TEXT;
ALTER TABLE "pedidos_assinatura" ADD COLUMN "parcelas" INTEGER;
ALTER TABLE "pedidos_assinatura" ADD COLUMN "totalPago" DECIMAL(12,2);
ALTER TABLE "pedidos_assinatura" ADD COLUMN "estornadoEm" TIMESTAMPTZ(3);
-- Número do recibo: sequencial e só para pedidos pagos (checkout abandonado não gasta número).
ALTER TABLE "pedidos_assinatura" ADD COLUMN "numeroRecibo" INTEGER;
CREATE SEQUENCE "pedidos_assinatura_recibo_seq";

WITH ordem AS (
  SELECT id, row_number() OVER (ORDER BY COALESCE("pagoEm", "atualizadoEm"), "criadoEm") AS n
  FROM "pedidos_assinatura"
  WHERE status IN ('pago', 'estornado')
)
UPDATE "pedidos_assinatura" p SET "numeroRecibo" = ordem.n FROM ordem WHERE ordem.id = p.id;
SELECT setval('pedidos_assinatura_recibo_seq', COALESCE((SELECT max("numeroRecibo") FROM "pedidos_assinatura"), 0) + 1, false);
CREATE UNIQUE INDEX "pedidos_assinatura_numeroRecibo_key" ON "pedidos_assinatura"("numeroRecibo");

UPDATE "pedidos_assinatura" SET "estornadoEm" = "atualizadoEm" WHERE status = 'estornado';

-- Anual: a receita mensal é o preço anual dividido por 12 (antes gravava o preço mensal).
-- "clinicas" tem RLS forçado: sem o modo sistema, o UPDATE não enxerga nenhuma linha.
SELECT set_config('app.modo_sistema', 'on', false);
UPDATE "clinicas" c
SET "valorMensal" = round(p."precoAnual" / 12, 2)
FROM "planos" p
WHERE p.id = c."planoId"
  AND c."cicloCobranca" = 'anual'
  AND c."tipoAcesso" = 'pago'
  AND c."pagoAte" IS NOT NULL
  AND p."precoAnual" > 0;
SELECT set_config('app.modo_sistema', '', false);

-- ---------------------------------------------------------------- C. troca de plano
-- Downgrade (ou anual → mensal) que vale no próximo vencimento.
ALTER TABLE "clinicas" ADD COLUMN "planoAgendadoId" UUID;
ALTER TABLE "clinicas" ADD COLUMN "cicloAgendado" TEXT;
ALTER TABLE "clinicas" ADD CONSTRAINT "clinicas_planoAgendadoId_fkey"
  FOREIGN KEY ("planoAgendadoId") REFERENCES "planos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Pedido tipo 'troca_plano': o que a clínica tinha antes, para conferir na confirmação e desfazer no estorno.
ALTER TABLE "pedidos_assinatura" ADD COLUMN "planoAnteriorCodigo" TEXT;
ALTER TABLE "pedidos_assinatura" ADD COLUMN "cicloAnterior" TEXT;
ALTER TABLE "pedidos_assinatura" ADD COLUMN "pagoAteAnterior" TIMESTAMPTZ(3);
ALTER TABLE "pedidos_assinatura" ADD COLUMN "credito" DECIMAL(12,2);

-- ---------------------------------------------------------------- A. cobrança automática no cartão
CREATE TABLE "assinaturas_recorrentes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinicaId" UUID NOT NULL,
    "preapprovalId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "planoCodigo" TEXT NOT NULL,
    "ciclo" TEXT NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "linkAutorizacao" TEXT,
    "cartaoFinal" TEXT,
    "proximaCobrancaEm" TIMESTAMPTZ(3),
    "ultimaFalhaEm" TIMESTAMPTZ(3),
    "ultimaFalhaMotivo" TEXT,
    "valorNovo" DECIMAL(12,2),
    "valorNovoEm" TIMESTAMPTZ(3),
    "ativadaPor" UUID,
    "ativadaEm" TIMESTAMPTZ(3),
    "canceladaEm" TIMESTAMPTZ(3),
    "motivoCancelamento" TEXT,
    "conferidaEm" TIMESTAMPTZ(3),
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assinaturas_recorrentes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "assinaturas_recorrentes_preapprovalId_key" ON "assinaturas_recorrentes"("preapprovalId");
CREATE INDEX "assinaturas_recorrentes_clinicaId_idx" ON "assinaturas_recorrentes"("clinicaId");
-- No máximo uma assinatura não cancelada por clínica.
CREATE UNIQUE INDEX "assinaturas_recorrentes_ativa_key" ON "assinaturas_recorrentes"("clinicaId")
  WHERE "status" <> 'cancelada';

ALTER TABLE "pedidos_assinatura" ADD COLUMN "assinaturaRecorrenteId" UUID;
CREATE INDEX "pedidos_assinatura_assinaturaRecorrenteId_idx" ON "pedidos_assinatura"("assinaturaRecorrenteId");
