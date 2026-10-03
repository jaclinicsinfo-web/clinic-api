import { Request, Response, NextFunction } from 'express';
import { buscarPorId } from '../models/usuario.model';
import { AcaoPermissao, mensagemModuloForaDoPlano, planoIncluiModulo, temAcessoAoModulo } from '../lib/permissoes';
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

      if (!planoIncluiModulo(usuario.clinica.plano.codigo, modulo)) {
        throw new AppError(403, mensagemModuloForaDoPlano(modulo));
      }

      if (!temAcessoAoModulo(usuario, modulo, acao)) {
        throw new AppError(403, 'Você não tem permissão para acessar este recurso.');
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
