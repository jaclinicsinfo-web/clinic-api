import { Request, Response, NextFunction } from 'express';
import { procedimentoBodySchema, procedimentoIdParamSchema } from '../validators/procedimentos.validator';
import {
  alterarStatus,
  atualizar,
  buscarPorIdEClinica,
  criar,
  listarPorClinica,
  nomeJaExiste,
} from '../models/procedimento.model';
import { AppError } from '../lib/erros';
import { montarListaProcedimentos, montarProcedimento } from '../views/procedimentos.view';

async function carregar(req: Request) {
  const { id } = procedimentoIdParamSchema.parse(req.params);
  const procedimento = await buscarPorIdEClinica(id, req.auth!.clinicaId);
  if (!procedimento) {
    throw new AppError(404, 'Procedimento não encontrado.');
  }
  return procedimento;
}

export async function listarProcedimentos(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const procedimentos = await listarPorClinica(req.auth!.clinicaId);
    res.json(montarListaProcedimentos(procedimentos));
  } catch (err) {
    next(err);
  }
}

export async function criarProcedimento(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const clinicaId = req.auth!.clinicaId;
    const dados = procedimentoBodySchema.parse(req.body);

    if (await nomeJaExiste(clinicaId, dados.nome)) {
      throw new AppError(409, 'Já existe um procedimento com este nome.');
    }

    const criado = await criar({
      clinicaId,
      nome: dados.nome,
      categoria: dados.categoria,
      duracaoPadraoMin: dados.duracaoPadraoMin,
      valorParticular: dados.valorParticular,
      status: dados.status,
    });
    res.status(201).json(montarProcedimento(criado));
  } catch (err) {
    next(err);
  }
}

export async function atualizarProcedimento(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const procedimento = await carregar(req);
    const dados = procedimentoBodySchema.parse(req.body);

    if (await nomeJaExiste(procedimento.clinicaId, dados.nome, procedimento.id)) {
      throw new AppError(409, 'Já existe um procedimento com este nome.');
    }

    const atualizado = await atualizar(procedimento.id, procedimento.clinicaId, {
      nome: dados.nome,
      categoria: dados.categoria,
      duracaoPadraoMin: dados.duracaoPadraoMin,
      valorParticular: dados.valorParticular,
      status: dados.status,
    });
    res.json(montarProcedimento(atualizado));
  } catch (err) {
    next(err);
  }
}

export async function inativarProcedimento(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const procedimento = await carregar(req);
    if (procedimento.status === 'inativo') {
      res.json(montarProcedimento(procedimento));
      return;
    }
    const atualizado = await alterarStatus(procedimento.id, procedimento.clinicaId, 'inativo');
    res.json(montarProcedimento(atualizado));
  } catch (err) {
    next(err);
  }
}

export async function ativarProcedimento(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const procedimento = await carregar(req);
    if (procedimento.status === 'ativo') {
      res.json(montarProcedimento(procedimento));
      return;
    }
    const atualizado = await alterarStatus(procedimento.id, procedimento.clinicaId, 'ativo');
    res.json(montarProcedimento(atualizado));
  } catch (err) {
    next(err);
  }
}
