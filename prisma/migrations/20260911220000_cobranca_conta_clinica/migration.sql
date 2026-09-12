-- AlterTable
ALTER TABLE "integracoes_clinica" ADD COLUMN "whatsappCobrancaModo" TEXT NOT NULL DEFAULT 'conta_clinica';
ALTER TABLE "integracoes_clinica" ADD COLUMN "emailCobrancaModo" TEXT NOT NULL DEFAULT 'conta_clinica';
