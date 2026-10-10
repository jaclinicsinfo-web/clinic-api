-- Linha do tempo de cada pagamento (checkout, avisos do Mercado Pago, confirmação, estorno, e-mail).
-- Tabela do sistema, sem clinicaId obrigatório: fica fora do RLS, como pedidos_assinatura.
CREATE TABLE "eventos_pagamento" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tipo" TEXT NOT NULL,
    "nivel" TEXT NOT NULL DEFAULT 'info',
    "mensagem" TEXT NOT NULL,
    "pedidoId" UUID,
    "clinicaId" UUID,
    "pagamentoId" TEXT,
    "meio" TEXT,
    "status" TEXT,
    "valor" DECIMAL(12,2),
    "detalhes" JSONB,

    CONSTRAINT "eventos_pagamento_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "eventos_pagamento_criadoEm_idx" ON "eventos_pagamento"("criadoEm" DESC);
CREATE INDEX "eventos_pagamento_pedidoId_idx" ON "eventos_pagamento"("pedidoId");
CREATE INDEX "eventos_pagamento_pagamentoId_idx" ON "eventos_pagamento"("pagamentoId");
CREATE INDEX "eventos_pagamento_tipo_idx" ON "eventos_pagamento"("tipo");
