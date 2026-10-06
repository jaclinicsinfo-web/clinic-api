import { Prisma, PerfilAcesso } from '@prisma/client';
import { prisma, type ClientePrisma } from '../config/database';
import { PERFIS_PADRAO } from '../lib/perfis-padrao';

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
        isolarDados: perfil.isolarDados,
        permissoes: perfil.permissoes as unknown as Prisma.InputJsonValue,
      },
    });
    criados.push(criado);
  }

  return criados;
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

export async function atualizarAcesso(
  id: string,
  clinicaId: string,
  dados: { permissoes?: Prisma.InputJsonValue; isolarDados: boolean },
): Promise<PerfilAcesso> {
  return prisma.perfilAcesso.update({
    where: { id, clinicaId },
    data: {
      isolarDados: dados.isolarDados,
      ...(dados.permissoes ? { permissoes: dados.permissoes } : {}),
    },
  });
}
