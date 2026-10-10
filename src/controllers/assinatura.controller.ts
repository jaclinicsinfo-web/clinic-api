import { Request, Response, NextFunction } from 'express';

import { env, isDev } from '../config/env';
import { AppError } from '../lib/erros';
import { verificarToken, verificarTokenPagamento } from '../lib/jwt';
import { mensagemDeErro, registrarEvento } from '../lib/eventos-pagamento';
import { assinaturaWebhookValida } from '../lib/mercadopago';
import { comoSistema } from '../lib/tenant';
import { montarErro } from '../views/error.view';
import {
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
  processarAvisoMercadoPago,
  reenviarAcesso,
  sincronizarPedido,
} from '../services/assinatura.service';

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
  if (tipo && !tipo.includes('payment')) {
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
    await comoSistema(() => processarAvisoMercadoPago(id));
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
