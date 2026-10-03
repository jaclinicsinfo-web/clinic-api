import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';

const incluir = {
  valoresConvenio: { select: { convenioId: true, valor: true } },
} satisfies Prisma.ProcedimentoInclude;

export type ProcedimentoCompleto = Prisma.ProcedimentoGetPayload<{ include: typeof incluir }>;

export interface DadosProcedimento {
  clinicaId: string;
  nome: string;
  categoria: string;
  duracaoPadraoMin: number;
  valorParticular: number;
  status?: string;
}

export async function listarPorClinica(clinicaId: string): Promise<ProcedimentoCompleto[]> {
  return prisma.procedimento.findMany({
    where: { clinicaId },
    include: incluir,
    orderBy: { nome: 'asc' },
  });
}

export async function listarAtivosPorClinica(clinicaId: string): Promise<ProcedimentoCompleto[]> {
  return prisma.procedimento.findMany({
    where: { clinicaId, status: 'ativo' },
    include: incluir,
    orderBy: { nome: 'asc' },
  });
}

export async function buscarPorIdEClinica(
  id: string,
  clinicaId: string,
): Promise<ProcedimentoCompleto | null> {
  return prisma.procedimento.findFirst({
    where: { id, clinicaId },
    include: incluir,
  });
}

export async function idsPertencemAClinica(ids: string[], clinicaId: string) {
  if (ids.length === 0) return true;
  const unicos = [...new Set(ids)];
  const encontrados = await prisma.procedimento.count({
    where: { clinicaId, id: { in: unicos } },
  });
  return encontrados === unicos.length;
}

export async function nomeJaExiste(clinicaId: string, nome: string, excetoId?: string) {
  const existente = await prisma.procedimento.findFirst({
    where: {
      clinicaId,
      nome,
      ...(excetoId ? { id: { not: excetoId } } : {}),
    },
    select: { id: true },
  });
  return existente !== null;
}

export async function criar(dados: DadosProcedimento): Promise<ProcedimentoCompleto> {
  return prisma.procedimento.create({
    data: {
      clinicaId: dados.clinicaId,
      nome: dados.nome,
      categoria: dados.categoria,
      duracaoPadraoMin: dados.duracaoPadraoMin,
      valorParticular: dados.valorParticular,
      status: dados.status ?? 'ativo',
    },
    include: incluir,
  });
}

export async function atualizar(
  id: string,
  clinicaId: string,
  dados: Omit<DadosProcedimento, 'clinicaId'>,
): Promise<ProcedimentoCompleto> {
  return prisma.procedimento.update({
    where: { id, clinicaId },
    data: {
      nome: dados.nome,
      categoria: dados.categoria,
      duracaoPadraoMin: dados.duracaoPadraoMin,
      valorParticular: dados.valorParticular,
      status: dados.status,
    },
    include: incluir,
  });
}

export async function alterarStatus(
  id: string,
  clinicaId: string,
  status: string,
): Promise<ProcedimentoCompleto> {
  return prisma.procedimento.update({
    where: { id, clinicaId },
    data: { status },
    include: incluir,
  });
}
