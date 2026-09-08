import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { horariosSobrepoem } from '../lib/datas';

const incluir = {
  paciente: { select: { id: true, nome: true, telefone: true, cpf: true, dataNascimento: true, convenioId: true, alergias: true, status: true } },
  profissional: { select: { id: true, nome: true } },
  procedimento: { select: { id: true, nome: true } },
  convenio: { select: { id: true, nome: true } },
  criadoPor: { select: { id: true, nome: true } },
} satisfies Prisma.AgendamentoInclude;

export type AgendamentoCompleto = Prisma.AgendamentoGetPayload<{ include: typeof incluir }>;

export interface FiltroAgenda {
  clinicaId: string;
  de: Date;
  ate: Date;
  profissionalId?: string;
}

export interface DadosAgendamento {
  clinicaId: string;
  unidadeId: string;
  pacienteId: string;
  profissionalId: string;
  procedimentoId: string;
  data: Date;
  horaInicio: string;
  horaFim: string;
  sala: string | null;
  convenioId: string | null;
  particular: boolean;
  tipo: string;
  valor: number;
  status: string;
  observacoes: string | null;
  criadoPorId: string;
}

export async function listar(filtro: FiltroAgenda): Promise<AgendamentoCompleto[]> {
  return prisma.agendamento.findMany({
    where: {
      clinicaId: filtro.clinicaId,
      data: { gte: filtro.de, lte: filtro.ate },
      ...(filtro.profissionalId ? { profissionalId: filtro.profissionalId } : {}),
    },
    include: incluir,
    orderBy: [{ data: 'asc' }, { horaInicio: 'asc' }],
  });
}

export async function listarDoPaciente(pacienteId: string, clinicaId: string): Promise<AgendamentoCompleto[]> {
  return prisma.agendamento.findMany({
    where: { pacienteId, clinicaId },
    include: incluir,
    orderBy: [{ data: 'desc' }, { horaInicio: 'desc' }],
  });
}

export async function listarDoProfissional(profissionalId: string, clinicaId: string): Promise<AgendamentoCompleto[]> {
  return prisma.agendamento.findMany({
    where: { profissionalId, clinicaId },
    include: incluir,
    orderBy: [{ data: 'desc' }, { horaInicio: 'desc' }],
  });
}

const selectPacienteAgenda = {
  id: true,
  nome: true,
  telefone: true,
  cpf: true,
  dataNascimento: true,
  convenioId: true,
  alergias: true,
  status: true,
} as const;

export type PacienteResumoAgenda = Prisma.PacienteGetPayload<{ select: typeof selectPacienteAgenda }>;

export async function listarUltimosPacientesAgrupados(
  clinicaId: string,
  profissionalId?: string,
  limite = 3,
): Promise<{ clinica: PacienteResumoAgenda[]; porProfissional: Record<string, PacienteResumoAgenda[]> }> {
  const agendamentos = await prisma.agendamento.findMany({
    where: {
      clinicaId,
      ...(profissionalId ? { profissionalId } : {}),
      status: { notIn: ['cancelado'] },
      paciente: { status: { not: 'arquivado' } },
    },
    orderBy: [{ data: 'desc' }, { horaInicio: 'desc' }],
    take: profissionalId ? limite * 20 : 400,
    select: {
      profissionalId: true,
      paciente: { select: selectPacienteAgenda },
    },
  });

  const clinica: PacienteResumoAgenda[] = [];
  const vistoClinica = new Set<string>();
  const porProfissional: Record<string, PacienteResumoAgenda[]> = {};

  for (const item of agendamentos) {
    if (!vistoClinica.has(item.paciente.id) && clinica.length < limite) {
      vistoClinica.add(item.paciente.id);
      clinica.push(item.paciente);
    }

    const lista = porProfissional[item.profissionalId] ?? [];
    if (lista.length < limite && !lista.some((paciente) => paciente.id === item.paciente.id)) {
      lista.push(item.paciente);
      porProfissional[item.profissionalId] = lista;
    }
  }

  return { clinica, porProfissional };
}

