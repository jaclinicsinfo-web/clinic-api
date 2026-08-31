import { z } from 'zod';

import { cepValido, cnpjValido, telefoneValido, apenasDigitos } from '../lib/validacao';
import { textoOpcional } from './comum';

export const clinicaBodySchema = z.object({
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
  endereco: z.object({
    cep: z
      .string()
      .transform(apenasDigitos)
      .refine(cepValido, 'CEP inválido.'),
    rua: z.string().trim().min(3, 'Informe o logradouro.'),
    numero: z.string().trim().min(1, 'Informe o número.'),
    complemento: textoOpcional,
    bairro: z.string().trim().min(2, 'Informe o bairro.'),
    cidade: z.string().trim().min(2, 'Informe a cidade.'),
    uf: z
      .string()
      .trim()
      .transform((valor) => valor.toUpperCase())
      .refine((valor) => /^[A-Z]{2}$/.test(valor), 'UF deve ter 2 letras.'),
  }),
});

export const unidadeBodySchema = z.object({
  nome: z.string().trim().min(3, 'Nome da unidade deve ter no mínimo 3 caracteres.'),
  cidade: z.string().trim().min(2, 'Cidade inválida.'),
});

export const unidadeIdParamSchema = z.object({
  id: z.string().uuid('Identificador inválido.'),
});
