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
  return somarMeses(data, ciclo === 'anual' ? 12 : 1);
}

/** Volta 1 mês ou 12 meses mantendo o dia (o contrário de somarCiclo). */
export function subtrairCiclo(data: Date, ciclo: CicloCobranca): Date {
  return somarMeses(data, ciclo === 'anual' ? -12 : -1);
}

function somarMeses(data: Date, meses: number): Date {
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

export type MarcoCobranca =
  | 'D-30'
  | 'D-5'
  | 'D-1'
  | 'D0'
  | 'D+1'
  | 'D+3'
  | 'D+5'
  | 'teste-2'
  | 'teste-fim'
  /** Cobrança automática ativa: "vamos cobrar no cartão em dd/mm". */
  | 'auto-3';

/** Dia de calendário em São Paulo, como número de dias desde 1970. */
function diaEmSaoPaulo(data: Date): number {
  const [ano, mes, dia] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' })
    .format(data)
    .split('-')
    .map(Number);
  return Date.UTC(ano, mes - 1, dia) / DIA_MS;
}

/** Dias de calendário (São Paulo) de `agora` até `alvo`. Negativo quando já passou. */
export function diasAte(alvo: Date, agora = new Date()): number {
  return diaEmSaoPaulo(alvo) - diaEmSaoPaulo(agora);
}

/** Atraso máximo para ainda mandar um marco (servidor fora do ar não gera e-mail velho). */
const ATRASO_MAXIMO_DIAS = 2;

export interface MarcoAtual {
  marco: MarcoCobranca;
  /** Vencimento (ou fim do teste) que gerou o marco. Muda quando a clínica paga. */
  referencia: Date;
  vence: Date;
  bloqueia: Date;
}

/**
 * Lembrete que cabe agora: o marco mais avançado já alcançado, se não estiver velho demais.
 * Só para clínica ativa em teste ou paga pelo Mercado Pago (pagoAte preenchido).
 * Com a cobrança automática ativa, os avisos antes do vencimento viram um só, três dias antes.
 */
export function marcoDeCobranca(
  clinica: ClinicaCobranca & { cicloCobranca?: string | null; automatica?: boolean },
  agora = new Date(),
): MarcoAtual | null {
  if (clinica.status && clinica.status !== 'ativa') return null;

  if (clinica.tipoAcesso === 'gratuito') {
    if (!clinica.trialExpiraEm) return null;
    const fim = instanteDoRelogio(clinica.trialExpiraEm);
    const base = { referencia: fim, vence: fim, bloqueia: fim };
    if (agora.getTime() >= fim.getTime()) {
      return agora.getTime() - fim.getTime() <= ATRASO_MAXIMO_DIAS * DIA_MS ? { marco: 'teste-fim', ...base } : null;
    }
    return diasAte(fim, agora) <= 2 ? { marco: 'teste-2', ...base } : null;
  }

  if (clinica.tipoAcesso !== 'pago' || !clinica.pagoAte) return null;
  const vence = clinica.pagoAte;
  const bloqueia = fimDaCarencia(vence);
  const base = { referencia: vence, vence, bloqueia };

  if (agora.getTime() >= bloqueia.getTime()) {
    return agora.getTime() - bloqueia.getTime() <= ATRASO_MAXIMO_DIAS * DIA_MS ? { marco: 'D+5', ...base } : null;
  }

  const dias = diasAte(vence, agora);
  const atraso: { marco: MarcoCobranca; limite: number }[] = [
    { marco: 'D+3', limite: -3 },
    { marco: 'D+1', limite: -1 },
  ];
  const marcos: { marco: MarcoCobranca; limite: number }[] = clinica.automatica
    ? [...atraso, { marco: 'auto-3', limite: 3 }]
    : [
        ...atraso,
        { marco: 'D0', limite: 0 },
        { marco: 'D-1', limite: 1 },
        { marco: 'D-5', limite: 5 },
        ...(clinica.cicloCobranca === 'anual' ? [{ marco: 'D-30' as const, limite: 30 }] : []),
      ];
  const alcancado = marcos.find((item) => dias <= item.limite);
  if (!alcancado) return null;
  if (alcancado.limite - dias > ATRASO_MAXIMO_DIAS) return null;
  return { marco: alcancado.marco, ...base };
}

// ---------------------------------------------------------------- troca de plano no meio do período

/** Diferença abaixo disso não é cobrada: a troca acontece sem pagamento. */
export const VALOR_MINIMO_TROCA = 5;

export interface PrecoPlano {
  codigo: string;
  precoMensal: number;
  precoAnual: number;
}

export function precoDoCiclo(plano: PrecoPlano, ciclo: CicloCobranca): number {
  return ciclo === 'anual' ? plano.precoAnual : plano.precoMensal;
}

/** Receita mensal da clínica: no anual, o preço anual dividido por 12. */
export function valorMensalDe(plano: PrecoPlano, ciclo: CicloCobranca): number {
  return ciclo === 'anual' ? centavos(plano.precoAnual / 12) : plano.precoMensal;
}

function centavos(valor: number): number {
  return Math.round(valor * 100) / 100;
}

export type ResultadoTroca =
  /** Mesmo plano e ciclo: é a renovação de sempre. */
  | { tipo: 'renovacao'; valor: number }
  /** Plano mais caro no mesmo ciclo: paga a diferença dos dias que faltam; o vencimento não muda. */
  | { tipo: 'upgrade'; valor: number; mantemVencimento: true }
  /** Mensal ↔ anual: o novo ciclo começa agora e o que sobra do atual vira crédito. */
  | { tipo: 'troca_ciclo'; valor: number; credito: number; novoInicio: Date; novoFim: Date }
  /** Plano mais barato (ou crédito maior que o novo ciclo): vale no próximo vencimento, nada é cobrado. */
  | { tipo: 'downgrade_agendado'; aPartirDe: Date }
  /** Diferença abaixo do mínimo: troca na hora, sem cobrança. Com novoFim, o ciclo também muda. */
  | { tipo: 'sem_custo'; credito?: number; novoInicio?: Date; novoFim?: Date }
  /** Atrasada, bloqueada, em teste ou sem vencimento: paga o período cheio do plano escolhido. */
  | { tipo: 'periodo_cheio'; valor: number };

export interface EntradaTroca {
  clinica: ClinicaCobranca;
  planoAtual: PrecoPlano;
  cicloAtual: CicloCobranca;
  planoNovo: PrecoPlano;
  cicloNovo: CicloCobranca;
  /** Início do período em curso (último pedido pago de período cheio). Sem ele: vencimento menos um ciclo. */
  periodoInicio: Date | null;
  /** Quanto valeu o período em curso. Sem ele: o preço do plano atual no ciclo atual. */
  valorPeriodoAtual?: number | null;
  agora?: Date;
}

/**
 * Proporção do período em curso que ainda falta, contada em dias de calendário (São Paulo).
 * Passa de 1 quando a clínica pagou adiantado mais de um período.
 */
export function proporcaoRestante(pagoAte: Date, periodoInicio: Date, agora = new Date()): number {
  const restantes = Math.max(0, diasAte(pagoAte, agora));
  const total = Math.max(1, diasAte(pagoAte, periodoInicio));
  return restantes / total;
}

/**
 * Quanto custa trocar de plano ou de ciclo agora e o que acontece com o vencimento.
 * upgrade:     (preço novo − preço atual) × proporção
 * troca ciclo: preço do novo ciclo − (valor do período atual × proporção)
 */
export function calcularTrocaDePlano(entrada: EntradaTroca): ResultadoTroca {
  const agora = entrada.agora ?? new Date();
  const { clinica, planoAtual, cicloAtual, planoNovo, cicloNovo } = entrada;
  const precoNovo = precoDoCiclo(planoNovo, cicloNovo);

  if (resumoAssinatura(clinica, agora).situacao !== 'em_dia' || !clinica.pagoAte) {
    return { tipo: 'periodo_cheio', valor: precoNovo };
  }
  if (planoAtual.codigo === planoNovo.codigo && cicloAtual === cicloNovo) {
    return { tipo: 'renovacao', valor: precoNovo };
  }

  const pagoAte = clinica.pagoAte;
  const inicio =
    entrada.periodoInicio && entrada.periodoInicio.getTime() < pagoAte.getTime()
      ? entrada.periodoInicio
      : subtrairCiclo(pagoAte, cicloAtual);
  const proporcao = proporcaoRestante(pagoAte, inicio, agora);

  if (cicloAtual === cicloNovo) {
    const diferenca = precoNovo - precoDoCiclo(planoAtual, cicloAtual);
    if (diferenca <= 0) return { tipo: 'downgrade_agendado', aPartirDe: pagoAte };
    const valor = centavos(diferenca * proporcao);
    if (valor < VALOR_MINIMO_TROCA) return { tipo: 'sem_custo' };
    return { tipo: 'upgrade', valor, mantemVencimento: true };
  }

  const base = entrada.valorPeriodoAtual ?? precoDoCiclo(planoAtual, cicloAtual);
  const credito = centavos(base * proporcao);
  // Crédito cobre o novo ciclo inteiro (anual → mensal com meses sobrando): troca no vencimento, sem devolver nada.
  if (credito >= precoNovo) return { tipo: 'downgrade_agendado', aPartirDe: pagoAte };
  const novoInicio = agora;
  const novoFim = somarCiclo(agora, cicloNovo);
  const valor = centavos(precoNovo - credito);
  if (valor < VALOR_MINIMO_TROCA) return { tipo: 'sem_custo', credito, novoInicio, novoFim };
  return { tipo: 'troca_ciclo', valor, credito, novoInicio, novoFim };
}

export function formatarDataAcesso(data: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(data);
}
