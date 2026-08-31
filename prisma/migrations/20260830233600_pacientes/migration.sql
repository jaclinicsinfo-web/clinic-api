-- CreateTable
CREATE TABLE "convenios" (
    "id" UUID NOT NULL,
    "clinicaId" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ativo',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "convenios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pacientes" (
    "id" UUID NOT NULL,
    "clinicaId" UUID NOT NULL,
    "unidadeId" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "rg" TEXT,
    "dataNascimento" DATE NOT NULL,
    "sexo" TEXT NOT NULL,
    "estadoCivil" TEXT,
    "profissao" TEXT,
    "telefone" TEXT NOT NULL,
    "whatsapp" TEXT,
    "email" TEXT,
    "cep" TEXT NOT NULL,
    "rua" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "complemento" TEXT,
    "bairro" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "uf" TEXT NOT NULL,
    "convenioId" UUID,
    "numeroCarteirinha" TEXT,
    "validadeCarteirinha" DATE,
    "responsavelNome" TEXT,
    "responsavelCpf" TEXT,
    "responsavelParentesco" TEXT,
    "responsavelTelefone" TEXT,
    "alergias" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "condicoesPreexistentes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "medicacoesEmUso" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "profissionalPreferidoId" UUID,
    "formaContatoPreferida" TEXT,
    "observacoes" TEXT,
    "consentimentoLgpd" BOOLEAN NOT NULL,
    "autorizacaoImagem" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ativo',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pacientes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "convenios_clinicaId_nome_key" ON "convenios"("clinicaId", "nome");

-- CreateIndex
CREATE INDEX "convenios_clinicaId_status_idx" ON "convenios"("clinicaId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "pacientes_clinicaId_cpf_key" ON "pacientes"("clinicaId", "cpf");

-- CreateIndex
CREATE INDEX "pacientes_clinicaId_unidadeId_idx" ON "pacientes"("clinicaId", "unidadeId");

-- CreateIndex
CREATE INDEX "pacientes_clinicaId_profissionalPreferidoId_idx" ON "pacientes"("clinicaId", "profissionalPreferidoId");

-- CreateIndex
CREATE INDEX "pacientes_clinicaId_status_idx" ON "pacientes"("clinicaId", "status");

-- CreateIndex
CREATE INDEX "pacientes_clinicaId_nome_idx" ON "pacientes"("clinicaId", "nome");

-- AddForeignKey
ALTER TABLE "convenios" ADD CONSTRAINT "convenios_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pacientes" ADD CONSTRAINT "pacientes_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pacientes" ADD CONSTRAINT "pacientes_unidadeId_fkey" FOREIGN KEY ("unidadeId") REFERENCES "unidades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pacientes" ADD CONSTRAINT "pacientes_convenioId_fkey" FOREIGN KEY ("convenioId") REFERENCES "convenios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pacientes" ADD CONSTRAINT "pacientes_profissionalPreferidoId_fkey" FOREIGN KEY ("profissionalPreferidoId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
