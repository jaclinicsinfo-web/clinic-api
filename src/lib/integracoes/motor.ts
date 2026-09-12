import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { dataCivil } from '../datas';
import { TipoLembrete } from './constantes';
import { formatarDataPt, interpolarTexto, parametrosWhatsapp } from './placeholders';
import {
  agendamentoPermiteAntecedencia,
  calcularProcessarEm,
  canaisDaRegra,
  chaveIdempotencia,
  destinatariosDaRegra,
  emailValido,
  instanteAgendamento,
  normalizarTelefoneWhatsapp,
} from './regras';
import { listarRegrasAtivas } from '../../models/regra-lembrete.model';
import { obterConfiguracao } from '../../models/integracao.model';
import {
  cancelarPendentesDoAgendamento,
  criarEnvioSeNovo,
} from '../../models/envio-lembrete.model';

const incluirAgenda = {
  paciente: {
    select: { id: true, nome: true, email: true, whatsapp: true, telefone: true },
  },
  profissional: {
    select: { id: true, nome: true, email: true, telefone: true },
  },
  procedimento: { select: { id: true, nome: true } },
  unidade: { select: { id: true, nome: true } },
  clinica: { select: { id: true, nomeFantasia: true } },
} satisfies Prisma.AgendamentoInclude;

type AgendamentoMotor = Prisma.AgendamentoGetPayload<{ include: typeof incluirAgenda }>;

export async function carregarAgendamentoMotor(id: string, clinicaId: string) {
  return prisma.agendamento.findFirst({
    where: { id, clinicaId },
    include: incluirAgenda,
  });
}

function contextoDe(agendamento: AgendamentoMotor) {
  const data = dataCivil(agendamento.data) ?? '';
  return {
    pacienteNome: agendamento.paciente.nome,
    profissionalNome: agendamento.profissional.nome,
    data: formatarDataPt(data),
    horario: agendamento.horaInicio,
    procedimento: agendamento.procedimento.nome,
    unidade: agendamento.unidade.nome,
    sala: agendamento.sala ?? '',
    clinicaNome: agendamento.clinica.nomeFantasia,
    tipoAtendimento: agendamento.tipo === 'avaliacao' ? 'Avaliação' : 'Atendimento',
  };
}

function contatoDestinatario(
  agendamento: AgendamentoMotor,
  tipo: 'paciente' | 'profissional',
  canal: 'whatsapp' | 'email',
): { id: string; nome: string; contato: string | null } {
  if (tipo === 'paciente') {
    const contato =
      canal === 'email'
        ? emailValido(agendamento.paciente.email)
        : normalizarTelefoneWhatsapp(agendamento.paciente.whatsapp || agendamento.paciente.telefone);
    return { id: agendamento.paciente.id, nome: agendamento.paciente.nome, contato };
  }
  const contato =
    canal === 'email'
      ? emailValido(agendamento.profissional.email)
      : normalizarTelefoneWhatsapp(agendamento.profissional.telefone);
  return { id: agendamento.profissional.id, nome: agendamento.profissional.nome, contato };
}

function canalHabilitado(
  canal: 'whatsapp' | 'email',
  config: { whatsappAtivo: boolean; emailAtivo: boolean } | null,
) {
  if (!config) return false;
  return canal === 'whatsapp' ? config.whatsappAtivo : config.emailAtivo;
}

async function enfileirarRegra(params: {
  agendamento: AgendamentoMotor;
  regra: Awaited<ReturnType<typeof listarRegrasAtivas>>[number];
  referenciaEvento?: string;
  imediato?: boolean;
}) {
  const config = await obterConfiguracao(params.agendamento.clinicaId);
  if (!config?.lembretesAtivos) return;

  const processarEm = params.imediato
    ? new Date()
    : calcularProcessarEm({
        tipo: params.regra.tipo as TipoLembrete,
        data: params.agendamento.data,
        horaInicio: params.agendamento.horaInicio,
        antecedenciaMinutos: params.regra.antecedenciaMinutos,
      });

  for (const destinatarioTipo of destinatariosDaRegra(params.regra.destinatarios)) {
    for (const canal of canaisDaRegra(params.regra.canais)) {
      if (!canalHabilitado(canal, config)) continue;

      const template = canal === 'whatsapp' ? params.regra.templateWhatsapp : params.regra.templateEmail;
      const destino = contatoDestinatario(params.agendamento, destinatarioTipo, canal);
      const chave = chaveIdempotencia({
        agendamentoId: params.agendamento.id,
        regraId: params.regra.id,
        destinatarioTipo,
        canal,
        tipo: params.regra.tipo as TipoLembrete,
        referenciaEvento: params.referenciaEvento,
      });

      await criarEnvioSeNovo({
        clinicaId: params.agendamento.clinicaId,
        agendamentoId: params.agendamento.id,
        regraId: params.regra.id,
        templateId: template?.id ?? null,
        canal,
        destinatarioTipo,
        destinatarioId: destino.id,
        destinatarioNome: destino.nome,
        destinatarioContato: destino.contato ?? '',
        tipoLembrete: params.regra.tipo,
        status: 'pendente',
        chaveIdempotencia: chave,
        processarEm,
        metadados: {
          templateNome: template?.whatsappNomeTemplate ?? null,
          parametros: template ? parametrosWhatsapp(template.corpo, contextoDe(params.agendamento)) : [],
          preview: template ? interpolarTexto(template.corpo, contextoDe(params.agendamento)) : null,
        },
      });
    }
  }
}

