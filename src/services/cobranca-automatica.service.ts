import type { AssinaturaRecorrente, Plano } from '@prisma/client';

import { env } from '../config/env';
import {
  fimDaCarencia,
  formatarDataAcesso,
  precoDoCiclo,
  resumoAssinatura,
  type CicloCobranca,
} from '../lib/assinatura';
import { sincronizarAutomatica } from '../lib/cobranca/automatica';
import { enfileirarEmail } from '../lib/email/fila';
import {
  montarEmailAutomaticaRecusada,
  montarEmailReajuste,
  montarEmailTrocaNaoAplicada,
} from '../lib/email/templates/cobranca';
import { AppError } from '../lib/erros';
import { meioDoPagamento, mensagemDeErro, registrarEvento } from '../lib/eventos-pagamento';
import {
  atualizarAssinaturaRecorrente,
  buscarAssinaturaRecorrente,
  buscarCobrancaAutorizada,
  buscarPagamento,
  buscarCobrancasDaAssinatura,
  criarAssinaturaRecorrente,
  valorConfere,
  type AssinaturaMercadoPago,
  type PagamentoMercadoPago,
} from '../lib/mercadopago';
import {
  apagarAutomaticaPendente,
  atualizarAutomatica,
  buscarAutomatica,
  buscarAutomaticaDaClinica,
  buscarAutomaticaPorPreapproval,
  criarAutomatica,
  listarAutomaticasAtivas,
  listarAutomaticasParaConferir,
  marcarAutomaticaCancelada,
  type MotivoCancelamento,
} from '../models/assinatura-recorrente.model';
import { buscarPorId as buscarClinica } from '../models/clinica.model';
import {
  listarAdministradoresAtivos,
  listarTrocasAgendadasNoVencimento,
  notificarAdministrador,
} from '../models/cobranca-assinatura.model';
import { buscarPedidoPorPagamento, cancelarTrocaAgendada, criarPedidoRecorrente } from '../models/pedido-assinatura.model';
import { assertClinicaCabeNoPlano, buscarPorCodigo, buscarPorId as buscarPlano } from '../models/plano.model';
import {
  type AcessoPagamento,
  administradorDaClinica,
  cicloDe,
  confirmarPedido,
  exigirMercadoPago,
  infoDoPagamento,
  processarAvisoMercadoPago,
  tituloDoPlano,
} from './assinatura.service';

/** Aumento de preço só vale na cobrança automática depois deste aviso por e-mail. */
export const DIAS_AVISO_REAJUSTE = 30;
const DIA_MS = 24 * 60 * 60 * 1000;

function linkAssinatura() {
  return `${env.FRONTEND_URL.replace(/\/+$/, '')}/configuracoes/assinatura`;
}

function reais(valor: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
}

function precoDe(plano: Plano, ciclo: CicloCobranca) {
  return precoDoCiclo(
    { codigo: plano.codigo, precoMensal: Number(plano.precoMensal), precoAnual: Number(plano.precoAnual) },
    ciclo,
  );
}

const STATUS: Record<string, AssinaturaRecorrente['status']> = {
  pending: 'pendente',
  authorized: 'ativa',
  paused: 'pausada',
  cancelled: 'cancelada',
};

// ---------------------------------------------------------------- ativar e desativar

/**
 * Cria a assinatura no Mercado Pago com a primeira cobrança no vencimento atual (nunca antes) e
 * devolve o link para o administrador autorizar o cartão. Pendente: devolve o mesmo link de novo.
 */
