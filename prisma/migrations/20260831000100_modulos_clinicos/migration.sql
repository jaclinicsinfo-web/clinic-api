-- AlterTable
ALTER TABLE "convenios" ADD COLUMN     "contatoNome" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "contatoTelefone" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "exigeAutorizacaoPrevia" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "portalUrl" TEXT,
ADD COLUMN     "prazoPagamentoDias" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "registroAns" TEXT;

-- DropForeignKey
ALTER TABLE "pacientes" DROP CONSTRAINT "pacientes_profissionalPreferidoId_fkey";

-- Preferido apontava para usuario; a entidade clínica passa a ser profissionais.
UPDATE "pacientes" SET "profissionalPreferidoId" = NULL;

-- CreateTable
CREATE TABLE "procedimentos" (
    "id" UUID NOT NULL,
    "clinicaId" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "duracaoPadraoMin" INTEGER NOT NULL,
    "valorParticular" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ativo',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "procedimentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "convenio_procedimentos" (
    "convenioId" UUID NOT NULL,
    "procedimentoId" UUID NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "convenio_procedimentos_pkey" PRIMARY KEY ("convenioId","procedimentoId")
);

-- CreateTable
CREATE TABLE "profissionais" (
    "id" UUID NOT NULL,
    "clinicaId" UUID NOT NULL,
    "usuarioId" UUID,
    "nome" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "rg" TEXT,
    "email" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "fotoUrl" TEXT,
    "especialidades" TEXT[],
    "conselho" TEXT NOT NULL,
    "registroConselho" TEXT NOT NULL,
    "tipoVinculo" TEXT NOT NULL,
    "formaRemuneracao" TEXT NOT NULL,
    "dataAdmissao" DATE NOT NULL,
    "percentualComissao" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "comissaoPorProcedimento" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ativo',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profissionais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profissional_horarios" (
    "id" UUID NOT NULL,
    "profissionalId" UUID NOT NULL,
    "diaSemana" INTEGER NOT NULL,
    "horaInicio" TEXT NOT NULL,
    "horaFim" TEXT NOT NULL,

    CONSTRAINT "profissional_horarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profissional_procedimentos" (
    "profissionalId" UUID NOT NULL,
    "procedimentoId" UUID NOT NULL,

    CONSTRAINT "profissional_procedimentos_pkey" PRIMARY KEY ("profissionalId","procedimentoId")
);

-- CreateTable
CREATE TABLE "agendamentos" (
    "id" UUID NOT NULL,
    "clinicaId" UUID NOT NULL,
    "unidadeId" UUID NOT NULL,
    "pacienteId" UUID NOT NULL,
    "profissionalId" UUID NOT NULL,
    "procedimentoId" UUID NOT NULL,
    "data" DATE NOT NULL,
    "horaInicio" TEXT NOT NULL,
    "horaFim" TEXT NOT NULL,
    "sala" TEXT,
    "convenioId" UUID,
    "particular" BOOLEAN NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL,
    "observacoes" TEXT,
    "lembreteEnviado" BOOLEAN NOT NULL DEFAULT false,
    "criadoPorId" UUID NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agendamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bloqueios_agenda" (
    "id" UUID NOT NULL,
    "clinicaId" UUID NOT NULL,
    "profissionalId" UUID NOT NULL,
    "data" DATE NOT NULL,
    "horaInicio" TEXT NOT NULL,
    "horaFim" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bloqueios_agenda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lista_espera" (
    "id" UUID NOT NULL,
    "clinicaId" UUID NOT NULL,
    "unidadeId" UUID NOT NULL,
    "pacienteId" UUID NOT NULL,
    "profissionalId" UUID,
    "procedimentoId" UUID,
    "preferenciaPeriodo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'aguardando',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lista_espera_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acompanhamentos_clinicos" (
    "id" UUID NOT NULL,
    "clinicaId" UUID NOT NULL,
    "pacienteId" UUID NOT NULL,
    "profissionalId" UUID NOT NULL,
    "especialidade" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "queixaInicial" TEXT NOT NULL,
    "quadroInicial" TEXT NOT NULL,
    "objetivo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'em_andamento',
    "inicioEm" DATE NOT NULL,
    "altaEm" DATE,
    "resumoAlta" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "acompanhamentos_clinicos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "atendimentos" (
    "id" UUID NOT NULL,
    "clinicaId" UUID NOT NULL,
    "agendamentoId" UUID,
    "acompanhamentoId" UUID,
    "pacienteId" UUID NOT NULL,
    "profissionalId" UUID NOT NULL,
    "data" DATE NOT NULL,
    "procedimentoRealizado" TEXT NOT NULL,
    "tipoRegistro" TEXT NOT NULL,
    "queixaPrincipal" TEXT,
    "quadroClinico" TEXT,
    "evolucao" TEXT NOT NULL,
    "conduta" TEXT,
    "respostaAoTratamento" TEXT,
    "escalaDor" INTEGER,
    "proximoRetornoSugerido" DATE,
    "criadoPorId" UUID NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "atendimentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documentos_paciente" (
    "id" UUID NOT NULL,
    "clinicaId" UUID NOT NULL,
    "pacienteId" UUID NOT NULL,
    "atendimentoId" UUID,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "tamanhoKb" INTEGER NOT NULL,
    "conteudo" BYTEA NOT NULL,
    "criadoPorId" UUID NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documentos_paciente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logs_acesso_prontuario" (
    "id" UUID NOT NULL,
    "clinicaId" UUID NOT NULL,
    "pacienteId" UUID NOT NULL,
    "usuarioId" UUID NOT NULL,
    "acao" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logs_acesso_prontuario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "procedimentos_clinicaId_nome_key" ON "procedimentos"("clinicaId", "nome");

-- CreateIndex
CREATE INDEX "procedimentos_clinicaId_status_idx" ON "procedimentos"("clinicaId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "profissionais_usuarioId_key" ON "profissionais"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "profissionais_clinicaId_cpf_key" ON "profissionais"("clinicaId", "cpf");

-- CreateIndex
CREATE INDEX "profissionais_clinicaId_status_idx" ON "profissionais"("clinicaId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "profissional_horarios_profissionalId_diaSemana_key" ON "profissional_horarios"("profissionalId", "diaSemana");

-- CreateIndex
CREATE INDEX "agendamentos_clinicaId_data_idx" ON "agendamentos"("clinicaId", "data");

-- CreateIndex
CREATE INDEX "agendamentos_clinicaId_profissionalId_data_idx" ON "agendamentos"("clinicaId", "profissionalId", "data");

-- CreateIndex
CREATE INDEX "agendamentos_clinicaId_pacienteId_idx" ON "agendamentos"("clinicaId", "pacienteId");

-- CreateIndex
CREATE INDEX "agendamentos_clinicaId_status_idx" ON "agendamentos"("clinicaId", "status");

-- CreateIndex
CREATE INDEX "bloqueios_agenda_clinicaId_profissionalId_data_idx" ON "bloqueios_agenda"("clinicaId", "profissionalId", "data");

-- CreateIndex
CREATE INDEX "lista_espera_clinicaId_status_idx" ON "lista_espera"("clinicaId", "status");

-- CreateIndex
CREATE INDEX "acompanhamentos_clinicos_clinicaId_pacienteId_idx" ON "acompanhamentos_clinicos"("clinicaId", "pacienteId");

-- CreateIndex
CREATE UNIQUE INDEX "atendimentos_agendamentoId_key" ON "atendimentos"("agendamentoId");

-- CreateIndex
CREATE INDEX "atendimentos_clinicaId_pacienteId_idx" ON "atendimentos"("clinicaId", "pacienteId");

-- CreateIndex
CREATE INDEX "atendimentos_acompanhamentoId_idx" ON "atendimentos"("acompanhamentoId");

-- CreateIndex
CREATE INDEX "documentos_paciente_clinicaId_pacienteId_idx" ON "documentos_paciente"("clinicaId", "pacienteId");

-- CreateIndex
CREATE INDEX "logs_acesso_prontuario_clinicaId_pacienteId_criadoEm_idx" ON "logs_acesso_prontuario"("clinicaId", "pacienteId", "criadoEm");

-- AddForeignKey
ALTER TABLE "procedimentos" ADD CONSTRAINT "procedimentos_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "convenio_procedimentos" ADD CONSTRAINT "convenio_procedimentos_convenioId_fkey" FOREIGN KEY ("convenioId") REFERENCES "convenios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "convenio_procedimentos" ADD CONSTRAINT "convenio_procedimentos_procedimentoId_fkey" FOREIGN KEY ("procedimentoId") REFERENCES "procedimentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profissionais" ADD CONSTRAINT "profissionais_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profissionais" ADD CONSTRAINT "profissionais_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profissional_horarios" ADD CONSTRAINT "profissional_horarios_profissionalId_fkey" FOREIGN KEY ("profissionalId") REFERENCES "profissionais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profissional_procedimentos" ADD CONSTRAINT "profissional_procedimentos_profissionalId_fkey" FOREIGN KEY ("profissionalId") REFERENCES "profissionais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profissional_procedimentos" ADD CONSTRAINT "profissional_procedimentos_procedimentoId_fkey" FOREIGN KEY ("procedimentoId") REFERENCES "procedimentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pacientes" ADD CONSTRAINT "pacientes_profissionalPreferidoId_fkey" FOREIGN KEY ("profissionalPreferidoId") REFERENCES "profissionais"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_unidadeId_fkey" FOREIGN KEY ("unidadeId") REFERENCES "unidades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "pacientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_profissionalId_fkey" FOREIGN KEY ("profissionalId") REFERENCES "profissionais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_procedimentoId_fkey" FOREIGN KEY ("procedimentoId") REFERENCES "procedimentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_convenioId_fkey" FOREIGN KEY ("convenioId") REFERENCES "convenios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bloqueios_agenda" ADD CONSTRAINT "bloqueios_agenda_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bloqueios_agenda" ADD CONSTRAINT "bloqueios_agenda_profissionalId_fkey" FOREIGN KEY ("profissionalId") REFERENCES "profissionais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lista_espera" ADD CONSTRAINT "lista_espera_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lista_espera" ADD CONSTRAINT "lista_espera_unidadeId_fkey" FOREIGN KEY ("unidadeId") REFERENCES "unidades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lista_espera" ADD CONSTRAINT "lista_espera_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "pacientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lista_espera" ADD CONSTRAINT "lista_espera_profissionalId_fkey" FOREIGN KEY ("profissionalId") REFERENCES "profissionais"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lista_espera" ADD CONSTRAINT "lista_espera_procedimentoId_fkey" FOREIGN KEY ("procedimentoId") REFERENCES "procedimentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acompanhamentos_clinicos" ADD CONSTRAINT "acompanhamentos_clinicos_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acompanhamentos_clinicos" ADD CONSTRAINT "acompanhamentos_clinicos_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "pacientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acompanhamentos_clinicos" ADD CONSTRAINT "acompanhamentos_clinicos_profissionalId_fkey" FOREIGN KEY ("profissionalId") REFERENCES "profissionais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atendimentos" ADD CONSTRAINT "atendimentos_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atendimentos" ADD CONSTRAINT "atendimentos_agendamentoId_fkey" FOREIGN KEY ("agendamentoId") REFERENCES "agendamentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atendimentos" ADD CONSTRAINT "atendimentos_acompanhamentoId_fkey" FOREIGN KEY ("acompanhamentoId") REFERENCES "acompanhamentos_clinicos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atendimentos" ADD CONSTRAINT "atendimentos_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "pacientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atendimentos" ADD CONSTRAINT "atendimentos_profissionalId_fkey" FOREIGN KEY ("profissionalId") REFERENCES "profissionais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atendimentos" ADD CONSTRAINT "atendimentos_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_paciente" ADD CONSTRAINT "documentos_paciente_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_paciente" ADD CONSTRAINT "documentos_paciente_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "pacientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_paciente" ADD CONSTRAINT "documentos_paciente_atendimentoId_fkey" FOREIGN KEY ("atendimentoId") REFERENCES "atendimentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_paciente" ADD CONSTRAINT "documentos_paciente_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logs_acesso_prontuario" ADD CONSTRAINT "logs_acesso_prontuario_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logs_acesso_prontuario" ADD CONSTRAINT "logs_acesso_prontuario_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "pacientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logs_acesso_prontuario" ADD CONSTRAINT "logs_acesso_prontuario_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
