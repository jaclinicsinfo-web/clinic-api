import { Prisma } from '@prisma/client';

import { prisma } from '../config/database';

export interface DadosEventoPagamento {
  tipo: string;
  nivel: 'info' | 'aviso' | 'erro';
  mensagem: string;
  pedidoId?: string | null;
  clinicaId?: string | null;
  pagamentoId?: string | null;
  meio?: string | null;
  status?: string | null;
  valor?: number | null;
  detalhes?: Record<string, unknown> | null;
}

export async function inserirEvento(dados: DadosEventoPagamento) {
  await prisma.eventoPagamento.create({
    data: {
      ...dados,
      detalhes: (dados.detalhes ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}
