import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';

const incluirAcompanhamento = {
  profissional: { select: { id: true, nome: true } },
} satisfies Prisma.AcompanhamentoClinicoInclude;

const incluirAtendimento = {
  profissional: { select: { id: true, nome: true } },
  anexos: {
    select: {
      id: true,
      nome: true,
      tipo: true,
      tamanhoKb: true,
      origem: true,
      criadoEm: true,
    },
  },
} satisfies Prisma.AtendimentoInclude;

export type AcompanhamentoCompleto = Prisma.AcompanhamentoClinicoGetPayload<{
  include: typeof incluirAcompanhamento;
}>;

export type AtendimentoCompleto = Prisma.AtendimentoGetPayload<{ include: typeof incluirAtendimento }>;

export async function listarAcompanhamentos(pacienteId: string, clinicaId: string): Promise<AcompanhamentoCompleto[]> {
  return prisma.acompanhamentoClinico.findMany({
    where: { pacienteId, clinicaId },
    include: incluirAcompanhamento,
    orderBy: { inicioEm: 'desc' },
  });
}

export async function buscarAcompanhamento(id: string, clinicaId: string): Promise<AcompanhamentoCompleto | null> {
  return prisma.acompanhamentoClinico.findFirst({
    where: { id, clinicaId },
    include: incluirAcompanhamento,
  });
}

export async function criarAcompanhamento(dados: {
  clinicaId: string;
  pacienteId: string;
  profissionalId: string;
  especialidade: string;
  titulo: string;
  queixaInicial: string;
  quadroInicial: string;
  objetivo: string | null;
  inicioEm: Date;
}): Promise<AcompanhamentoCompleto> {
  return prisma.acompanhamentoClinico.create({
    data: { ...dados, status: 'em_andamento' },
    include: incluirAcompanhamento,
  });
}

export async function encerrarAcompanhamento(
  id: string,
  dados: { altaEm: Date; resumoAlta: string | null },
): Promise<AcompanhamentoCompleto> {
  return prisma.acompanhamentoClinico.update({
    where: { id },
    data: { status: 'alta', altaEm: dados.altaEm, resumoAlta: dados.resumoAlta },
    include: incluirAcompanhamento,
  });
}

export async function listarAtendimentos(pacienteId: string, clinicaId: string): Promise<AtendimentoCompleto[]> {
  return prisma.atendimento.findMany({
    where: { pacienteId, clinicaId },
    include: incluirAtendimento,
    orderBy: { data: 'desc' },
  });
}

export async function criarAtendimento(dados: {
  clinicaId: string;
  agendamentoId: string | null;
  acompanhamentoId: string | null;
  pacienteId: string;
  profissionalId: string;
  data: Date;
  procedimentoRealizado: string;
  tipoRegistro: string;
  queixaPrincipal: string | null;
  quadroClinico: string | null;
  evolucao: string;
  conduta: string | null;
  respostaAoTratamento: string | null;
  escalaDor: number | null;
  proximoRetornoSugerido: Date | null;
  criadoPorId: string;
}): Promise<AtendimentoCompleto> {
  return prisma.atendimento.create({
    data: dados,
    include: incluirAtendimento,
  });
}

export async function registrarAcessoProntuario(dados: {
  clinicaId: string;
  pacienteId: string;
  usuarioId: string;
  acao: string;
}) {
  await prisma.logAcessoProntuario.create({ data: dados });
}
