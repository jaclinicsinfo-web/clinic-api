import { AgendamentoCompleto, ListaEsperaCompleta } from '../models/agendamento.model';
import { dataCivil, dinheiro } from '../lib/datas';
import { BloqueioAgenda } from '@prisma/client';

export function agendamentoResumo(agendamento: AgendamentoCompleto) {
  return {
    id: agendamento.id,
    pacienteId: agendamento.pacienteId,
    pacienteNome: agendamento.paciente.nome,
    profissionalId: agendamento.profissionalId,
    profissionalNome: agendamento.profissional.nome,
    procedimentoId: agendamento.procedimentoId,
    procedimentoNome: agendamento.procedimento.nome,
    data: dataCivil(agendamento.data) ?? '',
    horaInicio: agendamento.horaInicio,
    horaFim: agendamento.horaFim,
    sala: agendamento.sala,
    convenioId: agendamento.convenioId,
    convenioNome: agendamento.convenio?.nome ?? null,
    particular: agendamento.particular,
    valor: dinheiro(agendamento.valor),
    status: agendamento.status,
    observacoes: agendamento.observacoes,
    lembreteEnviado: agendamento.lembreteEnviado,
    criadoPor: agendamento.criadoPor.nome,
    criadoEm: agendamento.criadoEm.toISOString(),
  };
}

export function bloqueioResumo(bloqueio: BloqueioAgenda) {
  return {
    id: bloqueio.id,
    profissionalId: bloqueio.profissionalId,
    data: dataCivil(bloqueio.data) ?? '',
    horaInicio: bloqueio.horaInicio,
    horaFim: bloqueio.horaFim,
    motivo: bloqueio.motivo,
  };
}

export function esperaResumo(item: ListaEsperaCompleta) {
  return {
    id: item.id,
    pacienteId: item.pacienteId,
    pacienteNome: item.paciente.nome,
    telefone: item.paciente.telefone,
    profissionalId: item.profissionalId,
    procedimentoNome: item.procedimento?.nome ?? 'A definir',
    preferenciaPeriodo: item.preferenciaPeriodo,
    criadoEm: item.criadoEm.toISOString(),
  };
}

export const SALAS_PADRAO = [
  'Consultório 1',
  'Consultório 2',
  'Consultório 3',
  'Sala de Exames',
  'Sala Cirúrgica',
];

export function montarAgenda(params: {
  agendamentos: AgendamentoCompleto[];
  bloqueios: BloqueioAgenda[];
  listaEspera: ListaEsperaCompleta[];
  profissionais: unknown[];
  procedimentos: unknown[];
  convenios: { id: string; nome: string }[];
  pacientes: unknown[];
  somenteProprios: boolean;
  meuProfissionalId: string | null;
}) {
  return {
    agendamentos: params.agendamentos.map(agendamentoResumo),
    bloqueios: params.bloqueios.map(bloqueioResumo),
    listaEspera: params.listaEspera.map(esperaResumo),
    profissionais: params.profissionais,
    procedimentos: params.procedimentos,
    convenios: params.convenios,
    pacientes: params.pacientes,
    salas: SALAS_PADRAO,
    somenteProprios: params.somenteProprios,
    meuProfissionalId: params.meuProfissionalId,
  };
}

export function montarAgendamento(agendamento: AgendamentoCompleto) {
  return { agendamento: agendamentoResumo(agendamento) };
}

export function montarBloqueio(bloqueio: BloqueioAgenda) {
  return { bloqueio: bloqueioResumo(bloqueio) };
}

export function montarEspera(item: ListaEsperaCompleta) {
  return { item: esperaResumo(item) };
}
