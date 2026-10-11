import { Request, Response, NextFunction } from 'express';

import { env, isDev } from '../config/env';
import { AppError } from '../lib/erros';
import { verificarToken, verificarTokenPagamento } from '../lib/jwt';
import { mensagemDeErro, registrarEvento } from '../lib/eventos-pagamento';
import { assinaturaWebhookValida } from '../lib/mercadopago';
import { comoSistema } from '../lib/tenant';
import { montarErro } from '../views/error.view';
import {
  clinicaIdSchema,
  inscricaoSchema,
  pagamentoClinicaSchema,
  pedidoIdSchema,
} from '../validators/assinatura.validator';
import {
  type AcessoPagamento,
  confirmarPagamentoLocal,
  iniciarAcessoGratuito,
  iniciarCheckout,
  iniciarCheckoutClinica,
  obterAssinaturaClinica,
  reenviarAcesso,
  sincronizarPedido,
} from '../services/assinatura.service';
import {
  ativarAutomatica,
  cancelarAutomaticaPeloPainel,
  desativarAutomatica,
  processarAvisoAssinatura,
  processarAvisoCobrancaAutomatica,
  processarPagamentoMercadoPago,
} from '../services/cobranca-automatica.service';
import { listarPagamentos, reciboHtml } from '../services/pagamentos.service';
import { cancelarTroca, simularTroca, trocarPlano } from '../services/troca-plano.service';

export async function acessoGratuito(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dados = inscricaoSchema.parse(req.body);
    const resultado = await comoSistema(() => iniciarAcessoGratuito(dados));
    res.status(201).json(resultado);
  } catch (err) {
    next(err);
  }
}

export async function checkout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dados = inscricaoSchema.parse(req.body);
    const resultado = await comoSistema(() => iniciarCheckout(dados));
    res.status(201).json(resultado);
  } catch (err) {
    next(err);
  }
}

export async function sincronizar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { pedidoId } = pedidoIdSchema.parse(req.body);
    const resultado = await comoSistema(() => sincronizarPedido(pedidoId));
    res.json(resultado);
  } catch (err) {
    next(err);
  }
}

export async function confirmarLocal(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { pedidoId } = pedidoIdSchema.parse(req.body);
    const resultado = await comoSistema(() => confirmarPagamentoLocal(pedidoId));
    res.json(resultado);
  } catch (err) {
    next(err);
  }
}

/** Sessão normal do sistema ou o token curto que o login bloqueado entrega ao administrador. */
function acessoDePagamento(req: Request): AcessoPagamento {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  if (!token) throw new AppError(401, 'Sessão expirada. Entre novamente.');

  const pagamento = verificarTokenPagamento(token);
  if (pagamento) return { usuarioId: pagamento.sub, clinicaId: pagamento.clinicaId };

  try {
    const sessao = verificarToken(token);
    return { usuarioId: sessao.sub, clinicaId: sessao.clinicaId };
  } catch {
    throw new AppError(401, 'Sessão expirada. Entre novamente.');
  }
}

export async function assinaturaDaClinica(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = req.auth!;
    const resultado = await comoSistema(() =>
      obterAssinaturaClinica({ usuarioId: auth.sub, clinicaId: auth.clinicaId }),
    );
    res.json(resultado);
  } catch (err) {
    next(err);
  }
}

/** Sessão normal do sistema (rotas com `autenticar`). */
function acessoDaSessao(req: Request): AcessoPagamento {
  const auth = req.auth!;
  return { usuarioId: auth.sub, clinicaId: auth.clinicaId };
}

export async function pagamentosDaClinica(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const acesso = acessoDaSessao(req);
    res.json(await comoSistema(() => listarPagamentos(acesso)));
  } catch (err) {
    next(err);
  }
}

export async function reciboDoPagamento(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const acesso = acessoDaSessao(req);
    const { pedidoId } = pedidoIdSchema.parse({ pedidoId: req.params.id });
    const html = await comoSistema(() => reciboHtml(acesso, pedidoId));
    res.set('Cache-Control', 'no-store').type('html').send(html);
  } catch (err) {
    next(err);
  }
}

export async function simularTrocaClinica(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const acesso = acessoDaSessao(req);
    const escolha = pagamentoClinicaSchema.parse(req.query);
    res.json(await comoSistema(() => simularTroca(acesso, escolha)));
  } catch (err) {
    next(err);
  }
}

export async function trocarPlanoClinica(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const acesso = acessoDaSessao(req);
    const escolha = pagamentoClinicaSchema.parse(req.body);
    const resultado = await comoSistema(() => trocarPlano(acesso, escolha));
    res.status(resultado.acao === 'checkout' ? 201 : 200).json(resultado);
  } catch (err) {
    next(err);
  }
}

export async function cancelarTrocaAgendada(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const acesso = acessoDaSessao(req);
    res.json(await comoSistema(() => cancelarTroca(acesso)));
  } catch (err) {
    next(err);
  }
}

export async function ativarCobrancaAutomatica(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const acesso = acessoDaSessao(req);
    res.status(201).json(await comoSistema(() => ativarAutomatica(acesso)));
  } catch (err) {
    next(err);
  }
}

export async function desativarCobrancaAutomatica(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const acesso = acessoDaSessao(req);
    res.json(await comoSistema(() => desativarAutomatica(acesso)));
  } catch (err) {
    next(err);
  }
}

