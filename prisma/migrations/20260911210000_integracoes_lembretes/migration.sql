-- CreateTable
CREATE TABLE "integracoes_clinica" (
    "id" UUID NOT NULL,
    "clinicaId" UUID NOT NULL,
    "lembretesAtivos" BOOLEAN NOT NULL DEFAULT false,
    "whatsappAtivo" BOOLEAN NOT NULL DEFAULT false,
    "whatsappPhoneNumberId" TEXT,
    "whatsappWabaId" TEXT,
    "whatsappAppId" TEXT,
    "whatsappAccessTokenCifrado" TEXT,
    "whatsappAppSecretCifrado" TEXT,
    "whatsappVerifyTokenCifrado" TEXT,
    "whatsappAmbiente" TEXT NOT NULL DEFAULT 'producao',
    "emailAtivo" BOOLEAN NOT NULL DEFAULT false,
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpUsuario" TEXT,
    "smtpSenhaCifrada" TEXT,
    "smtpRemetente" TEXT,
    "smtpRemetenteNome" TEXT,
    "smtpSeguro" TEXT NOT NULL DEFAULT 'tls',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integracoes_clinica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "templates_mensagem" (
    "id" UUID NOT NULL,
    "clinicaId" UUID NOT NULL,
    "canal" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "assunto" TEXT,
    "corpo" TEXT NOT NULL,
    "whatsappNomeTemplate" TEXT,
    "whatsappIdioma" TEXT NOT NULL DEFAULT 'pt_BR',
    "whatsappCategoria" TEXT NOT NULL DEFAULT 'utility',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "sistema" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "templates_mensagem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regras_lembrete" (
    "id" UUID NOT NULL,
    "clinicaId" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "antecedenciaMinutos" INTEGER,
    "destinatarios" TEXT NOT NULL,
    "canais" TEXT[],
    "templateWhatsappId" UUID,
    "templateEmailId" UUID,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "sistema" BOOLEAN NOT NULL DEFAULT false,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "regras_lembrete_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custos_envio" (
    "id" UUID NOT NULL,
    "clinicaId" UUID NOT NULL,
    "canal" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "valor" DECIMAL(12,4) NOT NULL,
    "moeda" TEXT NOT NULL DEFAULT 'BRL',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custos_envio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "envios_lembrete" (
    "id" UUID NOT NULL,
    "clinicaId" UUID NOT NULL,
    "agendamentoId" UUID NOT NULL,
    "regraId" UUID,
    "templateId" UUID,
    "canal" TEXT NOT NULL,
    "destinatarioTipo" TEXT NOT NULL,
    "destinatarioId" TEXT NOT NULL,
    "destinatarioNome" TEXT NOT NULL,
    "destinatarioContato" TEXT NOT NULL,
    "tipoLembrete" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "chaveIdempotencia" TEXT NOT NULL,
    "provedorMessageId" TEXT,
    "erro" TEXT,
    "custo" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "custoEstimado" BOOLEAN NOT NULL DEFAULT true,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "processarEm" TIMESTAMP(3) NOT NULL,
    "enviadoEm" TIMESTAMP(3),
    "entregueEm" TIMESTAMP(3),
    "lidoEm" TIMESTAMP(3),
    "metadados" JSONB,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "envios_lembrete_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "integracoes_clinica_clinicaId_key" ON "integracoes_clinica"("clinicaId");
CREATE INDEX "templates_mensagem_clinicaId_canal_idx" ON "templates_mensagem"("clinicaId", "canal");
CREATE INDEX "regras_lembrete_clinicaId_ativo_idx" ON "regras_lembrete"("clinicaId", "ativo");
CREATE UNIQUE INDEX "custos_envio_clinicaId_canal_categoria_key" ON "custos_envio"("clinicaId", "canal", "categoria");
CREATE INDEX "custos_envio_clinicaId_idx" ON "custos_envio"("clinicaId");
CREATE UNIQUE INDEX "envios_lembrete_clinicaId_chaveIdempotencia_key" ON "envios_lembrete"("clinicaId", "chaveIdempotencia");
CREATE INDEX "envios_lembrete_clinicaId_status_processarEm_idx" ON "envios_lembrete"("clinicaId", "status", "processarEm");
CREATE INDEX "envios_lembrete_clinicaId_criadoEm_idx" ON "envios_lembrete"("clinicaId", "criadoEm");
CREATE INDEX "envios_lembrete_agendamentoId_idx" ON "envios_lembrete"("agendamentoId");
CREATE INDEX "envios_lembrete_provedorMessageId_idx" ON "envios_lembrete"("provedorMessageId");

-- AddForeignKey
ALTER TABLE "integracoes_clinica" ADD CONSTRAINT "integracoes_clinica_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "templates_mensagem" ADD CONSTRAINT "templates_mensagem_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "regras_lembrete" ADD CONSTRAINT "regras_lembrete_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "regras_lembrete" ADD CONSTRAINT "regras_lembrete_templateWhatsappId_fkey" FOREIGN KEY ("templateWhatsappId") REFERENCES "templates_mensagem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "regras_lembrete" ADD CONSTRAINT "regras_lembrete_templateEmailId_fkey" FOREIGN KEY ("templateEmailId") REFERENCES "templates_mensagem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "custos_envio" ADD CONSTRAINT "custos_envio_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "envios_lembrete" ADD CONSTRAINT "envios_lembrete_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "envios_lembrete" ADD CONSTRAINT "envios_lembrete_agendamentoId_fkey" FOREIGN KEY ("agendamentoId") REFERENCES "agendamentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "envios_lembrete" ADD CONSTRAINT "envios_lembrete_regraId_fkey" FOREIGN KEY ("regraId") REFERENCES "regras_lembrete"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "envios_lembrete" ADD CONSTRAINT "envios_lembrete_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "templates_mensagem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
