import { Prisma } from '@prisma/client';
import { prisma, type ClientePrisma } from '../config/database';
import { transacao } from '../lib/tenant';

const incluir = {
  usuario: { select: { id: true, nome: true, email: true } },
  procedimentos: { select: { procedimentoId: true } },
  gradeHorarios: { orderBy: { diaSemana: 'asc' as const } },
} satisfies Prisma.ProfissionalInclude;

export type ProfissionalCompleto = Prisma.ProfissionalGetPayload<{ include: typeof incluir }>;

export interface DadosProfissional {
  clinicaId: string;
  usuarioId: string | null;
  nome: string;
  cpf: string;
  rg: string | null;
  email: string;
  telefone: string;
  fotoUrl: string | null;
  especialidades: string[];
  conselho: string;
  registroConselho: string;
  tipoVinculo: string;
  formaRemuneracao: string;
  dataAdmissao: Date;
  percentualComissao: number;
  comissaoPorProcedimento: boolean;
  procedimentoIds: string[];
  gradeHorarios: { diaSemana: number; horaInicio: string; horaFim: string }[];
  status?: string;
}

export async function listarPorClinica(clinicaId: string): Promise<ProfissionalCompleto[]> {
  return prisma.profissional.findMany({
    where: { clinicaId },
    include: incluir,
    orderBy: { nome: 'asc' },
  });
}

export async function listarAtivosPorClinica(clinicaId: string) {
  return prisma.profissional.findMany({
    where: { clinicaId, status: 'ativo' },
    include: incluir,
    orderBy: { nome: 'asc' },
  });
}

export async function buscarPorIdEClinica(
  id: string,
  clinicaId: string,
): Promise<ProfissionalCompleto | null> {
  return prisma.profissional.findFirst({
    where: { id, clinicaId },
    include: incluir,
  });
}

export async function buscarPorUsuarioId(usuarioId: string, clinicaId: string) {
  return prisma.profissional.findFirst({
    where: { usuarioId, clinicaId, status: 'ativo' },
    include: incluir,
  });
}

export async function ehProfissionalAtivoDaClinica(id: string, clinicaId: string) {
  const encontrado = await prisma.profissional.findFirst({
    where: { id, clinicaId, status: 'ativo' },
    select: { id: true },
  });
  return encontrado !== null;
}

export async function cpfJaExiste(clinicaId: string, cpf: string, excetoId?: string) {
  const existente = await prisma.profissional.findFirst({
    where: {
      clinicaId,
      cpf,
      ...(excetoId ? { id: { not: excetoId } } : {}),
    },
    select: { id: true },
  });
  return existente !== null;
}

export async function usuarioJaVinculado(usuarioId: string, clinicaId: string, excetoId?: string) {
  const existente = await prisma.profissional.findFirst({
    where: {
      usuarioId,
      clinicaId,
      ...(excetoId ? { id: { not: excetoId } } : {}),
    },
    select: { id: true },
  });
  return existente !== null;
}

async function persistir(
  dados: DadosProfissional,
  id: string | undefined,
  tx: ClientePrisma,
): Promise<ProfissionalCompleto> {
  const payload = {
    clinicaId: dados.clinicaId,
    usuarioId: dados.usuarioId,
    nome: dados.nome,
    cpf: dados.cpf,
    rg: dados.rg,
    email: dados.email,
    telefone: dados.telefone,
    fotoUrl: dados.fotoUrl,
    especialidades: dados.especialidades,
    conselho: dados.conselho,
    registroConselho: dados.registroConselho,
    tipoVinculo: dados.tipoVinculo,
    formaRemuneracao: dados.formaRemuneracao,
    dataAdmissao: dados.dataAdmissao,
    percentualComissao: dados.percentualComissao,
    comissaoPorProcedimento: dados.comissaoPorProcedimento,
    status: dados.status ?? 'ativo',
  };

  const profissional = id
    ? await tx.profissional.update({
        where: { id, clinicaId: dados.clinicaId },
        data: {
          ...payload,
          procedimentos: { deleteMany: {} },
          gradeHorarios: { deleteMany: {} },
        },
      })
    : await tx.profissional.create({ data: payload });

  if (dados.procedimentoIds.length > 0) {
    await tx.profissionalProcedimento.createMany({
      data: dados.procedimentoIds.map((procedimentoId) => ({
        profissionalId: profissional.id,
        procedimentoId,
      })),
    });
  }

  if (dados.gradeHorarios.length > 0) {
    await tx.profissionalHorario.createMany({
      data: dados.gradeHorarios.map((grade) => ({
        profissionalId: profissional.id,
        diaSemana: grade.diaSemana,
        horaInicio: grade.horaInicio,
        horaFim: grade.horaFim,
      })),
    });
  }

  return tx.profissional.findUniqueOrThrow({
    where: { id: profissional.id, clinicaId: dados.clinicaId },
    include: incluir,
  });
}

