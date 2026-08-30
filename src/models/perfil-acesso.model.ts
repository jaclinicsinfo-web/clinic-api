import { Prisma, PerfilAcesso, PrismaClient } from '@prisma/client';
import { prisma } from '../config/database';
import { PERFIS_PADRAO } from '../lib/perfis-padrao';

type ClientePrisma = PrismaClient | Prisma.TransactionClient;

export async function criarPerfisPadrao(
  clinicaId: string,
  tx: ClientePrisma = prisma,
): Promise<PerfilAcesso[]> {
  const criados: PerfilAcesso[] = [];

  for (const perfil of PERFIS_PADRAO) {
    const criado = await tx.perfilAcesso.create({
      data: {
        clinicaId,
        nome: perfil.nome,
        descricao: perfil.descricao,
        sistema: true,
        permissoes: perfil.permissoes as unknown as Prisma.InputJsonValue,
      },
    });
    criados.push(criado);
  }

  return criados;
}

export async function buscarPorId(id: string): Promise<PerfilAcesso | null> {
  return prisma.perfilAcesso.findUnique({ where: { id } });
}

export async function listarPorClinica(clinicaId: string): Promise<PerfilAcesso[]> {
  return prisma.perfilAcesso.findMany({
    where: { clinicaId },
    orderBy: { nome: 'asc' },
  });
}

export async function buscarPorIdEClinica(
  id: string,
  clinicaId: string,
): Promise<PerfilAcesso | null> {
  return prisma.perfilAcesso.findFirst({ where: { id, clinicaId } });
}
