import { z } from 'zod';
import { dataCivilSchema, textoOpcional, uuidOpcional } from './comum';
import { CATEGORIAS_DESPESA, FORMAS_PAGAMENTO_CODIGOS } from '../lib/financeiro';

export const formaPagamentoCodigoSchema = z.enum(
  FORMAS_PAGAMENTO_CODIGOS as unknown as [string, ...string[]],
  { errorMap: () => ({ message: 'Forma de pagamento inválida.' }) },
);

const valorSchema = z
  .number({ invalid_type_error: 'Informe o valor.' })
  .positive('Informe um valor maior que zero.')
  .max(10_000_000, 'Valor acima do permitido.');

const competenciaSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, 'Competência inválida.')
  .refine((valor) => {
    const [ano, mes] = valor.split('-').map(Number);
    return mes >= 1 && mes <= 12 && ano >= 2000 && ano <= 2100;
  }, 'Competência inválida.');

export const cobrancaBodySchema = z.object({
  pacienteId: z.string().uuid('Paciente inválido.'),
  agendamentoId: uuidOpcional,
  descricao: z.string().trim().min(3, 'Informe a descrição.').max(200),
  valor: valorSchema,
  vencimento: dataCivilSchema,
  convenioId: uuidOpcional,
  formaPagamento: formaPagamentoCodigoSchema.nullable().optional(),
  observacoes: textoOpcional,
  parcelas: z.number().int().min(2).max(24).optional(),
});

export const pagamentoBodySchema = z.object({
  valor: valorSchema.optional(),
  formaPagamento: formaPagamentoCodigoSchema,
  data: dataCivilSchema,
  observacoes: textoOpcional,
});

export const parcelarBodySchema = z.object({
  quantidade: z.number({ invalid_type_error: 'Informe a quantidade de parcelas.' }).int().min(2).max(24),
  formaPagamento: formaPagamentoCodigoSchema.optional(),
});

export const despesaBodySchema = z.object({
  descricao: z.string().trim().min(3, 'Informe a descrição.').max(200),
  categoria: z.enum(CATEGORIAS_DESPESA as unknown as [string, ...string[]], {
    errorMap: () => ({ message: 'Categoria inválida.' }),
  }),
  fornecedor: z.string().trim().min(2, 'Informe o fornecedor.').max(120),
  valor: valorSchema,
  vencimento: dataCivilSchema,
  recorrente: z.boolean().optional().default(false),
  formaPagamento: formaPagamentoCodigoSchema.nullable().optional(),
  observacoes: textoOpcional,
});

export const loteBodySchema = z.object({
  convenioId: z.string().uuid('Convênio inválido.'),
  competencia: competenciaSchema,
});

export const loteReconciliarSchema = z.object({
  valorGlosado: z.number().min(0).max(10_000_000),
  valorRecebido: z.number().min(0).max(10_000_000),
});

export const comissaoCalcularSchema = z.object({
  competencia: competenciaSchema.optional(),
});

export const comissaoFecharSchema = z.object({
  competencia: competenciaSchema,
});

export const idParamSchema = z.object({
  id: z.string().uuid('Identificador inválido.'),
});

export const parcelaParamSchema = z.object({
  id: z.string().uuid('Cobrança inválida.'),
  numero: z.coerce.number().int().min(1).max(24),
});

export const cobrancaQuerySchema = z.object({
  pacienteId: z.string().uuid().optional(),
});

export const comissaoQuerySchema = z.object({
  profissionalId: z.string().uuid().optional(),
  competencia: competenciaSchema.optional(),
});

export const formasPagamentoBodySchema = z.object({
  formas: z
    .array(
      z.object({
        codigo: formaPagamentoCodigoSchema,
        nome: z.string().trim().min(2).max(80),
        taxa: z.number().min(0).max(100),
        ativo: z.boolean(),
      }),
    )
    .min(1)
    .max(20),
});
