import { z } from 'zod';

import { apenasDigitos, cepValido, cpfValido, telefoneValido } from '../lib/validacao';

const sexoEnum = z.enum(['masculino', 'feminino', 'outro'], {
  errorMap: () => ({ message: 'Sexo inválido.' }),
});

const estadoCivilEnum = z.enum(['solteiro', 'casado', 'divorciado', 'viuvo', 'uniao_estavel'], {
  errorMap: () => ({ message: 'Estado civil inválido.' }),
});

const formaContatoEnum = z.enum(['whatsapp', 'telefone', 'email'], {
  errorMap: () => ({ message: 'Forma de contato inválida.' }),
});

const tagsSchema = z
  .array(z.string().trim().min(1).max(80))
  .max(30, 'Informe no máximo 30 itens.')
  .default([]);

const textoOpcional = z
  .union([z.string(), z.null()])
  .optional()
  .transform((valor) => {
    if (valor == null) return null;
    const texto = valor.trim();
    return texto.length > 0 ? texto : null;
  });

const dataCivil = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.')
  .refine((valor) => {
    const data = new Date(`${valor}T00:00:00.000Z`);
    return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === valor;
  }, 'Data inválida.');

function idadeEmAnos(iso: string): number {
  const nascimento = new Date(`${iso}T00:00:00.000Z`);
  const hoje = new Date();
  let idade = hoje.getUTCFullYear() - nascimento.getUTCFullYear();
  const mes = hoje.getUTCMonth() - nascimento.getUTCMonth();
  if (mes < 0 || (mes === 0 && hoje.getUTCDate() < nascimento.getUTCDate())) {
    idade -= 1;
  }
  return idade;
}

const enderecoSchema = z.object({
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
});

const responsavelSchema = z
  .object({
    nome: z.string().trim().min(5, 'Informe o nome do responsável.'),
    cpf: z
      .string()
      .transform(apenasDigitos)
      .refine((valor) => valor.length === 0 || cpfValido(valor), 'CPF do responsável inválido.')
      .transform((valor) => (valor.length === 0 ? null : valor)),
    parentesco: z
      .string()
      .trim()
      .max(40)
      .optional()
      .transform((valor) => (valor ? valor : null)),
    telefone: z
      .string()
      .transform(apenasDigitos)
      .refine((valor) => valor.length === 0 || telefoneValido(valor), 'Telefone do responsável inválido.')
      .transform((valor) => (valor.length === 0 ? null : valor)),
  })
  .nullable()
  .optional()
  .transform((valor) => valor ?? null);

export const pacienteBodySchema = z
  .object({
    nome: z.string().trim().min(5, 'Informe o nome completo.'),
    cpf: z
      .string()
      .transform(apenasDigitos)
      .refine(cpfValido, 'CPF inválido.'),
    rg: textoOpcional,
    dataNascimento: dataCivil.refine((valor) => {
      const data = new Date(`${valor}T00:00:00.000Z`);
      const hoje = new Date();
      const minimo = new Date('1900-01-01T00:00:00.000Z');
      return data <= hoje && data >= minimo;
    }, 'Data de nascimento inválida.'),
    sexo: sexoEnum,
    estadoCivil: z
      .union([estadoCivilEnum, z.null(), z.literal('')])
      .optional()
      .transform((valor) => (valor ? valor : null)),
    profissao: textoOpcional,
    telefone: z
      .string()
      .transform(apenasDigitos)
      .refine(telefoneValido, 'Telefone inválido.'),
    whatsapp: z
      .union([z.string(), z.null()])
      .optional()
      .transform((valor) => (valor ? apenasDigitos(valor) : ''))
      .refine((valor) => valor.length === 0 || telefoneValido(valor), 'WhatsApp inválido.')
      .transform((valor) => (valor.length === 0 ? null : valor)),
    email: z
      .union([z.string(), z.null()])
      .optional()
      .transform((valor) => (valor ? valor.trim().toLowerCase() : null))
      .transform((valor) => (valor && valor.length > 0 ? valor : null))
      .refine((valor) => valor === null || z.string().email().safeParse(valor).success, 'E-mail inválido.'),
    endereco: enderecoSchema,
    convenioId: z
      .union([z.string().uuid('Convênio inválido.'), z.null(), z.literal('')])
      .optional()
      .transform((valor) => (valor ? valor : null)),
    numeroCarteirinha: textoOpcional,
    validadeCarteirinha: z
      .union([z.string(), z.null()])
      .optional()
      .transform((valor) => (valor && valor.length > 0 ? valor : null))
      .refine((valor) => valor === null || dataCivil.safeParse(valor).success, 'Validade da carteirinha inválida.'),
    responsavel: responsavelSchema,
    alergias: tagsSchema,
    condicoesPreexistentes: tagsSchema,
    medicacoesEmUso: tagsSchema,
    profissionalPreferidoId: z
      .union([z.string().uuid('Profissional inválido.'), z.null(), z.literal('')])
      .optional()
      .transform((valor) => (valor ? valor : null)),
    formaContatoPreferida: z
      .union([formaContatoEnum, z.null(), z.literal('')])
      .optional()
      .transform((valor) => (valor ? valor : null)),
    observacoes: textoOpcional,
    consentimentoLgpd: z.boolean(),
    autorizacaoImagem: z.boolean().optional().default(false),
  })
  .superRefine((dados, ctx) => {
    if (!dados.consentimentoLgpd) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'O aceite do termo de LGPD é obrigatório.',
        path: ['consentimentoLgpd'],
      });
    }

    if (idadeEmAnos(dados.dataNascimento) < 18 && !dados.responsavel?.nome) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Informe o responsável para pacientes menores de idade.',
        path: ['responsavel'],
      });
    }
  });

export const pacienteIdParamSchema = z.object({
  id: z.string().uuid('Paciente inválido.'),
});

export type PacienteBodyInput = z.infer<typeof pacienteBodySchema>;