export async function ativarAutomatica(acesso: AcessoPagamento): Promise<{ linkAutorizacao: string }> {
  exigirMercadoPago();
  const usuario = await administradorDaClinica(acesso);
  const clinica = await buscarClinica(acesso.clinicaId);
  if (!clinica || clinica.status !== 'ativa') throw new AppError(403, 'Esta clínica está desativada. Fale com o suporte.');
  if (resumoAssinatura(clinica).situacao !== 'em_dia' || !clinica.pagoAte) {
    throw new AppError(409, 'Pague o período em aberto e ative a cobrança automática em seguida.');
  }

  const existente = await buscarAutomaticaDaClinica(clinica.id);
  if (existente?.status === 'pendente' && existente.linkAutorizacao) return { linkAutorizacao: existente.linkAutorizacao };
  if (existente) throw new AppError(409, 'A cobrança automática já está ligada.');

  // Com troca agendada, a primeira cobrança (no vencimento) já é do plano novo.
  const planoAgendado = clinica.planoAgendadoId ? await buscarPlano(clinica.planoAgendadoId) : null;
  if (planoAgendado && clinica.cicloAgendado && clinica.cicloAgendado !== clinica.cicloCobranca) {
    throw new AppError(
      409,
      'Há uma troca entre mensal e anual agendada. Cancele a troca ou ative a cobrança automática depois do vencimento.',
    );
  }
  const plano = planoAgendado ?? (await buscarPlano(clinica.planoId));
  if (!plano) throw new AppError(404, 'Plano da clínica não encontrado.');
  const ciclo = cicloDe(planoAgendado ? clinica.cicloAgendado ?? clinica.cicloCobranca : clinica.cicloCobranca);
  const valor = precoDe(plano, ciclo);
  if (!(valor > 0)) throw new AppError(400, 'Este plano ainda não tem preço de assinatura.');

  const linha = await criarAutomatica({
    clinicaId: clinica.id,
    planoCodigo: plano.codigo,
    ciclo,
    valor,
    ativadaPor: usuario.id,
  });
  if (!linha) {
    const atual = await buscarAutomaticaDaClinica(clinica.id);
    if (atual?.linkAutorizacao) return { linkAutorizacao: atual.linkAutorizacao };
    throw new AppError(409, 'A cobrança automática já está sendo ativada. Atualize a página.');
  }

  try {
    const criada = await criarAssinaturaRecorrente({
      referencia: linha.id,
      titulo: tituloDoPlano(plano.nome, ciclo),
      email: usuario.email,
      ciclo,
      valor,
      inicio: clinica.pagoAte,
      retorno: linkAssinatura(),
    });
    await atualizarAutomatica(linha.id, {
      preapprovalId: criada.preapprovalId,
      linkAutorizacao: criada.linkAutorizacao,
      proximaCobrancaEm: clinica.pagoAte,
    });
    await registrarEvento({
      tipo: 'automatica_criada',
      nivel: 'info',
      clinicaId: clinica.id,
      valor,
      mensagem: `"${clinica.nomeFantasia}" pediu a cobrança automática (${plano.nome} ${ciclo}, ${reais(valor)}); falta autorizar o cartão. Primeira cobrança em ${formatarDataAcesso(clinica.pagoAte)}.`,
      detalhes: { preapprovalId: criada.preapprovalId, usuarioId: usuario.id },
    });
    return { linkAutorizacao: criada.linkAutorizacao };
  } catch (err) {
    await apagarAutomaticaPendente(linha.id);
    throw err;
  }
}

async function cancelar(automatica: AssinaturaRecorrente, motivo: MotivoCancelamento, quem: string) {
  if (automatica.preapprovalId && env.MERCADOPAGO_ACCESS_TOKEN) {
    const noMercadoPago = await buscarAssinaturaRecorrente(automatica.preapprovalId);
    if (noMercadoPago && noMercadoPago.status !== 'cancelled') {
      await atualizarAssinaturaRecorrente(automatica.preapprovalId, { status: 'cancelled' });
    }
  }
  if (!(await marcarAutomaticaCancelada(automatica.id, motivo))) return;
  await registrarEvento({
    tipo: 'automatica_cancelada',
    nivel: 'info',
    clinicaId: automatica.clinicaId,
    valor: Number(automatica.valor),
    mensagem: `Cobrança automática cancelada (${quem}). O período pago continua e os lembretes de pagamento voltam.`,
    detalhes: { preapprovalId: automatica.preapprovalId, motivo },
  });
}

/** Desligar pelo sistema: cancela no Mercado Pago; o período já pago continua valendo. */
export async function desativarAutomatica(acesso: AcessoPagamento) {
  await administradorDaClinica(acesso);
  const automatica = await buscarAutomaticaDaClinica(acesso.clinicaId);
  if (!automatica) throw new AppError(404, 'A cobrança automática não está ligada.');
  await cancelar(automatica, 'usuario', 'pelo administrador da clínica');
  return { mensagem: 'Cobrança automática desligada. O período pago continua valendo e você volta a receber os lembretes.' };
}

