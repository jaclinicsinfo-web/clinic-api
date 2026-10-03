import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('E-mail inválido.'),
  senha: z.string().min(1, 'Informe a senha.'),
  lembrar: z.boolean().optional().default(false),
});

export const selecionarUnidadeSchema = z.object({
  unidadeId: z.string().uuid('Unidade inválida.'),
});

export const recuperarSenhaSchema = z.object({
  email: z.string().email('E-mail inválido.'),
});

export const redefinirSenhaSchema = z.object({
  token: z.string().min(20, 'Link de recuperação inválido.'),
  senha: z.string().min(8, 'A senha deve ter no mínimo 8 caracteres.'),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type SelecionarUnidadeInput = z.infer<typeof selecionarUnidadeSchema>;

export const primeiroAcessoSchema = z.object({
  unidadeNome: z.string().trim().min(3, 'Nome da unidade deve ter no mínimo 3 caracteres.'),
  unidadeCidade: z.string().trim().min(2, 'Cidade inválida.'),
  adminNome: z.string().trim().min(3, 'Nome do administrador deve ter no mínimo 3 caracteres.'),
});

export const temaSchema = z.object({
  tema: z.enum(['claro', 'escuro'], { errorMap: () => ({ message: 'Tema inválido.' }) }),
});
