import { z } from 'zod';
import { apenasDigitos, cpfValido, telefoneValido } from '../lib/validacao';
import { dataCivilSchema, horaSchema, statusCadastroSchema, textoOpcional, uuidOpcional } from './comum';

export const ESPECIALIDADES = [
  'Clínica Geral',
  'Cardiologia',
  'Dermatologia',
  'Ortopedia',
  'Pediatria',
  'Ginecologia',
  'Odontologia',
  'Nutrição',
  'Fisioterapia',
  'Estética',
] as const;

const CONSELHOS = ['CRM', 'CRO', 'CREFITO', 'CRN', 'CRP', 'COREN'] as const;

const gradeItemSchema = z.object({
  diaSemana: z.number().int().min(0).max(6),
  horaInicio: horaSchema,
  horaFim: horaSchema,
});

export const profissionalBodySchema = z
  .object({
    nome: z.string().trim().min(5, 'Informe o nome completo.'),
    cpf: z
      .string()
      .transform(apenasDigitos)
      .refine(cpfValido, 'CPF inválido.'),
    rg: textoOpcional,
    email: z.string().trim().toLowerCase().email('E-mail inválido.'),
    telefone: z
      .string()
      .transform(apenasDigitos)
      .refine(telefoneValido, 'Telefone inválido.'),
    fotoUrl: textoOpcional.refine(
      (valor) => valor === null || /^https?:\/\//i.test(valor),
      'Informe uma URL válida para a foto.',
    ),
    especialidades: z
      .array(z.enum(ESPECIALIDADES, { errorMap: () => ({ message: 'Especialidade inválida.' }) }))
      .min(1, 'Selecione ao menos uma especialidade.'),
    conselho: z.enum(CONSELHOS, { errorMap: () => ({ message: 'Conselho inválido.' }) }),
    registroConselho: z.string().trim().min(3, 'Informe o número do registro.'),
    tipoVinculo: z.enum(['clt', 'pj', 'autonomo'], {
      errorMap: () => ({ message: 'Tipo de vínculo inválido.' }),
    }),
    dataAdmissao: dataCivilSchema,
    formaRemuneracao: z.enum(['fixo', 'comissao', 'misto'], {
      errorMap: () => ({ message: 'Forma de remuneração inválida.' }),
    }),
    percentualComissao: z.number().min(0).max(100),
    comissaoPorProcedimento: z.boolean().optional().default(false),
    procedimentosHabilitados: z
      .array(z.string().uuid('Procedimento inválido.'))
      .min(1, 'Habilite ao menos um procedimento.'),
    gradeHorarios: z.array(gradeItemSchema).min(1, 'Defina ao menos um dia de atendimento.'),
    usuarioId: uuidOpcional,
    status: statusCadastroSchema.optional().default('ativo'),
  })
  .superRefine((dados, ctx) => {
    if (dados.formaRemuneracao !== 'fixo' && dados.percentualComissao <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Informe o percentual de comissão para esta forma de remuneração.',
        path: ['percentualComissao'],
      });
    }

    const dias = new Set<number>();
    for (const [indice, grade] of dados.gradeHorarios.entries()) {
      if (dias.has(grade.diaSemana)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Há dias repetidos na grade semanal.',
          path: ['gradeHorarios', indice, 'diaSemana'],
        });
      }
      dias.add(grade.diaSemana);
      if (grade.horaFim <= grade.horaInicio) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'O horário final deve ser posterior ao inicial.',
          path: ['gradeHorarios', indice, 'horaFim'],
        });
      }
    }
  });

export const profissionalIdParamSchema = z.object({
  id: z.string().uuid('Profissional inválido.'),
});

export type ProfissionalBodyInput = z.infer<typeof profissionalBodySchema>;
