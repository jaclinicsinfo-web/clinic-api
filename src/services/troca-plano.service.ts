import type { Plano } from '@prisma/client';

import { env } from '../config/env';
import {
  calcularTrocaDePlano,
  formatarDataAcesso,
  inicioDoNovoPeriodo,
  precoDoCiclo,
  somarCiclo,
  type CicloCobranca,
  type PrecoPlano,
  type ResultadoTroca,
} from '../lib/assinatura';
import { sincronizarAutomatica } from '../lib/cobranca/automatica';
import { AppError } from '../lib/erros';
import { registrarEvento } from '../lib/eventos-pagamento';
import { criarPreferencia, pagador } from '../lib/mercadopago';
import { buscarAutomaticaDaClinica } from '../models/assinatura-recorrente.model';
import { buscarPorId as buscarClinica } from '../models/clinica.model';
import {
  agendarTroca,
  cancelarTrocaAgendada,
  criarPedidoTroca,
  gravarPreferencia,
  periodoEmCurso,
  registrarTrocaPlano,
} from '../models/pedido-assinatura.model';
import { assertClinicaCabeNoPlano, buscarPorId as buscarPlano } from '../models/plano.model';
import type { PagamentoClinicaInput } from '../validators/assinatura.validator';
import {
  type AcessoPagamento,
  administradorDaClinica,
  cicloDe,
  exigirMercadoPago,
  iniciarCheckoutClinica,
  planoComPreco,
  tituloDoPlano,
} from './assinatura.service';

function reais(valor: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
}

function precos(plano: Plano): PrecoPlano {
  return { codigo: plano.codigo, precoMensal: Number(plano.precoMensal), precoAnual: Number(plano.precoAnual) };
}

function nomeComCiclo(plano: Plano, ciclo: CicloCobranca) {
  return `${plano.nome} ${ciclo === 'anual' ? 'anual' : 'mensal'}`;
}

/** Limites do plano: devolve a mensagem quando a clínica tem mais usuários ou unidades do que ele permite. */
async function foraDosLimites(clinicaId: string, plano: Plano): Promise<string | null> {
  try {
    await assertClinicaCabeNoPlano(clinicaId, plano);
    return null;
  } catch (err) {
    if (err instanceof AppError && err.status === 409) return err.message;
    throw err;
  }
}

/** Tudo o que a simulação e a troca precisam, recalculado no servidor a cada chamada. */
async function montarTroca(acesso: AcessoPagamento, escolha: PagamentoClinicaInput) {
  const usuario = await administradorDaClinica(acesso);
  const clinica = await buscarClinica(acesso.clinicaId);
  if (!clinica) throw new AppError(404, 'Clínica não encontrada.');
  const planoAtual = await buscarPlano(clinica.planoId);
  if (!planoAtual) throw new AppError(404, 'Plano da clínica não encontrado.');

  const cicloNovo = cicloDe(escolha.ciclo);
  const { plano: planoNovo } = await planoComPreco(escolha.plano, cicloNovo);
  const cicloAtual = cicloDe(clinica.cicloCobranca);
  const periodo = clinica.pagoAte ? await periodoEmCurso(clinica.id, clinica.pagoAte) : null;
  const agora = new Date();

  const calculado = calcularTrocaDePlano({
    clinica,
    planoAtual: precos(planoAtual),
    cicloAtual,
    planoNovo: precos(planoNovo),
    cicloNovo,
    periodoInicio: periodo?.inicio ?? null,
    // Depois de um upgrade, o período passou a valer o preço do plano novo: usa o preço de tabela.
    valorPeriodoAtual:
      periodo && periodo.planoCodigo === planoAtual.codigo && periodo.ciclo === cicloAtual ? periodo.valor : null,
    agora,
  });
  // Escolher a troca já agendada é pagar a renovação nesse plano: o período novo começa no vencimento.
  const renovaAgendada =
    calculado.tipo === 'downgrade_agendado' &&
    clinica.planoAgendadoId === planoNovo.id &&
    cicloDe(clinica.cicloAgendado ?? clinica.cicloCobranca) === cicloNovo;
  const resultado: ResultadoTroca = renovaAgendada
    ? { tipo: 'renovacao', valor: precoDoCiclo(precos(planoNovo), cicloNovo) }
    : calculado;

  const agendada = resultado.tipo === 'downgrade_agendado';
  const limite = await foraDosLimites(clinica.id, planoNovo);
  const automatica = await buscarAutomaticaDaClinica(clinica.id);
  let bloqueio: string | null = null;
  if (automatica && cicloNovo !== cicloAtual && resultado.tipo !== 'periodo_cheio') {
    bloqueio =
      'Com a cobrança automática ligada não dá para trocar entre mensal e anual. Desative a cobrança automática, faça a troca e ative de novo.';
  } else if (limite && !agendada) {
    // Troca que vale na hora precisa caber no plano novo. A agendada só avisa (confere de novo no vencimento).
    bloqueio = limite;
  }

  return {
    usuario,
    clinica,
    planoAtual,
    planoNovo,
    cicloAtual,
    cicloNovo,
    resultado,
    agora,
    renovaAgendada,
    avisoLimite: agendada ? limite : null,
    bloqueio,
  };
}

