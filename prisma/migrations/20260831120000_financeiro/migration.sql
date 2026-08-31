-- CreateTable
CREATE TABLE "formas_pagamento" (
    "id" UUID NOT NULL,
    "clinicaId" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "taxa" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "formas_pagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cobrancas" (
    "id" UUID NOT NULL,
    "clinicaId" UUID NOT NULL,
    "unidadeId" UUID NOT NULL,
    "pacienteId" UUID NOT NULL,
    "agendamentoId" UUID,
    "descricao" TEXT NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "formaPagamento" TEXT,
    "convenioId" UUID,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "vencimento" DATE NOT NULL,
    "pagoEm" DATE,
    "observacoes" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cobrancas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parcelas_cobranca" (
    "id" UUID NOT NULL,
    "cobrancaId" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "vencimento" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "pagoEm" DATE,
    "formaPagamento" TEXT,

    CONSTRAINT "parcelas_cobranca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "despesas" (
    "id" UUID NOT NULL,
    "clinicaId" UUID NOT NULL,
    "unidadeId" UUID NOT NULL,
    "descricao" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "fornecedor" TEXT NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "vencimento" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'a_pagar',
    "recorrente" BOOLEAN NOT NULL DEFAULT false,
    "formaPagamento" TEXT,
    "pagoEm" DATE,
    "observacoes" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "despesas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lotes_convenio" (
    "id" UUID NOT NULL,
    "clinicaId" UUID NOT NULL,
    "convenioId" UUID NOT NULL,
    "competencia" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'aberto',
    "valorApresentado" DECIMAL(12,2) NOT NULL,
    "valorGlosado" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "valorRecebido" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "enviadoEm" DATE,
    "previsaoPagamento" DATE,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lotes_convenio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lote_guias" (
    "loteId" UUID NOT NULL,
    "cobrancaId" UUID NOT NULL,

    CONSTRAINT "lote_guias_pkey" PRIMARY KEY ("loteId","cobrancaId")
);

-- CreateTable
CREATE TABLE "comissoes" (
    "id" UUID NOT NULL,
    "clinicaId" UUID NOT NULL,
    "profissionalId" UUID NOT NULL,
    "competencia" TEXT NOT NULL,
    "atendimentos" INTEGER NOT NULL,
    "faturamentoGerado" DECIMAL(12,2) NOT NULL,
    "percentual" DECIMAL(5,2) NOT NULL,
    "valorComissao" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'prevista',
    "pagoEm" DATE,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comissoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "formas_pagamento_clinicaId_codigo_key" ON "formas_pagamento"("clinicaId", "codigo");

-- CreateIndex
CREATE INDEX "formas_pagamento_clinicaId_ativo_idx" ON "formas_pagamento"("clinicaId", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "cobrancas_agendamentoId_key" ON "cobrancas"("agendamentoId");

-- CreateIndex
CREATE INDEX "cobrancas_clinicaId_status_idx" ON "cobrancas"("clinicaId", "status");

-- CreateIndex
CREATE INDEX "cobrancas_clinicaId_vencimento_idx" ON "cobrancas"("clinicaId", "vencimento");

-- CreateIndex
CREATE INDEX "cobrancas_clinicaId_pacienteId_idx" ON "cobrancas"("clinicaId", "pacienteId");

-- CreateIndex
CREATE UNIQUE INDEX "parcelas_cobranca_cobrancaId_numero_key" ON "parcelas_cobranca"("cobrancaId", "numero");

-- CreateIndex
CREATE INDEX "despesas_clinicaId_status_idx" ON "despesas"("clinicaId", "status");

-- CreateIndex
CREATE INDEX "despesas_clinicaId_vencimento_idx" ON "despesas"("clinicaId", "vencimento");

-- CreateIndex
CREATE UNIQUE INDEX "lotes_convenio_clinicaId_convenioId_competencia_key" ON "lotes_convenio"("clinicaId", "convenioId", "competencia");

-- CreateIndex
CREATE INDEX "lotes_convenio_clinicaId_competencia_idx" ON "lotes_convenio"("clinicaId", "competencia");

-- CreateIndex
CREATE UNIQUE INDEX "comissoes_clinicaId_profissionalId_competencia_key" ON "comissoes"("clinicaId", "profissionalId", "competencia");

-- CreateIndex
CREATE INDEX "comissoes_clinicaId_competencia_idx" ON "comissoes"("clinicaId", "competencia");

-- AddForeignKey
ALTER TABLE "formas_pagamento" ADD CONSTRAINT "formas_pagamento_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cobrancas" ADD CONSTRAINT "cobrancas_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cobrancas" ADD CONSTRAINT "cobrancas_unidadeId_fkey" FOREIGN KEY ("unidadeId") REFERENCES "unidades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cobrancas" ADD CONSTRAINT "cobrancas_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "pacientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cobrancas" ADD CONSTRAINT "cobrancas_agendamentoId_fkey" FOREIGN KEY ("agendamentoId") REFERENCES "agendamentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cobrancas" ADD CONSTRAINT "cobrancas_convenioId_fkey" FOREIGN KEY ("convenioId") REFERENCES "convenios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcelas_cobranca" ADD CONSTRAINT "parcelas_cobranca_cobrancaId_fkey" FOREIGN KEY ("cobrancaId") REFERENCES "cobrancas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "despesas" ADD CONSTRAINT "despesas_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "despesas" ADD CONSTRAINT "despesas_unidadeId_fkey" FOREIGN KEY ("unidadeId") REFERENCES "unidades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lotes_convenio" ADD CONSTRAINT "lotes_convenio_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lotes_convenio" ADD CONSTRAINT "lotes_convenio_convenioId_fkey" FOREIGN KEY ("convenioId") REFERENCES "convenios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lote_guias" ADD CONSTRAINT "lote_guias_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "lotes_convenio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lote_guias" ADD CONSTRAINT "lote_guias_cobrancaId_fkey" FOREIGN KEY ("cobrancaId") REFERENCES "cobrancas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comissoes" ADD CONSTRAINT "comissoes_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comissoes" ADD CONSTRAINT "comissoes_profissionalId_fkey" FOREIGN KEY ("profissionalId") REFERENCES "profissionais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
