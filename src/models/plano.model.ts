import { Plano, Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../config/database';
import { AppError } from '../lib/erros';
import { limiteUnidadesDoPlano, mensagemLimiteUnidades } from '../lib/modulos-plano';

type ClientePrisma = PrismaClient | Prisma.TransactionClient;

export interface UsoUsuarios {
  usados: number;
  limite: number | null;
  podeAdicionar: boolean;
}

export async function listarPlanos(): Promise<Plano[]> {
  return prisma.plano.findMany({
    where: { ativo: true },
    orderBy: { limiteUsuarios: { sort: 'asc', nulls: 'last' } },
  });
}

export async function buscarPorCodigo(codigo: string): Promise<Plano | null> {
  return prisma.plano.findUnique({ where: { codigo } });
}

export async function buscarPorId(id: string): Promise<Plano | null> {
  return prisma.plano.findUnique({ where: { id } });
}

export async function usoDaClinica(
  clinicaId: string,
  tx: ClientePrisma = prisma,
): Promise<UsoUsuarios> {
  const clinica = await tx.clinica.findUnique({
    where: { id: clinicaId },
    include: { plano: true },
  });

  if (!clinica) {
    throw new AppError(404, 'Clínica não encontrada.');
  }

  const usados = await tx.usuario.count({
    where: { clinicaId, status: 'ativo' },
  });

  const limite = clinica.plano.limiteUsuarios;
  const podeAdicionar = limite === null || usados < limite;

  return { usados, limite, podeAdicionar };
}

export async function assertPodeAdicionarUsuario(
  clinicaId: string,
  tx: ClientePrisma = prisma,
): Promise<void> {
  const uso = await usoDaClinica(clinicaId, tx);
  if (!uso.podeAdicionar) {
    throw new AppError(
      403,
      'Limite de usuários do plano atingido. Faça upgrade para adicionar mais contas.',
    );
  }
}

export async function assertPodeAdicionarUnidade(
  clinicaId: string,
  tx: ClientePrisma = prisma,
): Promise<void> {
  const clinica = await tx.clinica.findUnique({
    where: { id: clinicaId },
    include: { plano: true },
  });

  if (!clinica) {
    throw new AppError(404, 'Clínica não encontrada.');
  }

  const limite = limiteUnidadesDoPlano(clinica.plano.codigo);
  if (limite === null) return;

  const ativas = await tx.unidade.count({
    where: { clinicaId, ativo: true },
  });

  if (ativas >= limite) {
    throw new AppError(403, mensagemLimiteUnidades(clinica.plano.codigo));
  }
}
