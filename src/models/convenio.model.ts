import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { transacao } from '../lib/tenant';

const incluir = {
  tabelaPrecos: true,
  _count: { select: { pacientes: true } },
} satisfies Prisma.ConvenioInclude;

export type ConvenioCompleto = Prisma.ConvenioGetPayload<{ include: typeof incluir }>;

export interface DadosConvenio {
  clinicaId: string;
  nome: string;
  registroAns: string | null;
  prazoPagamentoDias: number;
  exigeAutorizacaoPrevia: boolean;
  contatoNome: string;
  contatoTelefone: string;
  portalUrl: string | null;
  status?: string;
}

export async function listarPorClinica(clinicaId: string): Promise<ConvenioCompleto[]> {
  return prisma.convenio.findMany({
    where: { clinicaId },
    include: incluir,
    orderBy: { nome: 'asc' },
  });
}

export async function listarAtivosPorClinica(clinicaId: string) {
  return prisma.convenio.findMany({
    where: { clinicaId, status: 'ativo' },
    orderBy: { nome: 'asc' },
    select: { id: true, nome: true },
  });
}

export async function buscarPorIdEClinica(
  id: string,
  clinicaId: string,
): Promise<ConvenioCompleto | null> {
  return prisma.convenio.findFirst({
    where: { id, clinicaId },
    include: incluir,
  });
}

export async function nomeJaExiste(clinicaId: string, nome: string, excetoId?: string) {
  const existente = await prisma.convenio.findFirst({
    where: {
      clinicaId,
      nome,
      ...(excetoId ? { id: { not: excetoId } } : {}),
    },
    select: { id: true },
  });
  return existente !== null;
}

export async function criar(dados: DadosConvenio): Promise<ConvenioCompleto> {
  return prisma.convenio.create({
    data: {
      clinicaId: dados.clinicaId,
      nome: dados.nome,
      registroAns: dados.registroAns,
      prazoPagamentoDias: dados.prazoPagamentoDias,
      exigeAutorizacaoPrevia: dados.exigeAutorizacaoPrevia,
      contatoNome: dados.contatoNome,
      contatoTelefone: dados.contatoTelefone,
      portalUrl: dados.portalUrl,
      status: dados.status ?? 'ativo',
    },
    include: incluir,
  });
}

export async function atualizar(
  id: string,
  clinicaId: string,
  dados: Omit<DadosConvenio, 'clinicaId'>,
): Promise<ConvenioCompleto> {
  return prisma.convenio.update({
    where: { id, clinicaId },
    data: {
      nome: dados.nome,
      registroAns: dados.registroAns,
      prazoPagamentoDias: dados.prazoPagamentoDias,
      exigeAutorizacaoPrevia: dados.exigeAutorizacaoPrevia,
      contatoNome: dados.contatoNome,
      contatoTelefone: dados.contatoTelefone,
      portalUrl: dados.portalUrl,
      status: dados.status,
    },
    include: incluir,
  });
}

export async function alterarStatus(
  id: string,
  clinicaId: string,
  status: string,
): Promise<ConvenioCompleto> {
  return prisma.convenio.update({
    where: { id, clinicaId },
    data: { status },
    include: incluir,
  });
}

export async function substituirTabelaPrecos(
  convenioId: string,
  clinicaId: string,
  precos: { procedimentoId: string; valor: number }[],
): Promise<ConvenioCompleto> {
  await transacao(async (tx) => {
    const convenio = await tx.convenio.findFirst({
      where: { id: convenioId, clinicaId },
      select: { id: true },
    });
    if (!convenio) {
      throw new Error('Convênio não encontrado após atualizar a tabela.');
    }

    await tx.convenioProcedimento.deleteMany({ where: { convenioId: convenio.id } });
    if (precos.length > 0) {
      await tx.convenioProcedimento.createMany({
        data: precos.map((item) => ({
          convenioId: convenio.id,
          procedimentoId: item.procedimentoId,
          valor: item.valor,
        })),
      });
    }
  });

  const atualizado = await prisma.convenio.findFirst({
    where: { id: convenioId, clinicaId },
    include: incluir,
  });
  if (!atualizado) {
    throw new Error('Convênio não encontrado após atualizar a tabela.');
  }
  return atualizado;
}

export async function listarPacientesVinculados(convenioId: string, clinicaId: string) {
  return prisma.paciente.findMany({
    where: { convenioId, clinicaId },
    select: {
      id: true,
      nome: true,
      numeroCarteirinha: true,
      status: true,
    },
    orderBy: { nome: 'asc' },
  });
}

export async function indicadoresDoMes(convenioId: string, clinicaId: string, inicioMes: Date, fimMes: Date) {
  const [pacientesVinculados, atendimentos, taxaGlosa] = await Promise.all([
    prisma.paciente.count({ where: { convenioId, clinicaId } }),
    prisma.agendamento.findMany({
      where: {
        clinicaId,
        convenioId,
        status: 'atendido',
        data: { gte: inicioMes, lte: fimMes },
      },
      select: { valor: true },
    }),
    prisma.loteConvenio.findMany({
      where: { convenioId, clinicaId, status: { in: ['pago', 'glosado', 'parcial'] } },
      select: { valorApresentado: true, valorGlosado: true },
    }),
  ]);

  const apresentado = taxaGlosa.reduce((total, lote) => total + Number(lote.valorApresentado), 0);
  const glosado = taxaGlosa.reduce((total, lote) => total + Number(lote.valorGlosado), 0);

  return {
    pacientesVinculados,
    atendimentosMes: atendimentos.length,
    faturamentoMes: atendimentos.reduce((total, item) => total + Number(item.valor), 0),
    taxaGlosa: apresentado > 0 ? (glosado / apresentado) * 100 : 0,
  };
}
