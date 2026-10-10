import { randomBytes } from 'crypto';

export const DIAS_ACESSO_GRATUITO = 7;

export function gerarSenhaInicial(): string {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = randomBytes(12);
  let senha = '';
  for (const byte of bytes) senha += alfabeto[byte % alfabeto.length];
  return senha;
}

export function fimDoAcessoGratuito(aPartirDe = new Date()): Date {
  return new Date(aPartirDe.getTime() + DIAS_ACESSO_GRATUITO * 24 * 60 * 60 * 1000);
}

/** O banco guarda o relógio de São Paulo num timestamp sem fuso. O Prisma lê esse relógio como UTC. */
export function instanteDoRelogio(data: Date): Date {
  const relogio = data.toISOString().replace(/Z$/, '');
  return new Date(`${relogio}-03:00`);
}

export function mensagemTrialEncerrado(clinica: {
  tipoAcesso: string;
  trialExpiraEm: Date | null;
}): string | null {
  if (clinica.tipoAcesso !== 'gratuito' || !clinica.trialExpiraEm) return null;
  if (instanteDoRelogio(clinica.trialExpiraEm).getTime() > Date.now()) return null;
  return 'O acesso gratuito de 7 dias desta clínica terminou. Assine um plano para continuar.';
}

export function acessoGratuitoAtivo(clinica: {
  tipoAcesso: string;
  trialExpiraEm: Date | null;
}): { expiraEm: string } | null {
  if (clinica.tipoAcesso !== 'gratuito' || !clinica.trialExpiraEm) return null;
  const expira = instanteDoRelogio(clinica.trialExpiraEm);
  if (expira.getTime() <= Date.now()) return null;
  return { expiraEm: expira.toISOString() };
}

export const DIAS_CARENCIA = 5;
const DIA_MS = 24 * 60 * 60 * 1000;

export type CicloCobranca = 'mensal' | 'anual';

export interface ClinicaCobranca {
  status?: string;
  tipoAcesso: string;
  trialExpiraEm: Date | null;
  pagoAte: Date | null;
}

/** Soma 1 mês ou 12 meses mantendo o dia. 31/01 + 1 mês vira 28/02 (ou 29/02). */
export function somarCiclo(data: Date, ciclo: CicloCobranca): Date {
  const meses = ciclo === 'anual' ? 12 : 1;
  const resultado = new Date(data.getTime());
  const dia = resultado.getUTCDate();
  resultado.setUTCDate(1);
  resultado.setUTCMonth(resultado.getUTCMonth() + meses);
  const ultimoDia = new Date(Date.UTC(resultado.getUTCFullYear(), resultado.getUTCMonth() + 1, 0)).getUTCDate();
  resultado.setUTCDate(Math.min(dia, ultimoDia));
  return resultado;
}

export function fimDaCarencia(pagoAte: Date): Date {
  return new Date(pagoAte.getTime() + DIAS_CARENCIA * DIA_MS);
}

/**
 * De onde conta o período que acabou de ser pago.
 * Teste: o que sobra do teste não se perde. Em dia ou na carência: mantém a data de vencimento.
 * Bloqueada ou sem controle: começa agora.
 */
export function inicioDoNovoPeriodo(clinica: ClinicaCobranca, agora = new Date()): Date {
  if (clinica.tipoAcesso === 'gratuito') {
    const fimTeste = clinica.trialExpiraEm ? instanteDoRelogio(clinica.trialExpiraEm) : null;
    return fimTeste && fimTeste.getTime() > agora.getTime() ? fimTeste : agora;
  }
  if (clinica.pagoAte && fimDaCarencia(clinica.pagoAte).getTime() > agora.getTime()) {
    return clinica.pagoAte;
  }
  return agora;
}

export type SituacaoAssinatura = 'teste' | 'teste_encerrado' | 'em_dia' | 'atrasada' | 'bloqueada' | 'manual';

export interface ResumoAssinatura {
  situacao: SituacaoAssinatura;
  /** Fim do teste ou fim do período pago. */
  venceEm: string | null;
  /** Quando o login para de funcionar, se nada for pago. */
  bloqueiaEm: string | null;
}

export function resumoAssinatura(clinica: ClinicaCobranca, agora = new Date()): ResumoAssinatura {
  if (clinica.tipoAcesso === 'gratuito') {
    const fim = clinica.trialExpiraEm ? instanteDoRelogio(clinica.trialExpiraEm) : null;
    if (!fim) return { situacao: 'teste', venceEm: null, bloqueiaEm: null };
    const iso = fim.toISOString();
    return {
      situacao: fim.getTime() > agora.getTime() ? 'teste' : 'teste_encerrado',
      venceEm: iso,
      bloqueiaEm: iso,
    };
  }
  if (!clinica.pagoAte) return { situacao: 'manual', venceEm: null, bloqueiaEm: null };

  const bloqueio = fimDaCarencia(clinica.pagoAte);
  const situacao: SituacaoAssinatura =
    clinica.pagoAte.getTime() > agora.getTime()
      ? 'em_dia'
      : bloqueio.getTime() > agora.getTime()
        ? 'atrasada'
        : 'bloqueada';
  return { situacao, venceEm: clinica.pagoAte.toISOString(), bloqueiaEm: bloqueio.toISOString() };
}

export type CodigoBloqueio = 'TESTE_ENCERRADO' | 'ASSINATURA_VENCIDA';

/** Motivo de cobrança que impede o login. Clínica desativada é tratada à parte. */
export function bloqueioDeCobranca(
  clinica: ClinicaCobranca,
  agora = new Date(),
): { codigo: CodigoBloqueio; mensagem: string } | null {
  const trial = mensagemTrialEncerrado(clinica);
  if (trial) return { codigo: 'TESTE_ENCERRADO', mensagem: trial };
  if (resumoAssinatura(clinica, agora).situacao === 'bloqueada') {
    return {
      codigo: 'ASSINATURA_VENCIDA',
      mensagem: `A assinatura desta clínica venceu em ${formatarDataAcesso(clinica.pagoAte!)} e o prazo de ${DIAS_CARENCIA} dias acabou. Pague para continuar.`,
    };
  }
  return null;
}

export function formatarDataAcesso(data: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(data);
}
