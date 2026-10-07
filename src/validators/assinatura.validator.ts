import { z } from 'zod';

import { cadastroSchema } from './cadastro.validator';

export const inscricaoSchema = z.object({
  plano: cadastroSchema.shape.plano,
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

export type InscricaoInput = z.infer<typeof inscricaoSchema>;