export async function criar(dados: DadosProfissional): Promise<ProfissionalCompleto> {
  return transacao((tx) => persistir(dados, undefined, tx));
}

export async function atualizar(id: string, dados: DadosProfissional): Promise<ProfissionalCompleto> {
  return transacao((tx) => persistir(dados, id, tx));
}

export async function alterarStatus(
  id: string,
  clinicaId: string,
  status: string,
): Promise<ProfissionalCompleto> {
  return prisma.profissional.update({
    where: { id, clinicaId },
    data: { status },
    include: incluir,
  });
}

export async function indicadores(
  profissionalId: string,
  clinicaId: string,
  inicioMes: Date,
  fimMes: Date,
) {
  const doMes = await prisma.agendamento.findMany({
    where: {
      clinicaId,
      profissionalId,
      data: { gte: inicioMes, lte: fimMes },
    },
    select: { status: true, valor: true, horaInicio: true, horaFim: true, pacienteId: true },
  });

  const atendidos = doMes.filter((item) => item.status === 'atendido');
  const faltas = doMes.filter((item) => item.status === 'faltou');
  const pacientesAtendidos = new Set(atendidos.map((item) => item.pacienteId)).size;

  return {
    atendimentosMes: atendidos.length,
    agendamentosMes: doMes.length,
    faturamentoGerado: atendidos.reduce((total, item) => total + Number(item.valor), 0),
    taxaFaltas: doMes.length > 0 ? (faltas.length / doMes.length) * 100 : 0,
    pacientesAtendidos,
    minutosAgendados: doMes
      .filter((item) => item.status !== 'cancelado')
      .reduce((total, item) => {
        const [hi, mi] = item.horaInicio.split(':').map(Number);
        const [hf, mf] = item.horaFim.split(':').map(Number);
        return total + (hf * 60 + mf - (hi * 60 + mi));
      }, 0),
  };
}

export async function pacientesAtendidos(profissionalId: string, clinicaId: string) {
  const agendamentos = await prisma.agendamento.findMany({
    where: { clinicaId, profissionalId },
    select: {
      pacienteId: true,
      status: true,
      data: true,
      paciente: {
        select: {
          id: true,
          nome: true,
          telefone: true,
          status: true,
          convenio: { select: { nome: true } },
        },
      },
    },
    orderBy: { data: 'desc' },
  });

  const porPaciente = new Map<
    string,
    {
      id: string;
      nome: string;
      telefone: string;
      convenio: string;
      status: string;
      atendimentos: number;
      ultimaVisita: string | null;
    }
  >();

  for (const item of agendamentos) {
    const atual = porPaciente.get(item.pacienteId) ?? {
      id: item.paciente.id,
      nome: item.paciente.nome,
      telefone: item.paciente.telefone,
      convenio: item.paciente.convenio?.nome ?? 'Particular',
      status: item.paciente.status,
      atendimentos: 0,
      ultimaVisita: null as string | null,
    };
    if (item.status === 'atendido') {
      atual.atendimentos += 1;
      const dataIso = item.data.toISOString().slice(0, 10);
      if (!atual.ultimaVisita || dataIso > atual.ultimaVisita) {
        atual.ultimaVisita = dataIso;
      }
    }
    porPaciente.set(item.pacienteId, atual);
  }

  return [...porPaciente.values()].sort((a, b) => b.atendimentos - a.atendimentos);
}
