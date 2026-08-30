import { z } from 'zod';

import { cnpjValido, telefoneValido } from '../lib/validacao';

const apenasDigitos = (valor: string): string => valor.replace(/\D/g, '');

/** Primeiro acesso: clínica + unidade + admin. O plano vem de `PLANO` no ambiente. */
export const setupSchema = z.object({
  clinica: z.object({
    nomeFantasia: z.string().trim().min(3, 'Nome fantasia deve ter no mínimo 3 caracteres.'),
    razaoSocial: z.string().trim().min(3, 'Razão social deve ter no mínimo 3 caracteres.'),
    cnpj: z
      .string()
      .transform(apenasDigitos)
      .refine(cnpjValido, 'CNPJ inválido.'),
    telefone: z
      .string()
      .transform(apenasDigitos)
      .refine(telefoneValido, 'Telefone inválido.'),
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

export type SetupInput = z.infer<typeof setupSchema>;
