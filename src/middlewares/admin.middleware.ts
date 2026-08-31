import { Request, Response, NextFunction } from 'express';
import { buscarPorId } from '../models/usuario.model';
import { NOME_PERFIL_ADMINISTRADOR, NOME_PERFIL_GESTOR } from '../lib/perfis-padrao';
import { AppError } from '../lib/erros';

async function exigirPerfis(
  req: Request,
  next: NextFunction,
  nomes: string[],
  mensagem: string,
): Promise<void> {
  const auth = req.auth;
  if (!auth) {
    throw new AppError(401, 'Sessão expirada. Entre novamente.');
  }

  const usuario = await buscarPorId(auth.sub);
  if (!usuario || usuario.status !== 'ativo') {
    throw new AppError(401, 'Sessão expirada. Entre novamente.');
  }

  if (!nomes.includes(usuario.perfil.nome)) {
    throw new AppError(403, mensagem);
  }

  next();
}

export async function exigirAdministrador(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await exigirPerfis(
      req,
      next,
      [NOME_PERFIL_ADMINISTRADOR],
      'Apenas o administrador pode gerenciar usuários.',
    );
  } catch (err) {
    next(err);
  }
}

export async function exigirAdminOuGestor(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await exigirPerfis(
      req,
      next,
      [NOME_PERFIL_ADMINISTRADOR, NOME_PERFIL_GESTOR],
      'Apenas administradores e gestores podem gerenciar usuários.',
    );
  } catch (err) {
    next(err);
  }
}