export async function cancelarAutomaticaPainel(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { clinicaId } = clinicaIdSchema.parse({ clinicaId: req.params.clinicaId });
    res.json(await comoSistema(() => cancelarAutomaticaPeloPainel(clinicaId)));
  } catch (err) {
    next(err);
  }
}

export async function checkoutClinica(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const acesso = acessoDePagamento(req);
    const escolha = pagamentoClinicaSchema.parse(req.body);
    const resultado = await comoSistema(() => iniciarCheckoutClinica(acesso, escolha));
    res.status(201).json(resultado);
  } catch (err) {
    next(err);
  }
}

export async function sincronizarClinica(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { pedidoId } = pedidoIdSchema.parse(req.body);
    const resultado = await comoSistema(() => sincronizarPedido(pedidoId));
    if (resultado.tipo !== 'clinica_existente') throw new AppError(404, 'Pedido não encontrado.');
    res.json({
      status: resultado.status,
      mensagem: resultado.mensagem,
      pagoAte: resultado.pagoAte ?? null,
    });
  } catch (err) {
    next(err);
  }
}

export async function reenviarAcessoPedido(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { pedidoId } = pedidoIdSchema.parse({ pedidoId: req.params.id });
    const resultado = await comoSistema(() => reenviarAcesso(pedidoId));
    res.json(resultado);
  } catch (err) {
    next(err);
  }
}

let avisouSemSegredo = false;

function avisoAutentico(req: Request, dataId: string): boolean {
  if (!env.MERCADOPAGO_WEBHOOK_SECRET) {
    if (!isDev && !avisouSemSegredo) {
      avisouSemSegredo = true;
      console.warn('[mercadopago] MERCADOPAGO_WEBHOOK_SECRET vazio: avisos aceitos sem conferir x-signature.');
    }
    return true;
  }
  return assinaturaWebhookValida({
    assinatura: req.get('x-signature'),
    requestId: req.get('x-request-id'),
    dataId,
    segredo: env.MERCADOPAGO_WEBHOOK_SECRET,
  });
}

/**
 * Tópicos tratados: payment; subscription_preapproval (estado da cobrança automática) e
 * subscription_authorized_payment (cada cobrança dela). Os nomes antigos (IPN) também.
 */
function tratadorDoAviso(tipo: string): ((id: string) => Promise<void>) | null {
  if (tipo === 'subscription_preapproval' || tipo === 'preapproval') return processarAvisoAssinatura;
  if (tipo === 'subscription_authorized_payment' || tipo === 'authorized_payment') return processarAvisoCobrancaAutomatica;
  if (!tipo || tipo.includes('payment')) return processarPagamentoMercadoPago;
  return null;
}

/**
 * 200: aviso aplicado ou que não nos interessa. 401: assinatura inválida.
 * 500: falha passageira (banco, rede, Mercado Pago) — o Mercado Pago reenvia depois.
 */
export async function webhookMercadoPago(req: Request, res: Response): Promise<void> {
  const corpo = req.body as {
    type?: string;
    topic?: string;
    action?: string;
    data?: { id?: string | number };
  } | undefined;
  const daQuery = req.query['data.id'] ?? req.query.id;
  const idDaUrl = typeof daQuery === 'string' ? daQuery.trim() : '';

  if (!avisoAutentico(req, idDaUrl)) {
    // Nunca registra o segredo nem o hash: só o que ajuda a achar a causa.
    const assinatura = req.get('x-signature') ?? '';
    const ts = /ts=([^,]+)/.exec(assinatura)?.[1] ?? null;
    await registrarEvento({
      tipo: 'aviso_recusado',
      nivel: 'erro',
      pagamentoId: idDaUrl || null,
      mensagem: assinatura
        ? 'x-signature não confere com MERCADOPAGO_WEBHOOK_SECRET (assinatura secreta de outra aplicação ou modo?).'
        : 'Aviso chegou sem x-signature.',
      detalhes: {
        assinatura: assinatura ? 'presente' : 'ausente',
        ts,
        requestId: req.get('x-request-id') ? 'presente' : 'ausente',
        query: req.query,
        corpo: req.body,
        userAgent: req.get('user-agent') ?? null,
      },
    });
    res.status(401).json(montarErro('Assinatura inválida.'));
    return;
  }

  const tipo = String(req.query.type || req.query.topic || corpo?.type || corpo?.topic || corpo?.action || '');
  const processar = tratadorDoAviso(tipo);
  if (!processar) {
    res.status(200).json({ ok: true });
    return;
  }

  const id = String(idDaUrl || corpo?.data?.id || '').trim();
  await registrarEvento({
    tipo: 'aviso_recebido',
    nivel: 'info',
    pagamentoId: id || null,
    mensagem: `Aviso do Mercado Pago: ${tipo || 'sem tipo'}${corpo?.action ? ` (${corpo.action})` : ''}.`,
    detalhes: { query: req.query, action: corpo?.action ?? null, assinatura: env.MERCADOPAGO_WEBHOOK_SECRET ? 'conferida' : 'não conferida' },
  });
  try {
    await comoSistema(() => processar(id));
    res.status(200).json({ ok: true });
  } catch (err) {
    await registrarEvento({
      tipo: 'aviso_falhou',
      nivel: 'erro',
      pagamentoId: id || null,
      mensagem: `Aviso não aplicado (o Mercado Pago reenvia em ~15 min): ${mensagemDeErro(err)}`,
    });
    res.status(500).json(montarErro('Aviso não aplicado.'));
  }
}
