import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  listarDoUsuario,
  marcarLida,
  marcarTodasLidas,
  sincronizarOperacionais,
} from '../models/notificacao.model';
import { buscarPorId } from '../models/usuario.model';
import { permissoesEfetivas } from '../lib/permissoes';
import { AppError } from '../lib/erros';
import { montarListaNotificacoes, notificacaoResumo } from '../views/notificacoes.view';

const idParamSchema = z.object({
  id: z.string().uuid('Notificação inválida.'),
});

export async function listarNotificacoes(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const usuario = await buscarPorId(req.auth!.sub);
    if (!usuario) {
      throw new AppError(401, 'Sessão expirada. Entre novamente.');
    }

    await sincronizarOperacionais({
      clinicaId: usuario.clinicaId,
      usuarioId: usuario.id,
      permissoes: permissoesEfetivas(usuario.perfil, usuario.clinica.plano.codigo),
    });

    const notificacoes = await listarDoUsuario(usuario.id, usuario.clinicaId);
    res.json(montarListaNotificacoes(notificacoes));
  } catch (err) {
    next(err);
  }
}

export async function marcarNotificacaoLida(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = idParamSchema.parse(req.params);
    const atualizada = await marcarLida(id, req.auth!.sub, req.auth!.clinicaId);
    if (!atualizada) {
      throw new AppError(404, 'Notificação não encontrada.');
    }
    res.json({ notificacao: notificacaoResumo(atualizada) });
  } catch (err) {
    next(err);
  }
}

export async function marcarNotificacoesLidas(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await marcarTodasLidas(req.auth!.sub, req.auth!.clinicaId);
    const notificacoes = await listarDoUsuario(req.auth!.sub, req.auth!.clinicaId);
    res.json(montarListaNotificacoes(notificacoes));
  } catch (err) {
    next(err);
  }
}
