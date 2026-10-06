import { Prisma } from '@prisma/client';

export function wherePacienteDoProfissional(profissionalId: string): Prisma.PacienteWhereInput {
  return {
    OR: [
      { profissionalPreferidoId: profissionalId },
      { agendamentos: { some: { profissionalId } } },
    ],
  };
}

export function whereCobrancaDoProfissional(profissionalId: string): Prisma.CobrancaWhereInput {
  return {
    OR: [
      { agendamento: { is: { profissionalId } } },
      { paciente: wherePacienteDoProfissional(profissionalId) },
    ],
  };
}
