import { horaParaMinutos } from './datas';

export const TIPOS_BATIDA = ['entrada', 'saida_intervalo', 'retorno_intervalo', 'saida'] as const;
export type TipoBatida = (typeof TIPOS_BATIDA)[number];

export const ORIGENS_PONTO = ['manual', 'proprio'] as const;
export type OrigemPonto = (typeof ORIGENS_PONTO)[number];

export interface HorariosPonto {
  entrada: string | null;
  saidaIntervalo: string | null;
  retornoIntervalo: string | null;
  saida: string | null;
}

export function competenciaDeData(dataCivil: string): string {
  return dataCivil.slice(0, 7);
}

export function competenciaValida(valor: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(valor)) return false;
  const mes = Number(valor.slice(5, 7));
  return mes >= 1 && mes <= 12;
}

export function inicioFimDaCompetencia(competencia: string): { inicio: Date; fim: Date } {
  const ano = Number(competencia.slice(0, 4));
  const mes = Number(competencia.slice(5, 7));
  return {
    inicio: new Date(Date.UTC(ano, mes - 1, 1)),
    fim: new Date(Date.UTC(ano, mes, 0)),
  };
}

export function campoDaBatida(tipo: TipoBatida): keyof HorariosPonto {
  if (tipo === 'saida_intervalo') return 'saidaIntervalo';
  if (tipo === 'retorno_intervalo') return 'retornoIntervalo';
  return tipo;
}

export function proximoTipoBatida(horarios: HorariosPonto): TipoBatida | null {
  if (!horarios.entrada) return 'entrada';
  if (!horarios.saidaIntervalo && !horarios.saida) return 'saida_intervalo';
  if (horarios.saidaIntervalo && !horarios.retornoIntervalo && !horarios.saida) return 'retorno_intervalo';
  if (!horarios.saida) return 'saida';
  return null;
}

export function validarHorariosPonto(horarios: HorariosPonto): string | null {
  if (horarios.saidaIntervalo && !horarios.entrada) {
    return 'Informe a entrada antes do intervalo.';
  }
  if (horarios.retornoIntervalo && !horarios.saidaIntervalo) {
    return 'Informe o início do intervalo antes do retorno.';
  }
  if (horarios.saida && !horarios.entrada) {
    return 'Informe a entrada antes da saída.';
  }

  const sequencia: Array<[string, string | null]> = [
    ['entrada', horarios.entrada],
    ['início do intervalo', horarios.saidaIntervalo],
    ['retorno do intervalo', horarios.retornoIntervalo],
    ['saída', horarios.saida],
  ];

  let anterior: { rotulo: string; valor: string } | null = null;
  for (const [rotulo, valor] of sequencia) {
    if (!valor) continue;
    if (anterior && horaParaMinutos(valor) <= horaParaMinutos(anterior.valor)) {
      return `O horário de ${rotulo} deve ser posterior ao de ${anterior.rotulo}.`;
    }
    anterior = { rotulo, valor };
  }

  return null;
}

export function minutosTrabalhados(horarios: HorariosPonto): number | null {
  if (!horarios.entrada || !horarios.saida) return null;
  const bruto = horaParaMinutos(horarios.saida) - horaParaMinutos(horarios.entrada);
  const intervalo =
    horarios.saidaIntervalo && horarios.retornoIntervalo
      ? horaParaMinutos(horarios.retornoIntervalo) - horaParaMinutos(horarios.saidaIntervalo)
      : 0;
  return Math.max(bruto - intervalo, 0);
}

export function statusDoPonto(horarios: HorariosPonto): 'completo' | 'incompleto' | 'em_andamento' {
  if (horarios.entrada && horarios.saida) return 'completo';
  if (horarios.entrada) return 'em_andamento';
  return 'incompleto';
}

export function formatarDuracao(minutos: number | null): string | null {
  if (minutos == null) return null;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return `${horas}h ${String(resto).padStart(2, '0')}min`;
}