/** Painel interno. */
export async function cancelarAutomaticaPeloPainel(clinicaId: string) {
  const automatica = await buscarAutomaticaDaClinica(clinicaId);
  if (!automatica) throw new AppError(404, 'Esta clínica não tem cobrança automática ligada.');
  await cancelar(automatica, 'painel', 'pelo painel interno');
  return { mensagem: 'Cobrança automática cancelada.' };
}

// ---------------------------------------------------------------- avisos do Mercado Pago

/** Aplica o estado da assinatura no Mercado Pago (aviso subscription_preapproval ou conferência diária). */
async function aplicarEstado(automatica: AssinaturaRecorrente, noMercadoPago: AssinaturaMercadoPago) {
  const status = STATUS[noMercadoPago.status ?? ''] ?? automatica.status;
  const proxima = noMercadoPago.next_payment_date ? new Date(noMercadoPago.next_payment_date) : null;

  if (status === 'cancelada') {
    if (automatica.status !== 'cancelada' && (await marcarAutomaticaCancelada(automatica.id, 'mercadopago'))) {
      await registrarEvento({
        tipo: 'automatica_cancelada',
        nivel: 'aviso',
        clinicaId: automatica.clinicaId,
        mensagem: 'A assinatura foi cancelada no Mercado Pago (pelo pagador ou depois das tentativas). Os lembretes de pagamento voltam.',
        detalhes: { preapprovalId: automatica.preapprovalId },
      });
    }
    return;
  }

  await atualizarAutomatica(automatica.id, {
    status,
    conferidaEm: new Date(),
    ...(proxima && !Number.isNaN(proxima.getTime()) ? { proximaCobrancaEm: proxima } : {}),
    ...(status === 'ativa' && !automatica.ativadaEm ? { ativadaEm: new Date() } : {}),
  });
  if (status === 'ativa' && automatica.status === 'pendente') {
    await registrarEvento({
      tipo: 'automatica_ativada',
      nivel: 'info',
      clinicaId: automatica.clinicaId,
      valor: Number(automatica.valor),
      mensagem: `Cartão autorizado: cobrança automática ativa (${reais(Number(automatica.valor))}${proxima ? `, próxima em ${formatarDataAcesso(proxima)}` : ''}).`,
      detalhes: { preapprovalId: automatica.preapprovalId },
    });
  } else if (status !== automatica.status) {
    await registrarEvento({
      tipo: 'automatica_atualizada',
      nivel: status === 'pausada' ? 'aviso' : 'info',
      clinicaId: automatica.clinicaId,
      mensagem: `Cobrança automática passou de ${automatica.status} para ${status} no Mercado Pago.`,
      detalhes: { preapprovalId: automatica.preapprovalId },
    });
  }
}

/** Aviso subscription_preapproval. Lança só em falha passageira. */
export async function processarAvisoAssinatura(preapprovalId: string): Promise<void> {
  if (!env.MERCADOPAGO_ACCESS_TOKEN || !preapprovalId) return;
  const noMercadoPago = await buscarAssinaturaRecorrente(preapprovalId);
  if (!noMercadoPago) return;
  const automatica =
    (await buscarAutomaticaPorPreapproval(preapprovalId)) ??
    (noMercadoPago.external_reference ? await buscarAutomatica(noMercadoPago.external_reference).catch(() => null) : null);
  if (!automatica) {
    await registrarEvento({
      tipo: 'pagamento_ignorado',
      nivel: 'aviso',
      mensagem: `Assinatura ${preapprovalId} do Mercado Pago não é deste ambiente.`,
    });
    return;
  }
  if (!automatica.preapprovalId) {
    await atualizarAutomatica(automatica.id, { preapprovalId });
    automatica.preapprovalId = preapprovalId;
  }
  await aplicarEstado(automatica, noMercadoPago);
}

/** Aviso subscription_authorized_payment: cada cobrança da assinatura. */
export async function processarAvisoCobrancaAutomatica(id: string): Promise<void> {
  if (!env.MERCADOPAGO_ACCESS_TOKEN || !id) return;
  const cobranca = await buscarCobrancaAutorizada(id);
  if (!cobranca) return;
  const automatica = cobranca.preapproval_id ? await buscarAutomaticaPorPreapproval(cobranca.preapproval_id) : null;
  if (!automatica) {
    await registrarEvento({
      tipo: 'pagamento_ignorado',
      nivel: 'aviso',
      mensagem: `Cobrança automática ${id} sem assinatura deste ambiente (${cobranca.preapproval_id ?? 'sem preapproval'}).`,
    });
    return;
  }

  const pagamentoId = cobranca.payment?.id ? String(cobranca.payment.id) : '';
  if (pagamentoId) {
    await processarPagamentoDaAutomatica(automatica.id, pagamentoId);
    return;
  }
  // Sem pagamento ainda: recusada e em nova tentativa ("recycling").
  if (cobranca.status === 'recycling' || cobranca.rejection_code) {
    await registrarFalha(automatica, {
      chave: `autorizada:${id}`,
      motivo: cobranca.rejection_code ?? cobranca.payment?.status_detail ?? 'recusada',
      valor: Number(cobranca.transaction_amount ?? automatica.valor),
      pagamentoId: null,
    });
  }
}

