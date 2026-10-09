import { z } from 'zod';
import { dataCivilSchema, horaSchema, textoOpcional, uuidOpcional } from './comum';

export const STATUS_AGENDAMENTO = [
  'agendado',
  'confirmado',
  'check_in',
  'em_atendimento',
  'atendido',
  'cancelado',
  'faltou',
] as const;

export const TIPO_AGENDAMENTO = ['avaliacao', 'atendimento'] as const;

export const FLUXO_STATUS: Record<(typeof STATUS_AGENDAMENTO)[number], (typeof STATUS_AGENDAMENTO)[number][]> = {
  agendado: ['confirmado', 'cancelado'],
  confirmado: ['check_in', 'cancelado', 'faltou'],
  check_in: ['em_atendimento', 'cancelado', 'faltou'],
  em_atendimento: ['atendido'],
  atendido: [],
  cancelado: [],
  faltou: [],
};

export const agendaQuerySchema = z.object({
  de: dataCivilSchema.optional(),
  ate: dataCivilSchema.optional(),
});

export const agendamentoBodySchema = z
  .object({
    pacienteId: z.string().uuid('Paciente inválido.'),
    profissionalId: z.string().uuid('Profissional inválido.'),
    procedimentoId: z.string().uuid('Procedimento inválido.'),
    data: dataCivilSchema,
    horaInicio: horaSchema,
    horaFim: horaSchema,
    sala: textoOpcional,
    particular: z.boolean(),
    convenioId: uuidOpcional,
    tipo: z.enum(TIPO_AGENDAMENTO).optional().default('atendimento'),
    observacoes: textoOpcional,
    status: z.enum(STATUS_AGENDAMENTO).optional().default('agendado'),
    recorrencia: z
      .object({
        intervalo: z.enum(['semanal', 'duas_semanas', 'tres_semanas', 'mensal']),
        meses: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(6), z.literal(12)]),
      })
      .optional(),
  })
  .superRefine((dados, ctx) => {
    if (dados.horaFim <= dados.horaInicio) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'O horário final deve ser posterior ao inicial.',
        path: ['horaFim'],
      });
    }
  });

export const agendamentoStatusSchema = z.object({
  status: z.enum(STATUS_AGENDAMENTO, { errorMap: () => ({ message: 'Status inválido.' }) }),
});

export const reagendarSchema = z
  .object({
    data: dataCivilSchema,
    horaInicio: horaSchema,
    horaFim: horaSchema,
    profissionalId: z.string().uuid('Profissional inválido.').optional(),
  })
  .refine((dados) => dados.horaFim > dados.horaInicio, {
    message: 'O horário final deve ser posterior ao inicial.',
    path: ['horaFim'],
  });

export const bloqueioBodySchema = z
  .object({
    profissionalId: z.string().uuid('Profissional inválido.'),
    data: dataCivilSchema,
    horaInicio: horaSchema,
    horaFim: horaSchema,
    motivo: z.string().trim().min(3, 'Descreva o motivo do bloqueio.').max(240),
  })
  .refine((dados) => dados.horaFim > dados.horaInicio, {
    message: 'O término deve ser posterior ao início.',
    path: ['horaFim'],
  });

export const esperaBodySchema = z.object({
  pacienteId: z.string().uuid('Paciente inválido.'),
  profissionalId: uuidOpcional,
  procedimentoId: uuidOpcional,
  preferenciaPeriodo: z.enum(['manha', 'tarde', 'qualquer'], {
    errorMap: () => ({ message: 'Período inválido.' }),
  }),
});

export const idParamSchema = z.object({
  id: z.string().uuid('Identificador inválido.'),
});

export type AgendamentoBodyInput = z.infer<typeof agendamentoBodySchema>;
