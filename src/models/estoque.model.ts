import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';

const incluir = {
  procedimento: { select: { id: true, nome: true } },
  usuario: { select: { id: true, nome: true } },
  produto: { select: { id: true, nome: true, unidadeMedida: true } },
} satisfies Prisma.MovimentacaoEstoqueInclude;

export type MovimentacaoCompleta = Prisma.MovimentacaoEstoqueGetPayload<{ include: typeof incluir }>;
export type ProdutoEstoque = Prisma.ProdutoEstoqueGetPayload<object>;

export interface DadosProduto {
  clinicaId: string;
  nome: string;
  categoria: string;
  unidadeMedida: string;
  quantidadeAtual: number;
  estoqueMinimo: number;
  custoUnitario: number;
  fornecedor: string;
}

export interface DadosMovimentacao {
  clinicaId: string;
  unidadeId: string;
  produtoId: string;
  tipo: 'entrada' | 'saida';
  quantidade: number;
  motivo: string;
  procedimentoId?: string | null;
  usuarioId: string;
  data: Date;
}

export async function listarProdutos(clinicaId: string) {
  return prisma.produtoEstoque.findMany({
    where: { clinicaId },
    orderBy: { nome: 'asc' },
  });
}

export async function listarAbaixoDoMinimo(clinicaId: string) {
  const produtos = await prisma.produtoEstoque.findMany({
    where: { clinicaId, ativo: true },
    orderBy: { nome: 'asc' },
  });
  return produtos.filter((produto) => Number(produto.quantidadeAtual) < Number(produto.estoqueMinimo));
}

export async function buscarProduto(id: string, clinicaId: string) {
  return prisma.produtoEstoque.findFirst({ where: { id, clinicaId } });
}

export async function nomeProdutoExiste(clinicaId: string, nome: string, excetoId?: string) {
  const existente = await prisma.produtoEstoque.findFirst({
    where: {
      clinicaId,
      nome: { equals: nome, mode: 'insensitive' },
      ...(excetoId ? { id: { not: excetoId } } : {}),
    },
    select: { id: true },
  });
  return Boolean(existente);
}

export async function criarProduto(dados: DadosProduto) {
  return prisma.produtoEstoque.create({
    data: {
      clinicaId: dados.clinicaId,
      nome: dados.nome,
      categoria: dados.categoria,
      unidadeMedida: dados.unidadeMedida,
      quantidadeAtual: dados.quantidadeAtual,
      estoqueMinimo: dados.estoqueMinimo,
      custoUnitario: dados.custoUnitario,
      fornecedor: dados.fornecedor,
    },
  });
}

export async function atualizarProduto(id: string, dados: Omit<DadosProduto, 'clinicaId' | 'quantidadeAtual'>) {
  return prisma.produtoEstoque.update({
    where: { id },
    data: {
      nome: dados.nome,
      categoria: dados.categoria,
      unidadeMedida: dados.unidadeMedida,
      estoqueMinimo: dados.estoqueMinimo,
      custoUnitario: dados.custoUnitario,
      fornecedor: dados.fornecedor,
    },
  });
}

export async function alterarAtivoProduto(id: string, ativo: boolean) {
  return prisma.produtoEstoque.update({ where: { id }, data: { ativo } });
}

export async function listarMovimentacoes(clinicaId: string): Promise<MovimentacaoCompleta[]> {
  return prisma.movimentacaoEstoque.findMany({
    where: { clinicaId },
    include: incluir,
    orderBy: [{ data: 'desc' }, { criadoEm: 'desc' }],
  });
}

export async function registrarMovimentacao(dados: DadosMovimentacao) {
  const delta = dados.tipo === 'entrada' ? dados.quantidade : -dados.quantidade;

  return prisma.$transaction(async (tx) => {
    const produto = await tx.produtoEstoque.findFirst({ where: { id: dados.produtoId, clinicaId: dados.clinicaId } });
    if (!produto) return null;

    const saldo = Number(produto.quantidadeAtual) + delta;
    if (saldo < 0) {
      return { erro: 'saldo' as const };
    }

    const movimentacao = await tx.movimentacaoEstoque.create({
      data: {
        clinicaId: dados.clinicaId,
        unidadeId: dados.unidadeId,
        produtoId: dados.produtoId,
        tipo: dados.tipo,
        quantidade: dados.quantidade,
        motivo: dados.motivo,
        procedimentoId: dados.procedimentoId ?? null,
        usuarioId: dados.usuarioId,
        data: dados.data,
      },
      include: incluir,
    });

    const atualizado = await tx.produtoEstoque.update({
      where: { id: produto.id },
      data: { quantidadeAtual: saldo },
    });

    return { movimentacao, produto: atualizado };
  });
}
