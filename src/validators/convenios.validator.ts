import { z } from 'zod';
import { apenasDigitos, telefoneValido } from '../lib/validacao';
import { dataCivilSchema, statusCadastroSchema, textoOpcional, uuidOpcional } from './comum';

export const convenioBodySchema = z.object({
  nome: z.string().trim().min(3, 'Informe o nome do convênio.'),
  registroAns: z.string().trim().min(4, 'Informe o registro ANS.').max(20),
  prazoPagamentoDias: z
    .number({ invalid_type_error: 'Informe o prazo de pagamento.' })
    .int()
    .min(1, 'O prazo deve ser de ao menos 1 dia.')
    .max(180, 'O prazo máximo é de 180 dias.'),
  exigeAutorizacaoPrevia: z.boolean(),
  contatoNome: z.string().trim().min(3, 'Informe o contato do convênio.'),
  contatoTelefone: z
    .string()
    .transform(apenasDigitos)
    .refine(telefoneValido, 'Telefone inválido.'),
  portalUrl: textoOpcional.refine(
    (valor) => valor === null || /^https?:\/\//i.test(valor),
    'Informe uma URL válida, começando com http:// ou https://.',
  ),
  status: statusCadastroSchema.optional().default('ativo'),
});

export const convenioTabelaSchema = z.object({
  precos: z
    .array(
      z.object({
        procedimentoId: z.string().uuid('Procedimento inválido.'),
        valor: z.number().min(0, 'Valor inválido.').max(1_000_000),
      }),
    )
    .max(200),
});

export const convenioIdParamSchema = z.object({
  id: z.string().uuid('Convênio inválido.'),
});

export type ConvenioBodyInput = z.infer<typeof convenioBodySchema>;
