import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';

const incluir = {
  profissional: { select: { id: true, nome: true } },
} satisfies Prisma.ComissaoInclude;

export type ComissaoCompleta = Prisma.ComissaoGetPayload<{ include: typeof incluir }>;

export async function listarPorClinica(clinicaId: string, profissionalId?: string): Promise<ComissaoCompleta[]> {
  return prisma.comissao.findMany({
    where: { clinicaId, ...(profissionalId ? { profissionalId } : {}) },
    include: incluir,
    orderBy: [{ competencia: 'desc' }, { profissional: { nome: 'asc' } }],
  });
}

export async function listarPorProfissional(profissionalId: string, clinicaId: string): Promise<ComissaoCompleta[]> {
  return listarPorClinica(clinicaId, profissionalId);
}

export async function buscarPorIdEClinica(id: string, clinicaId: string): Promise<ComissaoCompleta | null> {
  return prisma.comissao.findFirst({
    where: { id, clinicaId },
    include: incluir,
  });
}

export async function upsertPrevista(params: {
  clinicaId: string;
  profissionalId: string;
  competencia: string;
  atendimentos: number;
  faturamentoGerado: number;
  percentual: number;
  valorComissao: number;
}): Promise<ComissaoCompleta> {
  const existente = await prisma.comissao.findFirst({
    where: {
      clinicaId: params.clinicaId,
      profissionalId: params.profissionalId,
      competencia: params.competencia,
    },
  });

  if (existente) {
    if (existente.status !== 'prevista') {
      return prisma.comissao.findFirstOrThrow({
        where: { id: existente.id },
        include: incluir,
      });
    }
    return prisma.comissao.update({
      where: { id: existente.id },
      data: {
        atendimentos: params.atendimentos,
        faturamentoGerado: params.faturamentoGerado,
        percentual: params.percentual,
        valorComissao: params.valorComissao,
      },
      include: incluir,
    });
  }

  return prisma.comissao.create({
    data: params,
    include: incluir,
  });
}

export async function aprovar(id: string): Promise<ComissaoCompleta> {
  return prisma.comissao.update({
    where: { id },
    data: { status: 'aprovada' },
    include: incluir,
  });
}

export async function aprovarPrevistas(clinicaId: string, competencia: string) {
  await prisma.comissao.updateMany({
    where: { clinicaId, competencia, status: 'prevista' },
    data: { status: 'aprovada' },
  });
  return listarPorClinica(clinicaId);
}

export async function pagar(id: string, pagoEm: Date): Promise<ComissaoCompleta> {
  return prisma.comissao.update({
    where: { id },
    data: { status: 'paga', pagoEm },
    include: incluir,
  });
}

export async function faturamentoDoPeriodo(params: {
  clinicaId: string;
  profissionalId: string;
  inicio: Date;
  fim: Date;
}) {
  const agendamentos = await prisma.agendamento.findMany({
    where: {
      clinicaId: params.clinicaId,
      profissionalId: params.profissionalId,
      status: 'atendido',
      data: { gte: params.inicio, lte: params.fim },
    },
    select: { id: true, valor: true },
  });

  return {
    atendimentos: agendamentos.length,
    faturamentoGerado: agendamentos.reduce((total, item) => total + Number(item.valor), 0),
  };
}

export async function profissionaisComissionaveis(clinicaId: string) {
  return prisma.profissional.findMany({
    where: { clinicaId, status: 'ativo', formaRemuneracao: { not: 'fixo' } },
    select: { id: true, nome: true, percentualComissao: true },
    orderBy: { nome: 'asc' },
  });
}
