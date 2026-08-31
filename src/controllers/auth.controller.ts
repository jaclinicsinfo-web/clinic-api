import { Request, Response, NextFunction } from 'express';
import {
  loginSchema,
  selecionarUnidadeSchema,
} from '../validators/auth.validator';
import {
  buscarPorEmail,
  buscarPorId,
  registrarAcesso,
  possuiAcessoUnidade,
} from '../models/usuario.model';
import { buscarPorId as buscarUnidadePorId } from '../models/unidade.model';
import { usoDaClinica } from '../models/plano.model';
import { assinarToken } from '../lib/jwt';
import { conferirSenha } from '../lib/password';
import { AppError } from '../lib/erros';
import {
  montarSessao,
  montarMe,
  montarSelecaoUnidade,
  montarLogout,
} from '../views/auth.view';

export async function login(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email, senha, lembrar } = loginSchema.parse(req.body);

    const usuario = await buscarPorEmail(email);
    if (!usuario) {
      throw new AppError(401, 'E-mail ou senha incorretos.');
    }

    const senhaConfere = await conferirSenha(senha, usuario.senhaHash);
    if (!senhaConfere) {
      throw new AppError(401, 'E-mail ou senha incorretos.');
    }

    if (usuario.status !== 'ativo') {
      throw new AppError(
        403,
        'Este usuário está inativo. Fale com o administrador da clínica.',
      );
    }

    const unidadesAtivas = usuario.usuarioUnidades.filter((item) => item.unidade.ativo);
    if (unidadesAtivas.length === 0) {
      throw new AppError(
        403,
        'Nenhuma unidade liberada para este usuário. Fale com o administrador.',
      );
    }

    const unidadeAtualId =
      unidadesAtivas.length === 1 ? unidadesAtivas[0].unidadeId : null;

    const token = assinarToken(
      {
        sub: usuario.id,
        email: usuario.email,
        perfilId: usuario.perfilId,
        clinicaId: usuario.clinicaId,
        unidadeAtualId,
      },
      lembrar,
    );

    await registrarAcesso(usuario.id);
    usuario.ultimoAcesso = new Date();

    const uso = await usoDaClinica(usuario.clinicaId);

    res.json(montarSessao({ token, usuario, unidadeAtualId, uso }));
  } catch (err) {
    next(err);
  }
}

export async function selecionarUnidade(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = req.auth!;
    const { unidadeId } = selecionarUnidadeSchema.parse(req.body);

    const temAcesso = await possuiAcessoUnidade(auth.sub, unidadeId);
    if (!temAcesso) {
      throw new AppError(403, 'Você não tem acesso a esta unidade.');
    }

    const unidade = await buscarUnidadePorId(unidadeId);
    if (!unidade || !unidade.ativo) {
      throw new AppError(403, 'Você não tem acesso a esta unidade.');
    }

    const token = assinarToken({
      sub: auth.sub,
      email: auth.email,
      perfilId: auth.perfilId,
      clinicaId: auth.clinicaId,
      unidadeAtualId: unidadeId,
    });

    res.json(montarSelecaoUnidade({ token, unidade }));
  } catch (err) {
    next(err);
  }
}

export async function me(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = req.auth!;
    const usuario = await buscarPorId(auth.sub);
    if (!usuario) {
      throw new AppError(401, 'Sessão expirada. Entre novamente.');
    }

    const uso = await usoDaClinica(usuario.clinicaId);

    res.json(
      montarMe({ usuario, unidadeAtualId: auth.unidadeAtualId, uso }),
    );
  } catch (err) {
    next(err);
  }
}

export function logout(_req: Request, res: Response): void {
  res.json(montarLogout());
}
