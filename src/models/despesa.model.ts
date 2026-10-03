import { prisma } from '../config/database';

export interface DadosDespesa {
  clinicaId: string;
  unidadeId: string;
  descricao: string;
  categoria: string;
  fornecedor: string;
  valor: number;
  vencimento: Date;
  recorrente?: boolean;
  formaPagamento?: string | null;
  observacoes?: string | null;
  status?: string;
  pagoEm?: Date | null;
}

export async function listarPorClinica(clinicaId: string) {
  return prisma.despesa.findMany({
    where: { clinicaId },
    orderBy: [{ vencimento: 'desc' }, { criadoEm: 'desc' }],
  });
}

export async function buscarPorIdEClinica(id: string, clinicaId: string) {
  return prisma.despesa.findFirst({ where: { id, clinicaId } });
}

export async function criar(dados: DadosDespesa) {
  return prisma.despesa.create({
    data: {
      clinicaId: dados.clinicaId,
      unidadeId: dados.unidadeId,
      descricao: dados.descricao,
      categoria: dados.categoria,
      fornecedor: dados.fornecedor,
      valor: dados.valor,
      vencimento: dados.vencimento,
      recorrente: dados.recorrente ?? false,
      formaPagamento: dados.formaPagamento ?? null,
      observacoes: dados.observacoes ?? null,
      status: dados.status ?? 'a_pagar',
      pagoEm: dados.pagoEm ?? null,
    },
  });
}

export async function atualizar(
  id: string,
  clinicaId: string,
  dados: Omit<DadosDespesa, 'clinicaId' | 'unidadeId'>,
) {
  return prisma.despesa.update({
    where: { id, clinicaId },
    data: {
      descricao: dados.descricao,
      categoria: dados.categoria,
      fornecedor: dados.fornecedor,
      valor: dados.valor,
      vencimento: dados.vencimento,
      recorrente: dados.recorrente ?? false,
      formaPagamento: dados.formaPagamento ?? null,
      observacoes: dados.observacoes ?? null,
    },
  });
}

export async function registrarPagamento(params: {
  id: string;
  clinicaId: string;
  formaPagamento: string;
  pagoEm: Date;
  observacoes?: string | null;
}) {
  return prisma.despesa.update({
    where: { id: params.id, clinicaId: params.clinicaId },
    data: {
      status: 'pago',
      formaPagamento: params.formaPagamento,
      pagoEm: params.pagoEm,
      observacoes: params.observacoes,
    },
  });
}

export async function remover(id: string, clinicaId: string) {
  await prisma.despesa.delete({ where: { id, clinicaId } });
}

export async function listarPagasEntre(clinicaId: string, inicio: Date, fim: Date) {
  return prisma.despesa.findMany({
    where: { clinicaId, status: 'pago', pagoEm: { gte: inicio, lte: fim } },
    select: { valor: true, pagoEm: true, categoria: true },
  });
}