type Troca = Awaited<ReturnType<typeof montarTroca>>;

function vencimentoDepois(troca: Troca): Date | null {
  const { resultado, clinica } = troca;
  switch (resultado.tipo) {
    case 'troca_ciclo':
      return resultado.novoFim;
    case 'sem_custo':
      return resultado.novoFim ?? clinica.pagoAte;
    case 'upgrade':
    case 'downgrade_agendado':
      return clinica.pagoAte;
    default:
      return somarCiclo(inicioDoNovoPeriodo(clinica, troca.agora), troca.cicloNovo);
  }
}

function mensagemDaTroca(troca: Troca): string {
  const { resultado, planoNovo, cicloNovo, cicloAtual, clinica } = troca;
  const nome = cicloNovo === cicloAtual ? planoNovo.nome : nomeComCiclo(planoNovo, cicloNovo);
  const vence = clinica.pagoAte ? formatarDataAcesso(clinica.pagoAte) : '';
  switch (resultado.tipo) {
    case 'upgrade':
      return `Você paga ${reais(resultado.valor)} agora e o plano muda na hora. O vencimento continua em ${vence}.`;
    case 'troca_ciclo':
      return `Você paga ${reais(resultado.valor)} agora (${reais(precoDoCiclo(precos(planoNovo), cicloNovo))} menos ${reais(resultado.credito)} do período atual). O plano ${nome} vale até ${formatarDataAcesso(resultado.novoFim)}.`;
    case 'downgrade_agendado':
      return `O plano ${nome} passa a valer em ${formatarDataAcesso(resultado.aPartirDe)}. Nada é cobrado agora.`;
    case 'sem_custo':
      return resultado.novoFim
        ? `A diferença fica abaixo de R$ 5,00: o plano ${nome} vale agora, sem cobrança, até ${formatarDataAcesso(resultado.novoFim)}.`
        : `A diferença fica abaixo de R$ 5,00: o plano muda agora, sem cobrança. O vencimento continua em ${vence}.`;
    case 'renovacao': {
      const fim = vencimentoDepois(troca);
      const ate = fim ? formatarDataAcesso(fim) : '';
      return troca.renovaAgendada
        ? `Você paga ${reais(resultado.valor)} pela renovação no plano ${nome}, que passa a valer assim que o pagamento for confirmado. A assinatura vai até ${ate}.`
        : `Você paga ${reais(resultado.valor)} e a assinatura passa a valer até ${ate}.`;
    }
    case 'periodo_cheio': {
      const fim = vencimentoDepois(troca);
      return `Você paga ${reais(resultado.valor)} pelo período ${cicloNovo === 'anual' ? 'anual' : 'mensal'} do plano ${planoNovo.nome}${fim ? `, que vale até ${formatarDataAcesso(fim)}` : ''}.`;
    }
  }
}

