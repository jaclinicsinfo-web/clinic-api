import { PacienteCompleto } from '../models/paciente.model';

function dataCivil(valor: Date | null | undefined): string | null {
  if (!valor) return null;
  return valor.toISOString().slice(0, 10);
}

function opcional(valor: string | null | undefined): string | null {
  return valor && valor.length > 0 ? valor : null;
}

export function convenioResumo(convenio: { id: string; nome: string }) {
  return { id: convenio.id, nome: convenio.nome };
}

export function profissionalResumo(profissional: { id: string; nome: string }) {
  return { id: profissional.id, nome: profissional.nome };
}

export function pacienteResumo(
  paciente: PacienteCompleto,
  extras?: {
    ultimoAtendimento: string | null;
    proximoAgendamento: string | null;
    saldoDevedor?: number;
  },
) {
  const responsavel = paciente.responsavelNome
    ? {
        nome: paciente.responsavelNome,
        cpf: paciente.responsavelCpf ?? '',
        parentesco: paciente.responsavelParentesco ?? '',
        telefone: paciente.responsavelTelefone ?? '',
      }
    : null;

  return {
    id: paciente.id,
    nome: paciente.nome,
    cpf: paciente.cpf,
    rg: opcional(paciente.rg),
    dataNascimento: dataCivil(paciente.dataNascimento) ?? '',
    sexo: paciente.sexo,
    estadoCivil: paciente.estadoCivil,
    profissao: opcional(paciente.profissao),
    telefone: paciente.telefone,
    whatsapp: opcional(paciente.whatsapp),
    email: opcional(paciente.email),
    endereco: {
      cep: paciente.cep,
      rua: paciente.rua,
      numero: paciente.numero,
      complemento: opcional(paciente.complemento) ?? undefined,
      bairro: paciente.bairro,
      cidade: paciente.cidade,
      uf: paciente.uf,
    },
    convenioId: paciente.convenioId,
    convenioNome: paciente.convenio?.nome ?? null,
    numeroCarteirinha: opcional(paciente.numeroCarteirinha),
    validadeCarteirinha: dataCivil(paciente.validadeCarteirinha),
    responsavel,
    alergias: paciente.alergias,
    condicoesPreexistentes: paciente.condicoesPreexistentes,
    medicacoesEmUso: paciente.medicacoesEmUso,
    profissionalPreferidoId: paciente.profissionalPreferidoId,
    profissionalPreferidoNome: paciente.profissionalPreferido?.nome ?? null,
    formaContatoPreferida: paciente.formaContatoPreferida,
    observacoes: opcional(paciente.observacoes),
    consentimentoLgpd: paciente.consentimentoLgpd,
    autorizacaoImagem: paciente.autorizacaoImagem,
    status: paciente.status,
    ultimoAtendimento: extras?.ultimoAtendimento ?? null,
    proximoAgendamento: extras?.proximoAgendamento ?? null,
    saldoDevedor: extras?.saldoDevedor ?? 0,
    criadoEm: paciente.criadoEm.toISOString(),
    atualizadoEm: paciente.atualizadoEm.toISOString(),
  };
}

export function resumoPacientes(pacientes: ReturnType<typeof pacienteResumo>[]) {
  return {
    total: pacientes.length,
    ativos: pacientes.filter((paciente) => paciente.status === 'ativo').length,
    inativos: pacientes.filter((paciente) => paciente.status === 'inativo').length,
    arquivados: pacientes.filter((paciente) => paciente.status === 'arquivado').length,
    comPendencia: pacientes.filter((paciente) => paciente.saldoDevedor > 0).length,
    valorEmAberto: pacientes.reduce((total, paciente) => total + paciente.saldoDevedor, 0),
  };
}

export function montarListaPacientes(params: {
  pacientes: PacienteCompleto[];
  convenios: { id: string; nome: string }[];
  profissionais: { id: string; nome: string }[];
  somenteProprios: boolean;
  agendaPorPaciente?: Map<string, { ultimoAtendimento: string | null; proximoAgendamento: string | null }>;
  saldoPorPaciente?: Map<string, number>;
}) {
  const pacientes = params.pacientes.map((paciente) =>
    pacienteResumo(paciente, {
      ...(params.agendaPorPaciente?.get(paciente.id) ?? { ultimoAtendimento: null, proximoAgendamento: null }),
      saldoDevedor: params.saldoPorPaciente?.get(paciente.id) ?? 0,
    }),
  );
  return {
    pacientes,
    resumo: resumoPacientes(pacientes),
    convenios: params.convenios.map(convenioResumo),
    profissionais: params.profissionais.map(profissionalResumo),
    somenteProprios: params.somenteProprios,
  };
}

export function montarOpcoesPacientes(params: {
  convenios: { id: string; nome: string }[];
  profissionais: { id: string; nome: string }[];
}) {
  return {
    convenios: params.convenios.map(convenioResumo),
    profissionais: params.profissionais.map(profissionalResumo),
  };
}

export function montarPaciente(paciente: PacienteCompleto) {
  return { paciente: pacienteResumo(paciente) };
}

export function montarDetalhePaciente(params: {
  paciente: PacienteCompleto;
  agenda?: { ultimoAtendimento: string | null; proximoAgendamento: string | null };
  proximosAgendamentos: unknown[];
  atendimentos: unknown[];
  acompanhamentos: unknown[];
  agendamentos: unknown[];
  cobrancas: unknown[];
  documentos: unknown[];
  podeVerProntuario: boolean;
  podeRegistrarProntuario: boolean;
  saldoDevedor?: number;
}) {
  return {
    paciente: pacienteResumo(params.paciente, {
      ...(params.agenda ?? { ultimoAtendimento: null, proximoAgendamento: null }),
      saldoDevedor: params.saldoDevedor ?? 0,
    }),
    proximosAgendamentos: params.proximosAgendamentos,
    atendimentos: params.atendimentos,
    acompanhamentos: params.acompanhamentos,
    agendamentos: params.agendamentos,
    cobrancas: params.cobrancas,
    documentos: params.documentos,
    podeVerProntuario: params.podeVerProntuario,
    podeRegistrarProntuario: params.podeRegistrarProntuario,
  };
}
