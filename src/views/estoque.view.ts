import { dataCivil, dinheiro } from '../lib/datas';
import { CATEGORIAS_PRODUTO, UNIDADES_MEDIDA } from '../validators/estoque.validator';
import { MovimentacaoCompleta, ProdutoEstoque } from '../models/estoque.model';
import { ProcedimentoCompleto } from '../models/procedimento.model';

export function produtoResumo(produto: ProdutoEstoque) {
  return {
    id: produto.id,
    nome: produto.nome,
    categoria: produto.categoria,
    unidadeMedida: produto.unidadeMedida,
    quantidadeAtual: dinheiro(produto.quantidadeAtual),
    estoqueMinimo: dinheiro(produto.estoqueMinimo),
    custoUnitario: dinheiro(produto.custoUnitario),
    fornecedor: produto.fornecedor,
    ativo: produto.ativo,
    atualizadoEm: dataCivil(produto.atualizadoEm) ?? produto.atualizadoEm.toISOString().slice(0, 10),
  };
}

export function movimentacaoResumo(movimentacao: MovimentacaoCompleta) {
  return {
    id: movimentacao.id,
    produtoId: movimentacao.produtoId,
    produtoNome: movimentacao.produto.nome,
    tipo: movimentacao.tipo as 'entrada' | 'saida',
    quantidade: dinheiro(movimentacao.quantidade),
    motivo: movimentacao.motivo,
    responsavel: movimentacao.usuario.nome,
    procedimentoId: movimentacao.procedimentoId,
    procedimentoNome: movimentacao.procedimento?.nome ?? null,
    data: dataCivil(movimentacao.data) ?? '',
  };
}

export function montarEstoque(params: {
  produtos: ProdutoEstoque[];
  movimentacoes: MovimentacaoCompleta[];
  procedimentos: ProcedimentoCompleto[];
}) {
  const produtos = params.produtos.map(produtoResumo);
  const movimentacoes = params.movimentacoes.map(movimentacaoResumo);
  const abaixo = produtos.filter((produto) => produto.ativo && produto.quantidadeAtual < produto.estoqueMinimo);
  const saidas = movimentacoes.filter((item) => item.tipo === 'saida');

  const consumoMap = new Map<string, { produtoId: string; produtoNome: string; quantidade: number; ocorrencias: number }>();
  for (const saida of saidas) {
    const atual = consumoMap.get(saida.produtoId) ?? {
      produtoId: saida.produtoId,
      produtoNome: saida.produtoNome,
      quantidade: 0,
      ocorrencias: 0,
    };
    atual.quantidade += saida.quantidade;
    atual.ocorrencias += 1;
    consumoMap.set(saida.produtoId, atual);
  }

  return {
    produtos,
    movimentacoes,
    categorias: [...CATEGORIAS_PRODUTO],
    unidadesMedida: [...UNIDADES_MEDIDA],
    procedimentos: params.procedimentos.map((item) => ({ id: item.id, nome: item.nome })),
    resumo: {
      totalItens: produtos.filter((item) => item.ativo).length,
      valorEmEstoque: produtos
        .filter((item) => item.ativo)
        .reduce((total, item) => total + item.quantidadeAtual * item.custoUnitario, 0),
      abaixoDoMinimo: abaixo.length,
      saidasNoPeriodo: saidas.length,
    },
    consumo: [...consumoMap.values()].sort((a, b) => b.quantidade - a.quantidade),
  };
}

export function montarProduto(produto: ProdutoEstoque) {
  return { produto: produtoResumo(produto) };
}

export function montarMovimentacao(params: { movimentacao: MovimentacaoCompleta; produto: ProdutoEstoque }) {
  return {
    movimentacao: movimentacaoResumo(params.movimentacao),
    produto: produtoResumo(params.produto),
  };
}