function valorAgora(resultado: ResultadoTroca): number {
  return 'valor' in resultado ? resultado.valor : 0;
}

export async function simularTroca(acesso: AcessoPagamento, escolha: PagamentoClinicaInput) {
  const troca = await montarTroca(acesso, escolha);
  const { resultado } = troca;
  return {
    tipo: resultado.tipo,
    valor: valorAgora(resultado),
    credito: 'credito' in resultado && resultado.credito !== undefined ? resultado.credito : null,
    venceEm: vencimentoDepois(troca)?.toISOString() ?? null,
    aPartirDe: resultado.tipo === 'downgrade_agendado' ? resultado.aPartirDe.toISOString() : null,
    mensagem: mensagemDaTroca(troca),
    avisoLimite: troca.avisoLimite,
    bloqueio: troca.bloqueio,
  };
}

export type RespostaTroca =
  | { acao: 'checkout'; pedidoId: string; checkoutUrl: string }
  | { acao: 'aplicada'; mensagem: string }
  | { acao: 'agendada'; aPartirDe: string; mensagem: string; avisoLimite: string | null };

/**
 * Upgrade e troca de ciclo: abre o checkout com o valor calculado agora (e conferido de novo na
 * confirmação). Downgrade: só agenda. Atrasada, em teste ou mesmo plano: checkout do período cheio.
 */
