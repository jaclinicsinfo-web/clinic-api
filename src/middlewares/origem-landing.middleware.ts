import { NextFunction, Request, Response } from 'express';

import { env } from '../config/env';
import { AppError } from '../lib/erros';

/** Escolha de plano, teste e checkout só nascem no site público. */
export function exigirOrigemLanding(req: Request, _res: Response, next: NextFunction): void {
  if (!env.LANDING_URL) {
    next();
    return;
  }

  const origem = (req.get('origin') || '').trim().replace(/\/+$/, '');
  if (origem === env.LANDING_URL) {
    next();
    return;
  }

  next(new AppError(403, 'A escolha de plano e o teste grátis começam no site.'));
}
