import { Request, Response, NextFunction } from 'express';
import { buscarPorId } from '../models/usuario.model';
import { AcaoPermissao, temPermissao } from '../lib/permissoes';
import { AppError } from '../lib/erros';

export function exigirPermissao(modulo: string, acao: AcaoPermissao = 'visualizar') {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = req.auth;
      if (!auth) {
        throw new AppError(401, 'Sessão expirada. Entre novamente.');
      }

      const usuario = await buscarPorId(auth.sub);
      if (!usuario || usuario.status !== 'ativo') {
        throw new AppError(401, 'Sessão expirada. Entre novamente.');
      }

      if (!temPermissao(usuario.perfil.permissoes, modulo, acao)) {
        throw new AppError(403, 'Você não tem permissão para acessar este recurso.');
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