export async function buscarPorIdEClinica(
  id: string,
  clinicaId: string,
): Promise<AgendamentoCompleto | null> {
  return prisma.agendamento.findFirst({
    where: { id, clinicaId },
    include: incluir,
  });
}

export async function criar(dados: DadosAgendamento): Promise<AgendamentoCompleto> {
  return prisma.agendamento.create({
    data: dados,
    include: incluir,
  });
}

export async function atualizar(
  id: string,
  dados: Omit<DadosAgendamento, 'clinicaId' | 'unidadeId' | 'criadoPorId'>,
): Promise<AgendamentoCompleto> {
  return prisma.agendamento.update({
    where: { id },
    data: {
      pacienteId: dados.pacienteId,
      profissionalId: dados.profissionalId,
      procedimentoId: dados.procedimentoId,
      data: dados.data,
      horaInicio: dados.horaInicio,
      horaFim: dados.horaFim,
      sala: dados.sala,
      convenioId: dados.convenioId,
      particular: dados.particular,
      tipo: dados.tipo,
      valor: dados.valor,
      status: dados.status,
      observacoes: dados.observacoes,
    },
    include: incluir,
  });
}

export async function alterarStatus(id: string, status: string): Promise<AgendamentoCompleto> {
  return prisma.agendamento.update({
    where: { id },
    data: { status },
    include: incluir,
  });
}

export async function reagendar(
  id: string,
  dados: { data: Date; horaInicio: string; horaFim: string; profissionalId: string },
): Promise<AgendamentoCompleto> {
  return prisma.agendamento.update({
    where: { id },
    data: dados,
    include: incluir,
  });
}

export async function marcarLembrete(id: string, lembreteEnviado: boolean): Promise<AgendamentoCompleto> {
  return prisma.agendamento.update({
    where: { id },
    data: { lembreteEnviado },
    include: incluir,
  });
}

const STATUS_OCUPAM = ['agendado', 'confirmado', 'check_in', 'em_atendimento', 'atendido'];

export async function horarioOcupado(params: {
  clinicaId: string;
  profissionalId: string;
  data: Date;
  horaInicio: string;
  horaFim: string;
  excetoId?: string;
}) {
  const [agendamentos, bloqueios] = await Promise.all([
    prisma.agendamento.findMany({
      where: {
        clinicaId: params.clinicaId,
        profissionalId: params.profissionalId,
        data: params.data,
        status: { in: STATUS_OCUPAM },
        ...(params.excetoId ? { id: { not: params.excetoId } } : {}),
      },
      select: { horaInicio: true, horaFim: true },
    }),
    prisma.bloqueioAgenda.findMany({
      where: {
        clinicaId: params.clinicaId,
        profissionalId: params.profissionalId,
        data: params.data,
      },
      select: { horaInicio: true, horaFim: true },
    }),
  ]);

  const conflitoAgenda = agendamentos.some((item) =>
    horariosSobrepoem(params.horaInicio, params.horaFim, item.horaInicio, item.horaFim),
  );
  const conflitoBloqueio = bloqueios.some((item) =>
    horariosSobrepoem(params.horaInicio, params.horaFim, item.horaInicio, item.horaFim),
  );
  return conflitoAgenda || conflitoBloqueio;
}

