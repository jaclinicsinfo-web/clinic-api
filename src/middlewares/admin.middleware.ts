import { Request, Response, NextFunction } from 'express';
import { buscarPorId } from '../models/usuario.model';
import { NOME_PERFIL_ADMINISTRADOR } from '../lib/perfis-padrao';
import { AppError } from '../lib/erros';

export async function exigirAdministrador(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = req.auth;
    if (!auth) {
      throw new AppError(401, 'Sessão expirada. Entre novamente.');
    }

    const usuario = await buscarPorId(auth.sub);
    if (!usuario || usuario.status !== 'ativo') {
      throw new AppError(401, 'Sessão expirada. Entre novamente.');
    }

    if (usuario.perfil.nome !== NOME_PERFIL_ADMINISTRADOR) {
      throw new AppError(403, 'Apenas o administrador pode gerenciar usuários.');
    }

    next();
  } catch (err) {
    next(err);
  }
}
