import { Request, Response, NextFunction } from 'express';

import { comoSistema } from '../lib/tenant';
import { inscricaoSchema, pedidoIdSchema } from '../validators/assinatura.validator';
import {
  confirmarPagamentoLocal,
  iniciarAcessoGratuito,
  iniciarCheckout,
  processarAvisoMercadoPago,
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

export async function webhookMercadoPago(req: Request, res: Response, _next: NextFunction): Promise<void> {
  try {
    const corpo = req.body as { type?: string; topic?: string; data?: { id?: string | number } } | undefined;
    const tipo = String(req.query.type || req.query.topic || corpo?.type || corpo?.topic || '');
    if (tipo && !tipo.includes('payment')) {
      res.status(200).json({ ok: true });
      return;
    }

    const daQuery = req.query['data.id'] ?? req.query.id;
    const id = String(daQuery || corpo?.data?.id || '').trim();
    await comoSistema(() => processarAvisoMercadoPago(id));
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[mercadopago] aviso não aplicado', err instanceof Error ? err.message : err);
    res.status(200).json({ ok: true });
  }
}
