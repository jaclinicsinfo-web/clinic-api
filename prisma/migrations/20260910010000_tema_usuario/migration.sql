-- Preferência de tema visual do painel, por usuário.
ALTER TABLE "usuarios" ADD COLUMN "tema" TEXT NOT NULL DEFAULT 'claro';