export async function trocarPlano(acesso: AcessoPagamento, escolha: PagamentoClinicaInput): Promise<RespostaTroca> {
  const troca = await montarTroca(acesso, escolha);
  const { usuario, clinica, planoAtual, planoNovo, cicloAtual, cicloNovo, resultado } = troca;
  if (clinica.status !== 'ativa') throw new AppError(403, 'Esta clínica está desativada. Fale com o suporte.');
  if (troca.bloqueio) throw new AppError(409, troca.bloqueio);
  const mensagem = mensagemDaTroca(troca);
  const anterior = { planoCodigo: planoAtual.codigo, ciclo: cicloAtual, pagoAte: clinica.pagoAte };

  if (resultado.tipo === 'periodo_cheio' || resultado.tipo === 'renovacao') {
    const checkout = await iniciarCheckoutClinica(acesso, escolha);
    return { acao: 'checkout', ...checkout };
  }

  if (resultado.tipo === 'downgrade_agendado') {
    await agendarTroca(clinica.id, planoNovo.id, cicloNovo);
    await registrarEvento({
      tipo: 'troca_agendada',
      nivel: 'info',
      clinicaId: clinica.id,
      mensagem: `"${clinica.nomeFantasia}" agendou a troca de ${nomeComCiclo(planoAtual, cicloAtual)} para ${nomeComCiclo(planoNovo, cicloNovo)} em ${formatarDataAcesso(resultado.aPartirDe)}.${troca.avisoLimite ? ' Hoje a clínica não cabe no plano novo.' : ''}`,
      detalhes: { plano: planoNovo.codigo, ciclo: cicloNovo, aPartirDe: resultado.aPartirDe.toISOString(), usuarioId: usuario.id },
    });
    await sincronizarAutomatica(clinica.id, `troca agendada para ${planoNovo.nome}`);
    return {
      acao: 'agendada',
      aPartirDe: resultado.aPartirDe.toISOString(),
      mensagem,
      avisoLimite: troca.avisoLimite,
    };
  }

  if (resultado.tipo === 'sem_custo') {
    const aplicada = await registrarTrocaPlano({
      pedidoId: null,
      clinicaId: clinica.id,
      planoCodigo: planoNovo.codigo,
      ciclo: cicloNovo,
      esperado: anterior,
      novoPeriodo: resultado.novoInicio && resultado.novoFim ? { inicio: resultado.novoInicio, fim: resultado.novoFim } : null,
      pagamentoId: null,
    });
    if (!aplicada.aplicada) throw new AppError(409, 'A assinatura mudou enquanto você escolhia. Atualize a página e tente de novo.');
    await registrarEvento({
      tipo: 'troca_aplicada',
      nivel: 'info',
      clinicaId: clinica.id,
      valor: 0,
      mensagem: `"${clinica.nomeFantasia}" trocou de ${nomeComCiclo(planoAtual, cicloAtual)} para ${nomeComCiclo(planoNovo, cicloNovo)} sem cobrança (diferença abaixo de R$ 5,00).`,
      detalhes: { usuarioId: usuario.id, credito: resultado.credito ?? null, periodoFim: aplicada.fim.toISOString() },
    });
    await sincronizarAutomatica(clinica.id, 'troca de plano sem custo');
    return { acao: 'aplicada', mensagem: `Pronto: a clínica já está no plano ${planoNovo.nome}.` };
  }

  // upgrade ou troca de ciclo: pagamento avulso do valor proporcional.
  exigirMercadoPago();
  const credito = resultado.tipo === 'troca_ciclo' ? resultado.credito : null;
  const pedido = await criarPedidoTroca(
    clinica.id,
    { plano: planoNovo.codigo, ciclo: cicloNovo, usuarioId: usuario.id, troca: resultado.tipo },
    resultado.valor,
    anterior,
    credito,
  );
  const descricao =
    resultado.tipo === 'upgrade'
      ? `Diferença proporcional do plano ${planoNovo.nome} até ${formatarDataAcesso(clinica.pagoAte!)}`
      : `Plano ${nomeComCiclo(planoNovo, cicloNovo)} com crédito de ${reais(resultado.credito)} do período atual`;
  const { preferenciaId, checkoutUrl } = await criarPreferencia({
    pedidoId: pedido.id,
    itemId: `${planoNovo.codigo}-${cicloNovo}-troca`,
    titulo: `${tituloDoPlano(planoNovo.nome, cicloNovo)} — troca de plano`,
    descricao,
    valor: resultado.valor,
    ciclo: cicloNovo,
    pagador: pagador(usuario.nome, usuario.email),
    retorno: `${env.FRONTEND_URL.replace(/\/+$/, '')}/assinatura/retorno`,
  });
  await gravarPreferencia(pedido.id, preferenciaId);
  await registrarEvento({
    tipo: 'checkout_criado',
    nivel: 'info',
    pedidoId: pedido.id,
    clinicaId: clinica.id,
    valor: resultado.valor,
    status: 'pendente',
    mensagem: `"${clinica.nomeFantasia}" abriu o pagamento da troca de ${nomeComCiclo(planoAtual, cicloAtual)} para ${nomeComCiclo(planoNovo, cicloNovo)} (${resultado.tipo === 'upgrade' ? 'proporcional' : `crédito de ${reais(resultado.credito)}`}).`,
    detalhes: { preferenciaId, tipo: 'troca_plano', troca: resultado.tipo, plano: planoNovo.codigo, ciclo: cicloNovo, usuarioId: usuario.id },
  });
  return { acao: 'checkout', pedidoId: pedido.id, checkoutUrl };
}

export async function cancelarTroca(acesso: AcessoPagamento) {
  const usuario = await administradorDaClinica(acesso);
  if (!(await cancelarTrocaAgendada(acesso.clinicaId))) {
    throw new AppError(404, 'Não há troca de plano agendada.');
  }
  await registrarEvento({
    tipo: 'troca_agendada_cancelada',
    nivel: 'info',
    clinicaId: acesso.clinicaId,
    mensagem: `"${usuario.clinica.nomeFantasia}" cancelou a troca de plano agendada.`,
    detalhes: { usuarioId: usuario.id },
  });
  await sincronizarAutomatica(acesso.clinicaId, 'troca agendada cancelada');
  return { mensagem: 'Troca cancelada. O plano atual continua na renovação.' };
}
