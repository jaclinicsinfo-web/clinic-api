import { z } from 'zod';
import { dataCivilSchema, horaSchema, textoOpcional } from './comum';
import { competenciaValida, TIPOS_BATIDA } from '../lib/rh';

const horaOpcional = z
  .union([horaSchema, z.literal(''), z.null()])
  .optional()
  .transform((valor) => {
    if (!valor) return null;
    return valor;
  });

export const competenciaSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, 'Competência inválida.')
  .refine(competenciaValida, 'Competência inválida.');

export const pontoQuerySchema = z.object({
  inicio: dataCivilSchema.optional(),
  fim: dataCivilSchema.optional(),
  usuarioId: z.string().uuid('Usuário inválido.').optional(),
});

export const pontoBodySchema = z.object({
  usuarioId: z.string().uuid('Usuário inválido.'),
  data: dataCivilSchema,
  entrada: horaOpcional,
  saidaIntervalo: horaOpcional,
  retornoIntervalo: horaOpcional,
  saida: horaOpcional,
  observacao: textoOpcional,
});

export const pontoAtualizacaoSchema = pontoBodySchema.omit({ usuarioId: true, data: true });

export const baterPontoBodySchema = z.object({
  tipo: z.enum(TIPOS_BATIDA).optional(),
});

export const pontoIdParamSchema = z.object({
  id: z.string().uuid('Registro de ponto inválido.'),
});

export const holeriteQuerySchema = z.object({
  competencia: competenciaSchema.optional(),
  usuarioId: z.string().uuid('Usuário inválido.').optional(),
});

export const holeriteUploadSchema = z.object({
  usuarioId: z.string().uuid('Usuário inválido.'),
  competencia: competenciaSchema,
});

export const holeriteIdParamSchema = z.object({
  id: z.string().uuid('Holerite inválido.'),
});

export type PontoBodyInput = z.infer<typeof pontoBodySchema>;
export type PontoAtualizacaoInput = z.infer<typeof pontoAtualizacaoSchema>;
export type BaterPontoInput = z.infer<typeof baterPontoBodySchema>;
export type HoleriteUploadInput = z.infer<typeof holeriteUploadSchema>;
