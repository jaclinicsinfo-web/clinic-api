import { Prisma } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';
import { atualizarPermissoesSchema, perfilIdParamSchema } from '../validators/perfis.validator';
import {
  atualizarPermissoes,
  buscarPorIdEClinica,
  listarPorClinica,
} from '../models/perfil-acesso.model';
import { permissoesComoMapa } from '../lib/permissoes';
import { NOME_PERFIL_ADMINISTRADOR } from '../lib/perfis-padrao';
import { AppError } from '../lib/erros';
import { perfilCompleto } from '../views/usuarios.view';

export async function listar(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const perfis = await listarPorClinica(req.auth!.clinicaId);
    res.json({ perfis: perfis.map(perfilCompleto) });
  } catch (err) {
    next(err);
  }
}

export async function atualizar(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = perfilIdParamSchema.parse(req.params);
    const dados = atualizarPermissoesSchema.parse(req.body);
    const clinicaId = req.auth!.clinicaId;

    const perfil = await buscarPorIdEClinica(id, clinicaId);
    if (!perfil) {
      throw new AppError(404, 'Perfil não encontrado.');
    }

    if (perfil.nome === NOME_PERFIL_ADMINISTRADOR) {
      throw new AppError(400, 'As permissões do administrador não podem ser alteradas.');
    }

    const atualizado = await atualizarPermissoes(
      id,
      clinicaId,
      permissoesComoMapa(dados.permissoes) as unknown as Prisma.InputJsonValue,
    );

    res.json({ perfil: perfilCompleto(atualizado) });
  } catch (err) {
    next(err);
  }
}