/**
 * Aviso de pagamento (tópico payment). Pagamento com pedido segue o caminho de sempre; pagamento
 * gerado pela cobrança automática vira um pedido `recorrente` e é confirmado do mesmo jeito.
 */
export async function processarPagamentoMercadoPago(pagamentoId: string): Promise<void> {
  const daAutomatica = await processarAvisoMercadoPago(pagamentoId);
  if (daAutomatica) await aplicarPagamentoDaAutomatica(daAutomatica.assinaturaRecorrenteId, daAutomatica.pagamento);
}

/**
 * Pagamento de uma cobrança automática já identificada (pela cobrança autorizada ou pela conferência).
 * Com pedido, segue o caminho de sempre (confirmação, estorno); sem pedido, aplica pela assinatura,
 * mesmo que o pagamento não traga a referência dela.
 */
async function processarPagamentoDaAutomatica(assinaturaRecorrenteId: string, pagamentoId: string) {
  if (await buscarPedidoPorPagamento(pagamentoId)) {
    await processarPagamentoMercadoPago(pagamentoId);
    return;
  }
  const pagamento = await buscarPagamento(pagamentoId);
  if (pagamento) await aplicarPagamentoDaAutomatica(assinaturaRecorrenteId, pagamento);
}

async function aplicarPagamentoDaAutomatica(assinaturaRecorrenteId: string, pagamento: PagamentoMercadoPago) {
  const automatica = await buscarAutomatica(assinaturaRecorrenteId);
  if (!automatica) return;
  const pagamentoId = String(pagamento.id ?? '');
  const valor = Number(pagamento.transaction_amount);

  if (pagamento.status === 'rejected') {
    await registrarFalha(automatica, {
      chave: `pagamento:${pagamentoId}`,
      motivo: pagamento.status_detail ?? 'recusada',
      valor,
      pagamentoId,
    });
    return;
  }
  if (pagamento.status !== 'approved' || pagamento.currency_id !== 'BRL' || !pagamentoId) return;

  const clinica = await buscarClinica(automatica.clinicaId);
  if (!clinica) return;
  // O valor cobrado diz o plano: primeiro o plano atual, depois a troca agendada; sem nenhum dos dois,
  // o plano que a assinatura tinha (o pagamento entra e o painel mostra a diferença em Logs).
  const ciclo = cicloDe(automatica.ciclo);
  const atual = await buscarPlano(clinica.planoId);
  const agendado = clinica.planoAgendadoId ? await buscarPlano(clinica.planoAgendadoId) : null;
  const cicloAgendado = cicloDe(clinica.cicloAgendado ?? clinica.cicloCobranca);
  let planoCodigo = automatica.planoCodigo;
  if (atual && cicloDe(clinica.cicloCobranca) === ciclo && valorConfere(precoDe(atual, ciclo), valor)) {
    planoCodigo = atual.codigo;
  } else if (agendado && cicloAgendado === ciclo && valorConfere(precoDe(agendado, ciclo), valor)) {
    planoCodigo = agendado.codigo;
  } else if (!valorConfere(Number(automatica.valor), valor)) {
    await registrarEvento({
      tipo: 'cobranca_automatica_aprovada',
      nivel: 'aviso',
      clinicaId: automatica.clinicaId,
      pagamentoId,
      valor,
      mensagem: `Cobrança automática de ${reais(valor)} não bate com o preço do plano atual nem da troca agendada; aplicada como plano ${planoCodigo}. Confira.`,
    });
  }

  const pedido =
    (await criarPedidoRecorrente({
      clinicaId: automatica.clinicaId,
      assinaturaRecorrenteId: automatica.id,
      planoCodigo,
      ciclo,
      valor,
      pagamentoId,
    })) ?? (await buscarPedidoPorPagamento(pagamentoId));
  if (!pedido || pedido.status === 'pago' || pedido.status === 'estornado') return;

  const resultado = await confirmarPedido(pedido.id, pagamentoId, 'aviso', infoDoPagamento(pagamento));
  const final = pagamento.card?.last_four_digits ?? null;
  // O pagamento já foi aplicado: daqui em diante, falha só vai para Logs (o aviso não pode voltar com 500).
  try {
    await atualizarAutomatica(automatica.id, {
      ultimaFalhaEm: null,
      ultimaFalhaMotivo: null,
      ...(final ? { cartaoFinal: final } : {}),
      ...(resultado.pagoAte ? { proximaCobrancaEm: new Date(resultado.pagoAte) } : {}),
      ...(automatica.status === 'pendente' ? { status: 'ativa', ativadaEm: new Date() } : {}),
      ...(valorConfere(Number(automatica.valor), valor) ? {} : { valor, planoCodigo }),
    });
    if (automatica.status === 'pendente') {
      await registrarEvento({
        tipo: 'automatica_ativada',
        nivel: 'info',
        clinicaId: automatica.clinicaId,
        valor,
        mensagem: 'Cartão autorizado: cobrança automática ativa (confirmada pela primeira cobrança).',
        detalhes: { preapprovalId: automatica.preapprovalId },
      });
    }
    await registrarEvento({
      tipo: 'cobranca_automatica_aprovada',
      nivel: 'info',
      pedidoId: pedido.id,
      clinicaId: automatica.clinicaId,
      pagamentoId,
      meio: meioDoPagamento(pagamento),
      status: resultado.status,
      valor,
      mensagem: `Cobrança automática de ${reais(valor)} aprovada${final ? ` no cartão final ${final}` : ''}${resultado.pagoAte ? `: paga até ${formatarDataAcesso(new Date(resultado.pagoAte))}` : ''}.`,
      detalhes: { preapprovalId: automatica.preapprovalId, plano: planoCodigo, ciclo },
    });
  } catch (err) {
    console.error('[automatica] cobrança aplicada, mas a assinatura não foi atualizada', automatica.id, mensagemDeErro(err));
  }
}

