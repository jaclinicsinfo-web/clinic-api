-- CreateTable
CREATE TABLE "produtos_estoque" (
    "id" UUID NOT NULL,
    "clinicaId" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "unidadeMedida" TEXT NOT NULL,
    "quantidadeAtual" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "estoqueMinimo" DECIMAL(12,2) NOT NULL,
    "custoUnitario" DECIMAL(12,2) NOT NULL,
    "fornecedor" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "produtos_estoque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimentacoes_estoque" (
    "id" UUID NOT NULL,
    "clinicaId" UUID NOT NULL,
    "unidadeId" UUID NOT NULL,
    "produtoId" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "quantidade" DECIMAL(12,2) NOT NULL,
    "motivo" TEXT NOT NULL,
    "procedimentoId" UUID,
    "usuarioId" UUID NOT NULL,
    "data" DATE NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimentacoes_estoque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recuperacoes_senha" (
    "id" UUID NOT NULL,
    "usuarioId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "usadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recuperacoes_senha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificacoes" (
    "id" UUID NOT NULL,
    "clinicaId" UUID NOT NULL,
    "usuarioId" UUID NOT NULL,
    "chave" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "href" TEXT,
    "severidade" TEXT NOT NULL DEFAULT 'media',
    "lidaEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificacoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "produtos_estoque_clinicaId_nome_key" ON "produtos_estoque"("clinicaId", "nome");
CREATE INDEX "produtos_estoque_clinicaId_ativo_idx" ON "produtos_estoque"("clinicaId", "ativo");
CREATE INDEX "movimentacoes_estoque_clinicaId_data_idx" ON "movimentacoes_estoque"("clinicaId", "data");
CREATE INDEX "movimentacoes_estoque_produtoId_idx" ON "movimentacoes_estoque"("produtoId");
CREATE UNIQUE INDEX "recuperacoes_senha_tokenHash_key" ON "recuperacoes_senha"("tokenHash");
CREATE INDEX "recuperacoes_senha_usuarioId_idx" ON "recuperacoes_senha"("usuarioId");
CREATE UNIQUE INDEX "notificacoes_usuarioId_chave_key" ON "notificacoes"("usuarioId", "chave");
CREATE INDEX "notificacoes_usuarioId_lidaEm_criadoEm_idx" ON "notificacoes"("usuarioId", "lidaEm", "criadoEm");

-- AddForeignKey
ALTER TABLE "produtos_estoque" ADD CONSTRAINT "produtos_estoque_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "movimentacoes_estoque" ADD CONSTRAINT "movimentacoes_estoque_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "movimentacoes_estoque" ADD CONSTRAINT "movimentacoes_estoque_unidadeId_fkey" FOREIGN KEY ("unidadeId") REFERENCES "unidades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "movimentacoes_estoque" ADD CONSTRAINT "movimentacoes_estoque_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos_estoque"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "movimentacoes_estoque" ADD CONSTRAINT "movimentacoes_estoque_procedimentoId_fkey" FOREIGN KEY ("procedimentoId") REFERENCES "procedimentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "movimentacoes_estoque" ADD CONSTRAINT "movimentacoes_estoque_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recuperacoes_senha" ADD CONSTRAINT "recuperacoes_senha_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
