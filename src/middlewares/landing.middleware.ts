import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { AppError } from '../lib/erros';

function comparacaoSegura(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufferA, bufferB);
}

export function validarChaveLanding(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const chave = req.header('X-Landing-Key');

  if (!chave || !comparacaoSegura(chave, env.LANDING_API_KEY)) {
    return next(new AppError(401, 'Não autorizado.'));
  }

  next();
}
