import { Prisma } from '@prisma/client';

import { prisma, type ClientePrisma } from '../config/database';
import { AppError } from '../lib/erros';
import { transacao } from '../lib/tenant';
import type { CicloCobranca, ClinicaCobranca } from '../lib/assinatura';
import type { InscricaoInput } from '../validators/assinatura.validator';

/** Pedido em `processando` há mais tempo que isso é considerado abandonado (processo caiu no meio). */
const PROCESSANDO_EXPIRA_MS = 10 * 60 * 1000;

export interface DadosPedidoClinica {
  plano: string;
  ciclo: CicloCobranca;
  usuarioId: string;
}

export async function criarPedido(dados: InscricaoInput, valor: number) {
  return prisma.pedidoAssinatura.create({
    data: {
      tipo: 'nova_clinica',
      planoCodigo: dados.plano,
      ciclo: dados.ciclo === 'anual' ? 'anual' : 'mensal',
      valor,
      dados: dados as unknown as Prisma.InputJsonValue,
    },
  });
}

export async function criarPedidoClinica(clinicaId: string, dados: DadosPedidoClinica, valor: number) {
  return prisma.pedidoAssinatura.create({
    data: {
      tipo: 'clinica_existente',
      clinicaId,
      planoCodigo: dados.plano,
      ciclo: dados.ciclo,
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
  const abandonado = new Date(Date.now() - PROCESSANDO_EXPIRA_MS);
  const reservado = await prisma.pedidoAssinatura.updateMany({
    where: {
      id,
      OR: [
        // expirado: checkout abandonado, mas um Pix gerado antes ainda pode ser pago.
        { status: { in: ['pendente', 'revisao', 'expirado'] } },
        { status: 'processando', atualizadoEm: { lt: abandonado } },
      ],
    },
    data: { status: 'processando' },
  });
  return reservado.count === 1;
}

export async function concluirPedido(
  id: string,
  dados: { clinicaId: string; pagamentoId: string | null; periodoInicio: Date; periodoFim: Date },
  tx: ClientePrisma = prisma,
) {
  return tx.pedidoAssinatura.update({
    where: { id },
    data: {
      status: 'pago',
      clinicaId: dados.clinicaId,
      pagamentoId: dados.pagamentoId,
      pagoEm: new Date(),
      periodoInicio: dados.periodoInicio,
      periodoFim: dados.periodoFim,
    },
  });
}

/**
 * Pagamento de uma clínica que já existe: estende o vencimento e grava o pedido como pago
 * na mesma transação. `calcularPeriodo` recebe a clínica como está no banco.
 */
export async function registrarPagamentoClinica(params: {
  pedidoId: string;
  clinicaId: string;
  planoCodigo: string;
  ciclo: CicloCobranca;
  valorPedido: number;
  pagamentoId: string | null;
  calcularPeriodo: (clinica: ClinicaCobranca) => { inicio: Date; fim: Date };
}) {
  return transacao(async (tx) => {
    const clinica = await tx.clinica.findUnique({
      where: { id: params.clinicaId },
      select: { tipoAcesso: true, trialExpiraEm: true, pagoAte: true },
    });
    if (!clinica) throw new AppError(404, 'Clínica não encontrada.');
    const plano = await tx.plano.findUnique({ where: { codigo: params.planoCodigo } });
    if (!plano) throw new AppError(400, 'Plano inválido.');

    const { inicio, fim } = params.calcularPeriodo(clinica);
    await tx.clinica.update({
      where: { id: params.clinicaId },
      data: {
        tipoAcesso: 'pago',
        planoId: plano.id,
        cicloCobranca: params.ciclo,
        valorMensal: params.ciclo === 'anual' ? plano.precoMensal : params.valorPedido,
        situacaoCobranca: 'em_dia',
        pagoAte: fim,
      },
    });
    await concluirPedido(
      params.pedidoId,
      { clinicaId: params.clinicaId, pagamentoId: params.pagamentoId, periodoInicio: inicio, periodoFim: fim },
      tx,
    );
    return { inicio, fim };
  });
}

/**
 * Estorno ou chargeback: o pedido sai de `pago` uma única vez e o vencimento da clínica
 * recua o mesmo tempo que aquele pagamento tinha dado.
 */
export async function estornarPedido(id: string, pagamentoId: string): Promise<boolean> {
  return transacao(async (tx) => {
    const marcado = await tx.pedidoAssinatura.updateMany({
      where: { id, pagamentoId, status: 'pago' },
      data: { status: 'estornado' },
    });
    if (marcado.count !== 1) return false;

    const pedido = await tx.pedidoAssinatura.findUnique({ where: { id } });
    if (!pedido?.clinicaId || !pedido.periodoInicio || !pedido.periodoFim) return true;
    const clinica = await tx.clinica.findUnique({
      where: { id: pedido.clinicaId },
      select: { pagoAte: true },
    });
    if (!clinica?.pagoAte) return true;

    const recuo = pedido.periodoFim.getTime() - pedido.periodoInicio.getTime();
    await tx.clinica.update({
      where: { id: pedido.clinicaId },
      data: { pagoAte: new Date(clinica.pagoAte.getTime() - recuo) },
    });
    return true;
  });
}

export async function marcarAcessoEnviado(id: string) {
  await prisma.pedidoAssinatura.update({
    where: { id },
    data: { acessoEnviadoEm: new Date() },
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
