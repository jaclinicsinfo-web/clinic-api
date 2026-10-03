import { Request, Response, NextFunction } from 'express';
import {
  movimentacaoBodySchema,
  produtoAtualizacaoSchema,
  produtoBodySchema,
  produtoIdParamSchema,
} from '../validators/estoque.validator';
import {
  alterarAtivoProduto,
  atualizarProduto,
  buscarProduto,
  criarProduto,
  listarMovimentacoes,
  listarProdutos,
  nomeProdutoExiste,
  registrarMovimentacao,
} from '../models/estoque.model';
import { buscarPorIdEClinica as buscarProcedimento, listarAtivosPorClinica } from '../models/procedimento.model';
import { AppError } from '../lib/erros';
import { dataDeIso } from '../lib/datas';
import { montarEstoque, montarMovimentacao, montarProduto } from '../views/estoque.view';

async function carregarProduto(req: Request) {
  const { id } = produtoIdParamSchema.parse(req.params);
  const produto = await buscarProduto(id, req.auth!.clinicaId);
  if (!produto) {
    throw new AppError(404, 'Produto não encontrado.');
  }
  return produto;
}

export async function listarEstoque(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const clinicaId = req.auth!.clinicaId;
    const [produtos, movimentacoes, procedimentos] = await Promise.all([
      listarProdutos(clinicaId),
      listarMovimentacoes(clinicaId),
      listarAtivosPorClinica(clinicaId),
    ]);
    res.json(montarEstoque({ produtos, movimentacoes, procedimentos }));
  } catch (err) {
    next(err);
  }
}

export async function criarProdutoEstoque(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const clinicaId = req.auth!.clinicaId;
    const dados = produtoBodySchema.parse(req.body);

    if (await nomeProdutoExiste(clinicaId, dados.nome)) {
      throw new AppError(409, 'Já existe um produto com este nome.');
    }

    const criado = await criarProduto({ clinicaId, ...dados });
    res.status(201).json(montarProduto(criado));
  } catch (err) {
    next(err);
  }
}

export async function atualizarProdutoEstoque(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const produto = await carregarProduto(req);
    const dados = produtoAtualizacaoSchema.parse(req.body);

    if (await nomeProdutoExiste(produto.clinicaId, dados.nome, produto.id)) {
      throw new AppError(409, 'Já existe um produto com este nome.');
    }

    const atualizado = await atualizarProduto(produto.id, produto.clinicaId, dados);
    res.json(montarProduto(atualizado));
  } catch (err) {
    next(err);
  }
}

export async function inativarProdutoEstoque(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const produto = await carregarProduto(req);
    const atualizado = await alterarAtivoProduto(produto.id, produto.clinicaId, !produto.ativo);
    res.json(montarProduto(atualizado));
  } catch (err) {
    next(err);
  }
}

export async function criarMovimentacaoEstoque(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = req.auth!;
    if (!auth.unidadeAtualId) {
      throw new AppError(400, 'Selecione uma unidade para registrar a movimentação.');
    }

    const dados = movimentacaoBodySchema.parse(req.body);
    const produto = await buscarProduto(dados.produtoId, auth.clinicaId);
    if (!produto || !produto.ativo) {
      throw new AppError(404, 'Produto não encontrado.');
    }

    if (dados.procedimentoId) {
      const procedimento = await buscarProcedimento(dados.procedimentoId, auth.clinicaId);
      if (!procedimento) {
        throw new AppError(404, 'Procedimento não encontrado.');
      }
    }

    const data = dataDeIso(dados.data);
    if (!data) {
      throw new AppError(400, 'Data inválida.');
    }

    const resultado = await registrarMovimentacao({
      clinicaId: auth.clinicaId,
      unidadeId: auth.unidadeAtualId,
      produtoId: produto.id,
      tipo: dados.tipo,
      quantidade: dados.quantidade,
      motivo: dados.motivo,
      procedimentoId: dados.procedimentoId ?? null,
      usuarioId: auth.sub,
      data,
    });

    if (!resultado) {
      throw new AppError(404, 'Produto não encontrado.');
    }
    if ('erro' in resultado) {
      throw new AppError(400, 'A saída deixa o saldo negativo. Ajuste a quantidade.');
    }

    res.status(201).json(montarMovimentacao(resultado));
  } catch (err) {
    next(err);
  }
}
