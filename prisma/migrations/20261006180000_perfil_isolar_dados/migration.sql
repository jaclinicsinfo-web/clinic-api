ALTER TABLE "perfis_acesso" ADD COLUMN "isolarDados" BOOLEAN NOT NULL DEFAULT false;

UPDATE "perfis_acesso"
SET "isolarDados" = true
WHERE nome = 'Profissional de saúde';
