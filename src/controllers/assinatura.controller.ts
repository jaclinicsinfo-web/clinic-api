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

export async function webhookMercadoPago(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const daQuery = req.query['data.id'] ?? req.query.id;
    const corpo = req.body as { data?: { id?: string | number } } | undefined;
    const id = String(daQuery || corpo?.data?.id || '').trim();
    await comoSistema(() => processarAvisoMercadoPago(id));
    res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
}