/** Cobrança recusada: aviso no sistema e e-mail para atualizar o cartão. A carência continua a mesma. */
async function registrarFalha(
  automatica: AssinaturaRecorrente,
  falha: { chave: string; motivo: string; valor: number; pagamentoId: string | null },
) {
  // Cada nova tentativa recusada gera aviso do Mercado Pago: e-mail e sino no máximo uma vez por dia.
  const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const chaveAviso = `${automatica.id}:${dia}`;
  await atualizarAutomatica(automatica.id, { ultimaFalhaEm: new Date(), ultimaFalhaMotivo: falha.motivo });
  await registrarEvento({
    tipo: 'cobranca_automatica_recusada',
    nivel: 'aviso',
    clinicaId: automatica.clinicaId,
    pagamentoId: falha.pagamentoId,
    status: 'rejected',
    valor: falha.valor,
    mensagem: `Cobrança automática de ${reais(falha.valor)} recusada (${falha.motivo}). O Mercado Pago tenta de novo; o administrador foi avisado.`,
    detalhes: { preapprovalId: automatica.preapprovalId, origem: falha.chave },
  });

  const clinica = await buscarClinica(automatica.clinicaId);
  if (!clinica?.pagoAte) return;
  try {
    const admins = await listarAdministradoresAtivos(clinica.id);
    for (const admin of admins) {
      const email = montarEmailAutomaticaRecusada({
        clinica: clinica.nomeFantasia,
        nomeAdmin: admin.nome,
        valor: falha.valor,
        cartaoFinal: automatica.cartaoFinal,
        vence: clinica.pagoAte,
        bloqueia: fimDaCarencia(clinica.pagoAte),
        link: linkAssinatura(),
      });
      await enfileirarEmail({
        tipo: 'cobranca_automatica',
        chave: `automatica-recusada:${chaveAviso}:${admin.email.toLowerCase()}`,
        para: admin.email,
        assunto: email.assunto,
        texto: email.texto,
        html: email.html,
        remetenteNome: email.remetenteNome,
        clinicaId: clinica.id,
      });
      await notificarAdministrador({
        clinicaId: clinica.id,
        usuarioId: admin.id,
        chave: `automatica-recusada:${chaveAviso}`,
        titulo: 'A cobrança no cartão não passou',
        descricao: 'Atualize o cartão ou pague por Pix em Configurações › Assinatura.',
        href: '/configuracoes/assinatura',
        severidade: 'alta',
      });
    }
  } catch (err) {
    console.error('[automatica] aviso de recusa não enfileirado', automatica.id, mensagemDeErro(err));
  }
}

