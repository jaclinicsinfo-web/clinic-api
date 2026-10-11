import { Prisma } from '@prisma/client';

import { prisma } from '../config/database';
import type { CicloCobranca } from '../lib/assinatura';

export type StatusAutomatica = 'pendente' | 'ativa' | 'pausada' | 'cancelada';
export type MotivoCancelamento = 'usuario' | 'painel' | 'mercadopago' | 'falhas';

/** A assinatura não cancelada da clínica (no máximo uma, pelo índice parcial). */
export async function buscarAutomaticaDaClinica(clinicaId: string) {
  return prisma.assinaturaRecorrente.findFirst({
    where: { clinicaId, status: { not: 'cancelada' } },
  });
}

export async function buscarAutomatica(id: string) {
  return prisma.assinaturaRecorrente.findUnique({ where: { id } });
}

export async function buscarAutomaticaPorPreapproval(preapprovalId: string) {
  return prisma.assinaturaRecorrente.findUnique({ where: { preapprovalId } });
}

/** Cria a linha `pendente`. Devolve null quando a clínica já tem uma não cancelada (corrida). */
export async function criarAutomatica(dados: {
  clinicaId: string;
  planoCodigo: string;
  ciclo: CicloCobranca;
  valor: number;
  ativadaPor: string;
}) {
  try {
    return await prisma.assinaturaRecorrente.create({ data: { ...dados, status: 'pendente' } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return null;
    throw err;
  }
}

export async function atualizarAutomatica(id: string, dados: Prisma.AssinaturaRecorrenteUpdateInput) {
  return prisma.assinaturaRecorrente.update({ where: { id }, data: dados });
}

/** Marca cancelada uma única vez. Devolve false se já estava cancelada. */
export async function marcarAutomaticaCancelada(id: string, motivo: MotivoCancelamento) {
  const atualizado = await prisma.assinaturaRecorrente.updateMany({
    where: { id, status: { not: 'cancelada' } },
    data: { status: 'cancelada', canceladaEm: new Date(), motivoCancelamento: motivo },
  });
  return atualizado.count === 1;
}

export async function apagarAutomaticaPendente(id: string) {
  await prisma.assinaturaRecorrente.deleteMany({ where: { id, status: 'pendente', preapprovalId: null } });
}

/** Não canceladas com id no Mercado Pago, não conferidas nas últimas 24 h. */
export async function listarAutomaticasParaConferir(limite: number) {
  const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return prisma.assinaturaRecorrente.findMany({
    where: {
      status: { not: 'cancelada' },
      preapprovalId: { not: null },
      OR: [{ conferidaEm: null }, { conferidaEm: { lt: ontem } }],
    },
    orderBy: { conferidaEm: { sort: 'asc', nulls: 'first' } },
    take: limite,
  });
}

/** Ativas: para reajuste de preço e troca agendada. */
export async function listarAutomaticasAtivas() {
  return prisma.assinaturaRecorrente.findMany({ where: { status: 'ativa', preapprovalId: { not: null } } });
}
