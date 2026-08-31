import { z } from 'zod';
import { statusCadastroSchema } from './comum';

export const CATEGORIAS_PROCEDIMENTO = [
  'Consulta',
  'Exame',
  'Procedimento cirúrgico',
  'Odontologia',
  'Estética',
  'Terapia',
] as const;

export const procedimentoBodySchema = z.object({
  nome: z.string().trim().min(3, 'Informe o nome do procedimento.'),
  categoria: z.enum(CATEGORIAS_PROCEDIMENTO, {
    errorMap: () => ({ message: 'Categoria inválida.' }),
  }),
  duracaoPadraoMin: z
    .number({ invalid_type_error: 'Informe a duração.' })
    .int()
    .min(10, 'Duração mínima de 10 minutos.')
    .max(240, 'Duração máxima de 240 minutos.'),
  valorParticular: z
    .number({ invalid_type_error: 'Informe o valor particular.' })
    .min(1, 'Informe o valor particular.')
    .max(1_000_000),
  status: statusCadastroSchema.optional().default('ativo'),
});

export const procedimentoIdParamSchema = z.object({
  id: z.string().uuid('Procedimento inválido.'),
});

export type ProcedimentoBodyInput = z.infer<typeof procedimentoBodySchema>;
