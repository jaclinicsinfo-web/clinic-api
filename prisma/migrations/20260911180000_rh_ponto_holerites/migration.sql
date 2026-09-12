-- Remove leftover RH tables from a previous unfinished module.
DROP TABLE IF EXISTS "colaboradores_beneficios" CASCADE;
DROP TABLE IF EXISTS "solicitacoes_ajuste_ponto" CASCADE;
DROP TABLE IF EXISTS "solicitacoes_ausencia" CASCADE;
DROP TABLE IF EXISTS "registros_ponto" CASCADE;
DROP TABLE IF EXISTS "holerites" CASCADE;
DROP TABLE IF EXISTS "colaboradores" CASCADE;
DROP TABLE IF EXISTS "beneficios" CASCADE;
DROP TABLE IF EXISTS "departamentos" CASCADE;

-- CreateTable
CREATE TABLE "registros_ponto" (
    "id" UUID NOT NULL,
    "clinicaId" UUID NOT NULL,
    "usuarioId" UUID NOT NULL,
    "data" DATE NOT NULL,
    "entrada" TEXT,
    "saidaIntervalo" TEXT,
    "retornoIntervalo" TEXT,
    "saida" TEXT,
    "observacao" TEXT,
    "origem" TEXT NOT NULL DEFAULT 'manual',
    "registradoPorId" UUID NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "registros_ponto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holerites" (
    "id" UUID NOT NULL,
    "clinicaId" UUID NOT NULL,
    "usuarioId" UUID NOT NULL,
    "competencia" TEXT NOT NULL,
    "nomeArquivo" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "tamanhoKb" INTEGER NOT NULL,
    "conteudo" BYTEA NOT NULL,
    "criadoPorId" UUID NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "holerites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "registros_ponto_clinicaId_usuarioId_data_key" ON "registros_ponto"("clinicaId", "usuarioId", "data");
CREATE INDEX "registros_ponto_clinicaId_data_idx" ON "registros_ponto"("clinicaId", "data");
CREATE UNIQUE INDEX "holerites_clinicaId_usuarioId_competencia_key" ON "holerites"("clinicaId", "usuarioId", "competencia");
CREATE INDEX "holerites_clinicaId_competencia_idx" ON "holerites"("clinicaId", "competencia");

-- AddForeignKey
ALTER TABLE "registros_ponto" ADD CONSTRAINT "registros_ponto_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "registros_ponto" ADD CONSTRAINT "registros_ponto_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "registros_ponto" ADD CONSTRAINT "registros_ponto_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "holerites" ADD CONSTRAINT "holerites_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "holerites" ADD CONSTRAINT "holerites_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "holerites" ADD CONSTRAINT "holerites_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
