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

export async function atualizarUnidade(
  id: string,
  dados: { nome: string; cidade: string },
): Promise<Unidade> {
  return prisma.unidade.update({
    where: { id },
    data: { nome: dados.nome, cidade: dados.cidade },
  });
}

export async function alterarAtivo(id: string, ativo: boolean): Promise<Unidade> {
  return prisma.unidade.update({
    where: { id },
    data: { ativo },
  });
}

export async function nomeJaExiste(
  clinicaId: string,
  nome: string,
  excetoId?: string,
): Promise<boolean> {
  const existente = await prisma.unidade.findFirst({
    where: {
      clinicaId,
      nome: { equals: nome, mode: 'insensitive' },
      ...(excetoId ? { id: { not: excetoId } } : {}),
    },
    select: { id: true },
  });
  return existente !== null;
}

export async function contarAtivas(clinicaId: string): Promise<number> {
  return prisma.unidade.count({ where: { clinicaId, ativo: true } });
}

export async function concederAcesso(
  unidadeId: string,
  usuarioIds: string[],
  tx: ClientePrisma = prisma,
): Promise<void> {
  if (usuarioIds.length === 0) return;
  await tx.usuarioUnidade.createMany({
    data: usuarioIds.map((usuarioId) => ({ usuarioId, unidadeId })),
    skipDuplicates: true,
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

export async function listarPorClinica(clinicaId: string): Promise<Unidade[]> {
  return prisma.unidade.findMany({
    where: { clinicaId },
    orderBy: { nome: 'asc' },
  });
}

export async function pertencemAClinica(
  ids: string[],
  clinicaId: string,
): Promise<boolean> {
  if (ids.length === 0) return false;
  const encontrados = await prisma.unidade.count({
    where: { clinicaId, id: { in: ids } },
  });
  return encontrados === new Set(ids).size;
}
