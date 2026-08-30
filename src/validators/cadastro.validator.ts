import { z } from 'zod';

const apenasDigitos = (valor: string): string => valor.replace(/\D/g, '');

export const cadastroSchema = z.object({
  plano: z.enum(['essencial', 'profissional', 'ilimitado'], {
    errorMap: () => ({ message: 'Plano inválido.' }),
  }),
  clinica: z.object({
    nomeFantasia: z.string().trim().min(3, 'Nome fantasia deve ter no mínimo 3 caracteres.'),
    razaoSocial: z.string().trim().min(3, 'Razão social deve ter no mínimo 3 caracteres.'),
    cnpj: z
      .string()
      .transform(apenasDigitos)
      .refine((v) => v.length === 14, 'CNPJ deve conter 14 dígitos.'),
    telefone: z
      .string()
      .transform(apenasDigitos)
      .refine((v) => v.length === 10 || v.length === 11, 'Telefone deve conter 10 ou 11 dígitos.'),
    email: z.string().trim().toLowerCase().email('E-mail da clínica inválido.'),
  }),
  unidade: z.object({
    nome: z.string().trim().min(3, 'Nome da unidade deve ter no mínimo 3 caracteres.'),
    cidade: z.string().trim().min(2, 'Cidade inválida.'),
  }),
  usuario: z.object({
    nome: z.string().trim().min(3, 'Nome do usuário deve ter no mínimo 3 caracteres.'),
    email: z.string().trim().toLowerCase().email('E-mail do usuário inválido.'),
    senha: z.string().min(8, 'A senha deve ter no mínimo 8 caracteres.'),
  }),
});

export type CadastroInput = z.infer<typeof cadastroSchema>;
