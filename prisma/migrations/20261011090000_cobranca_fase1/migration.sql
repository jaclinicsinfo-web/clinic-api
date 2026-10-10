-- Fila de saída dos e-mails transacionais (acesso, recibo, lembretes de cobrança).
-- O conteúdo vai cifrado (tem senha temporária) e é apagado depois do envio.
CREATE TABLE "emails_saida" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tipo" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "para" TEXT NOT NULL,
    "assunto" TEXT NOT NULL,
    "conteudo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "proximaTentativaEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimoErro" TEXT,
    "clinicaId" UUID,
    "pedidoId" UUID,
    "referencia" TIMESTAMPTZ(3),
    "enviadoEm" TIMESTAMPTZ(3),
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emails_saida_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "emails_saida_chave_key" ON "emails_saida"("chave");
CREATE INDEX "emails_saida_fila_idx" ON "emails_saida"("status", "proximaTentativaEm");
CREATE INDEX "emails_saida_pedidoId_idx" ON "emails_saida"("pedidoId");

-- Conferência periódica com o Mercado Pago: quando o pedido foi conferido pela última vez.
ALTER TABLE "pedidos_assinatura" ADD COLUMN "conferidoEm" TIMESTAMPTZ(3);