export async function datasPorPacientes(clinicaId: string, pacienteIds: string[]) {
  if (pacienteIds.length === 0) {
    return new Map<string, { ultimoAtendimento: string | null; proximoAgendamento: string | null }>();
  }

  const agendamentos = await prisma.agendamento.findMany({
    where: {
      clinicaId,
      pacienteId: { in: pacienteIds },
      status: { not: 'cancelado' },
    },
    select: { pacienteId: true, data: true, horaInicio: true, status: true },
  });

  const hoje = new Date().toISOString().slice(0, 10);
  const mapa = new Map<string, { ultimoAtendimento: string | null; proximoAgendamento: string | null }>();
  const futuros = new Set(['agendado', 'confirmado', 'check_in', 'em_atendimento']);

  for (const item of agendamentos) {
    const dataIso = item.data.toISOString().slice(0, 10);
    const atual = mapa.get(item.pacienteId) ?? { ultimoAtendimento: null, proximoAgendamento: null };

    if (item.status === 'atendido') {
      if (!atual.ultimoAtendimento || dataIso > atual.ultimoAtendimento) {
        atual.ultimoAtendimento = dataIso;
      }
    }

    if (futuros.has(item.status) && dataIso >= hoje) {
      const atualProximo = atual.proximoAgendamento;
      if (
        !atualProximo ||
        dataIso < atualProximo ||
        (dataIso === atualProximo && item.horaInicio < (atualProximo.split('T')[1] ?? '99:99'))
      ) {
        atual.proximoAgendamento = dataIso;
      }
    }

    mapa.set(item.pacienteId, atual);
  }

  return mapa;
}

export async function listarBloqueios(filtro: FiltroAgenda) {
  return prisma.bloqueioAgenda.findMany({
    where: {
      clinicaId: filtro.clinicaId,
      data: { gte: filtro.de, lte: filtro.ate },
      ...(filtro.profissionalId ? { profissionalId: filtro.profissionalId } : {}),
    },
    orderBy: [{ data: 'asc' }, { horaInicio: 'asc' }],
  });
}

export async function criarBloqueio(dados: {
  clinicaId: string;
  profissionalId: string;
  data: Date;
  horaInicio: string;
  horaFim: string;
  motivo: string;
}) {
  return prisma.bloqueioAgenda.create({ data: dados });
}

export async function buscarBloqueio(id: string, clinicaId: string) {
  return prisma.bloqueioAgenda.findFirst({ where: { id, clinicaId } });
}

export async function removerBloqueio(id: string) {
  await prisma.bloqueioAgenda.delete({ where: { id } });
}

const incluirEspera = {
  paciente: { select: { id: true, nome: true, telefone: true } },
  procedimento: { select: { id: true, nome: true } },
} satisfies Prisma.ListaEsperaItemInclude;

export type ListaEsperaCompleta = Prisma.ListaEsperaItemGetPayload<{ include: typeof incluirEspera }>;

export async function listarEspera(clinicaId: string, profissionalId?: string): Promise<ListaEsperaCompleta[]> {
  return prisma.listaEsperaItem.findMany({
    where: {
      clinicaId,
      status: 'aguardando',
      ...(profissionalId ? { OR: [{ profissionalId }, { profissionalId: null }] } : {}),
    },
    include: incluirEspera,
    orderBy: { criadoEm: 'asc' },
  });
}

export async function criarEspera(dados: {
  clinicaId: string;
  unidadeId: string;
  pacienteId: string;
  profissionalId: string | null;
  procedimentoId: string | null;
  preferenciaPeriodo: string;
}): Promise<ListaEsperaCompleta> {
  return prisma.listaEsperaItem.create({
    data: { ...dados, status: 'aguardando' },
    include: incluirEspera,
  });
}

export async function buscarEspera(id: string, clinicaId: string): Promise<ListaEsperaCompleta | null> {
  return prisma.listaEsperaItem.findFirst({
    where: { id, clinicaId },
    include: incluirEspera,
  });
}

export async function marcarEsperaEncaixada(id: string): Promise<ListaEsperaCompleta> {
  return prisma.listaEsperaItem.update({
    where: { id },
    data: { status: 'encaixado' },
    include: incluirEspera,
  });
}

export async function removerEspera(id: string) {
  await prisma.listaEsperaItem.delete({ where: { id } });
}
