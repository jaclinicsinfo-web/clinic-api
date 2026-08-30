import { Request, Response, NextFunction } from 'express';
import {
  criarUsuarioSchema,
  usuarioIdParamSchema,
} from '../validators/usuarios.validator';
import {
  alterarStatus,
  buscarPorEmail,
  buscarPorId,
  contarAdminsAtivos,
  criarUsuario,
  listarPorClinica,
} from '../models/usuario.model';
import {
  buscarPorIdEClinica,
  listarPorClinica as listarPerfis,
} from '../models/perfil-acesso.model';
import {
  listarPorClinica as listarUnidades,
  pertencemAClinica,
} from '../models/unidade.model';
import { usoDaClinica } from '../models/plano.model';
import { NOME_PERFIL_ADMINISTRADOR } from '../lib/perfis-padrao';
import { AppError } from '../lib/erros';
import { montarListaUsuarios, montarUsuarioMutacao } from '../views/usuarios.view';

export async function listar(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const clinicaId = req.auth!.clinicaId;
    const [eu, usuarios, perfis, unidades, uso] = await Promise.all([
      buscarPorId(req.auth!.sub),
      listarPorClinica(clinicaId),
      listarPerfis(clinicaId),
      listarUnidades(clinicaId),
      usoDaClinica(clinicaId),
    ]);

    if (!eu) {
      throw new AppError(401, 'Sessão expirada. Entre novamente.');
    }

    res.json(
      montarListaUsuarios({
        usuarios,
        perfis,
        unidades,
        plano: eu.clinica.plano,
        uso,
      }),
    );
  } catch (err) {
    next(err);
  }
}

export async function criar(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const clinicaId = req.auth!.clinicaId;
    const dados = criarUsuarioSchema.parse(req.body);

    const emailExistente = await buscarPorEmail(dados.email);
    if (emailExistente) {
      throw new AppError(409, 'Já existe uma conta com este e-mail.');
    }

    const perfil = await buscarPorIdEClinica(dados.perfilId, clinicaId);
    if (!perfil) {
      throw new AppError(400, 'Perfil inválido para esta clínica.');
    }

    const unidadesValidas = await pertencemAClinica(dados.unidadesIds, clinicaId);
    if (!unidadesValidas) {
      throw new AppError(400, 'Uma ou mais unidades não pertencem a esta clínica.');
    }

    const criado = await criarUsuario({
      clinicaId,
      nome: dados.nome,
      email: dados.email,
      senha: dados.senha,
      perfilId: dados.perfilId,
      unidadeIds: dados.unidadesIds,
      status: 'ativo',
    });

    const usuario = await buscarPorId(criado.id);
    if (!usuario) {
      throw new AppError(500, 'Falha ao criar o usuário.');
    }

    const uso = await usoDaClinica(clinicaId);
    res.status(201).json(montarUsuarioMutacao({ usuario, uso }));
  } catch (err) {
    next(err);
  }
}

async function mudarStatus(
  req: Request,
  res: Response,
  proximoStatus: 'ativo' | 'inativo',
): Promise<void> {
  const { id } = usuarioIdParamSchema.parse(req.params);
  const clinicaId = req.auth!.clinicaId;

  const alvo = await buscarPorId(id);
  if (!alvo || alvo.clinicaId !== clinicaId) {
    throw new AppError(404, 'Usuário não encontrado.');
  }

  if (alvo.id === req.auth!.sub) {
    throw new AppError(400, 'Você não pode alterar o status da própria conta.');
  }

  if (alvo.status === proximoStatus) {
    const uso = await usoDaClinica(clinicaId);
    res.json(montarUsuarioMutacao({ usuario: alvo, uso }));
    return;
  }

  if (
    proximoStatus === 'inativo' &&
    alvo.perfil.nome === NOME_PERFIL_ADMINISTRADOR
  ) {
    const outrosAdmins = await contarAdminsAtivos(clinicaId, alvo.id);
    if (outrosAdmins === 0) {
      throw new AppError(
        400,
        'Não é possível inativar o último administrador da clínica.',
      );
    }
  }

  const usuario = await alterarStatus(id, proximoStatus);
  const uso = await usoDaClinica(clinicaId);
  res.json(montarUsuarioMutacao({ usuario, uso }));
}

export async function inativar(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await mudarStatus(req, res, 'inativo');
  } catch (err) {
    next(err);
  }
}

export async function ativar(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await mudarStatus(req, res, 'ativo');
  } catch (err) {
    next(err);
  }
}
