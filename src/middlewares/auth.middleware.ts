import { Request, Response, NextFunction } from 'express';
import { verificarToken } from '../lib/jwt';
import { AppError } from '../lib/erros';

export function autenticar(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return next(new AppError(401, 'Sessão expirada. Entre novamente.'));
  }

  const token = header.slice('Bearer '.length).trim();

  try {
    req.auth = verificarToken(token);
    next();
  } catch {
    next(new AppError(401, 'Sessão expirada. Entre novamente.'));
  }
}
