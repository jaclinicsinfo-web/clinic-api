import { Prisma } from '@prisma/client';

import { prisma } from '../config/database';
import type { InscricaoInput } from '../validators/assinatura.validator';

export async function criarPedido(dados: InscricaoInput, valor: number) {
  return prisma.pedidoAssinatura.create({
    data: {
      planoCodigo: dados.plano,
      valor,
      dados: dados as unknown as Prisma.InputJsonValue,
    },
  });
}

export async function buscarPedido(id: string) {
  return prisma.pedidoAssinatura.findUnique({ where: { id } });
}

export async function gravarPreferencia(id: string, preferenciaId: string) {
  return prisma.pedidoAssinatura.update({
    where: { id },
    data: { preferenciaId },
  });
}

export async function reservarPedido(id: string) {
  const reservado = await prisma.pedidoAssinatura.updateMany({
    where: { id, status: { in: ['pendente', 'revisao'] } },
    data: { status: 'processando' },
  });
  return reservado.count === 1;
}

export async function concluirPedido(id: string, clinicaId: string, pagamentoId: string | null) {
  return prisma.pedidoAssinatura.update({
    where: { id },
    data: {
      status: 'pago',
      clinicaId,
      pagamentoId,
    },
  });
}

export async function liberarPedido(id: string) {
  await prisma.pedidoAssinatura.updateMany({
    where: { id, status: 'processando' },
    data: { status: 'pendente' },
  });
}

export async function marcarRevisao(id: string) {
  await prisma.pedidoAssinatura.updateMany({
    where: { id, status: 'processando' },
    data: { status: 'revisao' },
  });
}
