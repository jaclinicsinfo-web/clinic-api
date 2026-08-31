import { z } from 'zod';

export const PERIODOS_RELATORIO = ['mes', 'anterior', '30d', '12m', 'ano'] as const;

export const relatorioQuerySchema = z.object({
  periodo: z.enum(PERIODOS_RELATORIO).optional().default('mes'),
});
