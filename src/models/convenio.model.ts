import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';

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
  dados: Omit<DadosConvenio, 'clinicaId'>,
): Promise<ConvenioCompleto> {
  return prisma.convenio.update({
    where: { id },
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

export async function alterarStatus(id: string, status: string): Promise<ConvenioCompleto> {
  return prisma.convenio.update({
    where: { id },
    data: { status },
    include: incluir,
  });
}

export async function substituirTabelaPrecos(
  convenioId: string,
  precos: { procedimentoId: string; valor: number }[],
): Promise<ConvenioCompleto> {
  await prisma.$transaction([
    prisma.convenioProcedimento.deleteMany({ where: { convenioId } }),
    ...(precos.length > 0
      ? [
          prisma.convenioProcedimento.createMany({
            data: precos.map((item) => ({
              convenioId,
              procedimentoId: item.procedimentoId,
              valor: item.valor,
            })),
          }),
        ]
      : []),
  ]);

  const atualizado = await prisma.convenio.findUnique({
    where: { id: convenioId },
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
  const [pacientesVinculados, atendimentos] = await Promise.all([
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
  ]);

  return {
    pacientesVinculados,
    atendimentosMes: atendimentos.length,
    faturamentoMes: atendimentos.reduce((total, item) => total + Number(item.valor), 0),
    taxaGlosa: 0,
  };
}
