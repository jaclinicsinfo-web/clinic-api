import { dataCivil } from '../datas';
import {
  CanalLembrete,
  ORDEM_STATUS_ENVIO,
  STATUS_AGENDA_ATIVOS,
  StatusEnvio,
  TipoDestinatario,
  TipoLembrete,
} from './constantes';

export function destinatariosDaRegra(destinatarios: string): TipoDestinatario[] {
  if (destinatarios === 'ambos') return ['paciente', 'profissional'];
  if (destinatarios === 'profissional') return ['profissional'];
  return ['paciente'];
}

export function canaisDaRegra(canais: string[]): CanalLembrete[] {
  return canais.filter((canal): canal is CanalLembrete => canal === 'whatsapp' || canal === 'email');
}

export function chaveIdempotencia(params: {
  agendamentoId: string;
  regraId: string;
  destinatarioTipo: string;
  canal: string;
  tipo: TipoLembrete;
  referenciaEvento?: string;
}): string {
  const base = [
    params.agendamentoId,
    params.regraId,
    params.destinatarioTipo,
    params.canal,
    params.tipo,
  ];
  if (params.tipo === 'reagendamento' && params.referenciaEvento) {
    base.push(params.referenciaEvento);
  }
  return base.join(':');
}

export function instanteAgendamento(data: Date, horaInicio: string): Date {
  const civil = dataCivil(data);
  return new Date(`${civil}T${horaInicio}:00-03:00`);
}

export function calcularProcessarEm(params: {
  tipo: TipoLembrete;
  data: Date;
  horaInicio: string;
  antecedenciaMinutos: number | null | undefined;
  agora?: Date;
}): Date {
  const agora = params.agora ?? new Date();
  if (params.tipo !== 'antecedencia') return agora;

  const inicio = instanteAgendamento(params.data, params.horaInicio);
  const minutos = params.antecedenciaMinutos ?? 0;
  const alvo = new Date(inicio.getTime() - minutos * 60 * 1000);
  return alvo.getTime() < agora.getTime() ? agora : alvo;
}

export function agendamentoPermiteAntecedencia(status: string, data: Date, horaInicio: string, agora = new Date()): boolean {
  if (!(STATUS_AGENDA_ATIVOS as readonly string[]).includes(status)) return false;
  return instanteAgendamento(data, horaInicio).getTime() > agora.getTime();
}

export function podeAvancarStatus(atual: string, proximo: StatusEnvio): boolean {
  const atualOrdem = ORDEM_STATUS_ENVIO[atual as StatusEnvio];
  const proximoOrdem = ORDEM_STATUS_ENVIO[proximo];
  if (atualOrdem == null || proximoOrdem == null) return false;
  if (atual === 'falhou' || atual === 'cancelado') {
    return proximo === 'falhou';
  }
  return proximoOrdem >= atualOrdem;
}

export function statusWhatsappParaEnvio(statusMeta: string): StatusEnvio | null {
  const mapa: Record<string, StatusEnvio> = {
    sent: 'enviado',
    delivered: 'entregue',
    read: 'lido',
    failed: 'falhou',
  };
  return mapa[statusMeta] ?? null;
}

export function normalizarTelefoneWhatsapp(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const digits = valor.replace(/\D/g, '');
  if (digits.length < 10) return null;
  if (digits.startsWith('55')) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export function emailValido(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const email = valor.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}
