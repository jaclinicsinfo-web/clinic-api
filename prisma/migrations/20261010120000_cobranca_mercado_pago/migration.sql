-- Até quando a mensalidade ou a anuidade está paga. Nulo: cobrança controlada à mão pelo painel.
ALTER TABLE "clinicas" ADD COLUMN "pagoAte" TIMESTAMPTZ(3);

-- O pedido agora também paga uma clínica que já existe (teste → pago e renovação).
ALTER TABLE "pedidos_assinatura" ADD COLUMN "tipo" TEXT NOT NULL DEFAULT 'nova_clinica';
ALTER TABLE "pedidos_assinatura" ADD COLUMN "ciclo" TEXT NOT NULL DEFAULT 'mensal';
ALTER TABLE "pedidos_assinatura" ADD COLUMN "pagoEm" TIMESTAMPTZ(3);
ALTER TABLE "pedidos_assinatura" ADD COLUMN "periodoInicio" TIMESTAMPTZ(3);
ALTER TABLE "pedidos_assinatura" ADD COLUMN "periodoFim" TIMESTAMPTZ(3);
ALTER TABLE "pedidos_assinatura" ADD COLUMN "acessoEnviadoEm" TIMESTAMPTZ(3);

UPDATE "pedidos_assinatura" SET "ciclo" = 'anual' WHERE "dados"->>'ciclo' = 'anual';

-- Uma clínica passa a ter vários pedidos ao longo do tempo.
DROP INDEX "pedidos_assinatura_clinicaId_key";
CREATE INDEX "pedidos_assinatura_clinicaId_idx" ON "pedidos_assinatura"("clinicaId");
CREATE INDEX "pedidos_assinatura_status_idx" ON "pedidos_assinatura"("status");
