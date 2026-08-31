import { z } from 'zod';
import { dataCivilSchema, textoOpcional, uuidOpcional } from './comum';

export const TIPO_REGISTRO = ['avaliacao_inicial', 'evolucao', 'retorno', 'alta'] as const;
export const RESPOSTA_TRATAMENTO = ['melhorou', 'estavel', 'piorou', 'resolvido'] as const;

export const atendimentoBodySchema = z
  .object({
    acompanhamentoId: uuidOpcional,
    profissionalId: z.string().uuid('Profissional inválido.'),
    procedimentoId: uuidOpcional,
    procedimentoRealizado: z.string().trim().min(3, 'Informe o procedimento realizado.'),
    tipoRegistro: z.enum(TIPO_REGISTRO, { errorMap: () => ({ message: 'Tipo de registro inválido.' }) }),
    queixaPrincipal: textoOpcional,
    quadroClinico: textoOpcional,
    evolucao: textoOpcional,
    conduta: textoOpcional,
    respostaAoTratamento: z.enum(RESPOSTA_TRATAMENTO).optional().nullable(),
    escalaDor: z
      .union([z.number().int().min(0).max(10), z.null()])
      .optional()
      .transform((valor) => valor ?? null),
    proximoRetornoSugerido: z
      .union([dataCivilSchema, z.null(), z.literal('')])
      .optional()
      .transform((valor) => (valor ? valor : null)),
    agendamentoId: uuidOpcional,
    titulo: textoOpcional,
    especialidade: textoOpcional,
    objetivo: textoOpcional,
  })
  .superRefine((dados, ctx) => {
    if (dados.tipoRegistro !== 'alta' && !dados.respostaAoTratamento) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Informe a resposta ao tratamento.',
        path: ['respostaAoTratamento'],
      });
    }
  });

export const documentoOrigemSchema = z.object({
  origem: z.string().trim().min(3, 'Informe o tipo do documento.').max(80),
});

export type AtendimentoBodyInput = z.infer<typeof atendimentoBodySchema>;
