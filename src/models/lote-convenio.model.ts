import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';

const incluir = {
  convenio: { select: { id: true, nome: true, prazoPagamentoDias: true } },
  guias: {
    include: {
      cobranca: {
        select: {
          id: true,
          descricao: true,
          valor: true,
          paciente: { select: { id: true, nome: true } },
        },
      },
    },
  },
} satisfies Prisma.LoteConvenioInclude;

export type LoteCompleto = Prisma.LoteConvenioGetPayload<{ include: typeof incluir }>;

export async function listarPorClinica(clinicaId: string): Promise<LoteCompleto[]> {
  return prisma.loteConvenio.findMany({
    where: { clinicaId },
    include: incluir,
    orderBy: [{ competencia: 'desc' }, { criadoEm: 'desc' }],
  });
}

export async function buscarPorIdEClinica(id: string, clinicaId: string): Promise<LoteCompleto | null> {
  return prisma.loteConvenio.findFirst({
    where: { id, clinicaId },
    include: incluir,
  });
}

export async function jaExiste(clinicaId: string, convenioId: string, competencia: string) {
  const lote = await prisma.loteConvenio.findFirst({
    where: { clinicaId, convenioId, competencia },
    select: { id: true },
  });
  return lote !== null;
}

export async function criar(params: {
  clinicaId: string;
  convenioId: string;
  competencia: string;
  cobrancaIds: string[];
  valorApresentado: number;
}): Promise<LoteCompleto> {
  return prisma.loteConvenio.create({
    data: {
      clinicaId: params.clinicaId,
      convenioId: params.convenioId,
      competencia: params.competencia,
      status: 'aberto',
      valorApresentado: params.valorApresentado,
      guias: {
        create: params.cobrancaIds.map((cobrancaId) => ({ cobrancaId })),
      },
    },
    include: incluir,
  });
}

export async function enviar(
  id: string,
  clinicaId: string,
  enviadoEm: Date,
  previsaoPagamento: Date,
): Promise<LoteCompleto> {
  return prisma.loteConvenio.update({
    where: { id, clinicaId },
    data: { status: 'enviado', enviadoEm, previsaoPagamento },
    include: incluir,
  });
}

export async function reconciliar(params: {
  id: string;
  clinicaId: string;
  valorGlosado: number;
  valorRecebido: number;
  status: string;
}): Promise<LoteCompleto> {
  return prisma.loteConvenio.update({
    where: { id: params.id, clinicaId: params.clinicaId },
    data: {
      valorGlosado: params.valorGlosado,
      valorRecebido: params.valorRecebido,
      status: params.status,
    },
    include: incluir,
  });
}

export async function cobrancasElegiveis(clinicaId: string, convenioId: string, inicio: Date, fim: Date) {
  return prisma.cobranca.findMany({
    where: {
      clinicaId,
      convenioId,
      status: { in: ['pendente', 'parcelado'] },
      vencimento: { gte: inicio, lte: fim },
      lotes: { none: {} },
    },
    include: {
      paciente: { select: { id: true, nome: true } },
    },
  });
}

export async function taxaGlosaDoConvenio(convenioId: string, clinicaId: string) {
  const lotes = await prisma.loteConvenio.findMany({
    where: { convenioId, clinicaId, status: { in: ['pago', 'glosado', 'parcial'] } },
    select: { valorApresentado: true, valorGlosado: true },
  });
  const apresentado = lotes.reduce((total, lote) => total + Number(lote.valorApresentado), 0);
  const glosado = lotes.reduce((total, lote) => total + Number(lote.valorGlosado), 0);
  return apresentado > 0 ? (glosado / apresentado) * 100 : 0;
}