// ---------------------------------------------------------------- conferência periódica

/** Uma vez por dia por assinatura: estado no Mercado Pago e cobranças que o aviso pode ter perdido. */
export async function conferirAutomatica(automatica: AssinaturaRecorrente): Promise<void> {
  if (!automatica.preapprovalId) return;
  const noMercadoPago = await buscarAssinaturaRecorrente(automatica.preapprovalId);
  if (!noMercadoPago) {
    await atualizarAutomatica(automatica.id, { conferidaEm: new Date() });
    return;
  }
  await aplicarEstado(automatica, noMercadoPago);
  if (noMercadoPago.status !== 'authorized') return;

  for (const cobranca of await buscarCobrancasDaAssinatura(automatica.preapprovalId)) {
    const pagamentoId = cobranca.payment?.id ? String(cobranca.payment.id) : '';
    if (!pagamentoId || cobranca.payment?.status !== 'approved') continue;
    const pedido = await buscarPedidoPorPagamento(pagamentoId);
    if (pedido && (pedido.status === 'pago' || pedido.status === 'estornado' || pedido.status === 'revisao')) continue;
    await processarPagamentoDaAutomatica(automatica.id, pagamentoId);
    const aplicado = await buscarPedidoPorPagamento(pagamentoId);
    if (aplicado?.status === 'pago') {
      await registrarEvento({
        tipo: 'conciliacao_aplicou',
        nivel: 'aviso',
        pedidoId: aplicado.id,
        clinicaId: automatica.clinicaId,
        pagamentoId,
        mensagem: 'A conferência diária aplicou uma cobrança automática que o aviso não aplicou. Confira os tópicos de assinatura no webhook.',
      });
    }
  }
}

export async function listarParaConferir(limite: number) {
  return listarAutomaticasParaConferir(limite);
}

/**
 * Troca agendada perto do vencimento: se a clínica não cabe no plano novo, mantém o plano atual,
 * volta o valor da cobrança automática para ele e avisa. (O valor da automática já acompanha a troca
 * desde que ela foi agendada.)
 */
export async function aplicarTrocasAgendadas(): Promise<number> {
  let tratadas = 0;
  for (const clinica of await listarTrocasAgendadasNoVencimento()) {
    if (!clinica.planoAgendado) continue;
    try {
      await assertClinicaCabeNoPlano(clinica.id, clinica.planoAgendado);
    } catch (err) {
      try {
        if (!(err instanceof AppError) || err.status !== 409) throw err;
        if (!(await cancelarTrocaAgendada(clinica.id))) continue;
        tratadas += 1;
        await registrarEvento({
          tipo: 'troca_nao_aplicada',
          nivel: 'aviso',
          clinicaId: clinica.id,
          mensagem: `Troca agendada para ${clinica.planoAgendado.nome} cancelada no vencimento: ${err.message} O plano ${clinica.plano.nome} continua.`,
        });
        await sincronizarAutomatica(clinica.id, 'troca agendada não coube nos limites');
        await avisarTrocaNaoAplicada(clinica.id, clinica.nomeFantasia, clinica.plano.nome, clinica.planoAgendado.nome, err.message);
      } catch (falha) {
        console.error('[automatica] troca agendada não conferida', clinica.id, mensagemDeErro(falha));
      }
    }
  }
  return tratadas;
}

async function avisarTrocaNaoAplicada(clinicaId: string, nome: string, planoAtual: string, planoAgendado: string, motivo: string) {
  try {
    for (const admin of await listarAdministradoresAtivos(clinicaId)) {
      const email = montarEmailTrocaNaoAplicada({
        clinica: nome,
        nomeAdmin: admin.nome,
        planoAtual,
        planoAgendado,
        motivo,
        link: linkAssinatura(),
      });
      await enfileirarEmail({
        tipo: 'aviso_assinatura',
        chave: `troca-nao-aplicada:${clinicaId}:${Date.now()}:${admin.email.toLowerCase()}`,
        para: admin.email,
        assunto: email.assunto,
        texto: email.texto,
        html: email.html,
        remetenteNome: email.remetenteNome,
        clinicaId,
      });
    }
  } catch (err) {
    console.error('[automatica] aviso de troca não aplicada não enfileirado', clinicaId, mensagemDeErro(err));
  }
}

