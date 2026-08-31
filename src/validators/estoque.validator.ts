import { z } from 'zod';

export const CATEGORIAS_PRODUTO = [
  'Material odontológico',
  'Material de enfermagem',
  'Medicamento',
  'Estética',
  'Descartáveis',
  'Escritório',
] as const;

export const UNIDADES_MEDIDA = [
  'unidade',
  'caixa',
  'frasco',
  'litro',
  'galão',
  'seringa',
  'rolo',
  'ampola',
  'pacote',
] as const;

export const produtoBodySchema = z.object({
  nome: z.string().trim().min(3, 'Informe o nome do produto.'),
  categoria: z.enum(CATEGORIAS_PRODUTO, { errorMap: () => ({ message: 'Categoria inválida.' }) }),
  unidadeMedida: z.enum(UNIDADES_MEDIDA, { errorMap: () => ({ message: 'Unidade de medida inválida.' }) }),
  quantidadeAtual: z
    .number({ invalid_type_error: 'Informe a quantidade atual.' })
    .min(0, 'A quantidade não pode ser negativa.')
    .max(1_000_000),
  estoqueMinimo: z
    .number({ invalid_type_error: 'Informe o estoque mínimo.' })
    .min(0, 'O estoque mínimo não pode ser negativo.')
    .max(1_000_000),
  custoUnitario: z
    .number({ invalid_type_error: 'Informe o custo unitário.' })
    .min(0, 'O custo não pode ser negativo.')
    .max(1_000_000),
  fornecedor: z.string().trim().min(2, 'Informe o fornecedor.'),
});

export const produtoAtualizacaoSchema = produtoBodySchema.omit({ quantidadeAtual: true });

export const movimentacaoBodySchema = z.object({
  produtoId: z.string().uuid('Produto inválido.'),
  tipo: z.enum(['entrada', 'saida']),
  quantidade: z
    .number({ invalid_type_error: 'Informe a quantidade.' })
    .positive('A quantidade deve ser maior que zero.')
    .max(1_000_000),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.'),
  motivo: z.string().trim().min(3, 'Descreva o motivo da movimentação.'),
  procedimentoId: z.string().uuid('Procedimento inválido.').optional().nullable(),
});

export const produtoIdParamSchema = z.object({
  id: z.string().uuid('Produto inválido.'),
});

export type ProdutoBodyInput = z.infer<typeof produtoBodySchema>;
export type MovimentacaoBodyInput = z.infer<typeof movimentacaoBodySchema>;
