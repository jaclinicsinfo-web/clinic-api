import { Prisma, Unidade, PrismaClient } from '@prisma/client';
import { prisma } from '../config/database';

type ClientePrisma = PrismaClient | Prisma.TransactionClient;

export async function criarUnidade(
  dados: { clinicaId: string; nome: string; cidade: string },
  tx: ClientePrisma = prisma,
): Promise<Unidade> {
  return tx.unidade.create({
    data: {
      clinicaId: dados.clinicaId,
      nome: dados.nome,
      cidade: dados.cidade,
      ativo: true,
    },
  });
}

export async function listarPorUsuario(usuarioId: string): Promise<Unidade[]> {
  const vinculos = await prisma.usuarioUnidade.findMany({
    where: { usuarioId },
    include: { unidade: true },
  });
  return vinculos.map((v) => v.unidade);
}

export async function buscarPorId(id: string): Promise<Unidade | null> {
  return prisma.unidade.findUnique({ where: { id } });
}
