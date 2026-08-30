/*
  Warnings:

  - You are about to drop the `tokens_redefinicao_senha` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "tokens_redefinicao_senha" DROP CONSTRAINT "tokens_redefinicao_senha_usuarioId_fkey";

-- DropTable
DROP TABLE "tokens_redefinicao_senha";
