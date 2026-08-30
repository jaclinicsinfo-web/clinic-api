import { Request, Response, NextFunction } from 'express';
import { listarPlanos } from '../models/plano.model';
import { montarListaPlanos } from '../views/planos.view';

export async function listar(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const planos = await listarPlanos();
    res.json(montarListaPlanos(planos));
  } catch (err) {
    next(err);
  }
}
