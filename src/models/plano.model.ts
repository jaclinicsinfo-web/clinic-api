import { Plano, Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../config/database';
import { env } from '../config/env';
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

/** Plano vigente neste deploy (`PLANO` no ambiente). */
export async function planoDoDeploy(): Promise<Plano> {
  const plano = await buscarPorCodigo(env.PLANO);
  if (!plano || !plano.ativo) {
    throw new AppError(500, 'Plano configurado no servidor é inválido.');
  }
  return plano;
}

/**
 * Alinha a clínica ao `PLANO` da API. O setup grava o plano uma vez; mudar a env
 * no deploy precisa refletir no banco para login, limites e módulos.
 */
export async function sincronizarPlanoDoDeploy(clinicaId: string): Promise<Plano> {
  const alvo = await planoDoDeploy();
  const clinica = await prisma.clinica.findUnique({
    where: { id: clinicaId },
    select: { planoId: true },
  });

  if (!clinica) {
    throw new AppError(404, 'Clínica não encontrada.');
  }

  if (clinica.planoId !== alvo.id) {
    await prisma.clinica.update({
      where: { id: clinicaId },
      data: { planoId: alvo.id },
    });
  }

  return alvo;
}

export async function usoDaClinica(
  clinicaId: string,
  tx: ClientePrisma = prisma,
): Promise<UsoUsuarios> {
  const clinica = await tx.clinica.findUnique({
    where: { id: clinicaId },
    select: { id: true },
  });

  if (!clinica) {
    throw new AppError(404, 'Clínica não encontrada.');
  }

  const plano = await planoDoDeploy();
  const usados = await tx.usuario.count({
    where: { clinicaId, status: 'ativo' },
  });

  const limite = plano.limiteUsuarios;
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
    select: { id: true },
  });

  if (!clinica) {
    throw new AppError(404, 'Clínica não encontrada.');
  }

  const limite = limiteUnidadesDoPlano(env.PLANO);
  if (limite === null) return;

  const ativas = await tx.unidade.count({
    where: { clinicaId, ativo: true },
  });

  if (ativas >= limite) {
    throw new AppError(403, mensagemLimiteUnidades(env.PLANO));
  }
}
