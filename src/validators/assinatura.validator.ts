import { z } from 'zod';

import { cadastroSchema } from './cadastro.validator';

export const inscricaoSchema = z.object({
  plano: cadastroSchema.shape.plano,
  ciclo: z.enum(['mensal', 'anual']).optional(),
  clinica: cadastroSchema.shape.clinica,
  unidade: cadastroSchema.shape.unidade,
  usuario: z.object({
    nome: z.string().trim().min(3, 'Nome do usuário deve ter no mínimo 3 caracteres.'),
    email: z.string().trim().toLowerCase().email('E-mail do usuário inválido.'),
  }),
});

export const pedidoIdSchema = z.object({
  pedidoId: z.string().uuid('Pedido inválido.'),
});

export const clinicaIdSchema = z.object({
  clinicaId: z.string().uuid('Clínica inválida.'),
});

export const pagamentoClinicaSchema = z.object({
  plano: cadastroSchema.shape.plano,
  ciclo: z.enum(['mensal', 'anual'], { message: 'Escolha mensal ou anual.' }),
});

export type InscricaoInput = z.infer<typeof inscricaoSchema>;
export type PagamentoClinicaInput = z.infer<typeof pagamentoClinicaSchema>;