export async function sincronizarAntecedencia(agendamentoId: string, clinicaId: string): Promise<void> {
  const agendamento = await carregarAgendamentoMotor(agendamentoId, clinicaId);
  if (!agendamento) return;

  const config = await obterConfiguracao(clinicaId);
  if (!config?.lembretesAtivos) return;

  if (!agendamentoPermiteAntecedencia(agendamento.status, agendamento.data, agendamento.horaInicio)) {
    await cancelarPendentesDoAgendamento({ clinicaId, agendamentoId, tipo: 'antecedencia' });
    return;
  }

  const regras = await listarRegrasAtivas(clinicaId, 'antecedencia');
  for (const regra of regras) {
    await enfileirarRegra({ agendamento, regra });
  }
}

export async function dispararEventoAgenda(params: {
  agendamentoId: string;
  clinicaId: string;
  evento: 'criado' | 'confirmado' | 'reagendado' | 'cancelado';
}): Promise<void> {
  const agendamento = await carregarAgendamentoMotor(params.agendamentoId, params.clinicaId);
  if (!agendamento) return;

  if (params.evento === 'criado') {
    await sincronizarAntecedencia(params.agendamentoId, params.clinicaId);
    return;
  }

  if (params.evento === 'cancelado') {
    await cancelarPendentesDoAgendamento({
      clinicaId: params.clinicaId,
      agendamentoId: params.agendamentoId,
    });
    const regras = await listarRegrasAtivas(params.clinicaId, 'cancelamento');
    for (const regra of regras) {
      await enfileirarRegra({ agendamento, regra, imediato: true });
    }
    return;
  }

  if (params.evento === 'reagendado') {
    await cancelarPendentesDoAgendamento({
      clinicaId: params.clinicaId,
      agendamentoId: params.agendamentoId,
      tipo: 'antecedencia',
    });
    const referencia = `${dataCivil(agendamento.data)}-${agendamento.horaInicio}`;
    const regras = await listarRegrasAtivas(params.clinicaId, 'reagendamento');
    for (const regra of regras) {
      await enfileirarRegra({ agendamento, regra, referenciaEvento: referencia, imediato: true });
    }
    await sincronizarAntecedencia(params.agendamentoId, params.clinicaId);
    return;
  }

  if (params.evento === 'confirmado') {
    const regras = await listarRegrasAtivas(params.clinicaId, 'confirmacao');
    for (const regra of regras) {
      await enfileirarRegra({ agendamento, regra, imediato: true });
    }
  }
}

export async function varrerAntecedencias(): Promise<void> {
  const clinicas = await prisma.integracaoClinica.findMany({
    where: { lembretesAtivos: true },
    select: { clinicaId: true },
  });
  if (clinicas.length === 0) return;

  const agora = new Date();
  const limite = new Date(agora.getTime() + 8 * 24 * 60 * 60 * 1000);
  const inicioHoje = new Date(`${dataCivil(agora)}T00:00:00.000Z`);

  for (const clinica of clinicas) {
    const agendamentos = await prisma.agendamento.findMany({
      where: {
        clinicaId: clinica.clinicaId,
        data: { gte: inicioHoje, lte: limite },
        status: { in: ['agendado', 'confirmado', 'check_in', 'em_atendimento'] },
      },
      select: { id: true, data: true, horaInicio: true },
    });

    for (const item of agendamentos) {
      if (instanteAgendamento(item.data, item.horaInicio).getTime() <= agora.getTime()) continue;
      await sincronizarAntecedencia(item.id, clinica.clinicaId);
    }
  }
}
