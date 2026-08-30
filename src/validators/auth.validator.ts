import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('E-mail inválido.'),
  senha: z.string().min(1, 'Informe a senha.'),
  lembrar: z.boolean().optional().default(false),
});

export const selecionarUnidadeSchema = z.object({
  unidadeId: z.string().uuid('Unidade inválida.'),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type SelecionarUnidadeInput = z.infer<typeof selecionarUnidadeSchema>;