/**
 * Preço do plano mudou no painel. Redução vale já. Aumento: e-mail agora e o valor novo só é
 * aplicado no Mercado Pago depois de DIAS_AVISO_REAJUSTE dias.
 */
export async function aplicarReajustes(agora = new Date()): Promise<number> {
  let tratadas = 0;
  const planos = new Map<string, Plano | null>();
  for (const automatica of await listarAutomaticasAtivas()) {
    try {
      tratadas += await reajustar(automatica, planos, agora);
    } catch (err) {
      console.error('[automatica] reajuste não conferido', automatica.id, mensagemDeErro(err));
    }
  }
  return tratadas;
}

async function reajustar(automatica: AssinaturaRecorrente, planos: Map<string, Plano | null>, agora: Date): Promise<number> {
  if (!planos.has(automatica.planoCodigo)) planos.set(automatica.planoCodigo, await buscarPorCodigo(automatica.planoCodigo));
  const plano = planos.get(automatica.planoCodigo);
  if (!plano) return 0;
  const ciclo = cicloDe(automatica.ciclo);
  const preco = precoDe(plano, ciclo);
  const atual = Number(automatica.valor);
  if (!(preco > 0) || valorConfere(preco, atual)) {
    if (automatica.valorNovo !== null) await atualizarAutomatica(automatica.id, { valorNovo: null, valorNovoEm: null });
    return 0;
  }

  const avisado = automatica.valorNovo !== null && valorConfere(Number(automatica.valorNovo), preco);
  if (preco < atual || (avisado && automatica.valorNovoEm && automatica.valorNovoEm.getTime() <= agora.getTime())) {
    if (automatica.preapprovalId) await atualizarAssinaturaRecorrente(automatica.preapprovalId, { valor: preco });
    await atualizarAutomatica(automatica.id, { valor: preco, valorNovo: null, valorNovoEm: null });
    await registrarEvento({
      tipo: 'automatica_atualizada',
      nivel: 'info',
      clinicaId: automatica.clinicaId,
      valor: preco,
      mensagem: `Novo preço do plano ${plano.nome} aplicado na cobrança automática: de ${reais(atual)} para ${reais(preco)}.`,
      detalhes: { preapprovalId: automatica.preapprovalId },
    });
    return 1;
  }
  if (avisado) return 0;

  const aPartirDe = new Date(agora.getTime() + DIAS_AVISO_REAJUSTE * DIA_MS);
  await atualizarAutomatica(automatica.id, { valorNovo: preco, valorNovoEm: aPartirDe });
  await registrarEvento({
    tipo: 'reajuste_agendado',
    nivel: 'info',
    clinicaId: automatica.clinicaId,
    valor: preco,
    mensagem: `Preço do plano ${plano.nome} mudou: a cobrança automática passa de ${reais(atual)} para ${reais(preco)} a partir de ${formatarDataAcesso(aPartirDe)} (aviso de ${DIAS_AVISO_REAJUSTE} dias enviado).`,
  });
  const clinica = await buscarClinica(automatica.clinicaId);
  if (!clinica) return 1;
  try {
    for (const admin of await listarAdministradoresAtivos(clinica.id)) {
      const email = montarEmailReajuste({
        clinica: clinica.nomeFantasia,
        nomeAdmin: admin.nome,
        plano: plano.nome,
        ciclo,
        valorAtual: atual,
        valorNovo: preco,
        aPartirDe,
        link: linkAssinatura(),
      });
      await enfileirarEmail({
        tipo: 'aviso_assinatura',
        chave: `reajuste:${automatica.id}:${preco.toFixed(2)}:${admin.email.toLowerCase()}`,
        para: admin.email,
        assunto: email.assunto,
        texto: email.texto,
        html: email.html,
        remetenteNome: email.remetenteNome,
        clinicaId: clinica.id,
      });
    }
  } catch (err) {
    console.error('[automatica] aviso de reajuste não enfileirado', automatica.id, mensagemDeErro(err));
  }
  return 1;
}
